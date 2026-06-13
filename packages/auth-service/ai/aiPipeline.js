// packages/auth-service/ai/aiPipeline.js
// Orchestration / delegate layer for Nova's grounded AI pipeline.
//
// Pipeline flow:
//
//   User message (from GraphQL resolver)
//       ↓
//   [Step 1] Conversation Manager  — load history, track turn count, load user memory
//       ↓
//   [Step 2] Router / Planner Agent — classify intent → structured plan
//       ↓
//   [Step 3] Platform Tools        — load platformData only when plan.needsDatabase
//       ↓
//   [Step 4] Answer Agent          — grounded Gemini call, supports plan + mock mode
//       ↓
//   [Step 5] Validator Agent       — rule-based output verification + one-shot reflection
//       ↓
//   [Step 6] Save + Return         — persist exchange, return structured result
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
import { classifyIntent, INTENTS } from './routerAgent.js';
import { fetchDataForIntent } from './platformTools.js';
import { generateAnswer, generateReflection, resetModel } from './answerAgent.js';
import { extractRecommendedPosts } from './recommendationExtractor.js';
import {
  validate,
  evaluateResponse,
  loadKnownTitles,
  shouldValidateAnswer,
  validateAnswer,
} from './validatorAgent.js';
import {
  CHINESE_GREETING_RESPONSE,
  GREETING_RESPONSE,
  GENERIC_ERROR_RESPONSE,
  QUOTA_EXCEEDED_RESPONSE,
} from '../prompts/fallbackResponses.js';
import { buildUserMemoryContext, saveExplicitPreferences } from '../services/userMemoryService.js';

const isProduction = process.env.NODE_ENV === 'production';

const debugLog = (...args) => {
  if (!isProduction) console.log(...args);
};
const debugWarn = (...args) => {
  if (!isProduction) console.warn(...args);
};

