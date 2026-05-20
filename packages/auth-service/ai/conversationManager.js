// packages/auth-service/ai/conversationManager.js
// Manages conversation history, turn counting, and topic placeholders.
import ConversationHistory from '../models/ConversationHistory.js';

const MAX_HISTORY = parseInt(process.env.AI_MAX_HISTORY_MESSAGES ?? '3', 10);

/**
 * Load the last N messages for a user from the database.
 * @param {string} userId
 * @returns {Promise<Array<{role: string, content: string, createdAt: Date}>>}
 */
export async function loadHistory(userId) {
  try {
    const record = await ConversationHistory.findOne({ userId }).lean();
    if (!record) return [];
    return record.messages.slice(-MAX_HISTORY);
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
    await ConversationHistory.findOneAndUpdate(
      { userId },
      {
        $setOnInsert: { userId, username },
        $push: {
          messages: {
            $each: [
              { role: 'user', content: userMessage, createdAt: new Date() },
              { role: 'assistant', content: aiResponse, createdAt: new Date() },
            ],
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
  if (!historyRecords.length) return '';
  return historyRecords
    .map((m) => `${m.role === 'user' ? 'User' : 'Agent'}: ${m.content}`)
    .join('\n');
}

// ── Placeholder for future topic tracking ────────────────────────────────────
// In a future iteration this will extract named entities / game titles from the
// conversation to enable topic-aware context retrieval (RAG).
export function extractTopicContext(_historyRecords) {
  // TODO: implement topic/entity extraction for RAG
  return null;
}
