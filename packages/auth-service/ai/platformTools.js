// packages/auth-service/ai/platformTools.js
// Data-fetching functions keyed to router intents.
// Reuses the existing GamePost Mongoose model — no new DB dependencies.
import mongoose from 'mongoose';
import GamePost from '../models/GamePost.js';
import { attachCommunityRatingData, calculateTrendScore } from '../services/communityRatingService.js';
import { INTENTS } from './routerAgent.js';

const isProduction = process.env.NODE_ENV === 'production';

// ── Shared post formatter (mirrors the one in aiAgentService.js) ─────────────
function formatPost(p) {
  const communityRatingLine = p.communityRating != null
    ? `Community Rating: ${p.communityRating.toFixed(1)}/10 · ${p.ratingCount} ${p.ratingCount === 1 ? 'rating' : 'ratings'}`
    : 'Community Rating: Not rated yet';

  return (
    `• "${p.title}"` +
    (p.genre ? ` [${p.genre}]` : '') +
    (p.authorRating != null ? ` — Author Rating: ${p.authorRating}/10` : '') +
    ` — ${communityRatingLine}` +
    (p.tags?.length ? ` tags: ${p.tags.slice(0, 4).join(', ')}` : '') +
    (p.likedBy?.length ? ` ♥${p.likedBy.length}` : '') +
    (p.comments?.length ? ` 💬${p.comments.length}` : '') +
    (p.bookmarkedBy?.length ? ` 🔖${p.bookmarkedBy.length}` : '')
  );
}

async function loadPlatformPosts({ filter = {}, sort = { createdAt: -1 }, limit = 10, userId } = {}) {
  const posts = await GamePost.find(filter)
    .sort(sort)
    .limit(limit)
    .select('title genre platform rating tags likedBy comments bookmarkedBy postType')
    .lean();
  return attachCommunityRatingData(posts, userId);
}

/** Fetch the current user's bookmarked games. */
export async function getMyBookmarks(userId) {
  if (!mongoose.isValidObjectId(userId)) return 'No bookmarked games found.';
  const ratedPosts = await loadPlatformPosts({ filter: { bookmarkedBy: userId }, limit: 10, userId });
  if (!ratedPosts.length) return 'No bookmarked games found.';
  return `Bookmarked games (${ratedPosts.length}):\n` + ratedPosts.map(formatPost).join('\n');
}

/** Fetch the most recent community posts. */
export async function getCommunityPosts(limit = 10) {
  const ratedPosts = await loadPlatformPosts({ sort: { createdAt: -1 }, limit });
  if (!ratedPosts.length) return 'No community posts found.';
  return `Recent community posts (${ratedPosts.length}):\n` + ratedPosts.map(formatPost).join('\n');
}

/** Fetch games sorted by rating (highest first). */
export async function getTopRatedGames(limit = 10) {
  const ratedPosts = await loadPlatformPosts({ filter: { postType: 'GAME' }, limit: limit * 3 });
  const topPosts = ratedPosts
    .filter((post) => post.communityRating != null || post.authorRating != null)
    .sort((a, b) =>
      (b.communityRating ?? -1) - (a.communityRating ?? -1) ||
      (b.ratingCount ?? 0) - (a.ratingCount ?? 0) ||
      (b.authorRating ?? 0) - (a.authorRating ?? 0),
    )
    .slice(0, limit);
  if (!topPosts.length) return 'No rated games found.';
  return `Top-rated games (${topPosts.length}):\n` + topPosts.map(formatPost).join('\n');
}

/** Fetch games sorted by community trend score. */
export async function getTrendingPosts(limit = 10) {
  const posts = await loadPlatformPosts({ filter: { postType: 'GAME' }, limit: limit * 4 });
  posts.sort((a, b) =>
    calculateTrendScore({
      communityRating: b.communityRating,
      ratingCount: b.ratingCount,
      likesCount: b.likedBy?.length ?? 0,
      commentsCount: b.comments?.length ?? 0,
      bookmarksCount: b.bookmarkedBy?.length ?? 0,
    }) -
    calculateTrendScore({
      communityRating: a.communityRating,
      ratingCount: a.ratingCount,
      likesCount: a.likedBy?.length ?? 0,
      commentsCount: a.comments?.length ?? 0,
      bookmarksCount: a.bookmarkedBy?.length ?? 0,
    }),
  );
  const topPosts = posts.slice(0, limit);
  if (!topPosts.length) return 'No posts found.';
  return `Trending community posts (${topPosts.length}):\n` + topPosts.map(formatPost).join('\n');
}

/** Fetch games sorted by likes (most-liked first). */
export async function getMostLikedPosts(limit = 10) {
  // Over-fetch then sort in JS (MongoDB can't sort by array length without aggregation)
  const ratedPosts = await loadPlatformPosts({ limit: limit * 3 });
  ratedPosts.sort((a, b) =>
    calculateTrendScore({
      communityRating: b.communityRating,
      ratingCount: b.ratingCount,
      likesCount: b.likedBy?.length ?? 0,
      commentsCount: b.comments?.length ?? 0,
      bookmarksCount: b.bookmarkedBy?.length ?? 0,
    }) -
    calculateTrendScore({
      communityRating: a.communityRating,
      ratingCount: a.ratingCount,
      likesCount: a.likedBy?.length ?? 0,
      commentsCount: a.comments?.length ?? 0,
      bookmarksCount: a.bookmarkedBy?.length ?? 0,
    }),
  );
  const top = ratedPosts.slice(0, limit);
  if (!top.length) return 'No posts found.';
  return `Most-liked posts (${top.length}):\n` + top.map(formatPost).join('\n');
}

