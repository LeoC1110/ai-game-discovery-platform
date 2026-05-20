// packages/auth-service/ai/platformTools.js
// Data-fetching functions keyed to router intents.
// Reuses the existing GamePost Mongoose model — no new DB dependencies.
import GamePost from '../models/GamePost.js';
import { INTENTS } from './routerAgent.js';

// ── Shared post formatter (mirrors the one in aiAgentService.js) ─────────────
function formatPost(p) {
  return (
    `• "${p.title}"` +
    (p.genre ? ` [${p.genre}]` : '') +
    (p.rating != null ? ` — ${p.rating}/10` : '') +
    (p.tags?.length ? ` tags: ${p.tags.slice(0, 4).join(', ')}` : '') +
    (p.likedBy?.length ? ` ♥${p.likedBy.length}` : '')
  );
}

/** Fetch the current user's bookmarked games. */
export async function getMyBookmarks(userId) {
  const posts = await GamePost.find({ bookmarkedBy: userId })
    .limit(10)
    .select('title genre platform rating tags likedBy')
    .lean();
  if (!posts.length) return 'No bookmarked games found.';
  return `Bookmarked games (${posts.length}):\n` + posts.map(formatPost).join('\n');
}

/** Fetch the most recent community posts. */
export async function getCommunityPosts(limit = 10) {
  const posts = await GamePost.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('title genre platform rating tags likedBy')
    .lean();
  if (!posts.length) return 'No community posts found.';
  return `Recent community posts (${posts.length}):\n` + posts.map(formatPost).join('\n');
}

/** Fetch games sorted by rating (highest first). */
export async function getTopRatedGames(limit = 10) {
  const posts = await GamePost.find({ rating: { $ne: null } })
    .sort({ rating: -1 })
    .limit(limit)
    .select('title genre platform rating tags likedBy')
    .lean();
  if (!posts.length) return 'No rated games found.';
  return `Top-rated games (${posts.length}):\n` + posts.map(formatPost).join('\n');
}

/** Fetch games sorted by likes (most-liked first). */
export async function getMostLikedPosts(limit = 10) {
  // Over-fetch then sort in JS (MongoDB can't sort by array length without aggregation)
  const posts = await GamePost.find()
    .limit(limit * 3)
    .select('title genre platform rating tags likedBy')
    .lean();
  posts.sort((a, b) => (b.likedBy?.length ?? 0) - (a.likedBy?.length ?? 0));
  const top = posts.slice(0, limit);
  if (!top.length) return 'No posts found.';
  return `Most-liked posts (${top.length}):\n` + top.map(formatPost).join('\n');
}

/**
 * Select and fetch the platform data most relevant to the classified intent.
 *
 * Routing:
 *   bookmark_analysis   → getMyBookmarks
 *   community_summary   → getMostLikedPosts
 *   leaderboard_query   → getTopRatedGames
 *   game_recommendation → bookmarks + most-liked community posts
 *   general_chat        → (no data needed — returns empty string)
 *
 * @param {string} intent   - one of the INTENTS constants
 * @param {string} userId
 * @returns {Promise<string>} formatted platform data for prompt injection
 */
export async function fetchDataForIntent(intent, userId) {
  try {
    switch (intent) {
      case INTENTS.BOOKMARK_ANALYSIS:
        return await getMyBookmarks(userId);

      case INTENTS.COMMUNITY_SUMMARY:
        return await getMostLikedPosts();

      case INTENTS.LEADERBOARD_QUERY:
        return await getTopRatedGames();

      case INTENTS.GAME_RECOMMENDATION: {
        const [bookmarks, community] = await Promise.all([
          getMyBookmarks(userId),
          getMostLikedPosts(5),
        ]);
        return `${bookmarks}\n\n${community}`;
      }

      default:
        return '';
    }
  } catch (err) {
    console.warn('[platformTools] fetchDataForIntent error:', err?.message);
    return '';
  }
}
