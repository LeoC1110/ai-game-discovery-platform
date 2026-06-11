// packages/auth-service/ai/answerAgent.js
// Generates or streams Gemini responses from intent-classified context and platform data.
// Reuses the same SDK and env vars as the existing AI service.
//
// Mock mode: set AI_MOCK_MODE=true in .env (or use `npm run dev:mock` from auth-service)
// to skip all Gemini calls and return deterministic responses for local development.
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { INTENTS } from './routerAgent.js';
import { getMockAnswer, getMockReflection } from './mockAiService.js';

const AI_TIMEOUT_MS = parseInt(process.env.AI_TIMEOUT_MS ?? '30000', 10);

// ── Gemini model singleton ────────────────────────────────────────────────────
let _model = null;

export function getModel() {
  if (_model) return _model;
  const key = process.env.GOOGLE_API_KEY;
  if (!key?.trim()) throw new Error('GOOGLE_API_KEY is missing in backend environment variables.');
  
  // High-performance default lean model ideal for streaming workloads
  const modelName = process.env.AI_MODEL ?? 'gemini-3.1-flash-lite';
  console.log('[answerAgent] Creating model:', modelName);
  
  _model = new ChatGoogleGenerativeAI({
    model: modelName,
    apiKey: key.trim(),
    maxOutputTokens: 1024, // Expanded to 1024 to comfortably accommodate large trailing RECOMMENDATIONS machine blocks
    maxRetries: 0,
  });
  return _model;
}

/** Reset the singleton (e.g. after an API error or network drop). */
export function resetModel() {
  _model = null;
}

// ── System prompt builder ─────────────────────────────────────────────────────
const INTENT_ROLE_MAP = {
  [INTENTS.GAME_RECOMMENDATION]:
    "recommend games based on the user's bookmarks, preferences, and community activity",
  [INTENTS.BOOKMARK_ANALYSIS]:
    "analyze the user's bookmarked games and summarize their taste profile",
  [INTENTS.COMMUNITY_SUMMARY]:
    'summarize community trends, popular posts, active discussions, and trending tags',
  [INTENTS.LEADERBOARD_QUERY]:
    'answer questions about popular, highly rated, or trending games in the community',
  [INTENTS.LOW_RATING_QUERY]:
    'find low-rated games in the community and explain why they are considered low-rated',
  [INTENTS.GENERAL_CHAT]:
    'have a helpful, friendly conversation about games, recommendations, and the platform',
};

// RECOMMENDATIONS block format instruction — must match the regex in recommendationExtractor.js
const RECO_FORMAT_RULE =
  `\nWhen your response includes specific game recommendations, you MUST append a ` +
  `machine-readable block at the very end in this exact format, with no extra text after it:\n` +
  `<!--RECOMMENDATIONS:[{"title":"Exact Game Title","reason":"One concise sentence why this fits the user","confidence":0.95,"matchedTags":["tag1","tag2"]}]-->\n` +
  `Rules for the block:\n` +
  `- Use only titles from the Platform Data section — never from Web Suggestions or training knowledge.\n` +
  `- confidence is a float between 0.0 and 1.0.\n` +
  `- matchedTags are tags from the game that match the user's request, bookmarks, or preferences.\n` +
  `- If no specific games are being recommended, omit the block entirely.`;

/**
 * Build the system prompt used by Nova.
 * This prompt is intentionally strict about platform grounding:
 * Nova may explain, summarize, and compare using platform data,
 * but should not invent games, ratings, bookmarks, or user activity.
 */
