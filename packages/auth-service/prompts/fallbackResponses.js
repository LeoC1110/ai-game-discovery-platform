// packages/auth-service/prompts/fallbackResponses.js
// Safe, user-friendly fallback messages for every failure scenario.
// Return these instead of crashing or leaving the UI blank.

/** Returned immediately for hi/hello/hey — no Gemini call needed. */
export const GREETING_RESPONSE =
  "Hey! 👋 I'm your AI Game Agent. I can help you:\n" +
  '• Recommend games based on your bookmarks\n' +
  '• Summarize community posts and reviews\n' +
  '• Find games by genre, tags, or platform\n' +
  '• Show top-rated or most-liked community picks\n\n' +
  'What would you like to explore today?';

/** Returned when Gemini / LangChain times out. */
export const TIMEOUT_RESPONSE =
  'The AI service is taking longer than expected. ' +
  'Please try again in a moment.';

/** Returned when GOOGLE_API_KEY is missing server-side. */
export const MISSING_KEY_RESPONSE =
  'The AI Game Agent is not configured yet. ' +
  'Please ask the administrator to add GOOGLE_API_KEY to the server .env file.';

/** Returned when no community posts exist at all. */
export const NO_PLATFORM_DATA_RESPONSE =
  "There are no community posts available yet. " +
  "Head over to the Community page to create or bookmark some game posts first — " +
  "then I'll be able to give you much better recommendations!";

/** Returned when the user has no bookmarks. */
export const NO_BOOKMARKS_RESPONSE =
  "You haven't bookmarked any games yet. " +
  "Browse the Community page and bookmark games you're interested in — " +
  "then come back and I'll give you personalised recommendations!";

/** Generic catch-all when the AI service fails unexpectedly. */
export const GENERIC_ERROR_RESPONSE =
  'Something went wrong with the AI service. Please try again in a moment.';

/** Returned when the Gemini API quota is exceeded (HTTP 429). */
export const QUOTA_EXCEEDED_RESPONSE =
  "The AI service has reached its daily request limit. " +
  "Please try again after midnight UTC, or contact the administrator to upgrade the API plan.";
