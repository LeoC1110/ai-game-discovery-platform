// packages/auth-service/prompts/fallbackResponses.js
// Safe, user-friendly fallback messages for every failure scenario.
// Return these instead of crashing or leaving the UI blank.

/** Returned immediately for hi/hello/hey — no Gemini call needed. */
export const GREETING_RESPONSE =
  "Hi, I’m Nova. I can help you find games you might enjoy, explore community trends, or recommend titles based on your bookmarks and preferences. What would you like to discover today?";

/** Returned immediately for Chinese greetings — no Gemini call needed. */
export const CHINESE_GREETING_RESPONSE =
  '你好，我是 Nova。今天想找新游戏、看看社区在推荐什么，还是让我根据你的收藏给你一些个性化建议？';

/** Returned when Gemini / LangChain times out. */
export const TIMEOUT_RESPONSE =
  'Nova is taking a little longer than expected. Please try again in a moment.';

/** Returned when GOOGLE_API_KEY is missing server-side. */
export const MISSING_KEY_RESPONSE =
  'Nova is not available right now. Please try again later or contact the site administrator.';

/** Returned when no community posts exist at all. */
export const NO_PLATFORM_DATA_RESPONSE =
  "There are no community posts available yet. " +
  "Browse the Community page or share a game first — " +
  "then Nova can provide better recommendations based on real platform activity.";

/** Returned when the user has no bookmarks. */
export const NO_BOOKMARKS_RESPONSE =
  "You haven't bookmarked any games yet. " +
  "Browse the Community page and save games you're interested in — " +
  "then Nova can recommend similar games from the platform.";

/** Generic catch-all when the AI service fails unexpectedly. */
export const GENERIC_ERROR_RESPONSE =
  'Nova ran into a temporary issue. Please try again in a moment.';

/** Returned when the Gemini API quota is exceeded (HTTP 429). */
export const QUOTA_EXCEEDED_RESPONSE =
  'Nova has reached the current AI request limit. Please try again later.';
