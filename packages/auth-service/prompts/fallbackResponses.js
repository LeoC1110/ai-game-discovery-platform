// packages/auth-service/prompts/fallbackResponses.js
// Safe, user-friendly fallback messages for every failure scenario.
// Return these instead of crashing or leaving the UI blank.

/** Returned immediately for hi/hello/hey — no Gemini call needed. */
export const GREETING_RESPONSE =
  "Hi, I'm Nova. I can help you:\n" +
  '• Find game recommendations based on your bookmarks\n' +
  '• Explore community trends and popular posts\n' +
  '• Search by genre, platform, tags, or game type\n' +
  '• Understand your taste profile from saved games\n\n' +
  'What would you like to explore today?';

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
