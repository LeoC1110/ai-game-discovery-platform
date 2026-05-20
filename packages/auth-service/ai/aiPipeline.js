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
  loadUserMemory,
  saveConversationSummary,
  buildSimpleSummary,
} from './conversationManager.js';
import { classifyIntent } from './routerAgent.js';
import { fetchDataForIntent } from './platformTools.js';
import { generateAnswer, generateReflection, resetModel } from './answerAgent.js';
import { extractRecommendedPosts } from './recommendationExtractor.js';
import { validate, evaluateResponse, loadKnownTitles } from './validatorAgent.js';
import { GREETING_RESPONSE, GENERIC_ERROR_RESPONSE, QUOTA_EXCEEDED_RESPONSE } from '../prompts/fallbackResponses.js';

// ── Greeting fast-path ───────────────────────────────────────────────────────
// Matches simple one-word greetings in English, Pinyin, or Chinese characters.
// Extend the alternation list to add more languages.
const SIMPLE_GREETING_RE =
  /^\s*(hi|hello|hey|yo|sup|hiya|howdy|greetings|ping|test|你好|您好|nihao)[!?.,'"\s]*$/i;

function isSimpleGreeting(msg) {
  return SIMPLE_GREETING_RE.test(msg);
}

// ── Pipeline roadmap ──────────────────────────────────────────────────────────
// ✅ Step 1 (done): Greeting fast-path — see isSimpleGreeting above.
//
// ✅ Step 2 (done): Basic context management
//   - userTurnCount exposed in returned payload.
//   - Topic tracking via extractTopicContext.
//   - 5-turn rolling summary stored in UserMemory.
//
// ✅ Step 3 (done): Validator / Evaluation
//   - evaluateResponse() wires in aiEvaluationService (grounding, hallucination, safety).
//   - Reflection loop: one correction pass when hallucinations or safety issues detected.
//   - loadKnownTitles() fetches DB titles as ground truth for hallucination detection.
//   - evaluation (with wasReflected flag) returned in pipeline result.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the full AI agent pipeline for a single user message.
 *
 * @param {{ userId: string, username: string, message: string }} params
 * @returns {Promise<{
 *   answer: string,
 *   intent: string,
 *   userTurnCount: number,
 *   recommendedPosts: Array,
 *   evaluation: object
 * }>}
 */
export async function runPipeline({ userId, username, message }) {
  console.time('[pipeline] total');
  console.log('[pipeline] START — user:', username, '| message:', message.slice(0, 60));

  // ── Greeting fast-path — skip Gemini entirely ────────────────────────────
  if (isSimpleGreeting(message)) {
    console.log('[pipeline] greeting fast-path — skipping Gemini');
    console.timeEnd('[pipeline] total');
    // Fire-and-forget — not awaited so the response returns immediately
    saveExchange(userId, username, message, GREETING_RESPONSE).catch(() => {});
    return {
      answer: GREETING_RESPONSE,
      intent: 'general_chat',
      userTurnCount: 0,
      recommendedPosts: [],
      evaluation: null,
    };
  }

  // ── Step 1: Conversation Manager ─────────────────────────────────────────
  console.time('[pipeline] step1 conversationManager');
  const [historyRecords, userTurnCount, userMemory] = await Promise.all([
    loadHistory(userId),
    getUserTurnCount(userId),
    loadUserMemory(userId),
  ]);
  const topicContext = extractTopicContext(historyRecords, message);

  // Build conversation context: stored summary (if any) + recent history
  let conversationContext = buildConversationContext(historyRecords);
  if (userMemory.conversationSummary) {
    conversationContext = `${userMemory.conversationSummary}\n\n${conversationContext}`;
  }
  if (userMemory.trackedTopics.length) {
    conversationContext = `[Recent topics: ${userMemory.trackedTopics.join(', ')}]\n${conversationContext}`;
  }

  const newTurnCount = userTurnCount + 1;
  console.log(
    `[pipeline] turn #${newTurnCount}, history: ${historyRecords.length} msg(s), topics: ${topicContext?.join(', ') ?? 'none'}`,
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
    const is429 = err?.message?.includes('429') || err?.message?.includes('Too Many Requests') || err?.message?.includes('quota');
    if (err?.isTimeout) {
      console.warn('[pipeline] Gemini timed out');
    } else if (is429) {
      console.warn('[pipeline] Gemini quota exceeded (429)');
    } else {
      resetModel(); // clear stale singleton on unexpected errors
    }
    console.timeEnd('[pipeline] step4 answerAgent');
    console.timeEnd('[pipeline] total');
    throw new Error(is429 ? QUOTA_EXCEEDED_RESPONSE : GENERIC_ERROR_RESPONSE);
  }
  console.timeEnd('[pipeline] step4 answerAgent');

  // ── Step 4b: Extract recommendations + load known titles in parallel ─────────
  console.time('[pipeline] step4b extractRecommendations');
  const [{ cleanAnswer: rawClean, recommendations: rawReco }, knownTitles] = await Promise.all([
    extractRecommendedPosts(answer),
    loadKnownTitles(),
  ]);
  let cleanAnswer = rawClean;
  let recommendations = rawReco;
  console.log(`[pipeline] recommendations extracted: ${recommendations.length}, knownTitles: ${knownTitles.length}`);
  console.timeEnd('[pipeline] step4b extractRecommendations');

  // ── Step 5: Semantic evaluation + optional reflection pass ────────────────
  console.time('[pipeline] step5 evaluateAndReflect');
  let { evaluation, needsReflection } = evaluateResponse(cleanAnswer, recommendations, knownTitles);
  let wasReflected = false;

  if (needsReflection) {
    console.warn('[pipeline] Reflection triggered. Flags:', evaluation.flags);
    try {
      console.time('[pipeline] step5 reflection');
      const reflectedText = await generateReflection({
        badAnswer: cleanAnswer,
        flags: evaluation.flags,
        userMessage: message,
        intent,
        platformData,
      });
      console.timeEnd('[pipeline] step5 reflection');

      const re = await extractRecommendedPosts(reflectedText);
      cleanAnswer    = re.cleanAnswer;
      recommendations = re.recommendations;
      ({ evaluation } = evaluateResponse(cleanAnswer, recommendations, knownTitles));
      wasReflected = true;
      console.log('[pipeline] Reflection complete. Remaining flags:', evaluation.flags.length);
    } catch (err) {
      console.warn('[pipeline] Reflection failed — using original answer:', err?.message);
    }
  }

  evaluation = { ...evaluation, wasReflected };

  // Basic structural validation (blank / non-string guard)
  const { valid, reason } = validate(cleanAnswer);
  if (!valid) {
    console.warn('[pipeline] Structural validation failed:', reason);
    console.timeEnd('[pipeline] step5 evaluateAndReflect');
    console.timeEnd('[pipeline] total');
    return {
      answer: GENERIC_ERROR_RESPONSE,
      intent,
      userTurnCount: newTurnCount,
      recommendedPosts: [],
      evaluation: null,
    };
  }
  console.log(
    `[pipeline] Evaluation done. grounding=${
      evaluation.groundingScore != null ? evaluation.groundingScore.toFixed(2) : 'n/a'
    } hallucinations=${evaluation.hallucinations.length} safety=${
      evaluation.safetyPassed ? 'OK' : 'FAIL'
    } reflected=${wasReflected}`,
  );
  console.timeEnd('[pipeline] step5 evaluateAndReflect');

  // ── Step 6: Save exchange (clean answer — block already stripped) ─────────
  await saveExchange(userId, username, message, cleanAnswer);
  console.log('[pipeline] Exchange saved');

  // ── 5-turn summary trigger ─────────────────────────────────────────────
  // Every 5th user turn: compress history + current exchange into a rolling
  // summary stored in UserMemory, so long conversations don’t overflow context.
  if (newTurnCount % 5 === 0) {
    console.log(`[pipeline] 5-turn milestone (turn ${newTurnCount}) — saving summary`);
    const summary = buildSimpleSummary(historyRecords, message, cleanAnswer);
    const latestTopics = extractTopicContext(historyRecords, message) ?? [];
    // Fire-and-forget — non-blocking so it doesn’t delay the response
    saveConversationSummary(userId, summary, latestTopics).catch(() => {});
  }

  console.timeEnd('[pipeline] total');

  // Return shape matches the AIResponse GraphQL type.
  return {
    answer: cleanAnswer,
    intent,
    userTurnCount: newTurnCount,
    recommendedPosts: recommendations,
    evaluation,
  };
}
