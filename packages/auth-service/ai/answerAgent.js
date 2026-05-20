// packages/auth-service/ai/answerAgent.js
// Generates a Gemini response from intent-classified context and platform data.
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
  const modelName = process.env.AI_MODEL ?? 'gemini-2.5-flash';
  console.log('[answerAgent] Creating model:', modelName);
  _model = new ChatGoogleGenerativeAI({
    model: modelName,
    apiKey: key.trim(),
    maxOutputTokens: 512,
    maxRetries: 0,
  });
  return _model;
}

/** Reset the singleton (e.g. after an API error). */
export function resetModel() {
  _model = null;
}

// ── System prompt builder ─────────────────────────────────────────────────────
const INTENT_ROLE_MAP = {
  [INTENTS.GAME_RECOMMENDATION]: "recommend games based on the user's bookmarks and community trends",
  [INTENTS.BOOKMARK_ANALYSIS]:   "analyse the user's bookmarked games and summarise their taste profile",
  [INTENTS.COMMUNITY_SUMMARY]:   'summarise what the community is playing and discussing',
  [INTENTS.LEADERBOARD_QUERY]:   'answer questions about the top-rated or most-liked games',
  [INTENTS.GENERAL_CHAT]:        'have a helpful conversation about games and gaming',
};

// RECOMMENDATIONS block format instruction — must match the regex in recommendationExtractor.js
const RECO_FORMAT_RULE =
  `\nWhen your response includes specific game recommendations, you MUST append a ` +
  `machine-readable block at the very end in this exact format (no extra text after it):\n` +
  `<!--RECOMMENDATIONS:[{"title":"Exact Game Title","reason":"One concise sentence why this fits the user","confidence":0.95,"matchedTags":["tag1","tag2"]}]-->\n` +
  `Rules for the block:\n` +
  `- Use only titles that exist in the platform data above.\n` +
  `- confidence is a float between 0.0 and 1.0.\n` +
  `- matchedTags are tags from the game that match the user's request.\n` +
  `- If no specific games are being recommended, omit the block entirely.`;

function buildSystemPrompt(intent, platformData) {
  const role = INTENT_ROLE_MAP[intent] ?? 'assist with gaming questions';
  let prompt =
    `You are an AI Game Agent for a gaming discovery platform. Your task is to ${role}.\n` +
    `Be concise, friendly, and grounded in the platform data below.\n` +
    `Do not invent or fabricate game titles that are not present in the provided data.\n`;

  if (platformData) {
    prompt += `\n--- Platform Data ---\n${platformData}\n--- End Platform Data ---\n`;
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

/**
 * Generate an AI answer using Google Gemini.
 *
 * @param {{
 *   userMessage: string,
 *   intent: string,
 *   conversationContext: string,
 *   platformData: string
 * }} params
 * @returns {Promise<string>} raw text answer from Gemini
 */
export async function generateAnswer({ userMessage, intent, conversationContext, platformData }) {
  if (process.env.AI_MOCK_MODE === 'true') {
    console.log('[answerAgent] MOCK MODE — skipping Gemini, returning mock answer for intent:', intent);
    return getMockAnswer({ intent });
  }

  const model = getModel();
  const messages = [new SystemMessage(buildSystemPrompt(intent, platformData))];

  if (conversationContext) {
    messages.push(new HumanMessage(`Previous conversation:\n${conversationContext}`));
  }

  messages.push(new HumanMessage(userMessage));

  const response = await withTimeout(model.invoke(messages), AI_TIMEOUT_MS);

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
 *   badAnswer: string,
 *   flags: string[],
 *   userMessage: string,
 *   intent: string,
 *   platformData: string
 * }} params
 * @returns {Promise<string>} corrected answer text
 */
export async function generateReflection({ badAnswer, flags, userMessage, intent, platformData }) {
  if (process.env.AI_MOCK_MODE === 'true') {
    console.log('[answerAgent] MOCK MODE — skipping Gemini reflection, returning mock reflection');
    return getMockReflection({ badAnswer });
  }

  const model = getModel();
  const flagList = flags.map((f) => `- ${f}`).join('\n');

  const messages = [
    new SystemMessage(buildSystemPrompt(intent, platformData)),
    new HumanMessage(userMessage),
    new AIMessage(badAnswer),
    new HumanMessage(
      `Your previous response was automatically checked and the following issues were found:\n` +
      `${flagList}\n\n` +
      `Please provide a revised response that:\n` +
      `• Only references game titles that exist in the platform data\n` +
      `• Is safe and appropriate\n` +
      `• Stays grounded in the provided context`,
    ),
  ];

  const response = await withTimeout(model.invoke(messages), AI_TIMEOUT_MS);

  return typeof response.content === 'string'
    ? response.content
    : response.content.map((c) => (typeof c === 'string' ? c : (c.text ?? ''))).join('');
}
