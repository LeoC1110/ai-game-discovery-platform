// packages/auth-service/ai/aiPipeline.js
// Main AI agent pipeline — connects all modular steps in sequence.
//
// Pipeline flow:
//
//   User message (from GraphQL resolver)
//       ↓
//   [Step 1] Conversation Manager  — load history, track turn count, load user memory
//       ↓
//   [Step 2] Router Agent          — classify intent (Deterministic rule or fast model)
//       ↓
//   [Step 3] Platform Tools        — fetch DB data relevant to intent (Grounding layer)
//       ↓
//   [Step 4] Answer Agent          — call Gemini with context (Layer 1 Generation)
//       ↓
//   [Step 5] Validator Agent       — semantic evaluation + optional reflection pass (Layer 2 Guardrail)
//       ↓
//   [Step 6] Save + Return         — persist exchange, clean answer block, return to resolver
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
import { buildUserMemoryContext, saveExplicitPreferences } from '../services/userMemoryService.js';

const isProduction = process.env.NODE_ENV === 'production';

const debugLog = (...args) => {
  if (!isProduction) console.log(...args);
};
const debugWarn = (...args) => {
  if (!isProduction) console.warn(...args);
};

// ── Greeting fast-path ───────────────────────────────────────────────────────
// Matches simple one-word greetings in English, Pinyin, or Chinese characters.
const SIMPLE_GREETING_RE =
  /^\s*(hi|hello|hey|yo|sup|hiya|howdy|greetings|ping|test|你好|您好|nihao)[!?.,'"\s]*$/i;

function isSimpleGreeting(message) {
  return SIMPLE_GREETING_RE.test(message);
}

/**
 * Run the full AI agent pipeline for a single user message.
 * Supports Layer 1 creation, Layer 2 validation defense, and self-healing reflection blocks.
 *
 * @param {{ userId: string, username: string, message: string }} params
 * @returns {Promise<{
 * answer: string,
 * intent: string,
 * userTurnCount: number,
 * recommendedPosts: Array,
 * evaluation: object
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
    // Fire-and-forget logging initialization
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
  if (!isProduction) {
    console.time('[pipeline] step1 conversationManager');
  }
  const [historyRecords, userTurnCount, userMemory, userMemoryContext] = await Promise.all([
    loadHistory(userId),
    getUserTurnCount(userId),
    loadUserMemory(userId),
    buildUserMemoryContext(userId).catch(() => ''),
  ]);

  // Async tracking profile mutations safely
  saveExplicitPreferences(userId, message).catch(() => {});
  const topicContext = extractTopicContext(historyRecords, message);

  // Toxic responses containing meta-apologies or invalid references must be purged from memory
  const POISONED_PHRASE_RE =
    /I apologize|sorry for the confusion|let'?s refocus|oversight|Also consider \(not on this platform\)/i;

  const cleanHistory = historyRecords.filter(
    (m) => !(m.role === 'assistant' && POISONED_PHRASE_RE.test(m.content)),
  );

  // ── Step 2: Router Agent ──────────────────────────────────────────────────
  if (!isProduction) {
    console.time('[pipeline] step2 routerAgent');
  }
  const { intent, confidence } = classifyIntent(message);
  debugLog(`[pipeline] intent="${intent}" confidence="${confidence}"`);
  if (!isProduction) {
    console.timeEnd('[pipeline] step2 routerAgent');
  }

  const isCommunityOrLeaderboard =
    intent === 'community_summary' ||
    intent === 'leaderboard_query' ||
    intent === 'low_rating_query';

  // Build specialized contextual history frames
  let conversationContext;
  if (isCommunityOrLeaderboard) {
    // Drop full legacy scopes for public trends queries to enforce pure grounding constraints
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
  if (!isProduction) {
    console.timeEnd('[pipeline] step1 conversationManager');
  }

  // ── Step 3: Platform Tools (Grounding Ingestion) ──────────────────────────
  if (!isProduction) {
    console.time('[pipeline] step3 platformTools');
  }
  const platformData = await fetchDataForIntent(intent, userId, message);
  debugLog(`[pipeline] platformData: ${platformData.length} characters loaded`);
  if (!isProduction) {
    console.timeEnd('[pipeline] step3 platformTools');
  }

  // ── Step 4: Answer Agent (Layer 1 Generation) ─────────────────────────────
  if (!isProduction) {
    console.time('[pipeline] step4 answerAgent');
  }
  let answer;
  try {
    answer = await generateAnswer({
      userMessage: message,
      intent,
      conversationContext,
      platformData,
      userMemoryContext,
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
      resetModel(); // Safe tear down of corrupted sockets or channels
    }

    if (!isProduction) {
      console.timeEnd('[pipeline] step4 answerAgent');
      console.timeEnd('[pipeline] total');
    }
    throw new Error(is429 ? QUOTA_EXCEEDED_RESPONSE : GENERIC_ERROR_RESPONSE);
  }
  if (!isProduction) {
    console.timeEnd('[pipeline] step4 answerAgent');
  }

  // ── Step 4b: Extractions and Title Audits ──────────────────────────────────
  if (!isProduction) {
    console.time('[pipeline] step4b extractRecommendations');
  }
  const [{ cleanAnswer: rawClean, recommendations: rawReco }, knownTitles] = await Promise.all([
    extractRecommendedPosts(answer),
    loadKnownTitles(),
  ]);
  let cleanAnswer = rawClean;
  let recommendations = rawReco;
  debugLog(`[pipeline] extraction complete: ${recommendations.length} recommendations, ${knownTitles?.length ?? 0} canonical titles`);
  if (!isProduction) {
    console.timeEnd('[pipeline] step4b extractRecommendations');
  }

  // ── Step 5: Semantic Evaluation & Self-Healing Reflection Loop ────────────
  if (!isProduction) {
    console.time('[pipeline] step5 evaluateAndReflect');
  }
  let { evaluation, needsReflection } = evaluateResponse(cleanAnswer, recommendations, knownTitles);
  let wasReflected = false;

  if (needsReflection) {
    debugWarn('[pipeline] Layer 2 guardrail breach detected. Activating reflection loop. Flags:', evaluation.flags);
    try {
      if (!isProduction) {
        console.time('[pipeline] step5 reflection Pass');
      }
      const reflectedText = await generateReflection({
        badAnswer: cleanAnswer,
        flags: evaluation.flags,
        userMessage: message,
        intent,
        platformData,
        userMemoryContext,
      });
      if (!isProduction) {
        console.timeEnd('[pipeline] step5 reflection Pass');
      }

      const re = await extractRecommendedPosts(reflectedText);
      cleanAnswer = re.cleanAnswer;
      recommendations = re.recommendations;
      
      // Re-evaluate corrected response quality metrics
      ({ evaluation } = evaluateResponse(cleanAnswer, recommendations, knownTitles));
      wasReflected = true;
      debugLog('[pipeline] Reflection loop complete. Remaining security flags:', evaluation.flags.length);
    } catch (err) {
      debugWarn('[pipeline] Reflection system failure — falling back to legacy generation stream:', err?.message);
    }
  }

  evaluation = { ...evaluation, wasReflected };

  // Structural Sanity Protection
  const { valid, reason } = validate(cleanAnswer);
  if (!valid) {
    debugWarn('[pipeline] Structural baseline check failed:', reason);
    if (!isProduction) {
      console.timeEnd('[pipeline] step5 evaluateAndReflect');
      console.timeEnd('[pipeline] total');
    }
    return {
      answer: GENERIC_ERROR_RESPONSE,
      intent,
      userTurnCount: newTurnCount,
      recommendedPosts: [],
      evaluation: null,
    };
  }
  
  debugLog(
    `[pipeline] Target verification complete. grounding=${
      evaluation.groundingScore != null ? evaluation.groundingScore.toFixed(2) : 'n/a'
    } hallucinations=${evaluation.hallucinations.length} safety=${
      evaluation.safetyPassed ? 'OK' : 'FAIL'
    } reflected=${wasReflected}`,
  );
  if (!isProduction) {
    console.timeEnd('[pipeline] step5 evaluateAndReflect');
  }

  // ── Step 6: Database Persistence ─────────────────────────────────────────
  await saveExchange(userId, username, message, cleanAnswer);
  debugLog('[pipeline] Canonical transaction saved successfully.');

  // ── 5-turn Milestone Compressed Summary Trigger ───────────────────────────
  if (newTurnCount % 5 === 0) {
    debugLog(`[pipeline] 5-turn cadence achieved (turn ${newTurnCount}) — pushing rollups`);
    const summary = buildSimpleSummary(historyRecords, message, cleanAnswer);
    const latestTopics = extractTopicContext(historyRecords, message) ?? [];
    
    // Dispatched safely to avoid thread pool blockages
    saveConversationSummary(userId, summary, latestTopics).catch(() => {});
  }

  if (!isProduction) {
    console.timeEnd('[pipeline] total');
  }

  // Return payload precisely synchronized with the server's AIResponse GraphQL entity schema
  return {
    answer: cleanAnswer,
    intent,
    userTurnCount: newTurnCount,
    recommendedPosts: recommendations,
    evaluation,
  };
}