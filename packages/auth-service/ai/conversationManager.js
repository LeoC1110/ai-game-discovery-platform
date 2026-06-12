// packages/auth-service/ai/conversationManager.js
// Manages conversation history, turn counting, topic extraction, and memory summaries.
import ConversationHistory from '../models/ConversationHistory.js';
import UserMemory from '../models/UserMemory.js';

const MAX_HISTORY = parseInt(process.env.AI_MAX_HISTORY_MESSAGES ?? '3', 10);
const MAX_STORED_MESSAGES = Math.max(MAX_HISTORY * 10, parseInt(process.env.AI_MAX_STORED_MESSAGES ?? '100', 10));

/**
 * Load the last N messages for a user from the database.
 * @param {string} userId
 * @returns {Promise<Array<{role: string, content: string, createdAt: Date}>>}
 */
export async function loadHistory(userId) {
  try {
    const record = await ConversationHistory.findOne(
      { userId },
      { messages: { $slice: -MAX_HISTORY } },
    ).lean();
    if (!record) return [];
    return Array.isArray(record.messages) ? record.messages : [];
  } catch {
    return [];
  }
}

/**
 * Save a user + assistant exchange to conversation history.
 * @param {string} userId
 * @param {string} username
 * @param {string} userMessage
 * @param {string} aiResponse
 */
export async function saveExchange(userId, username, userMessage, aiResponse) {
  try {
    const now = new Date();
    await ConversationHistory.findOneAndUpdate(
      { userId },
      {
        $setOnInsert: { userId, username },
        $push: {
          messages: {
            $each: [
              { role: 'user', content: userMessage, createdAt: now },
              { role: 'assistant', content: aiResponse, createdAt: now },
            ],
            $slice: -MAX_STORED_MESSAGES,
          },
        },
      },
      { upsert: true, new: true },
    );
  } catch {
    // non-fatal — history save failures should not break the response
  }
}

/**
 * Count the number of user turns in the stored history.
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function getUserTurnCount(userId) {
  try {
    const record = await ConversationHistory.findOne({ userId }).lean();
    if (!record) return 0;
    return record.messages.filter((m) => m.role === 'user').length;
  } catch {
    return 0;
  }
}

/**
 * Format an array of history records into a plain-text block for prompt injection.
 * @param {Array<{role: string, content: string}>} historyRecords
 * @returns {string}
 */
export function buildConversationContext(historyRecords) {
  if (!Array.isArray(historyRecords) || !historyRecords.length) return '';
  return historyRecords
    .map((m) => `${m.role === 'user' ? 'User' : 'Agent'}: ${String(m?.content ?? '')}`)
    .join('\n');
}

// ── Topic extraction ─────────────────────────────────────────────────────────
// Scans message text for genre / gameplay keywords to track conversation topics.
// Future: replace with NLP entity extraction for proper game-title detection (RAG).
const TOPIC_KEYWORDS = [
  'rpg', 'fps', 'strategy', 'indie', 'horror', 'puzzle', 'racing', 'sports',
  'simulation', 'platformer', 'adventure', 'action', 'moba', 'rts', 'shooter',
  'mmorpg', 'roguelike', 'sandbox', 'multiplayer', 'co-op', 'coop', 'open world',
  'story', 'survival', 'tower defense', 'fighting', 'visual novel',
];

/**
 * Extract genre / keyword topics from history messages and the current message.
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} currentMessage
 * @returns {string[] | null}  matched keywords, or null if none found
 */
export function extractTopicContext(messages, currentMessage = '') {
  const text = [currentMessage, ...messages.map((m) => m.content)].join(' ').toLowerCase();
  const found = TOPIC_KEYWORDS.filter((kw) => text.includes(kw));
  return found.length ? found : null;
}

// ── UserMemory helpers ────────────────────────────────────────────────────────

/**
 * Load the UserMemory document for a user.
 * Returns safe defaults if no record exists yet.
 * @param {string} userId
 * @returns {Promise<{ conversationSummary: string, trackedTopics: string[], totalTurnCount: number }>}
 */
export async function loadUserMemory(userId) {
  try {
    const record = await UserMemory.findOne({ userId }).lean();
    return {
      conversationSummary: record?.conversationSummary ?? '',
      trackedTopics:       record?.trackedTopics ?? [],
      totalTurnCount:      record?.totalTurnCount ?? 0,
    };
  } catch {
    return { conversationSummary: '', trackedTopics: [], totalTurnCount: 0 };
  }
}

/**
 * Persist a conversation summary and the latest tracked topics.
 * Increments totalTurnCount by 1 on each call.
 * @param {string}   userId
 * @param {string}   summary  - plain-text summary from buildSimpleSummary
 * @param {string[]} topics   - extracted keyword topics
 */
export async function saveConversationSummary(userId, summary, topics = []) {
  try {
    await UserMemory.findOneAndUpdate(
      { userId },
      { $set: { conversationSummary: summary, trackedTopics: topics }, $inc: { totalTurnCount: 1 } },
      { upsert: true, new: true },
    );
  } catch {
    // non-fatal
  }
}

/**
 * Produce a compact plain-text summary from the last N history records
 * plus the current exchange. Used as the 5-turn rolling summary.
 *
 * @param {Array<{role: string, content: string}>} historyRecords
 * @param {string} lastUserMessage
 * @param {string} lastAIResponse
 * @returns {string}
 */
export function buildSimpleSummary(historyRecords, lastUserMessage, lastAIResponse) {
  const lines = ['[Conversation summary]:'];
  for (const msg of (Array.isArray(historyRecords) ? historyRecords : [])) {
    const role = msg.role === 'user' ? 'User' : 'Agent';
    lines.push(`  ${role}: ${String(msg?.content ?? '').slice(0, 120)}`);
  }
  lines.push(`  User: ${String(lastUserMessage ?? '').slice(0, 120)}`);
  lines.push(`  Agent: ${String(lastAIResponse ?? '').slice(0, 120)}`);
  return lines.join('\n');
}

export const __test__ = {
  MAX_HISTORY,
  MAX_STORED_MESSAGES,
};