// ── Web search rate limiter (protects Tavily free-tier quota) ────────────────
// Free tier: 1 000 calls / month — 30/day global, 3/hour per user.
const _webSearchLimiter = {
  GLOBAL_DAILY_LIMIT: 30,
  PER_USER_HOURLY_LIMIT: 3,
  _global: { count: 0, resetAt: 0 },
  _users: new Map(),
  check(userId) {
    const now = Date.now();
    if (now >= this._global.resetAt) {
      const midnight = new Date();
      midnight.setUTCHours(24, 0, 0, 0);
      this._global = { count: 0, resetAt: midnight.getTime() };
    }
    if (this._global.count >= this.GLOBAL_DAILY_LIMIT)
      return { ok: false, reason: 'Daily web-search limit reached.' };
    let u = this._users.get(userId);
    if (!u || now >= u.resetAt) {
      u = { count: 0, resetAt: now + 3_600_000 };
      this._users.set(userId, u);
    }
    if (u.count >= this.PER_USER_HOURLY_LIMIT)
      return { ok: false, reason: 'Web search limit reached for this hour.' };
    return { ok: true };
  },
  increment(userId) {
    this._global.count++;
    const u = this._users.get(userId);
    if (u) u.count++;
  },
};

/**
 * Tavily web search — only called when TAVILY_API_KEY is set.
 * Returns formatted result text, or empty string on failure / rate limit.
 */
export async function searchWeb(query, userId = 'global') {
  const check = _webSearchLimiter.check(String(userId));
  if (!check.ok) {
    console.warn('[platformTools:web-search] Rate limit:', check.reason);
    return '';
  }
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      max_results: 2,
      search_depth: 'basic',
      include_answer: true,
      include_images: false,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Tavily API error: ${response.status}`);
  const data = await response.json();
  _webSearchLimiter.increment(String(userId));
  if (!isProduction) {
    console.log(
      `[platformTools:web-search] queryLength=${query.length} — global today: ${_webSearchLimiter._global.count}/${_webSearchLimiter.GLOBAL_DAILY_LIMIT}`,
    );
  }
  if (!data.results?.length && !data.answer) return '';
  let output = `Web search results for "${query}":\n`;
  // Tavily's direct answer is the most token-efficient summary — use it first
  if (data.answer) {
    output += `Summary: ${data.answer}\n\n`;
  }
  if (data.results?.length) {
    output += data.results
      .map((r, i) => `[${i + 1}] ${r.title}\n${(r.content ?? '').slice(0, 200)}\nSource: ${r.url}`)
      .join('\n\n');
  }
  return output;
}

/**
 * Select and fetch the platform data most relevant to the classified intent.
 *
 * Routing:
 *   bookmark_analysis   → getMyBookmarks
 *   community_summary   → getMostLikedPosts
 *   leaderboard_query   → getTopRatedGames
 *   game_recommendation → bookmarks + most-liked community posts
 *   general_chat        → Tavily web search (if TAVILY_API_KEY is set), else empty
 *
 * @param {string} intent      - one of the INTENTS constants
 * @param {string} userId
 * @param {string} userMessage - used as web-search query for general_chat
 * @returns {Promise<string>} formatted platform data for prompt injection
 */
export async function fetchDataForIntent(intent, userId, userMessage = '') {
  try {
    switch (intent) {
      case INTENTS.BOOKMARK_ANALYSIS:
        return await getMyBookmarks(userId);

      case INTENTS.COMMUNITY_SUMMARY:
        return await getTrendingPosts();

      case INTENTS.LEADERBOARD_QUERY:
        return await getTopRatedGames();

      case INTENTS.GAME_RECOMMENDATION: {
        const [bookmarks, community] = await Promise.all([
          getMyBookmarks(userId),
          getMostLikedPosts(5),
        ]);
        let result = `${bookmarks}\n\n${community}`;

        // Supplement with a web search when the user asks for something
        // specific (e.g. a genre, play-style) that may not exist on the platform.
        if (process.env.TAVILY_API_KEY && userMessage.trim()) {
          const webData = await searchWeb(`best ${userMessage}`, userId).catch(() => '');
          if (webData) {
            result +=
              `\n\n--- Web Suggestions (games not on this platform) ---\n` +
              `${webData}\n` +
              `--- End Web Suggestions ---`;
          }
        }
        return result;
      }

      case INTENTS.GENERAL_CHAT:
      default:
        // Web search for factual questions when Tavily is configured
        if (process.env.TAVILY_API_KEY && userMessage.trim()) {
          return await searchWeb(userMessage, userId).catch(() => '');
        }
        return '';
    }
  } catch (err) {
    console.warn('[platformTools] fetchDataForIntent error:', err?.message);
    return '';
  }
}
