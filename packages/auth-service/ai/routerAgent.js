// packages/auth-service/ai/routerAgent.js
// Router / Planner Agent — classifies a user message into a structured
// execution plan.  No LLM call — purely rule-based, zero added latency.
//
// Active modes: QUERY, RECOMMENDATION, MIXED, GENERAL_CHAT.

export const INTENTS = {
  GAME_RECOMMENDATION:        'game_recommendation',
  BOOKMARK_ANALYSIS:          'bookmark_analysis',
  COMMUNITY_SUMMARY:          'community_summary',
  LEADERBOARD_QUERY:          'leaderboard_query',
  LOW_RATING_QUERY:           'low_rating_query',
  PLATFORM_INVENTORY_QUERY:   'platform_inventory_query',
  MIXED_QUERY_RECOMMENDATION: 'mixed_query_recommendation',
  GENERAL_CHAT:               'general_chat',
};

export const MODES = {
  QUERY:          'query',
  RECOMMENDATION: 'recommendation',
  MIXED:          'mixed',
  GENERAL_CHAT:   'general_chat',
};

// ── Intent classification sets ────────────────────────────────────────────────

const QUERY_INTENTS = new Set([
  INTENTS.PLATFORM_INVENTORY_QUERY,
  INTENTS.LOW_RATING_QUERY,
  INTENTS.LEADERBOARD_QUERY,
  INTENTS.COMMUNITY_SUMMARY,
]);

// Query intents whose answers reference ratings, rankings, or community stats.
const HIGH_RISK_QUERY_INTENTS = new Set([
  INTENTS.LOW_RATING_QUERY,
  INTENTS.LEADERBOARD_QUERY,
  INTENTS.COMMUNITY_SUMMARY,
]);

const RECOMMENDATION_INTENTS = new Set([
  INTENTS.GAME_RECOMMENDATION,
  INTENTS.BOOKMARK_ANALYSIS,
]);

// ── Signal detectors ──────────────────────────────────────────────────────────
// Used by isMixedIntent() to detect co-occurrence of both signal types before
// the normal first-match pattern loop runs.

const QUERY_SIGNAL_PATTERNS = [
  /\b(show|find|list|display|summarize|analyse|analyze)\b/i,
  /\b(trending|popular|top[\s-]?rated|low[\s-]?rated|most\s+liked|most\s+bookmarked)\b/i,
  /\bcommunity\b/i,
];

const RECOMMENDATION_SIGNAL_PATTERNS = [
  /\b(recommend|suggest)\b/i,
  /\bfor\s+me\b/i,
  /\bbased\s+on\s+my\s+(bookmarks?|taste|preference)\b/i,
  /\bwhat\s+should\s+i\s+play\b/i,
  /\bwhich\s+one\s+(should\s+i|i\s+should)\s+play\b/i,
  /\btell\s+me\s+which\s+one\s+(to|i\s+should)\s+play\b/i,
];

const GENERAL_CHAT_PATTERNS = [
  /^(hi+|hello+|hey+|howdy)[!.,?]*$/i,
  /^(thanks?|thank\s+you)[!.,?]*$/i,
  /^help[!.,?]*$/i,
  /\bwhat\s+can\s+you\s+do\b/i,
  /\bhow\s+does\s+nova\s+work\b/i,
  /\bwhat\s+can\s+i\s+ask\b/i,
  /\btell\s+me\s+about\s+(this\s+)?platform\b/i,
];

/**
 * Returns true when the message contains at least one query signal.
 * @param {string} msg - Pre-trimmed message.
 */
function hasQuerySignal(msg) {
  return QUERY_SIGNAL_PATTERNS.some((re) => re.test(msg));
}

/**
 * Returns true when the message contains at least one recommendation signal.
 * @param {string} msg - Pre-trimmed message.
 */
function hasRecommendationSignal(msg) {
  return RECOMMENDATION_SIGNAL_PATTERNS.some((re) => re.test(msg));
}