function buildSystemPrompt(intent, platformData, userMemoryContext = '') {
  const role = INTENT_ROLE_MAP[intent] ?? 'assist with game discovery questions';
  const isCommunityIntent =
    intent === INTENTS.COMMUNITY_SUMMARY ||
    intent === INTENTS.LEADERBOARD_QUERY ||
    intent === INTENTS.LOW_RATING_QUERY;
  const isPersonalIntent =
    intent === INTENTS.GAME_RECOMMENDATION || intent === INTENTS.BOOKMARK_ANALYSIS;

  let prompt =
    `You are Nova, the AI assistant for an AI-powered game discovery community platform.\n` +
    `Your current task is to ${role}.\n\n` +

    `Nova's personality:\n` +
    `- Friendly, concise, natural, and helpful.\n` +
    `- Product-like, not overly robotic.\n` +
    `- Honest when data is limited or unavailable.\n` +
    `- Focused on helping the user decide what to play or explore next.\n\n` +

    `Behavior rules:\n` +
    `- Respond in the same language the user used.\n` +
    `- Keep answers concise and easy to scan.\n` +
    `- Use bullet points or numbered lists when helpful.\n` +
    `- Stay grounded in the platform data below.\n` +
    `- NEVER start a response with an apology, self-correction, or meta-commentary about a previous turn ` +
    `(e.g. do NOT use "I apologize for the oversight", "Let's refocus", "Sorry for the confusion", ` +
    ` "I should clarify", "Let me correct that") UNLESS the user's current message explicitly points out ` +
    ` an error or asks for a correction. For every new question, answer directly.\n` +
    `- For community trend or leaderboard questions, open with platform-centric wording such as ` +
    ` "Based on current community activity..." or "Here are the games currently trending on the platform." — ` +
    ` never with an apology or a reference to a previous response.\n` +
    `- Do not invent or fabricate game titles that are not present in the provided platform data.\n` +
    `- Do not hallucinate ratings, tags, platforms, bookmarks, likes, comments, or user statistics.\n` +
    `- The RECOMMENDATIONS block must only include titles from the "Platform Data" section — never from Web Suggestions or training knowledge.\n` +
    `- If "Web Suggestions" are present, you may mention at most 1 title from them in your prose, clearly labelled as "Also consider (not on this platform): <title>". Never put Web Suggestions in the RECOMMENDATIONS block.\n` +
    `- If platform data is empty, tell the user no community posts are available yet and suggest they browse, bookmark, or share some games first.\n` +
    `- If the user states a preference, acknowledge it and use it in your reply.\n` +
    `- If the user asks for recommendations based on bookmarks, recommend different platform games that match the user's saved-game patterns. Do not simply re-list the bookmarked games.\n` +
    `- If there are not enough matching games, say so clearly and suggest the closest available matches from platform data.\n` +
    `- If the user's message is off-topic, unclear, or casual small talk (not related to games, recommendations, bookmarks, trends, or community posts), respond politely in 1-2 short sentences and guide them back to relevant topics.\n` +
    `- In those off-topic cases, offer 2-3 concrete follow-up prompts about this platform (for example: trending games, bookmark-based recommendations, top-rated games, or community summaries).\n`;

  if (isCommunityIntent) {
    prompt +=
      `\nCommunity and leaderboard response rules:\n` +
      `- Low rating definition: any game with Community Rating <= 6.0/10 is considered low-rated.\n` +
      `- If Platform Data includes a "Low-rated games" section, summarize that section first before any high-rated or trending section.\n` +
      `- For requests about low-rated/worst/lowest games, rank results from lowest to highest Community Rating and include rating count in prose when available.\n` +
      `- If the low-rated section says none found, explicitly say no games currently meet the <= 6.0/10 threshold.\n` +
      `- Focus on current platform/community activity, not personal preference by default.\n` +
      `- Treat Author Rating as the post author's personal score only, not the full community opinion.\n` +
      `- For trend, popularity, or community-opinion questions, prefer Community Rating, Rating Count, likes, bookmarks, and comments over Author Rating.\n` +
      `- Prefer community-centric wording such as: "Based on current community activity...", "These games are trending on the platform...", "Top-rated community post.", "High engagement from likes, comments, or bookmarks."\n` +
      `- STRICTLY FORBIDDEN in prose AND in the "reason" field of the RECOMMENDATIONS block: ` +
      `"Matches your interest", "Fits your interest", "Fits your preference", "Based on your taste", ` +
      `"Based on your bookmarks", "Your saved games", or any other first-person personalized phrasing.\n` +
      `- The "reason" field in every RECOMMENDATIONS entry MUST use community/platform wording only. ` +
      `Good examples: "Most-liked game on the platform.", "Strong bookmark activity from the community.", ` +
      `"Highly rated community post.", "Active discussion from RPG fans.", "Popular action game in the community.", ` +
      `"Trending post with high engagement.", "Top community rating this week."\n` +
      `- Keep summary prose consistent with recommendation cards: if the prose names specific games, include those same games in the RECOMMENDATIONS block; otherwise keep prose at category/theme level only.\n`;
  }

  if (isPersonalIntent) {
    prompt +=
      `\nPersonalized recommendation response rules:\n` +
      `- Personalization is allowed and encouraged.\n` +
      `- Phrases like "Based on your bookmarks...", "This fits your interest in...", and "Your saved games suggest..." are appropriate when supported by data.\n` +
      `- For bookmark-based recommendations, propose different matching platform games instead of simply repeating the user's bookmarked titles.\n`;
  }

  if (userMemoryContext) {
    prompt +=
      `\n--- User Preference Profile ---\n` +
      `${userMemoryContext}\n` +
      `--- End User Preference Profile ---\n` +
      `Use the profile above to personalize your reply. Only recommend games present in the platform data.\n`;
  }

  if (platformData) {
    prompt += `\n--- Platform Data ---\n${platformData}\n--- End Platform Data ---\n`;
  } else if (intent !== INTENTS.GENERAL_CHAT) {
    prompt +=
      `\nPlatform data: No community posts, bookmarks, or activity are available yet. ` +
      `Ask the user to create, browse, or bookmark some community posts first.\n`;
  }

  prompt += RECO_FORMAT_RULE;

  return prompt;
}

// ── Timeout helper ────────────────────────────────────────────────────────────
function withTimeout(promise, ms) {
  const err = new Error('Gemini call timed out.');
  err.isTimeout = true;
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(err), ms)),
  ]);
}