// ── Greeting fast-path ───────────────────────────────────────────────────────
const SIMPLE_GREETING_RE =
  /^\s*(hi|hello|hey|yo|sup|hiya|howdy|greetings|ping|test|你好|您好|nihao)[!?.,'"\s]*$/i;
const CHINESE_GREETING_RE = /^\s*(你好|您好|nihao)[!?.,'"\s]*$/i;

function isSimpleGreeting(message) {
  return SIMPLE_GREETING_RE.test(message);
}

function getGreetingResponse(message) {
  return CHINESE_GREETING_RE.test(message) ? CHINESE_GREETING_RESPONSE : GREETING_RESPONSE;
}

// ── Plan normalizer ──────────────────────────────────────────────────────────
// Converts both old { intent, confidence } and new structured plan objects into
// a consistent plan shape so the rest of the pipeline always gets the same fields.
const FALLBACK_PLAN = {
  intent:              INTENTS.GENERAL_CHAT,
  mode:                'general_chat',
  confidence:          'fallback',
  needsDatabase:       false,
  needsUserProfile:    false,
  needsRecommendation: false,
  needsValidation:     false,
  dataSources:         [],
  executionOrder:      ['short_guidance'],
  responseStyle:       'general_guidance',
};

function normalizePlan(routerResult) {
  return {
    intent:              routerResult.intent      ?? INTENTS.GENERAL_CHAT,
    mode:                routerResult.mode         ?? 'general_chat',
    confidence:          routerResult.confidence   ?? 'default',
    needsDatabase:       Boolean(routerResult.needsDatabase),
    needsUserProfile:    Boolean(routerResult.needsUserProfile),
    needsRecommendation: Boolean(routerResult.needsRecommendation),
    needsValidation:     Boolean(routerResult.needsValidation),
    dataSources:         routerResult.dataSources  ?? [],
    executionOrder:      routerResult.executionOrder ?? [],
    responseStyle:       routerResult.responseStyle ?? 'general_guidance',
  };
}

// ── Platform data adapter ────────────────────────────────────────────────────
// Thin wrapper so the pipeline loads DB data only when the plan requires it.
async function buildPlatformDataForPlan({ plan, userId, userMessage }) {
  if (!plan.needsDatabase) return '';
  try {
    return await fetchDataForIntent(plan.intent, userId, userMessage);
  } catch (err) {
    console.error('[pipeline] platform data retrieval failed:', err?.message);
    return '';
  }
}

/**
 * Run the full AI agent pipeline for a single user message.
 *
 * @param {{ userId: string, username: string, message: string }} params
 * @returns {Promise<{
 *   answer: string,
 *   intent: string,
 *   mode: string,
 *   confidence: string,
 *   userTurnCount: number,
 *   recommendedPosts: Array,
 *   recommendations: Array,
 *   evaluation: object | null,
 *   validation: object | null,
 *   repaired: boolean,
 *   plan: object
 * }>}
 */
export async function runPipeline({ userId, username, message }) {
  if (!isProduction) {
    console.time('[pipeline] total');
  }
  debugLog('[pipeline] START', {
    userId: String(userId),
    requestType: 'askAI',
    messageLength: (message || '').length,
  });

  // ── Greeting fast-path — skip Gemini entirely ────────────────────────────
  if (isSimpleGreeting(message)) {
    debugLog('[pipeline] greeting fast-path — skipping Gemini execution loop');
    if (!isProduction) {
      console.timeEnd('[pipeline] total');
    }
    const greetingResponse = getGreetingResponse(message);
    saveExchange(userId, username, message, greetingResponse).catch(() => {});
    return {
      answer:           greetingResponse,
      intent:           'general_chat',
      mode:             'general_chat',
      confidence:       'default',
      userTurnCount:    0,
      recommendedPosts: [],
      recommendations:  [],
      evaluation:       null,
      validation:       null,
      repaired:         false,
      plan:             { ...FALLBACK_PLAN, confidence: 'default' },
    };
  }

  // ── Step 1: Conversation Manager ─────────────────────────────────────────
  if (!isProduction) console.time('[pipeline] step1 conversationManager');

  const [historyRecords, userTurnCount, userMemory, baseUserMemoryContext] = await Promise.all([
    loadHistory(userId),
    getUserTurnCount(userId),
    loadUserMemory(userId),
    buildUserMemoryContext(userId).catch(() => ''),
  ]);

  saveExplicitPreferences(userId, message).catch(() => {});
  const topicContext = extractTopicContext(historyRecords, message);

  const POISONED_PHRASE_RE =
    /I apologize|sorry for the confusion|let'?s refocus|oversight|Also consider \(not on this platform\)/i;

  const cleanHistory = historyRecords.filter(
    (m) => !(m.role === 'assistant' && POISONED_PHRASE_RE.test(m.content)),
  );

  // ── Step 2: Router / Planner Agent ───────────────────────────────────────
  if (!isProduction) console.time('[pipeline] step2 routerAgent');

  let plan;
  try {
    const routerResult = classifyIntent(message);
    plan = normalizePlan(routerResult);
  } catch (err) {
    console.error('[pipeline] router failed, using fallback plan:', err?.message);
    plan = { ...FALLBACK_PLAN };
  }

  debugLog(`[pipeline] intent="${plan.intent}" mode="${plan.mode}" confidence="${plan.confidence}"`);
  if (!isProduction) console.timeEnd('[pipeline] step2 routerAgent');

  const isCommunityOrLeaderboard =
    plan.intent === INTENTS.COMMUNITY_SUMMARY ||
    plan.intent === INTENTS.LEADERBOARD_QUERY ||
    plan.intent === INTENTS.LOW_RATING_QUERY;

  let conversationContext;
  if (isCommunityOrLeaderboard) {
    const lastUserTurn = cleanHistory.filter((m) => m.role === 'user').slice(-1);
    conversationContext = lastUserTurn.length
      ? `User (previous): ${lastUserTurn[0].content}`
      : '';
  } else {
    conversationContext = buildConversationContext(cleanHistory);
    if (userMemory.conversationSummary) {
      conversationContext = `${userMemory.conversationSummary}\n\n${conversationContext}`;
    }
    if (userMemory.trackedTopics?.length) {
      conversationContext = `[Recent topics: ${userMemory.trackedTopics.join(', ')}]\n${conversationContext}`;
    }
  }

  const newTurnCount = userTurnCount + 1;
  debugLog(
    `[pipeline] turn #${newTurnCount}, history: ${historyRecords.length} msg(s), topics: ${topicContext?.join(', ') ?? 'none'}`,
  );
  if (!isProduction) console.timeEnd('[pipeline] step1 conversationManager');

  // ── Step 3: Platform Tools (conditional on plan) ─────────────────────────
  if (!isProduction) console.time('[pipeline] step3 platformTools');

  // TODO: Replace PLATFORM_INVENTORY_QUERY path with a deterministic MongoDB
  // inventory handler so platform inventory queries never depend on free-form
  // LLM generation.
  const platformData = await buildPlatformDataForPlan({ plan, userId, userMessage: message });

  // User profile context: load only when plan requires it.
  const effectiveUserMemoryContext = plan.needsUserProfile ? baseUserMemoryContext : '';

  debugLog(`[pipeline] platformData: ${platformData.length} characters loaded`);
  if (!isProduction) console.timeEnd('[pipeline] step3 platformTools');

  // ── Step 4: Answer Agent ──────────────────────────────────────────────────
  if (!isProduction) console.time('[pipeline] step4 answerAgent');

  let rawAnswer;
  try {
    rawAnswer = await generateAnswer({
      userMessage:      message,
      intent:           plan.intent,
      plan,
      conversationContext,
      platformData,
      userMemoryContext: effectiveUserMemoryContext,
    });
  } catch (err) {
    console.error('[pipeline] answerAgent compilation error:', err?.message);
    const is429 =
      err?.message?.includes('429') ||
      err?.message?.includes('Too Many Requests') ||
      err?.message?.includes('quota');

    if (err?.isTimeout) {
      debugWarn('[pipeline] Gemini API runtime threshold timeout exceeded.');
    } else if (is429) {
      debugWarn('[pipeline] Gemini tier quota limitation triggered (429).');
    } else {
      resetModel();
    }

    if (!isProduction) {
      console.timeEnd('[pipeline] step4 answerAgent');
      console.timeEnd('[pipeline] total');
    }
    throw new Error(is429 ? QUOTA_EXCEEDED_RESPONSE : GENERIC_ERROR_RESPONSE);
  }
  if (!isProduction) console.timeEnd('[pipeline] step4 answerAgent');

  // ── Step 5: Rule-based Validation & One-shot Reflection ──────────────────
  if (!isProduction) console.time('[pipeline] step5 validateAndReflect');

  let finalAnswer = rawAnswer;
  let validation  = null;
  let repaired    = false;

  const needsValidation = shouldValidateAnswer({
    plan,
    intent: plan.intent,
    answer: rawAnswer,
  });

  if (needsValidation) {
    try {
      validation = validateAnswer({
        answer:           rawAnswer,
        intent:           plan.intent,
        plan,
        platformData,
        userMemoryContext: effectiveUserMemoryContext,
      });

      if (!validation.passed) {
        debugWarn('[pipeline] validation failed. action:', validation.suggestedAction, 'flags:', validation.flags);

        if (validation.suggestedAction === 'reflect') {
          try {
            if (!isProduction) console.time('[pipeline] step5 reflectionPass');
            const repairedText = await generateReflection({
              badAnswer:         rawAnswer,
              flags:             validation.flags,
              userMessage:       message,
              intent:            plan.intent,
              plan,
              platformData,
              userMemoryContext: effectiveUserMemoryContext,
            });
            if (!isProduction) console.timeEnd('[pipeline] step5 reflectionPass');

            finalAnswer = repairedText;
            repaired    = true;

            // One additional validation pass — no further reflection regardless of result.
            const postRepairValidation = validateAnswer({
              answer:           finalAnswer,
              intent:           plan.intent,
              plan,
              platformData,
              userMemoryContext: effectiveUserMemoryContext,
            });
            validation = postRepairValidation;
            debugLog('[pipeline] post-repair validation flags:', validation.flags.length);
          } catch (reflErr) {
            debugWarn('[pipeline] reflection failed, keeping original answer:', reflErr?.message);
          }

        } else if (validation.suggestedAction === 'hide_cards') {
          // Clean prose is returned but cards will be suppressed below.
          debugWarn('[pipeline] hide_cards: recommendation cards will be suppressed.');

        } else if (validation.suggestedAction === 'filter_cards') {
          // TODO: implement fine-grained card filtering by title.
          // Currently falls back to hiding all cards to stay safe.
          debugWarn('[pipeline] filter_cards: falling back to hide_cards (filtering not yet implemented).');

        } else if (validation.suggestedAction === 'log_only') {
          debugWarn('[pipeline] log_only: returning answer despite validation flags.');
        }
      }
    } catch (valErr) {
      console.error('[pipeline] validation threw unexpectedly — skipping:', valErr?.message);
      validation = null;
    }
  }

  if (!isProduction) console.timeEnd('[pipeline] step5 validateAndReflect');

  // ── Step 4b: Recommendation Extraction ───────────────────────────────────
  if (!isProduction) console.time('[pipeline] step4b extractRecommendations');

  const [{ cleanAnswer, recommendations: rawReco }, knownTitles] = await Promise.all([
    extractRecommendedPosts(finalAnswer),
    loadKnownTitles(),
  ]);

  // Suppress cards when hide_cards / filter_cards was the action.
  const suppressCards =
    validation &&
    !validation.passed &&
    (validation.suggestedAction === 'hide_cards' || validation.suggestedAction === 'filter_cards');

  let recommendations = suppressCards ? [] : rawReco;

  debugLog(
    `[pipeline] extraction complete: ${recommendations.length} recommendations, ${knownTitles?.length ?? 0} canonical titles`,
  );
  if (!isProduction) console.timeEnd('[pipeline] step4b extractRecommendations');

  // ── Legacy semantic evaluation (backward compat with existing pipeline tests) ─
  if (!isProduction) console.time('[pipeline] step5 evaluateAndReflect');
  let { evaluation } = evaluateResponse(cleanAnswer, recommendations, knownTitles);
  evaluation = { ...evaluation, wasReflected: repaired };

  // Structural sanity protection.
  const { valid, reason } = validate(cleanAnswer);
  if (!valid) {
    debugWarn('[pipeline] structural baseline check failed:', reason);
    if (!isProduction) {
      console.timeEnd('[pipeline] step5 evaluateAndReflect');
      console.timeEnd('[pipeline] total');
    }
    return {
      answer:           GENERIC_ERROR_RESPONSE,
      intent:           plan.intent,
      mode:             plan.mode,
      confidence:       plan.confidence,
      userTurnCount:    newTurnCount,
      recommendedPosts: [],
      recommendations:  [],
      evaluation:       null,
      validation,
      repaired,
      plan,
    };
  }

  debugLog(
    `[pipeline] Target verification complete. grounding=${
      evaluation.groundingScore != null ? evaluation.groundingScore.toFixed(2) : 'n/a'
    } hallucinations=${evaluation.hallucinations.length} safety=${
      evaluation.safetyPassed ? 'OK' : 'FAIL'
    } reflected=${repaired}`,
  );
  if (!isProduction) console.timeEnd('[pipeline] step5 evaluateAndReflect');

  // ── Step 6: Database Persistence ─────────────────────────────────────────
  await saveExchange(userId, username, message, cleanAnswer);
  debugLog('[pipeline] Canonical transaction saved successfully.');

  if (newTurnCount % 5 === 0) {
    debugLog(`[pipeline] 5-turn cadence achieved (turn ${newTurnCount}) — pushing rollups`);
    const summary    = buildSimpleSummary(historyRecords, message, cleanAnswer);
    const latestTopics = extractTopicContext(historyRecords, message) ?? [];
    saveConversationSummary(userId, summary, latestTopics).catch(() => {});
  }

  if (!isProduction) console.timeEnd('[pipeline] total');

  return {
    answer:           cleanAnswer,
    intent:           plan.intent,
    mode:             plan.mode,
    confidence:       plan.confidence,
    userTurnCount:    newTurnCount,
    recommendedPosts: recommendations,   // backward-compat alias
    recommendations,
    evaluation,
    validation,
    repaired,
    plan,
  };
}