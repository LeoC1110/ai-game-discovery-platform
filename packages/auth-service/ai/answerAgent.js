// packages/auth-service/ai/answerAgent.js
// Generates a Gemini response from intent-classified context and platform data.
// Reuses the same SDK and env vars as the existing AI service.
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { INTENTS } from './routerAgent.js';

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

function buildSystemPrompt(intent, platformData) {
  const role = INTENT_ROLE_MAP[intent] ?? 'assist with gaming questions';
  let prompt =
    `You are an AI Game Agent for a gaming discovery platform. Your task is to ${role}.\n` +
    `Be concise, friendly, and grounded in the platform data below.\n` +
    `Do not invent or fabricate game titles that are not present in the provided data.\n`;

  if (platformData) {
    prompt += `\n--- Platform Data ---\n${platformData}\n--- End Platform Data ---\n`;
  }

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