// ── Helper to wrap plain text into an AsyncIterable for Mock Mode ─────────────
function createMockStreamAdapter(answerText) {
  return {
    async *[Symbol.asyncIterator]() {
      // Yield the full string mock chunk
      yield { content: answerText };
    }
  };
}

// ── Exported Core Capabilities ────────────────────────────────────────────────

/**
 * Generate a stream of AI answer chunks using Google Gemini.
 * Perfect for EventStream (SSE) orchestration to eliminate client-side waiting states.
 *
 * @param {{
 * userMessage: string,
 * intent: string,
 * conversationContext: string,
 * platformData: string,
 * userMemoryContext?: string
 * }} params
 * @returns {Promise<AsyncIterable<any>>} An async iterable stream of token chunks
 */
export async function generateAnswerStream({
  userMessage,
  intent,
  conversationContext,
  platformData,
  userMemoryContext = '',
}) {
  if (process.env.AI_MOCK_MODE === 'true') {
    console.log('[answerAgent] MOCK MODE — Returning simulated iterable stream for intent:', intent);
    const mockString = getMockAnswer({ intent });
    return createMockStreamAdapter(mockString);
  }

  const model = getModel();
  const messages = [new SystemMessage(buildSystemPrompt(intent, platformData, userMemoryContext))];

  if (conversationContext) {
    messages.push(new HumanMessage(`Previous conversation:\n${conversationContext}`));
  }
  messages.push(new HumanMessage(userMessage));

  // Race the generation initialization against a strict platform time configuration barrier
  return withTimeout(model.stream(messages), AI_TIMEOUT_MS).catch((err) => {
    resetModel(); // Destroy faulty connection lifecycle references
    throw err;
  });
}

/**
 * Generate a traditional full AI answer using Google Gemini.
 * Keep this block active to retain backward compatibility with the current standard aiPipeline.js execution.
 *
 * @param {{
 * userMessage: string,
 * intent: string,
 * conversationContext: string,
 * platformData: string,
 * userMemoryContext?: string
 * }} params
 * @returns {Promise<string>} raw unified text answer string from Gemini
 */
export async function generateAnswer({
  userMessage,
  intent,
  conversationContext,
  platformData,
  userMemoryContext = '',
}) {
  if (process.env.AI_MOCK_MODE === 'true') {
    console.log('[answerAgent] MOCK MODE — skipping Gemini, returning mock answer for intent:', intent);
    return getMockAnswer({ intent });
  }

  const model = getModel();
  const messages = [new SystemMessage(buildSystemPrompt(intent, platformData, userMemoryContext))];

  if (conversationContext) {
    messages.push(new HumanMessage(`Previous conversation:\n${conversationContext}`));
  }
  messages.push(new HumanMessage(userMessage));

  const response = await withTimeout(model.invoke(messages), AI_TIMEOUT_MS);

  // Normalize text payload formatting across array objects or raw data extensions safely
  return typeof response.content === 'string'
    ? response.content
    : response.content.map((c) => (typeof c === 'string' ? c : (c.text ?? ''))).join('');
}

/**
 * Run one reflection pass: send the original message + bad answer + flag list
 * to Gemini and ask it to produce a corrected response.
 * Called at most once per pipeline run (see aiPipeline.js).
 *
 * @param {{
 * badAnswer: string,
 * flags: string[],
 * userMessage: string,
 * intent: string,
 * platformData: string,
 * userMemoryContext?: string
 * }} params
 * @returns {Promise<string>} corrected answer text
 */
export async function generateReflection({
  badAnswer,
  flags,
  userMessage,
  intent,
  platformData,
  userMemoryContext = '',
}) {
  if (process.env.AI_MOCK_MODE === 'true') {
    console.log('[answerAgent] MOCK MODE — skipping Gemini reflection, returning mock reflection');
    return getMockReflection({ badAnswer });
  }

  const model = getModel();
  const flagList = flags.map((f) => `- ${f}`).join('\n');

  const messages = [
    new SystemMessage(buildSystemPrompt(intent, platformData, userMemoryContext)),
    new HumanMessage(userMessage),
    new AIMessage(badAnswer),
    new HumanMessage(
      `Nova's previous response was automatically checked and the following issues were found:\n` +
      `${flagList}\n\n` +
      `Please provide a revised response that:\n` +
      `- Only references game titles that exist in the platform data\n` +
      `- Does not invent ratings, bookmarks, tags, likes, comments, or user statistics\n` +
      `- Is safe, appropriate, and helpful\n` +
      `- Stays grounded in the provided context\n` +
      `- Keeps the same language as the user's message\n` +
      `- Includes a valid RECOMMENDATIONS block only when specific platform games are recommended`,
    ),
  ];

  const response = await withTimeout(model.invoke(messages), AI_TIMEOUT_MS);

  return typeof response.content === 'string'
    ? response.content
    : response.content.map((c) => (typeof c === 'string' ? c : (c.text ?? ''))).join('');
}