/**
 * Returns true when the message looks like casual / off-topic chat.
 * @param {string} msg - Pre-trimmed message.
 */
function hasGeneralChatSignal(msg) {
  return GENERAL_CHAT_PATTERNS.some((re) => re.test(msg));
}

/**
 * Returns true when the message contains both a query signal and a
 * recommendation signal — indicating the user wants data AND a suggestion.
 * @param {string} msg - Pre-trimmed message.
 */
function isMixedIntent(msg) {
  return hasQuerySignal(msg) && hasRecommendationSignal(msg);
}

// ── Plan builder ──────────────────────────────────────────────────────────────

/**
 * Build a structured execution plan for a resolved intent.
 *
 * @param {string} intent    - One of the INTENTS values.
 * @param {'pattern_match'|'signal_match'|'default'} confidence
 * @returns {object} Full plan consumed by the AI pipeline.
 */
function buildPlan(intent, confidence) {
  if (intent === INTENTS.MIXED_QUERY_RECOMMENDATION) {
    return {
      intent,
      mode:                MODES.MIXED,
      confidence,
      needsDatabase:       true,
      needsUserProfile:    true,
      needsRecommendation: true,
      needsValidation:     true,
      dataSources:         ['platform_posts', 'community_signals', 'user_bookmarks', 'user_profile'],
      executionOrder:      ['query_first', 'recommend_second'],
      responseStyle:       'facts_then_recommendation',
    };
  }

  if (QUERY_INTENTS.has(intent)) {
    return {
      intent,
      mode:                MODES.QUERY,
      confidence,
      needsDatabase:       true,
      needsUserProfile:    false,
      needsRecommendation: false,
      needsValidation:     HIGH_RISK_QUERY_INTENTS.has(intent),
      dataSources:         ['platform_posts'],
      executionOrder:      ['query'],
      responseStyle:       'factual_list',
    };
  }

  if (RECOMMENDATION_INTENTS.has(intent)) {
    return {
      intent,
      mode:                MODES.RECOMMENDATION,
      confidence,
      needsDatabase:       true,
      needsUserProfile:    true,
      needsRecommendation: true,
      needsValidation:     true,
      dataSources:         ['platform_posts', 'user_bookmarks', 'user_profile'],
      executionOrder:      ['retrieve_candidates', 'rank', 'answer'],
      responseStyle:       'personalized_recommendation',
    };
  }

  // GENERAL_CHAT fallback — no database access, guides the user toward useful actions.
  return {
    intent:              INTENTS.GENERAL_CHAT,
    mode:                MODES.GENERAL_CHAT,
    confidence,
    needsDatabase:       false,
    needsUserProfile:    false,
    needsRecommendation: false,
    needsValidation:     false,
    dataSources:         [],
    executionOrder:      ['short_guidance'],
    responseStyle:       'general_guidance',
  };
}

