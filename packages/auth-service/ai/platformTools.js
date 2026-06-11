// packages/auth-service/ai/platformTools.js
// Context Ingestion Layer — Fetches real-time structured data 
// from MongoDB and external APIs based on intercepted routing intents.

import mongoose from 'mongoose';
import GamePost from '../models/GamePost.js';
import { attachCommunityRatingData, calculateTrendScore } from '../services/communityRatingService.js';
import { INTENTS } from './routerAgent.js';

const isProduction = process.env.NODE_ENV === 'production';
const LOW_RATING_MAX_SCORE = 6;
const DEFAULT_LOW_RATING_MIN_COUNT = Math.max(1, parseInt(process.env.LOW_RATING_MIN_COUNT ?? '2', 10));

/**
 * Shared post formatter to convert Mongoose documents into high-density tokens for LLM parsing.
 * @param {object} p Enriched post item
 * @returns {string} Fully formatted text line
 */
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

/**
 * Base data-loader abstraction layer interfacing directly with the GamePost aggregation pipeline.
 */
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

/** Fetch the most recent community games. */
export async function getRecentCommunityPosts(limit = 10) {
  const ratedPosts = await loadPlatformPosts({ sort: { createdAt: -1 }, limit });
  if (!ratedPosts.length) return 'No community posts found.';
  return `Recent community posts (${ratedPosts.length}):\n` + ratedPosts.map(formatPost).join('\n');
}

// Backward-compatible alias for older callers.
export const getCommunityPosts = getRecentCommunityPosts;

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

/**
 * Fetch low-rated games sorted by community rating ascending.
 * "Low rating" implies an evaluation benchmark <= LOW_RATING_MAX_SCORE.
 */
export async function getLowRatedGames({
  limit = 10,
  minRatingCount = DEFAULT_LOW_RATING_MIN_COUNT,
  maxCommunityRating = LOW_RATING_MAX_SCORE,
} = {}) {
  const normalizedLimit = Math.max(1, limit);
  const normalizedMinCount = Math.max(1, minRatingCount);
  const posts = await loadPlatformPosts({
    filter: { postType: 'GAME' },
    limit: Math.max(normalizedLimit * 8, 40),
  });

  const lowRated = posts
    .filter((post) =>
      post.communityRating != null &&
      post.communityRating <= maxCommunityRating &&
      (post.ratingCount ?? 0) >= normalizedMinCount,
    )
    .sort((a, b) =>
      (a.communityRating ?? 11) - (b.communityRating ?? 11) ||
      (b.ratingCount ?? 0) - (a.ratingCount ?? 0) ||
      (a.authorRating ?? 0) - (b.authorRating ?? 0),
    )
    .slice(0, normalizedLimit);

  if (!lowRated.length) {
    return `Low-rated games (community rating <= ${maxCommunityRating}/10, min ${normalizedMinCount} ratings): none found.`;
  }

  return (
    `Low-rated games (community rating <= ${maxCommunityRating}/10, min ${normalizedMinCount} ratings) (${lowRated.length}):\n` +
    lowRated.map(formatPost).join('\n')
  );
}

/** Fetch community games sorted by trend score. */
export async function getTrendingCommunityPosts(limit = 10) {
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

// Backward-compatible alias for older callers.
export const getTrendingPosts = getTrendingCommunityPosts;

/** Fetch games sorted by community engagement (most-engaged first). */
export async function getMostEngagedPosts(limit = 10) {
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
  return `Most-engaged posts (${top.length}):\n` + top.map(formatPost).join('\n');
}

// Backward-compatible alias for older callers.
export const getMostLikedPosts = getMostEngagedPosts;

// ── Web search rate limiter (protects Tavily free-tier quota) ────────────────
// Allocations: 1,000 calls/month — 30/day global ceiling, 3/hour threshold per individual profile.
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
 * Tavily search processor — triggered exclusively when canonical tokens are bound to process.env.
 * Prevents hallucinations by importing auxiliary grounding metadata.
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
 * Core Orchestration Router — Dynamically binds intent scopes to matching data access sub-handlers.
 * Combines collections to optimize context injection values for answer agents.
 *
 * @param {string} intent One of the structural INTENTS constants exported by routerAgent
 * @param {string} userId Unique identity identifier mapping
 * @param {string} userMessage Raw message string for web-search compilation
 * @returns {Promise<string>} Concatenated context segments
 */
export async function fetchDataForIntent(intent, userId, userMessage = '') {
  try {
    switch (intent) {
      case INTENTS.BOOKMARK_ANALYSIS:
        return await getMyBookmarks(userId);

      case INTENTS.COMMUNITY_SUMMARY:
        return [
          await getLowRatedGames(),
          await getTrendingCommunityPosts(),
        ].join('\n\n');

      case INTENTS.LEADERBOARD_QUERY:
        return [
          await getLowRatedGames(),
          await getTopRatedGames(),
        ].join('\n\n');

      case INTENTS.LOW_RATING_QUERY:
        return await getLowRatedGames();

      case INTENTS.GAME_RECOMMENDATION: {
        const [bookmarks, community] = await Promise.all([
          getMyBookmarks(userId),
          getMostEngagedPosts(5),
        ]);
        let result = `${bookmarks}\n\n${community}`;

        // Augment with internet snapshots if specific variables cross knowledge-base structures
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