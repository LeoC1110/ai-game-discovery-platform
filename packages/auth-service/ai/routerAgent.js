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
  /\b(show|find|list|display|summarize)\b/i,
  /\b(analyse|analyze)\b.*\b(community|trend|trending|rating|rated|leaderboard|popular|liked|bookmarked)\b/i,
  /\b(trending|popular|top[\s-]?rated|low[\s-]?rated|most\s+liked|most\s+bookmarked)\b/i,
  /\b(another|next|more)\s+(batch|set|group|five|5)\b/i,
  /\bshow\s+more\b/i,
  /\bcommunity\b/i,
  /(查看|显示|列出|总结|社区|热门|趋势|高分|低分|评分|排行榜|榜单|换一批|下一批|再来一批)/,
  /分析.*(社区|趋势|评分|榜单|排行榜)/,
];

const RECOMMENDATION_SIGNAL_PATTERNS = [
  /\b(recommend|suggest)\b/i,
  /\bfor\s+me\b/i,
  /\bbased\s+on\s+my\s+(bookmarks?|taste|preference)\b/i,
  /\bwhat\s+should\s+i\s+play\b/i,
  /\bwhich\s+one\s+(should\s+i|i\s+should)\s+play\b/i,
  /\btell\s+me\s+which\s+one\s+(to|i\s+should)\s+play\b/i,
  /(推荐|建议|适合我|玩什么|根据我的收藏|根据我的口味)/,
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

const PROFILE_ONLY_PATTERNS = [
  /\banaly[sz]e\s+my\s+(taste|preferences?|profile)\b/i,
  /\b(summarize|summarise|describe)\s+my\s+(game\s+)?(taste|preferences?|profile)\b/i,
  /\bwhat\s+(is|'s)\s+my\s+(game\s+)?(taste|preference|profile)\b/i,
  /\bwhat\s+kind\s+of\s+gamer\s+am\s+i\b/i,
  /\bwhat\s+does\s+my\s+(game\s+)?taste\s+say\s+about\s+me\b/i,
  /\bwhat\s+games?\s+have\s+i\s+saved\b/i,
  /\bshow\s+my\s+bookmark\s+list\b/i,
  /^\s*recommend\s+based\s+on\s+my\s+bookmarks?\b/i,
  /^\s*based\s+on\s+my\s+(bookmarks?|taste|preference)\b/i,
  /查看.*我的收藏夹.*推荐/,
  /根据我的收藏.*推荐/,
  /我的游戏品味如何/,
  /我的游戏品味怎么样/,
  /我的品味如何/,
  /我的品味怎么样/,
  /我的口味如何/,
  /我适合什么类型游戏/,
  /我是怎样的玩家/,
  /我是什么样的玩家/,
  /分析我的游戏品味/,
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

function hasProfileOnlySignal(msg) {
  return PROFILE_ONLY_PATTERNS.some((re) => re.test(msg));
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
      /\b(show|list|get)\s+(more|another|next)\b.*\b(platform\s+)?games\b/i,
      /\b(next|another)\s+(batch|set|group)\s+of\s+(platform\s+)?games\b/i,
      /^(?!.*\b(low[\s-]?rated|lowest[\s-]?rated|worst[\s-]?rated|worst|bottom\s+rated|poorly\s+rated|top[\s-]?rated|highest[\s-]?rated|trending|popular)\b).*\bgames\s+(in|on)\s+(the\s+)?platform\b/i,
      /\blist\s+(the\s+)?platform\s+games\b/i,
      /\bshow\s+(the\s+)?platform\s+games\b/i,
      /\bfind\s+(the\s+)?platform\s+games\b/i,
      /\bavailable\s+games\b/i,
      /(换一批|下一批|再来一批).*(平台)?游戏/,
      /(查看|显示|列出).*(全部|所有).*(游戏|标题)/,
      /(平台|社区).*(有哪些|有什么).*(游戏|标题)/,
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
      /低分/,
      /评分低/,
      /口碑差/,
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
      /高分/,
      /评分最高/,
      /排行榜/,
      /榜单/,
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
      /\b(another|next|more)\s+(batch|set|group|five|5)\b/i,
      /\bshow\s+more\b/i,
      /社区/,
      /热门/,
      /趋势/,
      /最多点赞/,
      /换一批/,
      /下一批/,
      /再来一批/,
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
      /(summarize|summarise|describe).*my\s+(game\s+)?(taste|preferences?|profile)/i,
      /what\s+kind\s+of\s+gamer\s+am\s+i/i,
      /what\s+does\s+my\s+(game\s+)?taste\s+say\s+about\s+me/i,
      /收藏/,
      /已保存/,
      /我的列表/,
      /分析.*口味/,
      /我的游戏品味如何/,
      /我的游戏品味怎么样/,
      /我的品味如何/,
      /我的品味怎么样/,
      /我的口味如何/,
      /我适合什么类型游戏/,
      /我是怎样的玩家/,
      /我是什么样的玩家/,
      /分析我的游戏品味/,
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
      /推荐/,
      /建议/,
      /玩什么/,
      /适合我/,
      /类似.*游戏/,
      /我喜欢/,

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
 *   1. Specific profile intent — checked before mixed so bookmark/taste phrases
 *      are not misclassified by broad query + recommendation signals.
 *   2. Mixed intent  — checked via signal co-occurrence.
 *   3. General chat  — checked so casual messages never reach the DB.
 *   4. Intent table  — first-match pattern loop for Query / Recommendation.
 *   5. Fallback      — GENERAL_CHAT if nothing matches.
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

  // 1. Specific profile intent — more precise than mixed signal co-occurrence.
  if (hasProfileOnlySignal(msg)) {
    return buildPlan(INTENTS.BOOKMARK_ANALYSIS, 'pattern_match');
  }

  // 2. Mixed intent — runs before the remaining single-intent pattern table.
  if (isMixedIntent(msg)) {
    return buildPlan(INTENTS.MIXED_QUERY_RECOMMENDATION, 'signal_match');
  }

  // 3. General chat — short-circuit before any DB-touching patterns.
  if (hasGeneralChatSignal(msg)) {
    return buildPlan(INTENTS.GENERAL_CHAT, 'pattern_match');
  }

  // 4. Single-intent pattern table.
  for (const { intent, patterns } of INTENT_PATTERNS) {
    if (patterns.some((re) => re.test(msg))) {
      return buildPlan(intent, 'pattern_match');
    }
  }

  // 5. Fallback.
  return buildPlan(INTENTS.GENERAL_CHAT, 'default');
}