// ── Pattern table (ordered by specificity — first match wins) ─────────────────
// Mixed detection runs before this table (see classifyIntent).
// Query patterns appear before recommendation patterns so that factual queries
// such as "find all games on the platform" are never misclassified as
// recommendations.
const INTENT_PATTERNS = [
  // ── Query intents ────────────────────────────────────────────────────────────
  {
    intent: INTENTS.PLATFORM_INVENTORY_QUERY,
    patterns: [
      /\b(show|find|list|display|get)\b.*\b(all|every|available)\b.*\b(game|games|title|titles)\b/i,
      /\b(all|every|available)\b.*\b(game|games|title|titles)\b.*\b(platform|community)\b/i,
      /\bwhat\s+games\b.*\b(platform|available|listed)\b/i,
      /\bgames\s+(in|on)\s+(the\s+)?platform\b/i,
      /\blist\s+(the\s+)?platform\s+games\b/i,
      /\bshow\s+(the\s+)?platform\s+games\b/i,
      /\bfind\s+(the\s+)?platform\s+games\b/i,
      /\bavailable\s+games\b/i,
    ],
  },

  {
    intent: INTENTS.LOW_RATING_QUERY,
    patterns: [
      /low[\s-]?rated/i,
      /lowest[\s-]?rated/i,
      /lowest\s+rating/i,
      /worst[\s-]?rated/i,
      /worst\s+game/i,
      /bottom\s+rated/i,
      /poorly\s+rated/i,
    ],
  },

  {
    intent: INTENTS.LEADERBOARD_QUERY,
    patterns: [
      /leaderboard/i,
      /top[\s-]?rated/i,
      /highest[\s-]?rated/i,
      /best\s+game/i,
      /\#?1\s+game/i,
      /rank(ing)?/i,
    ],
  },

  {
    intent: INTENTS.COMMUNITY_SUMMARY,
    patterns: [
      /community/i,
      /popular\s+post/i,
      /most\s+liked/i,
      /trending/i,
      /what.*people.*play(ing)?/i,
      /latest\s+review/i,
      /community\s+pick/i,
    ],
  },

  // ── Recommendation intents ───────────────────────────────────────────────────
  // BOOKMARK_ANALYSIS is checked before GAME_RECOMMENDATION so that
  // bookmark-specific phrasing always resolves to its own intent.
  {
    intent: INTENTS.BOOKMARK_ANALYSIS,
    patterns: [
      /bookmark/i,
      /saved\s+game/i,
      /my\s+list/i,
      /what.*i.*saved/i,
      /games?\s+i.*saved/i,
      /analyse.*my\s+taste/i,
      /analyze.*my\s+taste/i,
    ],
  },

  {
    intent: INTENTS.GAME_RECOMMENDATION,
    patterns: [
      /recommend/i,
      /suggest/i,
      /what.*should.*play/i,
      /what.*to\s+play/i,
      /next\s+game/i,
      /similar\s+to/i,
      /games?\s+like/i,
      /i\s+like\b/i,
      /match.*my\s+taste/i,

      // Narrow "find me games" pattern.
      // Intentionally excludes /find.*game/i to avoid catching platform inventory queries.
      /find\s+(me\s+)?(a\s+|some\s+|new\s+|similar\s+)?games?\s*(to\s+play|like|similar\s+to)?/i,
    ],
  },
];

/**
 * Classify a user message and return a structured execution plan.
 *
 * Evaluation order:
 *   1. Mixed intent  — checked first via signal co-occurrence.
 *   2. General chat  — checked second so casual messages never reach the DB.
 *   3. Intent table  — first-match pattern loop for Query / Recommendation.
 *   4. Fallback      — GENERAL_CHAT if nothing matches.
 *
 * @param {string} message
 * @returns {{
 *   intent:               string,
 *   mode:                 string,
 *   confidence:           'pattern_match' | 'signal_match' | 'default',
 *   needsDatabase:        boolean,
 *   needsUserProfile:     boolean,
 *   needsRecommendation:  boolean,
 *   needsValidation:      boolean,
 *   dataSources:          string[],
 *   executionOrder:       string[],
 *   responseStyle:        string,
 * }}
 */
export function classifyIntent(message) {
  const msg = (message ?? '').trim();

  // 1. Mixed intent — must run before the single-intent pattern table.
  if (isMixedIntent(msg)) {
    return buildPlan(INTENTS.MIXED_QUERY_RECOMMENDATION, 'signal_match');
  }

  // 2. General chat — short-circuit before any DB-touching patterns.
  if (hasGeneralChatSignal(msg)) {
    return buildPlan(INTENTS.GENERAL_CHAT, 'pattern_match');
  }

  // 3. Single-intent pattern table.
  for (const { intent, patterns } of INTENT_PATTERNS) {
    if (patterns.some((re) => re.test(msg))) {
      return buildPlan(intent, 'pattern_match');
    }
  }

  // 4. Fallback.
  return buildPlan(INTENTS.GENERAL_CHAT, 'default');
}