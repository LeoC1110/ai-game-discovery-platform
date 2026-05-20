// packages/auth-service/ai/aiPipeline.js
// Main AI agent pipeline — connects all modular steps in sequence.
//
// Pipeline flow:
//
//   User message (from GraphQL resolver)
//       ↓
//   [Step 1] Conversation Manager  — load history, track turn count
//       ↓
//   [Step 2] Router Agent          — classify intent (no Gemini call)
//       ↓
//   [Step 3] Platform Tools        — fetch DB data relevant to intent
//       ↓
//   [Step 4] Answer Agent          — call Gemini with context
//       ↓
//   [Step 5] Validator Agent       — ensure response is valid text
//       ↓
//   [Step 6] Save + Return         — persist exchange, return to resolver
//
import {
  loadHistory,
  saveExchange,
  getUserTurnCount,
  buildConversationContext,
  extractTopicContext,
} from './conversationManager.js';
import { classifyIntent } from './routerAgent.js';
import { fetchDataForIntent } from './platformTools.js';
import { generateAnswer, resetModel } from './answerAgent.js';
import { validate } from './validatorAgent.js';
import { GENERIC_ERROR_RESPONSE } from '../prompts/fallbackResponses.js';

/**
 * Run the full AI agent pipeline for a single user message.
 *
 * @param {{ userId: string, username: string, message: string }} params
 * @returns {Promise<{
 *   answer: string,
 *   intent: string,
 *   userTurnCount: number,
 *   recommendedPosts: [],
 *   evaluation: null
 * }>}
 *
 * Note: recommendedPosts and evaluation are reserved for future steps
 * (structured extraction and hallucination evaluation).
 */
export async function runPipeline({ userId, username, message }) {
  console.time('[pipeline] total');
  console.log('[pipeline] START — user:', username, '| message:', message.slice(0, 60));

  // ── Step 1: Conversation Manager ─────────────────────────────────────────
  console.time('[pipeline] step1 conversationManager');
  const [historyRecords, userTurnCount] = await Promise.all([
    loadHistory(userId),
    getUserTurnCount(userId),
  ]);
  const conversationContext = buildConversationContext(historyRecords);
  // eslint-disable-next-line no-unused-vars
  const topicContext = extractTopicContext(historyRecords); // placeholder — null for now
  console.log(
    `[pipeline] turn #${userTurnCount + 1}, history: ${historyRecords.length} msg(s)`,
  );
  console.timeEnd('[pipeline] step1 conversationManager');

  // ── Step 2: Router Agent ──────────────────────────────────────────────────
  console.time('[pipeline] step2 routerAgent');
  const { intent, confidence } = classifyIntent(message);
  console.log(`[pipeline] intent="${intent}" confidence="${confidence}"`);
  console.timeEnd('[pipeline] step2 routerAgent');

  // ── Step 3: Platform Tools ────────────────────────────────────────────────
  console.time('[pipeline] step3 platformTools');
  const platformData = await fetchDataForIntent(intent, userId);
  console.log(`[pipeline] platformData: ${platformData.length} chars`);
  console.timeEnd('[pipeline] step3 platformTools');

  // ── Step 4: Answer Agent ──────────────────────────────────────────────────
  console.time('[pipeline] step4 answerAgent');
  let answer;
  try {
    answer = await generateAnswer({ userMessage: message, intent, conversationContext, platformData });
  } catch (err) {
    console.error('[pipeline] answerAgent error:', err?.message);
    if (err?.isTimeout) {
      console.warn('[pipeline] Gemini timed out');
    } else {
      resetModel(); // clear stale singleton on unexpected errors
    }
    console.timeEnd('[pipeline] step4 answerAgent');
    console.timeEnd('[pipeline] total');
    throw new Error(GENERIC_ERROR_RESPONSE);
  }
  console.timeEnd('[pipeline] step4 answerAgent');

  // ── Step 5: Validator Agent ───────────────────────────────────────────────
  console.time('[pipeline] step5 validatorAgent');
  const { valid, reason } = validate(answer);
  if (!valid) {
    console.warn('[pipeline] Validation failed:', reason, '— using fallback');
    answer = GENERIC_ERROR_RESPONSE;
  } else {
    console.log('[pipeline] Validation passed');
  }
  console.timeEnd('[pipeline] step5 validatorAgent');

  // ── Step 6: Save exchange ─────────────────────────────────────────────────
  await saveExchange(userId, username, message, answer);
  console.log('[pipeline] Exchange saved');

  console.timeEnd('[pipeline] total');

  // Return shape matches the AIResponse GraphQL type.
  // recommendedPosts and evaluation will be populated in future pipeline iterations.
  return {
    answer,
    intent,
    userTurnCount: userTurnCount + 1,
    recommendedPosts: [],
    evaluation: null,
  };
}
