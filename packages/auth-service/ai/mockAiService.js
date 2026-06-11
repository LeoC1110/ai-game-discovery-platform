// packages/auth-service/ai/mockAiService.js
// Deterministic, intent-aware mock responses for local development.
//
// Used when AI_MOCK_MODE=true in the environment.
// Never called in production — only imported by answerAgent.js.
//
// Why mock responses instead of real Gemini calls during dev?
//   • Free-tier Gemini quota is limited (20–200 req/day depending on model)
//   • Testing UI flows, recommendedPosts rendering, memory, and evaluation
//     should not consume API quota
//   • Mock responses are deterministic — same input always produces same output
//
// Enabling:  AI_MOCK_MODE=true in packages/auth-service/.env  (or dev:mock script)
// Disabling: AI_MOCK_MODE=false  (or dev:real script, or just unset the variable)

import { INTENTS } from './routerAgent.js';

// ── Mock answer text keyed by intent ─────────────────────────────────────────
// game_recommendation and bookmark_analysis include a RECOMMENDATIONS block so
// the full pipeline (extractRecommendedPosts → evaluateResponse) can be exercised.
// Titles are generic placeholders — the hallucination filter will strip any that
// don't exist in your local DB (which is expected in mock mode).

const MOCK_ANSWERS = {
  [INTENTS.GAME_RECOMMENDATION]:
    `[MOCK MODE] Based on your bookmarks and community activity, here are two picks:\n\n` +
    `**Elden Ring** is the top community pick right now — an open-world RPG with ` +
    `challenging combat and deep lore. Highly recommended for fans of the genre.\n\n` +
    `**Hollow Knight** is a fan favourite for precise platforming and atmospheric storytelling.\n\n` +
    `<!--RECOMMENDATIONS:[` +
    `{"title":"Elden Ring","reason":"Top-rated open-world RPG matching your bookmark history","confidence":0.95,"matchedTags":["rpg","open-world","souls-like"]},` +
    `{"title":"Hollow Knight","reason":"Highly rated indie platformer with rich atmosphere","confidence":0.88,"matchedTags":["platformer","indie","metroidvania"]}` +
    `]-->`,

  [INTENTS.BOOKMARK_ANALYSIS]:
    `[MOCK MODE] Your bookmarks suggest a preference for **action RPGs** and **open-world exploration**. ` +
    `You gravitate toward games with challenging combat and strong narrative.\n\n` +
    `**Elden Ring** appears most frequently in your saved games and fits your taste profile closely.\n\n` +
    `<!--RECOMMENDATIONS:[` +
    `{"title":"Elden Ring","reason":"Consistent with your bookmarked action RPG preferences","confidence":0.93,"matchedTags":["rpg","action","open-world"]}` +
    `]-->`,

  [INTENTS.COMMUNITY_SUMMARY]:
    `[MOCK MODE] The community is most active around **Elden Ring** this week — ` +
    `the post "Perfect Parry Guide" has 47 likes and 18 comments. ` +
    `**Hollow Knight** is trending in the indie category with several speedrun posts. ` +
    `Overall community sentiment is very positive with players sharing tips and celebrating completions.`,

  [INTENTS.LEADERBOARD_QUERY]:
    `[MOCK MODE] Here are the current top-rated games on the platform:\n\n` +
    `1. **Elden Ring** — 9.8 / 10 (most liked this week)\n` +
    `2. **Hollow Knight** — 9.5 / 10 (indie favourite)\n` +
    `3. **Celeste** — 9.3 / 10 (praised for accessibility features)\n\n` +
    `Rankings are based on community ratings and like counts.`,

  [INTENTS.LOW_RATING_QUERY]:
    `[MOCK MODE] Here are the current low-rated games on the platform ` +
    `(community rating <= 6.0, minimum 2 ratings):\n\n` +
    `1. **Game A** — 5.2 / 10 (12 ratings)\n` +
    `2. **Game B** — 5.8 / 10 (8 ratings)\n` +
    `3. **Game C** — 6.0 / 10 (6 ratings)\n\n` +
    `These are ordered from lowest to highest community rating.`,

  [INTENTS.GENERAL_CHAT]:
    `[MOCK MODE] Hey! I'm running in local mock mode — no Gemini API calls are being made. ` +
    `This response is pre-defined for development and testing.\n\n` +
    `In production I can help you: recommend games based on your bookmarks, ` +
    `analyse your taste profile, summarise community posts, or browse the leaderboard. ` +
    `What would you like to explore today?`,
};

// Fallback for any unknown or future intent
const MOCK_FALLBACK = MOCK_ANSWERS[INTENTS.GENERAL_CHAT];

/**
 * Return a deterministic mock answer for local development.
 * Called from answerAgent.generateAnswer when AI_MOCK_MODE=true.
 *
 * @param {{ intent: string }} params
 * @returns {string}
 */
export function getMockAnswer({ intent }) {
  return MOCK_ANSWERS[intent] ?? MOCK_FALLBACK;
}

/**
 * Return a deterministic mock reflection response.
 * Simulates a one-pass correction: strips the RECOMMENDATIONS block from the
 * bad answer and appends a note confirming the correction.
 * Called from answerAgent.generateReflection when AI_MOCK_MODE=true.
 *
 * @param {{ badAnswer: string }} params
 * @returns {string}
 */
export function getMockReflection({ badAnswer }) {
  // Strip any embedded RECOMMENDATIONS block so the clean text is returned
  const stripped = badAnswer.replace(/<!--RECOMMENDATIONS:[\s\S]*?-->/g, '').trimEnd();
  return (
    `${stripped}\n\n` +
    `[MOCK REFLECTION] This response has been reviewed. ` +
    `All game titles are grounded in platform data and no hallucinations were found.`
  );
}
