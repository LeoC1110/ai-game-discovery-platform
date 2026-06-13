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
//   [Step 2b] Plan Normalizer       — normalize old/new router output + safety net
//       ↓
//   [Step 3] Platform Tools         — load platformData when plan requires it
//       ↓
//   [Step 4] Answer Agent           — grounded Gemini call, supports plan + mock mode
//       ↓
//   [Step 5] Validator Agent        — rule-based output verification + one-shot reflection
//       ↓
//   [Step 6] Save + Return          — persist exchange, return structured result
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

import {
  buildUserMemoryContext,
  saveExplicitPreferences,
} from '../services/userMemoryService.js';

const isProduction = process.env.NODE_ENV === 'production';

const debugLog = (...args) => {
  if (!isProduction) console.log(...args);
};

const debugWarn = (...args) => {
  if (!isProduction) console.warn(...args);
};

// ── Legacy intent compatibility ──────────────────────────────────────────────

const LEGACY_INTENTS = {
  GAME_RECOMMENDATION: INTENTS?.GAME_RECOMMENDATION ?? 'game_recommendation',
  BOOKMARK_ANALYSIS: INTENTS?.BOOKMARK_ANALYSIS ?? 'bookmark_analysis',
  COMMUNITY_SUMMARY: INTENTS?.COMMUNITY_SUMMARY ?? 'community_summary',
  LEADERBOARD_QUERY: INTENTS?.LEADERBOARD_QUERY ?? 'leaderboard_query',
  LOW_RATING_QUERY: INTENTS?.LOW_RATING_QUERY ?? 'low_rating_query',
  PLATFORM_INVENTORY_QUERY:
    INTENTS?.PLATFORM_INVENTORY_QUERY ?? 'platform_inventory_query',
  MIXED_QUERY_RECOMMENDATION:
    INTENTS?.MIXED_QUERY_RECOMMENDATION ?? 'mixed_query_recommendation',
  GENERAL_CHAT: INTENTS?.GENERAL_CHAT ?? 'general_chat',
};

const LAYER1_BEHAVIORS = {
  DISCOVERY: 'discovery',
  RANKING: 'ranking',
  RECOMMENDATION: 'recommendation',
  PERSONALIZATION: 'personalization',
  ACTION_ENGAGEMENT: 'action_engagement',
  GENERAL_CHAT: 'general_chat',
};

const LAYER2_INTENTS = {
  CONTEXT_BASED_RECOMMENDATION: 'context_based_recommendation',
  SIMILAR_GAME_DISCOVERY: 'similar_game_discovery',
  COMPARE_GAMES: 'compare_games',
  RECOMMENDATION_EXPLANATION: 'recommendation_explanation',
  TASTE_PROFILE_ANALYSIS: 'taste_profile_analysis',
  REFINE_RECOMMENDATIONS: 'refine_recommendations',
  GAME_DETAIL_QUERY: 'game_detail_query',
  FOLLOW_UP_ACTION: 'follow_up_action',
};

const DATABASE_INTENTS = new Set([
  LEGACY_INTENTS.GAME_RECOMMENDATION,
  LEGACY_INTENTS.BOOKMARK_ANALYSIS,
  LEGACY_INTENTS.COMMUNITY_SUMMARY,
  LEGACY_INTENTS.LEADERBOARD_QUERY,
  LEGACY_INTENTS.LOW_RATING_QUERY,
  LEGACY_INTENTS.PLATFORM_INVENTORY_QUERY,
  LEGACY_INTENTS.MIXED_QUERY_RECOMMENDATION,
]);

const PROFILE_INTENTS = new Set([
  LEGACY_INTENTS.BOOKMARK_ANALYSIS,
  LEGACY_INTENTS.MIXED_QUERY_RECOMMENDATION,
]);

const RECOMMENDATION_INTENTS = new Set([
  LEGACY_INTENTS.GAME_RECOMMENDATION,
  LEGACY_INTENTS.BOOKMARK_ANALYSIS,
  LEGACY_INTENTS.MIXED_QUERY_RECOMMENDATION,
]);

const RANKING_INTENTS = new Set([
  LEGACY_INTENTS.COMMUNITY_SUMMARY,
  LEGACY_INTENTS.LEADERBOARD_QUERY,
  LEGACY_INTENTS.LOW_RATING_QUERY,
]);

const DATABASE_MODES = new Set([
  'query',
  'discovery',
  'ranking',
  'recommendation',
  'personalization',
  'mixed',
]);

const VALIDATION_MODES = new Set([
  'query',
  'discovery',
  'ranking',
  'recommendation',
  'personalization',
  'mixed',
]);

