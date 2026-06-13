// packages/auth-service/ai/routerAgent.js
// New Router Agent — Layer 1 + Layer 2 Framework
//
// Purpose:
// Classify a user message into:
// 1. Layer 1: broad user behavior
// 2. Layer 2: specific intent / advanced behavior
//
// Design:
// - Rule-based
// - No LLM call
// - Low latency
// - Compatible with Answer Agent and Validation Agent
//
// Layer 1 Guide:
// 1. Discovery
// 2. Ranking
// 3. Recommendation
// 4. Personalization
// 5. Action / Engagement
//
// Layer 2 Guide:
// 1. Context-Based Recommendations
// 2. Similar Game Discovery
// 3. Comparison and Decision-Making
// 4. Recommendation Explanation
// 5. Taste Profile Analysis
// 6. Feedback and Refinement
// 7. Game Detail Q&A
// 8. Follow-Up Actions After Recommendations

// ── Layer 1 behavior constants ────────────────────────────────────────────────

export const LAYER1_BEHAVIORS = {
  DISCOVERY: "discovery",
  RANKING: "ranking",
  RECOMMENDATION: "recommendation",
  PERSONALIZATION: "personalization",
  ACTION_ENGAGEMENT: "action_engagement",
  GENERAL_CHAT: "general_chat",
};

// ── Layer 2 intent constants ──────────────────────────────────────────────────

export const LAYER2_INTENTS = {
  CONTEXT_BASED_RECOMMENDATION: "context_based_recommendation",
  SIMILAR_GAME_DISCOVERY: "similar_game_discovery",
  COMPARE_GAMES: "compare_games",
  RECOMMENDATION_EXPLANATION: "recommendation_explanation",
  TASTE_PROFILE_ANALYSIS: "taste_profile_analysis",
  REFINE_RECOMMENDATIONS: "refine_recommendations",
  GAME_DETAIL_QUERY: "game_detail_query",
  FOLLOW_UP_ACTION: "follow_up_action",
};

// ── Legacy intent constants (backward compatibility) ────────────────────────

export const INTENTS = {
  GAME_RECOMMENDATION: "game_recommendation",
  BOOKMARK_ANALYSIS: "bookmark_analysis",
  MIXED_QUERY_RECOMMENDATION: "mixed_query_recommendation",
  COMMUNITY_SUMMARY: "community_summary",
  LEADERBOARD_QUERY: "leaderboard_query",
  LOW_RATING_QUERY: "low_rating_query",
  PLATFORM_INVENTORY_QUERY: "platform_inventory_query",
  GENERAL_CHAT: "general_chat",
};

// ── Router modes ──────────────────────────────────────────────────────────────

export const MODES = {
  DISCOVERY: "discovery",
  RANKING: "ranking",
  RECOMMENDATION: "recommendation",
  PERSONALIZATION: "personalization",
  ACTION: "action",
  MIXED: "mixed",
  GENERAL_CHAT: "general_chat",
};

// ── Layer 1 signal patterns ───────────────────────────────────────────────────

const DISCOVERY_PATTERNS = [
  /\b(browse|explore|discover|show|find|list|display|get)\b.*\b(game|games|title|titles)\b/i,
  /\b(available|all|every)\b.*\b(game|games|title|titles)\b/i,
  /\b(game|games|title|titles)\b.*\b(platform|library|community)\b/i,
  /\bwhat\s+games\b/i,
  /\bshow\s+me\s+some\s+games\b/i,
  /\blet\s+me\s+explore\b/i,

  // Chinese
  /(浏览|探索|发现|查看|显示|列出).*(游戏|标题)/,
  /(有哪些|有什么).*(游戏|标题)/,
  /(游戏库|平台|社区).*(游戏|标题)/,
];

const RANKING_PATTERNS = [
  /\b(trending|popular|top[\s-]?rated|highest[\s-]?rated|low[\s-]?rated|lowest[\s-]?rated)\b/i,
  /\b(worst[\s-]?rated|bottom\s+rated|poorly\s+rated)\b/i,
  /\b(leaderboard|ranking|rankings|ranked|best\s+game|worst\s+game)\b/i,
  /\b(most\s+liked|most\s+bookmarked|community\s+pick|community\s+picks)\b/i,
  /\bwhat\s+games\s+are\s+popular\b/i,
  /\bwhich\s+games\s+have\s+mixed\s+reviews\b/i,

  // Chinese
  /(热门|趋势|高分|低分|评分最高|评分最低|排行榜|榜单|排名)/,
  /(最多点赞|最多收藏|口碑差|褒贬不一)/,
];

const RECOMMENDATION_PATTERNS = [
  /\b(recommend|recommendation|suggest|suggestion)\b/i,
  /\bwhat\s+should\s+i\s+play\b/i,
  /\bwhat\s+to\s+play\b/i,
  /\bnext\s+game\b/i,
  /\bgive\s+me\s+some\s+game\s+suggestions\b/i,
  /\bfind\s+(me\s+)?(a\s+|some\s+|new\s+)?games?\s+(to\s+play|for\s+me)?\b/i,

  // Chinese
  /(推荐|建议|玩什么|下一个游戏|适合玩的游戏)/,
];

