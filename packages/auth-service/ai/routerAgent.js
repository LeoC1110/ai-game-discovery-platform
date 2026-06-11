// packages/auth-service/ai/routerAgent.js
// Classifies a user message into one of 7 supported intents using keyword patterns.
// No Gemini call — purely rule-based so it adds zero latency to the pipeline.

export const INTENTS = {
  GAME_RECOMMENDATION:      'game_recommendation',
  BOOKMARK_ANALYSIS:        'bookmark_analysis',
  COMMUNITY_SUMMARY:        'community_summary',
  LEADERBOARD_QUERY:        'leaderboard_query',
  LOW_RATING_QUERY:         'low_rating_query',
  PLATFORM_INVENTORY_QUERY: 'platform_inventory_query',
  GENERAL_CHAT:             'general_chat',
};

// ── Pattern table (ordered by specificity — first match wins) ─────────────────
const INTENT_PATTERNS = [
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
    intent: INTENTS.PLATFORM_INVENTORY_QUERY,
    patterns: [
      /\b(show|find|list|display|get)\b.*\b(all|every|available)\b.*\b(game|games|title|titles)\b/i,
      /\b(all|every|available)\b.*\b(game|games|title|titles)\b.*\b(platform|community)\b/i,
      /\bwhat\s+games\b.*\b(platform|available|listed)\b/i,
      /\bgames?\s+(in|on)\s+(the\s+)?platform\b/i,
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
      /top[\s-]rated/i,
      /highest[\s-]rated/i,
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

      // Narrow recommendation search pattern.
      // Avoid using /find.*game/i because it catches "find all games on the platform".
      /find\s+(me\s+)?(a|some|new|similar)?\s*games?\s+(to\s+play|like|similar\s+to)?/i,
    ],
  },
];

  // Must be before GAME_RECOMMENDATION.
  // Handles deterministic platform inventory queries like:
  // "find all game in platform", "show all games", "list platform games".
  {
    intent: INTENTS.PLATFORM_INVENTORY_QUERY,
    patterns: [
      /\b(show|find|list|display|get)\b.*\b(all|every|available)\b.*\b(game|games|title|titles)\b/i,
      /\b(all|every|available)\b.*\b(game|games|title|titles)\b.*\b(platform|community)\b/i,
      /\bwhat\s+games\b.*\b(platform|available|listed)\b/i,
      /\bgames?\s+(in|on)\s+(the\s+)?platform\b/i,
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
      /top[\s-]rated/i,
      /highest[\s-]rated/i,
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

      // More specific than the old /find.*game/i.
      // Avoids catching "find all games on the platform".
      /find\s+(me\s+)?(a|some|new|similar)?\s*games?\s+(to\s+play|like|similar\s+to)?/i,
    ],
  },
];

/**
 * Classify a user message into one of the defined intents.
 * Falls back to GENERAL_CHAT when no pattern matches.
 *
 * @param {string} message
 * @returns {{ intent: string, confidence: 'pattern_match' | 'default' }}
 */
export function classifyIntent(message) {
  const msg = (message ?? '').trim();

  for (const { intent, patterns } of INTENT_PATTERNS) {
    if (patterns.some((re) => re.test(msg))) {
      return { intent, confidence: 'pattern_match' };
    }
  }

  return { intent: INTENTS.GENERAL_CHAT, confidence: 'default' };
}