const RECOMMENDATION_LAYER2_INTENTS = new Set([
  LAYER2_INTENTS.CONTEXT_BASED_RECOMMENDATION,
  LAYER2_INTENTS.SIMILAR_GAME_DISCOVERY,
  LAYER2_INTENTS.COMPARE_GAMES,
  LAYER2_INTENTS.RECOMMENDATION_EXPLANATION,
  LAYER2_INTENTS.REFINE_RECOMMENDATIONS,
]);

// ── Greeting fast-path ───────────────────────────────────────────────────────

const SIMPLE_GREETING_RE =
  /^\s*(hi|hello|hey|yo|sup|hiya|howdy|greetings|ping|test|你好|您好|nihao)[!?.,'"\s]*$/i;

const CHINESE_GREETING_RE =
  /^\s*(你好|您好|nihao)[!?.,'"\s]*$/i;

function isSimpleGreeting(message) {
  return SIMPLE_GREETING_RE.test(String(message ?? ''));
}

function getGreetingResponse(message) {
  return CHINESE_GREETING_RE.test(String(message ?? ''))
    ? CHINESE_GREETING_RESPONSE
    : GREETING_RESPONSE;
}

// ── Generic helpers ──────────────────────────────────────────────────────────

function normalizeText(value) {
  return String(value ?? '').toLowerCase().trim();
}

function hasAnyBehavior(plan, behavior) {
  return Array.isArray(plan?.layer1Behaviors) && plan.layer1Behaviors.includes(behavior);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function hasDataSource(plan, source) {
  return Array.isArray(plan?.dataSources) && plan.dataSources.includes(source);
}

// ── Message-level safety net ─────────────────────────────────────────────────
// This catches obvious platform quick-prompt requests when routerAgent still
// returns general_chat due to old/new intent mismatch.

function inferLegacyIntentFromMessage(message) {
  const text = normalizeText(message);

  if (!text) {
    return null;
  }

  const isTrendPick =
    /\btrending\b/.test(text) &&
    /\brecommend\b/.test(text) &&
    /\b(my|me|taste|bookmarks?|preferences?|profile)\b/.test(text);

  if (isTrendPick) {
    return LEGACY_INTENTS.MIXED_QUERY_RECOMMENDATION;
  }

  if (
    /\bmy\s+taste\b/.test(text) ||
    /\banaly[sz]e\s+my\s+bookmarked\s+games\b/.test(text) ||
    /\bsummarize\s+my\s+taste\s+profile\b/.test(text) ||
    /\bbookmarked\s+games\b/.test(text)
  ) {
    return LEGACY_INTENTS.BOOKMARK_ANALYSIS;
  }

  if (
    /\bbrowse\s+(platform\s+)?games\b/.test(text) ||
    /\bshow\s+the\s+first\s+\d+\s+games\b/.test(text) ||
    /\bshow\s+\d+\s+(platform\s+)?games\b/.test(text) ||
    /\bfirst\s+\d+\s+games\s+(available\s+)?on\s+(the\s+)?platform\b/.test(text) ||
    /\bgames\s+available\s+on\s+(the\s+)?platform\b/.test(text)
  ) {
    return LEGACY_INTENTS.PLATFORM_INVENTORY_QUERY;
  }

  if (
    /\btop[\s-]?rated\b/.test(text) ||
    /\bhighest[\s-]?rated\b/.test(text) ||
    /\bleaderboard\b/.test(text)
  ) {
    return LEGACY_INTENTS.LEADERBOARD_QUERY;
  }

  if (
    /\blow[\s-]?rated\b/.test(text) ||
    /\blower[\s-]?rated\b/.test(text) ||
    /\bworst[\s-]?rated\b/.test(text) ||
    /\bmixed\s+or\s+lower[\s-]?rated\b/.test(text)
  ) {
    return LEGACY_INTENTS.LOW_RATING_QUERY;
  }

  if (
    /\btrending\b/.test(text) ||
    /\bcommunity\s+trends?\b/.test(text) ||
    /\bpopular\s+right\s+now\b/.test(text)
  ) {
    return LEGACY_INTENTS.COMMUNITY_SUMMARY;
  }

  if (
    /\brecommend\b/.test(text) &&
    /\b(my|me|for\s+me|bookmarks?|preferences?|taste|profile)\b/.test(text)
  ) {
    return LEGACY_INTENTS.BOOKMARK_ANALYSIS;
  }

  if (
    /\brecommend\b/.test(text) ||
    /\bquick\s+picks?\b/.test(text) ||
    /\bsuggestions?\b/.test(text) ||
    /\bwhat\s+should\s+i\s+play\b/.test(text)
  ) {
    return LEGACY_INTENTS.GAME_RECOMMENDATION;
  }

  return null;
}

function inferLayer1BehaviorsFromIntent(intent, message = '') {
  const text = normalizeText(message);

  switch (intent) {
    case LEGACY_INTENTS.PLATFORM_INVENTORY_QUERY:
      return [LAYER1_BEHAVIORS.DISCOVERY];

    case LEGACY_INTENTS.COMMUNITY_SUMMARY:
    case LEGACY_INTENTS.LEADERBOARD_QUERY:
    case LEGACY_INTENTS.LOW_RATING_QUERY:
      return [LAYER1_BEHAVIORS.RANKING];

    case LEGACY_INTENTS.GAME_RECOMMENDATION:
      return [LAYER1_BEHAVIORS.RECOMMENDATION];

    case LEGACY_INTENTS.BOOKMARK_ANALYSIS:
      if (/\brecommend\b/.test(text)) {
        return [LAYER1_BEHAVIORS.RECOMMENDATION, LAYER1_BEHAVIORS.PERSONALIZATION];
      }
      return [LAYER1_BEHAVIORS.PERSONALIZATION];

    case LEGACY_INTENTS.MIXED_QUERY_RECOMMENDATION:
      return [
        LAYER1_BEHAVIORS.RANKING,
        LAYER1_BEHAVIORS.RECOMMENDATION,
        LAYER1_BEHAVIORS.PERSONALIZATION,
      ];

    default:
      return [LAYER1_BEHAVIORS.GENERAL_CHAT];
  }
}

function inferPrimaryBehavior(layer1Behaviors) {
  const behaviors = safeArray(layer1Behaviors);

  if (behaviors.includes(LAYER1_BEHAVIORS.RANKING)) {
    return LAYER1_BEHAVIORS.RANKING;
  }

  if (behaviors.includes(LAYER1_BEHAVIORS.RECOMMENDATION)) {
    return LAYER1_BEHAVIORS.RECOMMENDATION;
  }

  if (behaviors.includes(LAYER1_BEHAVIORS.PERSONALIZATION)) {
    return LAYER1_BEHAVIORS.PERSONALIZATION;
  }

  if (behaviors.includes(LAYER1_BEHAVIORS.DISCOVERY)) {
    return LAYER1_BEHAVIORS.DISCOVERY;
  }

  if (behaviors.includes(LAYER1_BEHAVIORS.ACTION_ENGAGEMENT)) {
    return LAYER1_BEHAVIORS.ACTION_ENGAGEMENT;
  }

  return LAYER1_BEHAVIORS.GENERAL_CHAT;
}

function inferLayer2IntentFromMessage(message, legacyIntent) {
  const text = normalizeText(message);

  if (
    legacyIntent === LEGACY_INTENTS.BOOKMARK_ANALYSIS &&
    (
      /\bmy\s+taste\b/.test(text) ||
      /\banaly[sz]e\s+my\s+bookmarked\s+games\b/.test(text) ||
      /\bsummarize\s+my\s+taste\s+profile\b/.test(text)
    )
  ) {
    return LAYER2_INTENTS.TASTE_PROFILE_ANALYSIS;
  }

  if (
    /\bsimilar\s+to\b/.test(text) ||
    /\bgames?\s+like\b/.test(text) ||
    /\bmore\s+like\s+this\b/.test(text)
  ) {
    return LAYER2_INTENTS.SIMILAR_GAME_DISCOVERY;
  }

  if (
    /\bcompare\b/.test(text) ||
    /\bwhich\s+(one\s+)?is\s+better\b/.test(text) ||
    /\bvs\.?\b/.test(text) ||
    /\bversus\b/.test(text) ||
    /\bworth\s+buying\b/.test(text)
  ) {
    return LAYER2_INTENTS.COMPARE_GAMES;
  }

  if (
    /\bwhy\b/.test(text) &&
    (
      /\brecommend/.test(text) ||
      /\bfit/.test(text) ||
      /\bmatch/.test(text)
    )
  ) {
    return LAYER2_INTENTS.RECOMMENDATION_EXPLANATION;
  }

  if (
    /\bdon'?t\s+recommend\b/.test(text) ||
    /\bdo\s+not\s+recommend\b/.test(text) ||
    /\bmore\s+story/.test(text) ||
    /\bless\s+like\b/.test(text) ||
    /\bnot\s+for\s+me\b/.test(text)
  ) {
    return LAYER2_INTENTS.REFINE_RECOMMENDATIONS;
  }

  if (
    /\btell\s+me\s+about\b/.test(text) ||
    /\bwhat\s+is\s+this\s+game\s+about\b/.test(text) ||
    /\bis\s+this\s+game\b/.test(text)
  ) {
    return LAYER2_INTENTS.GAME_DETAIL_QUERY;
  }

  if (
    /\bsave\b/.test(text) ||
    /\bbookmark\b/.test(text) ||
    /\bwatch\s+trailer\b/.test(text) ||
    /\bwrite\s+a\s+review\b/.test(text) ||
    /\bshare\b/.test(text)
  ) {
    return LAYER2_INTENTS.FOLLOW_UP_ACTION;
  }

  if (
    legacyIntent === LEGACY_INTENTS.GAME_RECOMMENDATION ||
    legacyIntent === LEGACY_INTENTS.MIXED_QUERY_RECOMMENDATION ||
    (
      legacyIntent === LEGACY_INTENTS.BOOKMARK_ANALYSIS &&
      /\brecommend\b/.test(text)
    )
  ) {
    return LAYER2_INTENTS.CONTEXT_BASED_RECOMMENDATION;
  }

  return null;
}

function mapLegacyIntentFromLayer2Intent(layer2Intent) {
  switch (layer2Intent) {
    case LAYER2_INTENTS.TASTE_PROFILE_ANALYSIS:
      return LEGACY_INTENTS.BOOKMARK_ANALYSIS;

    case LAYER2_INTENTS.CONTEXT_BASED_RECOMMENDATION:
    case LAYER2_INTENTS.SIMILAR_GAME_DISCOVERY:
    case LAYER2_INTENTS.COMPARE_GAMES:
    case LAYER2_INTENTS.RECOMMENDATION_EXPLANATION:
    case LAYER2_INTENTS.REFINE_RECOMMENDATIONS:
      return LEGACY_INTENTS.GAME_RECOMMENDATION;

    case LAYER2_INTENTS.GAME_DETAIL_QUERY:
      return LEGACY_INTENTS.PLATFORM_INVENTORY_QUERY;

    case LAYER2_INTENTS.FOLLOW_UP_ACTION:
      return LEGACY_INTENTS.GENERAL_CHAT;

    default:
      return null;
  }
}

function resolveLegacyIntentFromPlan(rawPlan, message) {
  const rawIntent = rawPlan?.intent;
  const inferredIntent = inferLegacyIntentFromMessage(message);

  // If router returned a useful legacy intent, keep it.
  if (rawIntent && rawIntent !== LEGACY_INTENTS.GENERAL_CHAT) {
    return rawIntent;
  }

  // Safety net for obvious platform/product prompts.
  if (inferredIntent) {
    return inferredIntent;
  }

  const layer2Intent = rawPlan?.layer2Intent;
  const primaryBehavior = rawPlan?.primaryBehavior;

  const mappedFromLayer2 = mapLegacyIntentFromLayer2Intent(layer2Intent);
  if (mappedFromLayer2) {
    return mappedFromLayer2;
  }

  switch (primaryBehavior) {
    case LAYER1_BEHAVIORS.DISCOVERY:
      return LEGACY_INTENTS.PLATFORM_INVENTORY_QUERY;

    case LAYER1_BEHAVIORS.RANKING:
      return LEGACY_INTENTS.COMMUNITY_SUMMARY;

    case LAYER1_BEHAVIORS.RECOMMENDATION:
      return LEGACY_INTENTS.GAME_RECOMMENDATION;

    case LAYER1_BEHAVIORS.PERSONALIZATION:
      return LEGACY_INTENTS.BOOKMARK_ANALYSIS;

    case LAYER1_BEHAVIORS.ACTION_ENGAGEMENT:
      return LEGACY_INTENTS.GENERAL_CHAT;

    default:
      return LEGACY_INTENTS.GENERAL_CHAT;
  }
}

function resolveMode({ rawMode, intent, primaryBehavior }) {
  if (
    rawMode &&
    rawMode !== 'general_chat' &&
    rawMode !== 'fallback'
  ) {
    return rawMode;
  }

  if (intent === LEGACY_INTENTS.MIXED_QUERY_RECOMMENDATION) {
    return 'mixed';
  }

  switch (intent) {
    case LEGACY_INTENTS.PLATFORM_INVENTORY_QUERY:
      return 'discovery';

    case LEGACY_INTENTS.COMMUNITY_SUMMARY:
    case LEGACY_INTENTS.LEADERBOARD_QUERY:
    case LEGACY_INTENTS.LOW_RATING_QUERY:
      return 'ranking';

    case LEGACY_INTENTS.GAME_RECOMMENDATION:
      return 'recommendation';

    case LEGACY_INTENTS.BOOKMARK_ANALYSIS:
      return 'personalization';

    default:
      break;
  }

  switch (primaryBehavior) {
    case LAYER1_BEHAVIORS.DISCOVERY:
      return 'discovery';

    case LAYER1_BEHAVIORS.RANKING:
      return 'ranking';

    case LAYER1_BEHAVIORS.RECOMMENDATION:
      return 'recommendation';

    case LAYER1_BEHAVIORS.PERSONALIZATION:
      return 'personalization';

    case LAYER1_BEHAVIORS.ACTION_ENGAGEMENT:
      return 'action';

    default:
      return 'general_chat';
  }
}

function inferDataSources({ intent, layer1Behaviors, rawDataSources }) {
  const existing = safeArray(rawDataSources);

  if (existing.length > 0) {
    return unique(existing);
  }

  if (intent === LEGACY_INTENTS.PLATFORM_INVENTORY_QUERY) {
    return ['platform_posts'];
  }

  if (RANKING_INTENTS.has(intent)) {
    return ['platform_posts', 'community_signals'];
  }

  if (intent === LEGACY_INTENTS.GAME_RECOMMENDATION) {
    return ['platform_posts'];
  }

  if (intent === LEGACY_INTENTS.BOOKMARK_ANALYSIS) {
    return ['platform_posts', 'user_bookmarks', 'user_profile'];
  }

  if (intent === LEGACY_INTENTS.MIXED_QUERY_RECOMMENDATION) {
    return ['platform_posts', 'community_signals', 'user_bookmarks', 'user_profile'];
  }

  if (layer1Behaviors.includes(LAYER1_BEHAVIORS.DISCOVERY)) {
    return ['platform_posts'];
  }

  if (layer1Behaviors.includes(LAYER1_BEHAVIORS.RANKING)) {
    return ['platform_posts', 'community_signals'];
  }

  if (layer1Behaviors.includes(LAYER1_BEHAVIORS.RECOMMENDATION)) {
    return ['platform_posts'];
  }

  return [];
}

function inferExecutionOrder({ intent, mode, needsRecommendation }) {
  if (intent === LEGACY_INTENTS.MIXED_QUERY_RECOMMENDATION || mode === 'mixed') {
    return ['query_first', 'recommend_second'];
  }

  if (needsRecommendation) {
    return ['retrieve_context', 'recommend'];
  }

  if (DATABASE_INTENTS.has(intent)) {
    return ['query'];
  }

  return ['short_guidance'];
}

function inferResponseStyle({ intent, mode, layer2Intent }) {
  if (layer2Intent === LAYER2_INTENTS.TASTE_PROFILE_ANALYSIS) {
    return 'taste_profile_summary';
  }

  if (intent === LEGACY_INTENTS.MIXED_QUERY_RECOMMENDATION || mode === 'mixed') {
    return 'facts_then_recommendation';
  }

  if (intent === LEGACY_INTENTS.PLATFORM_INVENTORY_QUERY || mode === 'discovery') {
    return 'factual_list';
  }

  if (RANKING_INTENTS.has(intent) || mode === 'ranking') {
    return 'ranking_summary';
  }

  if (RECOMMENDATION_INTENTS.has(intent) || mode === 'recommendation') {
    return 'recommendation';
  }

  if (mode === 'personalization') {
    return 'personalized_summary';
  }

  if (mode === 'action') {
    return 'action_guidance';
  }

  return 'general_guidance';
}

// ── Plan normalizer ──────────────────────────────────────────────────────────
// Converts both old { intent, confidence } and new structured router plans into
// a stable plan shape consumed by platformTools, answerAgent, and validatorAgent.

const FALLBACK_PLAN = {
  routerVersion: 'fallback',
  intent: LEGACY_INTENTS.GENERAL_CHAT,
  dataIntent: LEGACY_INTENTS.GENERAL_CHAT,
  mode: 'general_chat',
  confidence: 'fallback',

  layer1Behaviors: [LAYER1_BEHAVIORS.GENERAL_CHAT],
  primaryBehavior: LAYER1_BEHAVIORS.GENERAL_CHAT,
  layer2Intent: null,

  needsDatabase: false,
  needsUserProfile: false,
  needsRecommendation: false,
  needsValidation: false,
  needsAction: false,

  dataSources: [],
  executionOrder: ['short_guidance'],
  responseStyle: 'general_guidance',

  entities: {
    games: [],
    genres: [],
    platforms: [],
    tags: [],
    actions: [],
  },

  constraints: {
    mood: null,
    hardware: null,
    platform: null,
    playStyle: null,
    difficulty: null,
    sessionLength: null,
    feedbackDirection: null,
    excludedGenres: [],
    preferredGenres: [],
    excludedTags: [],
    preferredTags: [],
  },
};

function normalizePlan(routerResult, userMessage) {
  const rawPlan = routerResult && typeof routerResult === 'object'
    ? routerResult
    : {};

  const baseIntent = resolveLegacyIntentFromPlan(rawPlan, userMessage);

  const inferredLayer1Behaviors = inferLayer1BehaviorsFromIntent(baseIntent, userMessage);

  const layer1Behaviors = unique([
    ...safeArray(rawPlan.layer1Behaviors),
    ...inferredLayer1Behaviors,
  ]);

  const primaryBehavior =
    rawPlan.primaryBehavior && rawPlan.primaryBehavior !== LAYER1_BEHAVIORS.GENERAL_CHAT
      ? rawPlan.primaryBehavior
      : inferPrimaryBehavior(layer1Behaviors);

  const layer2Intent =
    rawPlan.layer2Intent ??
    inferLayer2IntentFromMessage(userMessage, baseIntent);

  // If router fell back to general_chat but we can infer a concrete Layer 2
  // intent from the message text, upgrade the legacy intent so platform data
  // loading and mode resolution stay aligned with the inferred task.
  const upgradedIntentFromLayer2 = mapLegacyIntentFromLayer2Intent(layer2Intent);
  const intent =
    baseIntent === LEGACY_INTENTS.GENERAL_CHAT && upgradedIntentFromLayer2
      ? upgradedIntentFromLayer2
      : baseIntent;

  const mode = resolveMode({
    rawMode: rawPlan.mode,
    intent,
    primaryBehavior,
  });

  const dataSources = inferDataSources({
    intent,
    layer1Behaviors,
    rawDataSources: rawPlan.dataSources,
  });

  const needsDatabase =
    rawPlan.needsDatabase === true ||
    DATABASE_INTENTS.has(intent) ||
    DATABASE_MODES.has(mode) ||
    hasDataSource({ dataSources }, 'platform_posts') ||
    hasDataSource({ dataSources }, 'community_signals');

  const needsUserProfile =
    rawPlan.needsUserProfile === true ||
    PROFILE_INTENTS.has(intent) ||
    layer1Behaviors.includes(LAYER1_BEHAVIORS.PERSONALIZATION) ||
    hasDataSource({ dataSources }, 'user_bookmarks') ||
    hasDataSource({ dataSources }, 'user_profile');

  const needsRecommendation =
    rawPlan.needsRecommendation === true ||
    RECOMMENDATION_INTENTS.has(intent) ||
    RECOMMENDATION_LAYER2_INTENTS.has(layer2Intent) ||
    layer1Behaviors.includes(LAYER1_BEHAVIORS.RECOMMENDATION);

  const needsAction =
    rawPlan.needsAction === true ||
    layer2Intent === LAYER2_INTENTS.FOLLOW_UP_ACTION ||
    primaryBehavior === LAYER1_BEHAVIORS.ACTION_ENGAGEMENT ||
    mode === 'action';

  const needsValidation =
    rawPlan.needsValidation === true ||
    needsRecommendation ||
    RANKING_INTENTS.has(intent) ||
    VALIDATION_MODES.has(mode);

  const executionOrder =
    safeArray(rawPlan.executionOrder).length > 0
      ? rawPlan.executionOrder
      : inferExecutionOrder({ intent, mode, needsRecommendation });

  const responseStyle =
    rawPlan.responseStyle ??
    inferResponseStyle({ intent, mode, layer2Intent });

  return {
    ...FALLBACK_PLAN,
    ...rawPlan,

    routerVersion: rawPlan.routerVersion ?? 'normalized_v2',

    // Legacy compatibility fields.
    intent,
    dataIntent: intent,
    mode,
    confidence: rawPlan.confidence ?? 'default',

    // New router fields.
    layer1Behaviors,
    primaryBehavior,
    layer2Intent,

    // Pipeline control flags.
    needsDatabase,
    needsUserProfile,
    needsRecommendation,
    needsValidation,
    needsAction,

    dataSources,
    executionOrder,
    responseStyle,

    entities: {
      ...FALLBACK_PLAN.entities,
      ...(rawPlan.entities ?? {}),
    },

    constraints: {
      ...FALLBACK_PLAN.constraints,
      ...(rawPlan.constraints ?? {}),
    },
  };
}

function shouldLoadPlatformData(plan) {
  if (!plan) return false;

  if (plan.needsDatabase === true) return true;

  if (DATABASE_INTENTS.has(plan.intent)) return true;
  if (DATABASE_MODES.has(plan.mode)) return true;

  if (hasDataSource(plan, 'platform_posts')) return true;
  if (hasDataSource(plan, 'community_signals')) return true;

  if (hasAnyBehavior(plan, LAYER1_BEHAVIORS.DISCOVERY)) return true;
  if (hasAnyBehavior(plan, LAYER1_BEHAVIORS.RANKING)) return true;
  if (hasAnyBehavior(plan, LAYER1_BEHAVIORS.RECOMMENDATION)) return true;
  if (hasAnyBehavior(plan, LAYER1_BEHAVIORS.PERSONALIZATION)) return true;

  return false;
}

function shouldUseShortContext(plan) {
  return (
    RANKING_INTENTS.has(plan.intent) ||
    plan.mode === 'ranking' ||
    plan.primaryBehavior === LAYER1_BEHAVIORS.RANKING
  );
}

function logNormalizedPlan(plan, message) {
  debugLog('[pipeline] normalized router plan:', {
    messagePreview: String(message ?? '').slice(0, 120),
    intent: plan.intent,
    mode: plan.mode,
    confidence: plan.confidence,
    primaryBehavior: plan.primaryBehavior,
    layer1Behaviors: plan.layer1Behaviors,
    layer2Intent: plan.layer2Intent,
    needsDatabase: plan.needsDatabase,
    needsUserProfile: plan.needsUserProfile,
    needsRecommendation: plan.needsRecommendation,
    needsValidation: plan.needsValidation,
    needsAction: plan.needsAction,
    dataSources: plan.dataSources,
    executionOrder: plan.executionOrder,
    responseStyle: plan.responseStyle,
  });
}

// ── Platform data adapter ────────────────────────────────────────────────────

async function buildPlatformDataForPlan({ plan, userId, userMessage }) {
  if (!shouldLoadPlatformData(plan)) {
    return '';
  }

  const dataIntent = plan.dataIntent ?? plan.intent;

  try {
    const platformData = await fetchDataForIntent(dataIntent, userId, userMessage);

    if (!platformData || !String(platformData).trim()) {
      debugWarn('[pipeline] platform data was requested but returned empty.', {
        intent: plan.intent,
        dataIntent,
        mode: plan.mode,
        dataSources: plan.dataSources,
      });
    }

    return platformData ?? '';
  } catch (err) {
    console.error('[pipeline] platform data retrieval failed:', {
      message: err?.message,
      intent: plan.intent,
      dataIntent,
      mode: plan.mode,
      dataSources: plan.dataSources,
    });

    return '';
  }
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

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
    messageLength: String(message || '').length,
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
      answer: greetingResponse,
      intent: LEGACY_INTENTS.GENERAL_CHAT,
      mode: 'general_chat',
      confidence: 'default',
      userTurnCount: 0,
      recommendedPosts: [],
      recommendations: [],
      evaluation: null,
      validation: null,
      repaired: false,
      plan: {
        ...FALLBACK_PLAN,
        confidence: 'default',
      },
    };
  }

  // ── Step 1: Conversation Manager ─────────────────────────────────────────
  if (!isProduction) console.time('[pipeline] step1 conversationManager');

  const [
    historyRecords,
    userTurnCount,
    userMemory,
    baseUserMemoryContext,
  ] = await Promise.all([
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
    plan = normalizePlan(routerResult, message);
  } catch (err) {
    console.error('[pipeline] router failed, using fallback plan:', err?.message);
    plan = normalizePlan(FALLBACK_PLAN, message);
  }

  logNormalizedPlan(plan, message);

  if (!isProduction) console.timeEnd('[pipeline] step2 routerAgent');

  // ── Conversation context shaping ─────────────────────────────────────────
  let conversationContext;

  if (shouldUseShortContext(plan)) {
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
    `[pipeline] turn #${newTurnCount}, history: ${historyRecords.length} msg(s), topics: ${
      topicContext?.join(', ') ?? 'none'
    }`,
  );

  if (!isProduction) console.timeEnd('[pipeline] step1 conversationManager');

  // ── Step 3: Platform Tools ───────────────────────────────────────────────
  if (!isProduction) console.time('[pipeline] step3 platformTools');

  const platformData = await buildPlatformDataForPlan({
    plan,
    userId,
    userMessage: message,
  });

  const effectiveUserMemoryContext =
    plan.needsUserProfile ? baseUserMemoryContext : '';

  debugLog('[pipeline] context loaded:', {
    platformDataCharacters: String(platformData ?? '').length,
    userMemoryContextCharacters: String(effectiveUserMemoryContext ?? '').length,
    shouldLoadPlatformData: shouldLoadPlatformData(plan),
  });

  if (!isProduction) console.timeEnd('[pipeline] step3 platformTools');

  // ── Step 4: Answer Agent ─────────────────────────────────────────────────
  if (!isProduction) console.time('[pipeline] step4 answerAgent');

  let rawAnswer;

  try {
    rawAnswer = await generateAnswer({
      userMessage: message,
      intent: plan.intent,
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
  let validation = null;
  let repaired = false;

  const needsValidation = shouldValidateAnswer({
    plan,
    intent: plan.intent,
    answer: rawAnswer,
  });

  if (needsValidation) {
    try {
      validation = validateAnswer({
        answer: rawAnswer,
        intent: plan.intent,
        plan,
        platformData,
        userMemoryContext: effectiveUserMemoryContext,
      });

      if (!validation.passed) {
        debugWarn('[pipeline] validation failed:', {
          suggestedAction: validation.suggestedAction,
          severity: validation.severity,
          flags: validation.flags,
        });

        if (validation.suggestedAction === 'reflect') {
          try {
            if (!isProduction) console.time('[pipeline] step5 reflectionPass');

            const repairedText = await generateReflection({
              badAnswer: rawAnswer,
              flags: validation.flags,
              userMessage: message,
              intent: plan.intent,
              plan,
              platformData,
              userMemoryContext: effectiveUserMemoryContext,
            });

            if (!isProduction) console.timeEnd('[pipeline] step5 reflectionPass');

            finalAnswer = repairedText;
            repaired = true;

            // One additional validation pass — no second reflection.
            validation = validateAnswer({
              answer: finalAnswer,
              intent: plan.intent,
              plan,
              platformData,
              userMemoryContext: effectiveUserMemoryContext,
            });

            debugLog('[pipeline] post-repair validation:', {
              passed: validation.passed,
              severity: validation.severity,
              flags: validation.flags,
            });
          } catch (reflErr) {
            debugWarn(
              '[pipeline] reflection failed, keeping original answer:',
              reflErr?.message,
            );
          }
        } else if (validation.suggestedAction === 'hide_cards') {
          debugWarn('[pipeline] hide_cards: recommendation cards will be suppressed.');
        } else if (validation.suggestedAction === 'filter_cards') {
          debugWarn(
            '[pipeline] filter_cards: falling back to hide_cards because fine-grained filtering is not implemented.',
          );
        } else if (validation.suggestedAction === 'log_only') {
          debugWarn('[pipeline] log_only: returning answer despite validation flags.');
        }
      }
    } catch (valErr) {
      console.error(
        '[pipeline] validation threw unexpectedly — skipping:',
        valErr?.message,
      );
      validation = null;
    }
  }

  if (!isProduction) console.timeEnd('[pipeline] step5 validateAndReflect');

  // ── Step 5b: Recommendation Extraction ───────────────────────────────────
  if (!isProduction) console.time('[pipeline] step5b extractRecommendations');

  const [{ cleanAnswer, recommendations: rawReco }, knownTitles] = await Promise.all([
    extractRecommendedPosts(finalAnswer),
    loadKnownTitles(),
  ]);

  const suppressCards =
    validation &&
    !validation.passed &&
    (
      validation.suggestedAction === 'hide_cards' ||
      validation.suggestedAction === 'filter_cards'
    );

  const recommendations = suppressCards ? [] : rawReco;

  debugLog('[pipeline] extraction complete:', {
    recommendations: recommendations.length,
    knownTitles: knownTitles?.length ?? 0,
    suppressCards,
  });

  if (!isProduction) console.timeEnd('[pipeline] step5b extractRecommendations');

  // ── Legacy semantic evaluation ───────────────────────────────────────────
  if (!isProduction) console.time('[pipeline] step5c evaluateAndReflect');

  let { evaluation } = evaluateResponse(cleanAnswer, recommendations, knownTitles);
  evaluation = {
    ...evaluation,
    wasReflected: repaired,
  };

  const { valid, reason } = validate(cleanAnswer);

  if (!valid) {
    debugWarn('[pipeline] structural baseline check failed:', reason);

    if (!isProduction) {
      console.timeEnd('[pipeline] step5c evaluateAndReflect');
      console.timeEnd('[pipeline] total');
    }

    return {
      answer: GENERIC_ERROR_RESPONSE,
      intent: plan.intent,
      mode: plan.mode,
      confidence: plan.confidence,
      userTurnCount: newTurnCount,
      recommendedPosts: [],
      recommendations: [],
      evaluation: null,
      validation,
      repaired,
      plan,
    };
  }

  debugLog('[pipeline] target verification complete:', {
    groundingScore:
      evaluation.groundingScore != null
        ? evaluation.groundingScore.toFixed(2)
        : 'n/a',
    hallucinations: evaluation.hallucinations.length,
    safetyPassed: evaluation.safetyPassed,
    reflected: repaired,
  });

  if (!isProduction) console.timeEnd('[pipeline] step5c evaluateAndReflect');

  // ── Step 6: Database Persistence ─────────────────────────────────────────
  await saveExchange(userId, username, message, cleanAnswer);

  debugLog('[pipeline] canonical transaction saved successfully.');

  if (newTurnCount % 5 === 0) {
    debugLog(
      `[pipeline] 5-turn cadence achieved (turn ${newTurnCount}) — pushing rollups`,
    );

    const summary = buildSimpleSummary(historyRecords, message, cleanAnswer);
    const latestTopics = extractTopicContext(historyRecords, message) ?? [];

    saveConversationSummary(userId, summary, latestTopics).catch(() => {});
  }

  if (!isProduction) console.timeEnd('[pipeline] total');

  return {
    answer: cleanAnswer,
    intent: plan.intent,
    mode: plan.mode,
    confidence: plan.confidence,
    userTurnCount: newTurnCount,
    recommendedPosts: recommendations,
    recommendations,
    evaluation,
    validation,
    repaired,
    plan,
  };
}