const PERSONALIZATION_PATTERNS = [
  /\bfor\s+me\b/i,
  /\bbased\s+on\s+my\s+(bookmarks?|saved\s+games?|taste|preferences?|profile|history)\b/i,
  /\bmy\s+(taste|preferences?|profile|bookmarks?|saved\s+games?)\b/i,
  /\banaly[sz]e\s+my\s+(taste|preferences?|profile|bookmarks?)\b/i,
  /\bsummar[yi]ze\s+my\s+(taste|preferences?|profile|bookmarks?)\b/i,
  /\bwhy\s+does\s+this\s+(fit|match)\s+me\b/i,
  /\bmatch(es)?\s+my\s+taste\b/i,
  /\bi\s+(like|dislike|prefer|don't\s+like|do\s+not\s+like)\b/i,
  /\bdon't\s+recommend\b/i,
  /\bdo\s+not\s+recommend\b/i,

  // Chinese
  /(根据我的收藏|根据我的口味|根据我的偏好|适合我)/,
  /(我的品味|我的口味|我的偏好|我的收藏|我的游戏品味)/,
  /(分析我的|总结我的)/,
  /(我喜欢|我不喜欢|不要推荐)/,
];

const ACTION_ENGAGEMENT_PATTERNS = [
  /\b(save|bookmark|add)\b.*\b(game|this|it)\b/i,
  /\badd\s+.*\b(wishlist|bookmarks?|saved\s+games?)\b/i,
  /\bview\s+(details?|game)\b/i,
  /\bwatch\s+(the\s+)?trailer\b/i,
  /\bwrite\s+(a\s+)?review\b/i,
  /\bshare\s+(this|it|game)\b/i,
  /\bask\s+nova\s+about\b/i,
  /\btell\s+me\s+about\s+this\s+game\b/i,

  // Chinese
  /(保存|收藏|加入愿望单|加入收藏)/,
  /(查看详情|观看预告|写评论|分享)/,
  /(问Nova|让Nova总结|总结这个游戏)/,
];

const GENERAL_CHAT_PATTERNS = [
  /^(hi+|hello+|hey+|howdy)[!.,?]*$/i,
  /^(thanks?|thank\s+you)[!.,?]*$/i,
  /^help[!.,?]*$/i,
  /\bwhat\s+can\s+you\s+do\b/i,
  /\bhow\s+does\s+nova\s+work\b/i,
  /\bwhat\s+can\s+i\s+ask\b/i,
  /\btell\s+me\s+about\s+(this\s+)?platform\b/i,

  // Chinese
  /^(你好|嗨|谢谢|感谢)$/,
  /(你能做什么|怎么使用|Nova怎么工作)/,
];

// ── Layer 2 signal patterns ───────────────────────────────────────────────────

const CONTEXT_BASED_RECOMMENDATION_PATTERNS = [
  /\b(recommend|suggest|find)\b.*\b(relaxing|casual|cozy|chill|weekend|short|quick|story[-\s]?driven|emotional|beginner[-\s]?friendly)\s+(games?|games?|titles?)\b/i,
  /\b(relaxing|casual|cozy|chill|weekend|short|quick|story[-\s]?driven|emotional|beginner[-\s]?friendly)\s+(games?|titles?)\b.*\b(recommend|suggest|find)\b/i,
  /\b(games?|titles?)\s+for\s+(the\s+)?weekend\b/i,
  /\b(games?|titles?)\s+(for\s+|with\s+)?friends\b/i,
  /\bmultiplayer\s+(games?|titles?)\b/i,
  /\bco[-\s]?op\s+(games?|titles?)\b/i,
  /\blow[-\s]?end\s+(pc|computer|laptop)\b.*\b(games?|run|play)\b/i,
  /\bbeginner[-\s]?friendly\s+(games?|titles?)\b/i,
  /\bopen[-\s]?world\b.*\b(games?|on|switch|pc|playstation|xbox)\b/i,
  /\b(can|does|will)\s+(it|this|game)\s+run\s+on\b/i,

  // Chinese
  /(推荐|建议).*(轻松|休闲|治愈|周末|短一点|剧情|新手友好|适合新手)/,
  /(轻松|休闲|治愈|周末|短一点|剧情|新手友好|适合新手).*(游戏|推荐|建议)/,
  /(多人|合作).*(游戏|推荐|建议)/,
];

const SIMILAR_GAME_DISCOVERY_PATTERNS = [
  /\b(similar\s+to|like|games?\s+like)\b/i,
  /\b(more\s+like|same\s+(vibe|genre|style))\b/i,
  /\bsimilar\s+(gameplay|style|vibe|experience|feel)\b/i,
  /\b(find|discover|show|recommend)\s+similar\s+(games?|titles?)\b/i,
  /\bgames?\s+(with\s+the\s+)?(same|similar)\s+(vibe|feel|style|gameplay)\b/i,

  // Chinese
  /(类似|相似).*(游戏|玩法|风格|感觉|体验)/,
  /(找.*类似|推荐.*类似|发现.*类似)/,
  /(像.*一样的游戏|和.*差不多的游戏)/,
];

const COMPARE_GAMES_PATTERNS = [
  /\bcompare\b/i,
  /\b(which|what)\s+(one\s+)?(is\s+)?better\b/i,
  /\b(which|what)\s+(one\s+|game\s+)?(should\s+)?i\s+play\b/i,
  /\bshould\s+i\s+play\b.*\b(or|vs\.?|versus)\b/i,
  /\b(is|are)\s+\w+\s+(and\s+)?\w+\s+(worth|good)\s+(for|to)\s+(buy|play)\b/i,
  /\b\w+\s+(or|vs\.?|versus)\s+\w+.*better/i,
  /\bwhat\s+should\s+i\s+play\s+first\b/i,
  /\bwhich\s+one\s+better\s+matches\s+my\s+taste\b/i,
  /\b(is|does)\s+\w+\s+(fit|match)\s+me\s+better\b/i,

  // Chinese
  /(对比|比较)/,
  /(哪个更好|哪个更适合我|应该先玩哪个|值不值得买|值不值得玩|哪个应该先玩)/,
];

const RECOMMENDATION_EXPLANATION_PATTERNS = [
  /\bwhy\s+(did\s+)?(you|nova)\s+recommend\b/i,
  /\bwhy\b.*\b(recommend|suggest)\b/i,
  /\bwhy\s+(does|is|should)\s+(this|it)\s+(fit|match|suit|work\s+for)\s+me\b/i,
  /\bwhy\s+is\s+(this|it)\s+on\s+my\s+recommendation/i,
  /\bexplain\s+(this\s+)?recommendation\b/i,
  /\bwhat\s+makes\s+(this|it|game)\s+relevant\s+to\s+me\b/i,
  /\b(does|should)\s+(this|it|game)\s+match\s+my\s+(preferences|taste|profile)\b/i,
  /\bhow\s+does\s+(this|it|game)\s+(fit|match)\s+me\b/i,

  // Chinese
  /(为什么.*推荐|为什么.*适合我|为什么.*符合我的口味)/,
  /(解释.*推荐|这个游戏.*适合我吗|为什么.*推荐给我)/,
];

const TASTE_PROFILE_ANALYSIS_PATTERNS = [
  /\banaly[sz]e\s+my\s+(bookmarked\s+games|bookmarks|taste|preferences?|profile)\b/i,
  /\bsummar[yi]ze\s+my\s+(bookmarked\s+games|bookmarks|taste|preferences?|profile)\b/i,
  /\bwhat\s+kind\s+of\s+games?\s+do\s+i\s+(usually\s+)?like\b/i,
  /\bwhat\s+kind\s+of\s+gamer\s+am\s+i\b/i,
  /\bwhat\s+patterns?\s+can\s+you\s+find\s+in\s+my\s+(saved\s+games|bookmarks)\b/i,
  /\bwhat\s+(does|'s)\s+my\s+(game\s+)?taste\s+(look\s+like|say)\b/i,

  // Chinese
  /(分析我的游戏品味|分析我的收藏|总结我的口味|总结我的偏好)/,
  /(我是怎样的玩家|我是什么样的玩家|我的游戏品味如何|我的口味如何)/,
];

const FEEDBACK_REFINEMENT_PATTERNS = [
  /\bdon't\s+recommend\b/i,
  /\bdo\s+not\s+recommend\b/i,
  /\bi\s+don'?t\s+like\b/i,
  /\bi\s+dislike\b/i,
  /\bi\s+prefer\b/i,
  /\brecommend\s+more\b/i,
  /\brecommend\s+fewer\b/i,
  /\brecommend\s+less\b/i,
  /\bmore\s+story[-\s]?driven\b/i,
  /\bshorter\s+games\b/i,
  /\bnot\s+for\s+me\b/i,
  /\bless\s+like\s+this\b/i,
  /\bthis\s+recommendation\s+is\s+not\s+accurate\b/i,
  /\brefine\s+(my\s+)?recommendations?\b/i,

  // Chinese
  /(不要推荐|我不喜欢|我更喜欢|多推荐|少推荐|不适合我)/,
  /(推荐不准|这个推荐不准确|调整推荐|优化推荐|细化推荐)/,
];

const GAME_DETAIL_QA_PATTERNS = [
  /\btell\s+me\s+(more\s+)?about\s+(this\s+)?(game|it)\b/i,
  /\btell\s+me\s+about\s+([a-zA-Z0-9:'’&.\-\s]{2,80})\b/i,
  /\b(what|tell\s+me)\s+(is|about)\s+(this\s+)?(game|it)\b/i,
  /\bsummar[yi]ze\s+(this\s+)?(game|it)\b/i,
  /\b(is|are)\s+this\s+game\s+(beginner[-\s]?friendly|good|difficult|suitable)\b/i,
  /\bhow\s+(difficult|hard|challenging)\s+(is|are)\s+(this\s+)?game\b/i,
  /\bwhat\s+kind\s+of\s+player\s+would\s+(enjoy|like)\s+(this\s+)?game\b/i,
  /\bwhat\s+does\s+(this\s+)?game\s+involve\b/i,
  /\bask\s+nova\s+about\s+(this\s+)?(game|it)\b/i,
  /\bmore\s+details?\s+about\s+(this\s+)?(game|it)\b/i,

  // Chinese
  /(介绍这个游戏|这个游戏讲什么|总结这个游戏|这个游戏难吗|这个游戏怎么样)/,
  /(这个游戏适合新手吗|什么玩家会喜欢这个游戏|问Nova.*游戏|告诉我.*游戏)/,
];

const FOLLOW_UP_ACTION_PATTERNS = [
  /\bsave\s+(this|it|game)\b/i,
  /\bbookmark\s+(this|it|game)\b/i,
  /\badd\s+(this|it|game)\s+to\s+(my\s+)?(wishlist|bookmarks?|saved\s+games?)\b/i,
  /\bview\s+(details?|game\s+details?)\b/i,
  /\bwatch\s+(the\s+)?trailer\b/i,
  /\bwrite\s+(a\s+)?review\b/i,
  /\bshare\s+(this|it|game)\b/i,
  /\bfind\s+similar\s+games?\b/i,

  // Chinese
  /(保存这个|收藏这个|加入收藏|加入愿望单)/,
  /(查看详情|观看预告|写评论|分享这个|找类似游戏)/,
];

// ── Layer 1 pattern registry ──────────────────────────────────────────────────

const LAYER1_PATTERN_REGISTRY = [
  {
    behavior: LAYER1_BEHAVIORS.PERSONALIZATION,
    mode: MODES.PERSONALIZATION,
    patterns: PERSONALIZATION_PATTERNS,
  },
  {
    behavior: LAYER1_BEHAVIORS.ACTION_ENGAGEMENT,
    mode: MODES.ACTION,
    patterns: ACTION_ENGAGEMENT_PATTERNS,
  },
  {
    behavior: LAYER1_BEHAVIORS.RANKING,
    mode: MODES.RANKING,
    patterns: RANKING_PATTERNS,
  },
  {
    behavior: LAYER1_BEHAVIORS.RECOMMENDATION,
    mode: MODES.RECOMMENDATION,
    patterns: RECOMMENDATION_PATTERNS,
  },
  {
    behavior: LAYER1_BEHAVIORS.DISCOVERY,
    mode: MODES.DISCOVERY,
    patterns: DISCOVERY_PATTERNS,
  },
];

// ── Layer 2 pattern registry ──────────────────────────────────────────────────
// Ordered by specificity.
// More specific intent patterns should appear before broader ones.

const LAYER2_PATTERN_REGISTRY = [
  {
    intent: LAYER2_INTENTS.RECOMMENDATION_EXPLANATION,
    patterns: RECOMMENDATION_EXPLANATION_PATTERNS,
    relatedLayer1Behaviors: [
      LAYER1_BEHAVIORS.RECOMMENDATION,
      LAYER1_BEHAVIORS.PERSONALIZATION,
    ],
  },
  {
    intent: LAYER2_INTENTS.TASTE_PROFILE_ANALYSIS,
    patterns: TASTE_PROFILE_ANALYSIS_PATTERNS,
    relatedLayer1Behaviors: [
      LAYER1_BEHAVIORS.PERSONALIZATION,
      LAYER1_BEHAVIORS.RECOMMENDATION,
    ],
  },
  {
    intent: LAYER2_INTENTS.FEEDBACK_REFINEMENT,
    patterns: FEEDBACK_REFINEMENT_PATTERNS,
    relatedLayer1Behaviors: [
      LAYER1_BEHAVIORS.RECOMMENDATION,
      LAYER1_BEHAVIORS.PERSONALIZATION,
      LAYER1_BEHAVIORS.ACTION_ENGAGEMENT,
    ],
  },
  {
    intent: LAYER2_INTENTS.COMPARE_GAMES,
    patterns: COMPARE_GAMES_PATTERNS,
    relatedLayer1Behaviors: [
      LAYER1_BEHAVIORS.RANKING,
      LAYER1_BEHAVIORS.RECOMMENDATION,
      LAYER1_BEHAVIORS.PERSONALIZATION,
    ],
  },
  {
    intent: LAYER2_INTENTS.SIMILAR_GAME_DISCOVERY,
    patterns: SIMILAR_GAME_DISCOVERY_PATTERNS,
    relatedLayer1Behaviors: [
      LAYER1_BEHAVIORS.DISCOVERY,
      LAYER1_BEHAVIORS.RECOMMENDATION,
      LAYER1_BEHAVIORS.PERSONALIZATION,
    ],
  },
  {
    intent: LAYER2_INTENTS.CONTEXT_BASED_RECOMMENDATION,
    patterns: CONTEXT_BASED_RECOMMENDATION_PATTERNS,
    relatedLayer1Behaviors: [
      LAYER1_BEHAVIORS.RECOMMENDATION,
      LAYER1_BEHAVIORS.PERSONALIZATION,
    ],
  },
  {
    intent: LAYER2_INTENTS.GAME_DETAIL_QUERY,
    patterns: GAME_DETAIL_QA_PATTERNS,
    relatedLayer1Behaviors: [
      LAYER1_BEHAVIORS.DISCOVERY,
      LAYER1_BEHAVIORS.RECOMMENDATION,
      LAYER1_BEHAVIORS.PERSONALIZATION,
      LAYER1_BEHAVIORS.ACTION_ENGAGEMENT,
    ],
  },
  {
    intent: LAYER2_INTENTS.FOLLOW_UP_ACTION,
    patterns: FOLLOW_UP_ACTION_PATTERNS,
    relatedLayer1Behaviors: [
      LAYER1_BEHAVIORS.DISCOVERY,
      LAYER1_BEHAVIORS.RECOMMENDATION,
      LAYER1_BEHAVIORS.PERSONALIZATION,
      LAYER1_BEHAVIORS.ACTION_ENGAGEMENT,
    ],
  },
];

// ── Light entity and constraint extraction ────────────────────────────────────
// This is intentionally lightweight and rule-based.
// It does not replace database lookup.
// It only extracts obvious signals for downstream tools / Answer Agent.

// ── Entity dictionaries ───────────────────────────────────────────────────────

const PLATFORM_KEYWORDS = [
  {
    value: "pc",
    patterns: [/\bpc\b/i, /\bwindows\b/i, /\bcomputer\b/i, /\blaptop\b/i],
  },
  {
    value: "switch",
    patterns: [/\bswitch\b/i, /\bnintendo\s+switch\b/i],
  },
  {
    value: "playstation",
    patterns: [/\bplaystation\b/i, /\bps4\b/i, /\bps5\b/i],
  },
  {
    value: "xbox",
    patterns: [/\bxbox\b/i, /\bseries\s+x\b/i, /\bseries\s+s\b/i],
  },
  {
    value: "mobile",
    patterns: [/\bmobile\b/i, /\bios\b/i, /\bandroid\b/i, /\bphone\b/i],
  },
];

const GENRE_KEYWORDS = [
  {
    value: "horror",
    patterns: [/\bhorrors?\b/i, /\bhorror\s+games?\b/i, /恐怖/],
  },
  {
    value: "puzzle",
    patterns: [/\bpuzzles?\b/i, /\bpuzzle\s+games?\b/i, /解谜/],
  },
  {
    value: "open_world",
    patterns: [/\bopen[-\s]?world\s+games?\b/i, /\bopen[-\s]?world\b/i, /开放世界/],
  },
  {
    value: "rpg",
    patterns: [/\brpgs?\b/i, /\brole[-\s]?playing\s+games?\b/i, /角色扮演/],
  },
  {
    value: "action",
    patterns: [/\baction\s+games?\b/i, /\baction\b/i, /动作/],
  },
  {
    value: "adventure",
    patterns: [/\badventure\s+games?\b/i, /\badventures?\b/i, /冒险/],
  },
  {
    value: "simulation",
    patterns: [/\bsimulations?\b/i, /\bsim\s+games?\b/i, /\bsims?\b/i, /模拟/],
  },
  {
    value: "strategy",
    patterns: [/\bstrateg(y|ies)\b/i, /\bstrategy\s+games?\b/i, /策略/],
  },
  {
    value: "turn_based",
    patterns: [/\bturn[-\s]?based\s+games?\b/i, /\bturn[-\s]?based\b/i, /回合制/],
  },
  {
    value: "story_driven",
    patterns: [/\bstory[-\s]?driven\s+games?\b/i, /\bstory[-\s]?driven\b/i, /\bnarrative\s+games?\b/i, /\bnarrative\b/i, /剧情/],
  },
  {
    value: "multiplayer",
    patterns: [/\bmultiplayer\s+games?\b/i, /\bmultiplayer\b/i, /\bco[-\s]?op\s+games?\b/i, /\bco[-\s]?op\b/i, /多人|合作/],
  },
];

const TAG_KEYWORDS = [
  {
    value: "relaxing",
    patterns: [/\brelaxing\b/i, /\bchill\b/i, /\bcozy\b/i, /轻松|休闲|治愈/],
  },
  {
    value: "beginner_friendly",
    patterns: [
      /\bbeginner[-\s]?friendly\b/i,
      /\bnew\s+player\b/i,
      /新手友好|适合新手/,
    ],
  },
  {
    value: "short",
    patterns: [
      /\bshort\b/i,
      /\bquick\b/i,
      /\bfinish\s+quickly\b/i,
      /短一点|很快通关/,
    ],
  },
  {
    value: "difficult",
    patterns: [
      /\bdifficult\b/i,
      /\bhard\b/i,
      /\bchallenging\b/i,
      /困难|有挑战/,
    ],
  },
  {
    value: "casual",
    patterns: [/\bcasual\b/i, /休闲/],
  },
];

const MOOD_KEYWORDS = [
  {
    value: "relaxing",
    patterns: [/\brelaxing\b/i, /\bchill\b/i, /\bcozy\b/i, /轻松|治愈/],
  },
  {
    value: "emotional",
    patterns: [/\bemotional\b/i, /\btouching\b/i, /感人|情绪|催泪/],
  },
  {
    value: "exciting",
    patterns: [/\bexciting\b/i, /\bintense\b/i, /刺激|爽快/],
  },
];

const ACTION_KEYWORDS = [
  {
    value: "save_to_bookmarks",
    patterns: [
      /\bsave\b/i,
      /\bbookmark\b/i,
      /\badd\s+.*bookmarks?\b/i,
      /保存|收藏/,
    ],
  },
  {
    value: "add_to_wishlist",
    patterns: [/\bwishlist\b/i, /愿望单/],
  },
  {
    value: "view_details",
    patterns: [/\bview\s+details?\b/i, /\bgame\s+details?\b/i, /查看详情/],
  },
  {
    value: "watch_trailer",
    patterns: [/\bwatch\s+(the\s+)?trailer\b/i, /\btrailer\b/i, /预告|预告片/],
  },
  {
    value: "write_review",
    patterns: [
      /\bwrite\s+(a\s+)?review\b/i,
      /\breview\s+this\b/i,
      /写评论|评价/,
    ],
  },
  {
    value: "share_with_community",
    patterns: [/\bshare\b/i, /分享/],
  },
];

// ── Extraction helpers ────────────────────────────────────────────────────────

function uniqueList(values) {
  return [...new Set(values.filter(Boolean))];
}

function matchesAnyPattern(patterns, msg) {
  return patterns.some((re) => re.test(msg));
}

function extractFromKeywordCatalog(msg, catalog) {
  return catalog
    .filter((item) => matchesAnyPattern(item.patterns, msg))
    .map((item) => item.value);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanGameCandidate(value) {
  if (!value) return null;

  let cleaned = value
    .replace(/[?.!,，。！？]+$/g, "")
    .replace(
      /\b(for me|based on my.*|on switch|on pc|on xbox|on playstation)\b.*$/i,
      "",
    )
    .trim();

  // Avoid over-extracting generic phrases as games.
  const lower = cleaned.toLowerCase();
  const blocked = [
    "this game",
    "games",
    "game",
    "some games",
    "relaxing games",
    "open world games",
    "horror games",
    "puzzle games",
    "story driven games",
  ];

  if (!cleaned || cleaned.length < 2) return null;
  if (blocked.includes(lower)) return null;

  return cleaned;
}

/**
 * Extract game title candidates from common phrasing:
 * - "Games like Portal 2" => Portal 2
 * - "Recommend games like Stardew Valley" => Stardew Valley
 * - "Compare Elden Ring and Sekiro" => Elden Ring, Sekiro
 * - "Elden Ring or Sekiro?" => Elden Ring, Sekiro
 */
function extractGameCandidates(msg) {
  const candidates = [];

  // Quoted titles: "Portal 2", 'Elden Ring'
  const quotedPattern = /["'“”‘’]([^"'“”‘’]{2,80})["'“”‘’]/g;
  let quotedMatch;
  while ((quotedMatch = quotedPattern.exec(msg)) !== null) {
    candidates.push(quotedMatch[1]);
  }

  // Similar-game phrasing.
  const similarPatterns = [
    /\bsimilar\s+to\s+([a-zA-Z0-9:'’&.\-\s]{2,80})/i,
    /\bgames?\s+like\s+([a-zA-Z0-9:'’&.\-\s]{2,80})/i,
    /\bmore\s+like\s+([a-zA-Z0-9:'’&.\-\s]{2,80})/i,
    /\btell\s+me\s+about\s+([a-zA-Z0-9:'’&.\-\s]{2,80})/i,
    /类似\s*([a-zA-Z0-9:'’&.\-\s\u4e00-\u9fff]{2,80})/,
    /像\s*([a-zA-Z0-9:'’&.\-\s\u4e00-\u9fff]{2,80})\s*一样/,
  ];

  for (const pattern of similarPatterns) {
    const match = msg.match(pattern);
    if (match?.[1]) {
      candidates.push(match[1]);
    }
  }

  // Compare phrasing: "Compare A and B", "Compare A vs B"
  const comparePattern =
    /\bcompare\s+([a-zA-Z0-9:'’&.\-\s]{2,60})\s+(?:and|vs\.?|versus|or)\s+([a-zA-Z0-9:'’&.\-\s]{2,60})/i;
  const compareMatch = msg.match(comparePattern);
  if (compareMatch) {
    candidates.push(compareMatch[1], compareMatch[2]);
  }

  // Choice phrasing: "Elden Ring or Sekiro"
  const choicePattern =
    /\b([A-Z][a-zA-Z0-9:'’&.\-]*(?:\s+[A-Z0-9][a-zA-Z0-9:'’&.\-]*){0,5})\s+(?:or|vs\.?|versus)\s+([A-Z][a-zA-Z0-9:'’&.\-]*(?:\s+[A-Z0-9][a-zA-Z0-9:'’&.\-]*){0,5})\b/;
  const choiceMatch = msg.match(choicePattern);
  if (choiceMatch) {
    candidates.push(choiceMatch[1], choiceMatch[2]);
  }

  return uniqueList(candidates.map(cleanGameCandidate));
}

function extractHardwareConstraint(msg) {
  if (
    /\blow[-\s]?end\s+(pc|computer|laptop)\b/i.test(msg) ||
    /低配置|低端电脑/.test(msg)
  ) {
    return "low_end_pc";
  }

  if (/\bhigh[-\s]?end\s+(pc|computer)\b/i.test(msg) || /高配置/.test(msg)) {
    return "high_end_pc";
  }

  return null;
}

function extractPlayStyleConstraint(msg) {
  if (
    /\bco[-\s]?op\b/i.test(msg) ||
    /\bwith\s+friends\b/i.test(msg) ||
    /合作|和朋友/.test(msg)
  ) {
    return "co_op";
  }

  if (/\bmultiplayer\b/i.test(msg) || /多人/.test(msg)) {
    return "multiplayer";
  }

  if (/\bsingle[-\s]?player\b/i.test(msg) || /单人/.test(msg)) {
    return "single_player";
  }

  if (
    /\bstory[-\s]?driven\b/i.test(msg) ||
    /\bnarrative\b/i.test(msg) ||
    /剧情/.test(msg)
  ) {
    return "story_driven";
  }

  if (/\bopen[-\s]?world\b/i.test(msg) || /开放世界/.test(msg)) {
    return "open_world";
  }

  return null;
}

function extractDifficultyConstraint(msg) {
  if (
    /\bbeginner[-\s]?friendly\b/i.test(msg) ||
    /\beasy\b/i.test(msg) ||
    /新手友好|适合新手|简单/.test(msg)
  ) {
    return "beginner_friendly";
  }

  if (
    /\bdifficult\b/i.test(msg) ||
    /\bhard\b/i.test(msg) ||
    /\bchallenging\b/i.test(msg) ||
    /困难|有挑战/.test(msg)
  ) {
    return "challenging";
  }

  return null;
}

function extractSessionLengthConstraint(msg) {
  // More specific time context should be checked first.
  if (
    /\b(for\s+the\s+)?weekend\b/i.test(msg) ||
    /\bweekend\s+games?\b/i.test(msg) ||
    /周末/.test(msg)
  ) {
    return "weekend_session";
  }

  if (
    /\bshort\s+games?\b/i.test(msg) ||
    /\bquick\s+games?\b/i.test(msg) ||
    /\bfinish\s+quickly\b/i.test(msg) ||
    /\bcan\s+finish\b.*\bquickly\b/i.test(msg) ||
    /\bfinish\s+in\s+(one|a)\s+(sitting|day|weekend)\b/i.test(msg) ||
    /短一点|很快通关|快速通关/.test(msg)
  ) {
    return "short_session";
  }

  if (
    /\blong\s+games?\b/i.test(msg) ||
    /\bhundreds?\s+of\s+hours\b/i.test(msg) ||
    /\bplay\s+for\s+months\b/i.test(msg) ||
    /\bcan\s+play\s+for\s+months\b/i.test(msg) ||
    /长期|很长|玩很久/.test(msg)
  ) {
    return "long_session";
  }

  return null;
}

function extractFeedbackConstraints(msg, detectedGenres, detectedTags) {
  const excludedGenres = [];
  const preferredGenres = [];
  const excludedTags = [];
  const preferredTags = [];

  for (const genre of detectedGenres) {
    const escaped = escapeRegExp(genre.replace("_", "[-\\s]?"));

    const negativePattern = new RegExp(
      `(don't\\s+recommend|do\\s+not\\s+recommend|don't\\s+like|do\\s+not\\s+like|dislike|less|fewer).{0,40}${escaped}`,
      "i",
    );

    const positivePattern = new RegExp(
      `(like|prefer|recommend\\s+more|more).{0,40}${escaped}`,
      "i",
    );

    if (negativePattern.test(msg)) excludedGenres.push(genre);
    if (positivePattern.test(msg)) preferredGenres.push(genre);
  }

  for (const tag of detectedTags) {
    const escaped = escapeRegExp(tag.replace("_", "[-\\s]?"));

    const negativePattern = new RegExp(
      `(don't\\s+recommend|do\\s+not\\s+recommend|don't\\s+like|do\\s+not\\s+like|dislike|less|fewer).{0,40}${escaped}`,
      "i",
    );

    const positivePattern = new RegExp(
      `(like|prefer|recommend\\s+more|more).{0,40}${escaped}`,
      "i",
    );

    if (negativePattern.test(msg)) excludedTags.push(tag);
    if (positivePattern.test(msg)) preferredTags.push(tag);
  }

  let feedbackDirection = null;

  if (/\bmore\s+like\s+this\b/i.test(msg) || /多推荐类似|更多类似/.test(msg)) {
    feedbackDirection = "more_like_this";
  } else if (
    /\bless\s+like\s+this\b/i.test(msg) ||
    /\bfewer\s+like\s+this\b/i.test(msg) ||
    /少推荐类似/.test(msg)
  ) {
    feedbackDirection = "less_like_this";
  } else if (/\bnot\s+for\s+me\b/i.test(msg) || /不适合我/.test(msg)) {
    feedbackDirection = "not_for_me";
  } else if (excludedGenres.length || excludedTags.length) {
    feedbackDirection = "exclude";
  } else if (preferredGenres.length || preferredTags.length) {
    feedbackDirection = "prefer";
  }

  return {
    feedbackDirection,
    excludedGenres: uniqueList(excludedGenres),
    preferredGenres: uniqueList(preferredGenres),
    excludedTags: uniqueList(excludedTags),
    preferredTags: uniqueList(preferredTags),
  };
}

/**
 * Public lightweight extraction function.
 *
 * @param {string} message
 * @returns {{
 *   entities: {
 *     games: string[],
 *     genres: string[],
 *     platforms: string[],
 *     tags: string[],
 *     actions: string[],
 *   },
 *   constraints: {
 *     mood: string | null,
 *     hardware: string | null,
 *     platform: string | null,
 *     playStyle: string | null,
 *     difficulty: string | null,
 *     sessionLength: string | null,
 *     feedbackDirection: string | null,
 *     excludedGenres: string[],
 *     preferredGenres: string[],
 *     excludedTags: string[],
 *     preferredTags: string[],
 *   }
 * }}
 */
export function extractEntitiesAndConstraints(message) {
  const msg = (message ?? "").trim();

  const platforms = uniqueList(
    extractFromKeywordCatalog(msg, PLATFORM_KEYWORDS),
  );
  const genres = uniqueList(extractFromKeywordCatalog(msg, GENRE_KEYWORDS));
  const tags = uniqueList(extractFromKeywordCatalog(msg, TAG_KEYWORDS));
  const moods = uniqueList(extractFromKeywordCatalog(msg, MOOD_KEYWORDS));
  const actions = uniqueList(extractFromKeywordCatalog(msg, ACTION_KEYWORDS));
  const games = extractGameCandidates(msg);

  const feedback = extractFeedbackConstraints(msg, genres, tags);

  return {
    entities: {
      games,
      genres,
      platforms,
      tags,
      actions,
    },
    constraints: {
      mood: moods[0] ?? null,
      hardware: extractHardwareConstraint(msg),
      platform: platforms[0] ?? null,
      playStyle: extractPlayStyleConstraint(msg),
      difficulty: extractDifficultyConstraint(msg),
      sessionLength: extractSessionLengthConstraint(msg),

      feedbackDirection: feedback.feedbackDirection,
      excludedGenres: feedback.excludedGenres,
      preferredGenres: feedback.preferredGenres,
      excludedTags: feedback.excludedTags,
      preferredTags: feedback.preferredTags,
    },
  };
}

// ── Signal helpers ────────────────────────────────────────────────────────────

function matchesAny(patterns, msg) {
  return patterns.some((re) => re.test(msg));
}

function hasGeneralChatSignal(msg) {
  return matchesAny(GENERAL_CHAT_PATTERNS, msg);
}

/**
 * Detect all matching Layer 1 behaviors.
 *
 * @param {string} msg
 * @returns {string[]}
 */
function detectLayer1Behaviors(msg) {
  const matchedBehaviors = [];

  for (const { behavior, patterns } of LAYER1_PATTERN_REGISTRY) {
    if (matchesAny(patterns, msg)) {
      matchedBehaviors.push(behavior);
    }
  }

  return matchedBehaviors;
}

/**
 * Detect the most specific Layer 2 intent.
 *
 * @param {string} msg
 * @returns {{
 *   intent: string | null,
 *   relatedLayer1Behaviors: string[],
 * }}
 */
function detectLayer2Intent(msg) {
  for (const {
    intent,
    patterns,
    relatedLayer1Behaviors,
  } of LAYER2_PATTERN_REGISTRY) {
    if (matchesAny(patterns, msg)) {
      return {
        intent,
        relatedLayer1Behaviors,
      };
    }
  }

  return {
    intent: null,
    relatedLayer1Behaviors: [],
  };
}

/**
 * Merge detected Layer 1 behaviors with Layer 1 behaviors implied by Layer 2.
 *
 * Example:
 * "Is Elden Ring worth buying?"
 * may not strongly match Layer 1 directly, but Layer 2 compare_games implies
 * ranking + recommendation + personalization.
 *
 * @param {string[]} detectedLayer1
 * @param {string[]} impliedLayer1
 * @returns {string[]}
 */
function mergeLayer1Behaviors(detectedLayer1, impliedLayer1) {
  const merged = [...detectedLayer1, ...impliedLayer1].filter(
    (behavior) => behavior !== LAYER1_BEHAVIORS.GENERAL_CHAT,
  );

  return [...new Set(merged)];
}

/**
 * Select the primary Layer 1 behavior.
 *
 * @param {string[]} behaviors
 * @returns {string}
 */
function selectPrimaryBehavior(behaviors) {
  if (!behaviors.length) {
    return LAYER1_BEHAVIORS.GENERAL_CHAT;
  }

  const priority = [
    LAYER1_BEHAVIORS.ACTION_ENGAGEMENT,
    LAYER1_BEHAVIORS.PERSONALIZATION,
    LAYER1_BEHAVIORS.RECOMMENDATION,
    LAYER1_BEHAVIORS.RANKING,
    LAYER1_BEHAVIORS.DISCOVERY,
  ];

  return (
    priority.find((behavior) => behaviors.includes(behavior)) || behaviors[0]
  );
}

/**
 * Convert primary behavior to router mode.
 * Mode follows primaryBehavior directly (which is selected via priority logic).
 *
 * @param {string} primaryBehavior
 * @returns {string}
 */
function resolveMode(primaryBehavior) {
  switch (primaryBehavior) {
    case LAYER1_BEHAVIORS.DISCOVERY:
      return MODES.DISCOVERY;

    case LAYER1_BEHAVIORS.RANKING:
      return MODES.RANKING;

    case LAYER1_BEHAVIORS.RECOMMENDATION:
      return MODES.RECOMMENDATION;

    case LAYER1_BEHAVIORS.PERSONALIZATION:
      return MODES.PERSONALIZATION;

    case LAYER1_BEHAVIORS.ACTION_ENGAGEMENT:
      return MODES.ACTION;

    case LAYER1_BEHAVIORS.GENERAL_CHAT:
    default:
      return MODES.GENERAL_CHAT;
  }
}

// ── Plan builder ──────────────────────────────────────────────────────────────

/**
 * Build a two-layer execution plan.
 *
 * @param {{
 *   layer1Behaviors: string[],
 *   primaryBehavior: string,
 *   layer2Intent: string | null,
 *   confidence: 'pattern_match' | 'layer2_match' | 'default',
 * }} params
 * @returns {object}
 */
function buildPlan({
  layer1Behaviors,
  primaryBehavior,
  layer2Intent,
  confidence,
  entities = {
    games: [],
    genres: [],
    platforms: [],
    tags: [],
    actions: [],
  },
  constraints = {
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
}) {
  const mode = resolveMode(primaryBehavior);

  if (primaryBehavior === LAYER1_BEHAVIORS.GENERAL_CHAT) {
    return {
      routerVersion: "layer1_layer2_v1",

      layer1Behaviors: [LAYER1_BEHAVIORS.GENERAL_CHAT],
      primaryBehavior: LAYER1_BEHAVIORS.GENERAL_CHAT,
      layer2Intent: null,

      mode: MODES.GENERAL_CHAT,
      confidence,

      needsDatabase: false,
      needsUserProfile: false,
      needsRecommendation: false,
      needsValidation: false,
      needsAction: false,

      dataSources: [],
      executionOrder: ["short_guidance"],
      responseStyle: "general_guidance",

      entities,
      constraints,
    };
  }

  const needsDatabase = resolveNeedsDatabase(layer1Behaviors, layer2Intent);
  const needsUserProfile = resolveNeedsUserProfile(
    layer1Behaviors,
    layer2Intent,
  );
  const needsRecommendation = resolveNeedsRecommendation(
    layer1Behaviors,
    layer2Intent,
  );
  const needsValidation = resolveNeedsValidation(layer1Behaviors, layer2Intent);
  const needsAction = resolveNeedsAction(layer1Behaviors, layer2Intent);

  return {
    routerVersion: "layer1_layer2_v1",

    // Layer 1 output
    layer1Behaviors,
    primaryBehavior,

    // Layer 2 output
    layer2Intent,

    mode,
    confidence,

    needsDatabase,
    needsUserProfile,
    needsRecommendation,
    needsValidation,
    needsAction,

    dataSources: resolveDataSources(layer1Behaviors, layer2Intent),

    executionOrder: buildExecutionOrder(
      layer1Behaviors,
      primaryBehavior,
      layer2Intent,
    ),

    responseStyle: resolveResponseStyle(
      primaryBehavior,
      layer1Behaviors,
      layer2Intent,
    ),

    entities,
    constraints,
  };
}

// ── Requirement resolvers ─────────────────────────────────────────────────────

function resolveNeedsDatabase(layer1Behaviors, layer2Intent) {
  if (
    [
      LAYER2_INTENTS.CONTEXT_BASED_RECOMMENDATION,
      LAYER2_INTENTS.SIMILAR_GAME_DISCOVERY,
      LAYER2_INTENTS.COMPARE_GAMES,
      LAYER2_INTENTS.RECOMMENDATION_EXPLANATION,
      LAYER2_INTENTS.TASTE_PROFILE_ANALYSIS,
      LAYER2_INTENTS.GAME_DETAIL_QUERY,
    ].includes(layer2Intent)
  ) {
    return true;
  }

  return layer1Behaviors.some((behavior) =>
    [
      LAYER1_BEHAVIORS.DISCOVERY,
      LAYER1_BEHAVIORS.RANKING,
      LAYER1_BEHAVIORS.RECOMMENDATION,
      LAYER1_BEHAVIORS.PERSONALIZATION,
      LAYER1_BEHAVIORS.ACTION_ENGAGEMENT,
    ].includes(behavior),
  );
}

function resolveNeedsUserProfile(layer1Behaviors, layer2Intent) {
  if (
    [
      LAYER2_INTENTS.CONTEXT_BASED_RECOMMENDATION,
      LAYER2_INTENTS.COMPARE_GAMES,
      LAYER2_INTENTS.RECOMMENDATION_EXPLANATION,
      LAYER2_INTENTS.TASTE_PROFILE_ANALYSIS,
      LAYER2_INTENTS.REFINE_RECOMMENDATIONS,
      LAYER2_INTENTS.SIMILAR_GAME_DISCOVERY,
    ].includes(layer2Intent)
  ) {
    return true;
  }

  return layer1Behaviors.some((behavior) =>
    [
      LAYER1_BEHAVIORS.PERSONALIZATION,
      LAYER1_BEHAVIORS.RECOMMENDATION,
    ].includes(behavior),
  );
}

function resolveNeedsRecommendation(layer1Behaviors, layer2Intent) {
  if (
    [
      LAYER2_INTENTS.CONTEXT_BASED_RECOMMENDATION,
      LAYER2_INTENTS.SIMILAR_GAME_DISCOVERY,
      LAYER2_INTENTS.COMPARE_GAMES,
      LAYER2_INTENTS.RECOMMENDATION_EXPLANATION,
    ].includes(layer2Intent)
  ) {
    return true;
  }

  return layer1Behaviors.includes(LAYER1_BEHAVIORS.RECOMMENDATION);
}

function resolveNeedsValidation(layer1Behaviors, layer2Intent) {
  if (
    [
      LAYER2_INTENTS.CONTEXT_BASED_RECOMMENDATION,
      LAYER2_INTENTS.SIMILAR_GAME_DISCOVERY,
      LAYER2_INTENTS.COMPARE_GAMES,
      LAYER2_INTENTS.RECOMMENDATION_EXPLANATION,
      LAYER2_INTENTS.TASTE_PROFILE_ANALYSIS,
      LAYER2_INTENTS.GAME_DETAIL_QUERY,
    ].includes(layer2Intent)
  ) {
    return true;
  }

  return layer1Behaviors.some((behavior) =>
    [
      LAYER1_BEHAVIORS.RANKING,
      LAYER1_BEHAVIORS.RECOMMENDATION,
      LAYER1_BEHAVIORS.PERSONALIZATION,
    ].includes(behavior),
  );
}

function resolveNeedsAction(layer1Behaviors, layer2Intent) {
  return (
    layer2Intent === LAYER2_INTENTS.FOLLOW_UP_ACTION ||
    layer1Behaviors.includes(LAYER1_BEHAVIORS.ACTION_ENGAGEMENT)
  );
}

function resolveDataSources(layer1Behaviors, layer2Intent) {
  const dataSources = [];

  if (
    layer1Behaviors.includes(LAYER1_BEHAVIORS.DISCOVERY) ||
    layer1Behaviors.includes(LAYER1_BEHAVIORS.RANKING) ||
    layer1Behaviors.includes(LAYER1_BEHAVIORS.RECOMMENDATION) ||
    layer1Behaviors.includes(LAYER1_BEHAVIORS.PERSONALIZATION) ||
    [
      LAYER2_INTENTS.CONTEXT_BASED_RECOMMENDATION,
      LAYER2_INTENTS.SIMILAR_GAME_DISCOVERY,
      LAYER2_INTENTS.COMPARE_GAMES,
      LAYER2_INTENTS.GAME_DETAIL_QUERY,
    ].includes(layer2Intent)
  ) {
    dataSources.push("platform_posts");
  }

  if (
    layer1Behaviors.includes(LAYER1_BEHAVIORS.RANKING) ||
    [
      LAYER2_INTENTS.COMPARE_GAMES,
      LAYER2_INTENTS.RECOMMENDATION_EXPLANATION,
    ].includes(layer2Intent)
  ) {
    dataSources.push("community_signals");
  }

  if (
    layer1Behaviors.includes(LAYER1_BEHAVIORS.PERSONALIZATION) ||
    layer1Behaviors.includes(LAYER1_BEHAVIORS.RECOMMENDATION) ||
    [
      LAYER2_INTENTS.CONTEXT_BASED_RECOMMENDATION,
      LAYER2_INTENTS.SIMILAR_GAME_DISCOVERY,
      LAYER2_INTENTS.COMPARE_GAMES,
      LAYER2_INTENTS.RECOMMENDATION_EXPLANATION,
      LAYER2_INTENTS.TASTE_PROFILE_ANALYSIS,
      LAYER2_INTENTS.REFINE_RECOMMENDATIONS,
    ].includes(layer2Intent)
  ) {
    dataSources.push("user_bookmarks", "user_profile");
  }

  if (
    layer1Behaviors.includes(LAYER1_BEHAVIORS.ACTION_ENGAGEMENT) ||
    layer2Intent === LAYER2_INTENTS.FOLLOW_UP_ACTION
  ) {
    dataSources.push("user_actions");
  }

  return [...new Set(dataSources)];
}

// ── Execution and response style resolvers ────────────────────────────────────

function buildExecutionOrder(layer1Behaviors, primaryBehavior, layer2Intent) {
  switch (layer2Intent) {
    case LAYER2_INTENTS.CONTEXT_BASED_RECOMMENDATION:
      return [
        "extract_context_constraints",
        "retrieve_candidates",
        "rank_candidates",
        "answer",
      ];

    case LAYER2_INTENTS.SIMILAR_GAME_DISCOVERY:
      return [
        "resolve_reference_game",
        "retrieve_similar_games",
        "rank_candidates",
        "answer",
      ];

    case LAYER2_INTENTS.COMPARE_GAMES:
      return [
        "resolve_game_candidates",
        "load_user_profile",
        "compare_games",
        "answer",
      ];

    case LAYER2_INTENTS.RECOMMENDATION_EXPLANATION:
      return [
        "resolve_recommended_game",
        "load_user_profile",
        "explain_match",
        "answer",
      ];

    case LAYER2_INTENTS.TASTE_PROFILE_ANALYSIS:
      return [
        "load_user_bookmarks",
        "load_user_profile",
        "analyze_taste_profile",
        "answer",
      ];

    case LAYER2_INTENTS.REFINE_RECOMMENDATIONS:
      return [
        "extract_feedback",
        "update_preference_profile",
        "refresh_recommendation_context",
        "answer",
      ];

    case LAYER2_INTENTS.GAME_DETAIL_QUERY:
      return ["resolve_game", "retrieve_game_details", "answer"];

    case LAYER2_INTENTS.FOLLOW_UP_ACTION:
      return ["resolve_action_target", "perform_or_prepare_action", "answer"];

    default:
      break;
  }

  if (primaryBehavior === LAYER1_BEHAVIORS.ACTION_ENGAGEMENT) {
    return ["resolve_action_target", "perform_or_prepare_action", "answer"];
  }

  if (layer1Behaviors.includes(LAYER1_BEHAVIORS.RECOMMENDATION)) {
    return [
      "retrieve_context",
      "retrieve_candidates",
      "rank_candidates",
      "answer",
    ];
  }

  if (layer1Behaviors.includes(LAYER1_BEHAVIORS.PERSONALIZATION)) {
    return ["load_user_profile", "load_user_bookmarks", "answer"];
  }

  if (layer1Behaviors.includes(LAYER1_BEHAVIORS.RANKING)) {
    return ["query_ranked_games", "answer"];
  }

  if (layer1Behaviors.includes(LAYER1_BEHAVIORS.DISCOVERY)) {
    return ["query_games", "answer"];
  }

  return ["short_guidance"];
}

function resolveResponseStyle(primaryBehavior, layer1Behaviors, layer2Intent) {
  switch (layer2Intent) {
    case LAYER2_INTENTS.CONTEXT_BASED_RECOMMENDATION:
      return "context_based_recommendation";

    case LAYER2_INTENTS.SIMILAR_GAME_DISCOVERY:
      return "similar_game_recommendation";

    case LAYER2_INTENTS.COMPARE_GAMES:
      return "comparison_decision_support";

    case LAYER2_INTENTS.RECOMMENDATION_EXPLANATION:
      return "recommendation_explanation";

    case LAYER2_INTENTS.TASTE_PROFILE_ANALYSIS:
      return "taste_profile_summary";

    case LAYER2_INTENTS.REFINE_RECOMMENDATIONS:
      return "feedback_refinement_confirmation";

    case LAYER2_INTENTS.GAME_DETAIL_QUERY:
      return "game_detail_answer";

    case LAYER2_INTENTS.FOLLOW_UP_ACTION:
      return "action_confirmation_or_next_step";

    default:
      break;
  }

  if (primaryBehavior === LAYER1_BEHAVIORS.ACTION_ENGAGEMENT) {
    return "action_confirmation_or_next_step";
  }

  if (
    layer1Behaviors.includes(LAYER1_BEHAVIORS.RECOMMENDATION) &&
    layer1Behaviors.includes(LAYER1_BEHAVIORS.PERSONALIZATION)
  ) {
    return "personalized_recommendation";
  }

  if (layer1Behaviors.includes(LAYER1_BEHAVIORS.RECOMMENDATION)) {
    return "general_recommendation";
  }

  if (layer1Behaviors.includes(LAYER1_BEHAVIORS.PERSONALIZATION)) {
    return "personalized_insight";
  }

  if (layer1Behaviors.includes(LAYER1_BEHAVIORS.RANKING)) {
    return "ranked_factual_list";
  }

  if (layer1Behaviors.includes(LAYER1_BEHAVIORS.DISCOVERY)) {
    return "exploratory_list";
  }

  return "general_guidance";
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Classify a user message into Nova's two-layer router framework.
 *
 * @param {string} message
 * @returns {{
 *   routerVersion: string,
 *   layer1Behaviors: string[],
 *   primaryBehavior: string,
 *   layer2Intent: string | null,
 *   mode: string,
 *   confidence: 'pattern_match' | 'layer2_match' | 'default',
 *   needsDatabase: boolean,
 *   needsUserProfile: boolean,
 *   needsRecommendation: boolean,
 *   needsValidation: boolean,
 *   needsAction: boolean,
 *   dataSources: string[],
 *   executionOrder: string[],
 *   responseStyle: string,
 *   entities: {
 *     games: string[],
 *     genres: string[],
 *     platforms: string[],
 *     tags: string[],
 *   },
 *   constraints: {
 *     mood: string | null,
 *     hardware: string | null,
 *     platform: string | null,
 *     playStyle: string | null,
 *     difficulty: string | null,
 *     sessionLength: string | null,
 *   },
 * }}
 */
export function classifyIntent(message) {
  const msg = (message ?? "").trim();
  const { entities, constraints } = extractEntitiesAndConstraints(msg);

  if (!msg) {
    return buildPlan({
      layer1Behaviors: [LAYER1_BEHAVIORS.GENERAL_CHAT],
      primaryBehavior: LAYER1_BEHAVIORS.GENERAL_CHAT,
      layer2Intent: null,
      confidence: "default",
      entities,
      constraints,
    });
  }

  // General chat short-circuit.
  if (hasGeneralChatSignal(msg)) {
    return buildPlan({
      layer1Behaviors: [LAYER1_BEHAVIORS.GENERAL_CHAT],
      primaryBehavior: LAYER1_BEHAVIORS.GENERAL_CHAT,
      layer2Intent: null,
      confidence: "pattern_match",
      entities,
      constraints,
    });
  }

  const detectedLayer1 = detectLayer1Behaviors(msg);
  const layer2Result = detectLayer2Intent(msg);

  const layer1Behaviors = mergeLayer1Behaviors(
    detectedLayer1,
    layer2Result.relatedLayer1Behaviors,
  );

  if (!layer1Behaviors.length && !layer2Result.intent) {
    return buildPlan({
      layer1Behaviors: [LAYER1_BEHAVIORS.GENERAL_CHAT],
      primaryBehavior: LAYER1_BEHAVIORS.GENERAL_CHAT,
      layer2Intent: null,
      confidence: "default",
      entities,
      constraints,
    });
  }

  const primaryBehavior = selectPrimaryBehavior(layer1Behaviors);

  return buildPlan({
    layer1Behaviors,
    primaryBehavior,
    layer2Intent: layer2Result.intent,
    confidence: layer2Result.intent ? "layer2_match" : "pattern_match",
    entities,
    constraints,
  });
}
