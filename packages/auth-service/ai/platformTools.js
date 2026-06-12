// packages/auth-service/ai/platformTools.js
// MongoDB-backed data retrieval layer for Nova.
//
// Responsibilities:
// - Deterministic, intent-aware data loading
// - Compact prompt-friendly formatting
// - No LLM calls and no final answer generation

import mongoose from 'mongoose';
import GamePost from '../models/GamePost.js';
import Game from '../models/Game.js';
import { attachCommunityRatingData, calculateTrendScore } from '../services/communityRatingService.js';
import { INTENTS } from './routerAgent.js';

const isProduction = process.env.NODE_ENV === 'production';

export const DEFAULT_PLATFORM_LIMIT = 12;
export const MAX_PLATFORM_LIMIT = 50;
export const RECOMMENDATION_CANDIDATE_LIMIT = 20;
export const INVENTORY_LIMIT = 50;
export const LOW_RATING_MAX_SCORE = 6.0;
export const DEFAULT_LOW_RATING_MIN_COUNT = Math.max(1, parseInt(process.env.LOW_RATING_MIN_COUNT ?? '2', 10));

const SAFE_POST_FIELDS = [
  'game',
  'title',
  'genre',
  'platform',
  'developer',
  'releaseYear',
  'gameType',
  'rating',
  'tags',
  'likedBy',
  'bookmarkedBy',
  'comments',
  'postType',
  'createdAt',
  'updatedAt',
].join(' ');

const SAFE_GAME_FIELDS = [
  'title',
  'titleNormalized',
  'genre',
  'platform',
  'developer',
  'releaseYear',
  'tags',
  'updatedAt',
  'createdAt',
].join(' ');

function logDebug(tag, details) {
  if (!isProduction) {
    console.log(`[platformTools] ${tag}`, details);
  }
}

function clampLimit(limit, fallback = DEFAULT_PLATFORM_LIMIT) {
  const n = Number.isFinite(Number(limit)) ? Number(limit) : fallback;
  return Math.min(MAX_PLATFORM_LIMIT, Math.max(1, Math.trunc(n)));
}

export function getGameTitle(post) {
  return post?.game?.title || post?.gameTitle || post?.title || post?.name || 'Untitled Game';
}

function getFieldFromPostOrGame(post, fieldName, fallback = 'N/A') {
  return post?.[fieldName] || post?.game?.[fieldName] || fallback;
}

export function getCommunityRating(post) {
  return post?.communityRating ?? post?.averageRating ?? post?.rating ?? null;
}

export function getCount(post, countField, arrayField) {
  if (typeof post?.[countField] === 'number') return post[countField];
  if (Array.isArray(post?.[arrayField])) return post[arrayField].length;
  return 0;
}

export function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.map((t) => String(t ?? '').trim()).filter(Boolean).slice(0, 8);
}

function compareAlphaTitle(a, b) {
  const ta = getGameTitle(a).toLowerCase();
  const tb = getGameTitle(b).toLowerCase();
  if (ta !== tb) return ta.localeCompare(tb);
  return String(a?._id ?? '').localeCompare(String(b?._id ?? ''));
}

function compareTopRated(a, b) {
  return (
    (getCommunityRating(b) ?? -1) - (getCommunityRating(a) ?? -1) ||
    getCount(b, 'ratingCount', 'ratings') - getCount(a, 'ratingCount', 'ratings') ||
    getCount(b, 'likesCount', 'likedBy') - getCount(a, 'likesCount', 'likedBy') ||
    getCount(b, 'bookmarksCount', 'bookmarkedBy') - getCount(a, 'bookmarksCount', 'bookmarkedBy') ||
    getCount(b, 'commentsCount', 'comments') - getCount(a, 'commentsCount', 'comments') ||
    compareAlphaTitle(a, b)
  );
}

function compareLowRated(a, b) {
  return (
    (getCommunityRating(a) ?? 11) - (getCommunityRating(b) ?? 11) ||
    getCount(b, 'ratingCount', 'ratings') - getCount(a, 'ratingCount', 'ratings') ||
    compareAlphaTitle(a, b)
  );
}

function compareTrending(a, b) {
  const scoreA = calculateTrendScore({
    communityRating: getCommunityRating(a),
    ratingCount: getCount(a, 'ratingCount', 'ratings'),
    likesCount: getCount(a, 'likesCount', 'likedBy'),
    commentsCount: getCount(a, 'commentsCount', 'comments'),
    bookmarksCount: getCount(a, 'bookmarksCount', 'bookmarkedBy'),
  });
  const scoreB = calculateTrendScore({
    communityRating: getCommunityRating(b),
    ratingCount: getCount(b, 'ratingCount', 'ratings'),
    likesCount: getCount(b, 'likesCount', 'likedBy'),
    commentsCount: getCount(b, 'commentsCount', 'comments'),
    bookmarksCount: getCount(b, 'bookmarksCount', 'bookmarkedBy'),
  });

  return (
    scoreB - scoreA ||
    compareTopRated(a, b)
  );
}

export function formatPostForPrompt(post, index) {
  const title = getGameTitle(post);
  const genre = getFieldFromPostOrGame(post, 'genre');
  const platform = getFieldFromPostOrGame(post, 'platform');
  const communityRating = getCommunityRating(post);
  const ratingCount = getCount(post, 'ratingCount', 'ratings');
  const likes = getCount(post, 'likesCount', 'likedBy');
  const bookmarks = getCount(post, 'bookmarksCount', 'bookmarkedBy');
  const comments = getCount(post, 'commentsCount', 'comments');
  const tags = normalizeTags(post?.tags);

  return [
    `${index}. Game: ${title}`,
    `   Genre: ${genre}`,
    `   Platform: ${platform}`,
    `   Community Rating: ${communityRating != null ? `${communityRating.toFixed(1)}/10` : 'N/A'}`,
    `   Rating Count: ${ratingCount}`,
    `   Likes: ${likes}`,
    `   Bookmarks: ${bookmarks}`,
    `   Comments: ${comments}`,
    `   Tags: ${tags.length ? tags.join(', ') : 'N/A'}`,
  ].join('\n');
}

export function formatPostsForPrompt({ title, posts }) {
  const safePosts = Array.isArray(posts) ? posts : [];
  if (!safePosts.length) {
    return (
      'Platform Data Status:\n' +
      'No matching platform records were returned for this specific request.\n' +
      'This does not necessarily mean the platform database is empty.'
    );
  }

  const lines = [
    `${title}:`,
    `Total items included: ${safePosts.length}`,
    '',
    ...safePosts.map((p, i) => formatPostForPrompt(p, i + 1)),
  ];
  return lines.join('\n');
}

async function loadPlatformPosts({
  filter = {},
  sort = { createdAt: -1, _id: 1 },
  limit = DEFAULT_PLATFORM_LIMIT,
  userId,
} = {}) {
  const normalizedLimit = clampLimit(limit);

  const posts = await GamePost.find(filter)
    .sort(sort)
    .limit(normalizedLimit)
    .select(SAFE_POST_FIELDS)
    .populate({ path: 'game', select: SAFE_GAME_FIELDS })
    .lean();

  return attachCommunityRatingData(posts, userId);
}

async function loadCanonicalGames({
  filter = {},
  sort = { titleNormalized: 1, title: 1, _id: 1 },
  limit = INVENTORY_LIMIT,
} = {}) {
  const normalizedLimit = clampLimit(limit, INVENTORY_LIMIT);
  const games = await Game.find(filter)
    .sort(sort)
    .limit(normalizedLimit)
    .select(SAFE_GAME_FIELDS)
    .lean();

  // Keep shape compatible with existing formatter utilities.
  return games.map((game) => ({
    _id: game._id,
    game,
    title: game.title,
    genre: game.genre,
    platform: game.platform,
    developer: game.developer,
    releaseYear: game.releaseYear,
    tags: Array.isArray(game.tags) ? game.tags : [],
    communityRating: null,
    ratingCount: 0,
    likesCount: 0,
    bookmarksCount: 0,
    commentsCount: 0,
  }));
}

async function loadLegacyInventoryPosts({ limit = INVENTORY_LIMIT } = {}) {
  const normalizedLimit = clampLimit(limit, INVENTORY_LIMIT);
  const posts = await GamePost.find({
    postType: 'GAME',
    game: { $in: [null, undefined] },
  })
    .sort({ createdAt: -1, _id: 1 })
    .limit(Math.max(normalizedLimit * 8, 120))
    .select(SAFE_POST_FIELDS)
    .lean();

  return posts;
}

function normalizeUserTagHints(userMessage = '') {
  const text = String(userMessage ?? '').toLowerCase();
  const hints = [];
  for (const token of ['rpg', 'puzzle', 'action', 'strategy', 'indie', 'co-op', 'coop', 'simulation']) {
    if (text.includes(token)) hints.push(token === 'coop' ? 'co-op' : token);
  }
  return hints;
}

function selectRecommendationCandidates(posts, { userMessage = '' } = {}) {
  const hints = normalizeUserTagHints(userMessage);
  const score = (post) => {
    const tags = normalizeTags(post.tags).map((t) => t.toLowerCase());
    const tagMatches = hints.reduce((acc, tag) => acc + (tags.includes(tag) ? 1 : 0), 0);
    return (
      tagMatches * 10 +
      (getCommunityRating(post) ?? 0) * 2 +
      getCount(post, 'ratingCount', 'ratings') +
      getCount(post, 'likesCount', 'likedBy') * 0.3 +
      getCount(post, 'bookmarksCount', 'bookmarkedBy') * 0.4 +
      getCount(post, 'commentsCount', 'comments') * 0.2
    );
  };

  const ranked = [...posts]
    .sort((a, b) => score(b) - score(a) || compareTopRated(a, b));

  // Deduplicate same canonical game appearing in multiple posts.
  const seen = new Set();
  const unique = [];
  for (const post of ranked) {
    const key = getGameTitle(post).toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(post);
  }

  return unique;
}

export async function getMyBookmarks(userId, limit = DEFAULT_PLATFORM_LIMIT) {
  if (!mongoose.isValidObjectId(userId)) {
    return (
      'Platform Data Status:\n' +
      'No matching platform records were returned for this specific request.\n' +
      'This does not necessarily mean the platform database is empty.'
    );
  }

  const posts = await loadPlatformPosts({
    filter: { bookmarkedBy: userId, postType: 'GAME' },
    sort: { createdAt: -1, _id: 1 },
    limit,
    userId,
  });

  return formatPostsForPrompt({ title: 'Bookmarked Games', posts });
}

export async function getRecentCommunityPosts(limit = DEFAULT_PLATFORM_LIMIT) {
  const posts = await loadPlatformPosts({
    filter: { postType: 'GAME' },
    sort: { createdAt: -1, _id: 1 },
    limit,
  });
  return formatPostsForPrompt({ title: 'Recent Community Posts', posts });
}

export const getCommunityPosts = getRecentCommunityPosts;

export async function getPlatformInventory(limit = INVENTORY_LIMIT) {
  const normalizedLimit = clampLimit(limit, INVENTORY_LIMIT);

  const canonicalPosts = await loadCanonicalGames({
    sort: { titleNormalized: 1, title: 1, _id: 1 },
    limit,
  });

  const legacyPosts = await loadLegacyInventoryPosts({ limit });

  // Merge canonical + legacy titles so historical posts remain discoverable.
  const merged = [];
  const seen = new Set();

  for (const post of canonicalPosts) {
    const key = getGameTitle(post).toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(post);
    if (merged.length >= normalizedLimit) break;
  }

  if (merged.length < normalizedLimit) {
    for (const post of legacyPosts) {
      const key = getGameTitle(post).toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(post);
      if (merged.length >= normalizedLimit) break;
    }
  }

  const sorted = [...merged].sort(compareAlphaTitle).slice(0, normalizedLimit);
  return formatPostsForPrompt({ title: 'Platform Inventory', posts: sorted });
}

export async function getTopRatedGames(limit = DEFAULT_PLATFORM_LIMIT) {
  const posts = await loadPlatformPosts({
    filter: { postType: 'GAME' },
    sort: { createdAt: -1, _id: 1 },
    limit: Math.max(clampLimit(limit) * 4, 40),
  });

  const sorted = [...posts]
    .filter((post) => getCommunityRating(post) != null)
    .sort(compareTopRated)
    .slice(0, clampLimit(limit));

  return formatPostsForPrompt({ title: 'Top Rated Games', posts: sorted });
}

export function selectLowRatedPosts(posts, { maxCommunityRating = LOW_RATING_MAX_SCORE, minRatingCount = DEFAULT_LOW_RATING_MIN_COUNT, limit = DEFAULT_PLATFORM_LIMIT } = {}) {
  return [...(posts || [])]
    .filter((post) => {
      const rating = getCommunityRating(post);
      return rating != null && rating <= maxCommunityRating && getCount(post, 'ratingCount', 'ratings') >= minRatingCount;
    })
    .sort(compareLowRated)
    .slice(0, clampLimit(limit));
}

export async function getLowRatedGames({
  limit = DEFAULT_PLATFORM_LIMIT,
  minRatingCount = DEFAULT_LOW_RATING_MIN_COUNT,
  maxCommunityRating = LOW_RATING_MAX_SCORE,
} = {}) {
  const posts = await loadPlatformPosts({
    filter: { postType: 'GAME' },
    sort: { createdAt: -1, _id: 1 },
    limit: Math.max(clampLimit(limit) * 6, 48),
  });

  const lowRated = selectLowRatedPosts(posts, { maxCommunityRating, minRatingCount, limit });
  return formatPostsForPrompt({ title: `Low Rated Games (<= ${maxCommunityRating.toFixed(1)}/10)`, posts: lowRated });
}

export async function getTrendingCommunityPosts(limit = DEFAULT_PLATFORM_LIMIT) {
  const posts = await loadPlatformPosts({
    filter: { postType: 'GAME' },
    sort: { createdAt: -1, _id: 1 },
    limit: Math.max(clampLimit(limit) * 4, 40),
  });

  const sorted = [...posts].sort(compareTrending).slice(0, clampLimit(limit));
  return formatPostsForPrompt({ title: 'Trending Community Posts', posts: sorted });
}

export const getTrendingPosts = getTrendingCommunityPosts;

export async function getMostEngagedPosts(limit = DEFAULT_PLATFORM_LIMIT) {
  const posts = await loadPlatformPosts({
    filter: { postType: 'GAME' },
    sort: { createdAt: -1, _id: 1 },
    limit: Math.max(clampLimit(limit) * 4, 40),
  });

  const sorted = [...posts].sort(compareTrending).slice(0, clampLimit(limit));
  return formatPostsForPrompt({ title: 'Most Engaged Posts', posts: sorted });
}

export const getMostLikedPosts = getMostEngagedPosts;

export async function getRecommendationCandidates({ userId, userMessage = '', limit = RECOMMENDATION_CANDIDATE_LIMIT } = {}) {
  const posts = await loadPlatformPosts({
    filter: { postType: 'GAME' },
    sort: { createdAt: -1, _id: 1 },
    limit: Math.max(clampLimit(limit) * 4, 40),
    userId,
  });

  const candidates = selectRecommendationCandidates(posts, { userMessage }).slice(0, clampLimit(limit, RECOMMENDATION_CANDIDATE_LIMIT));
  return formatPostsForPrompt({ title: 'Recommendation Candidates', posts: candidates });
}

export async function buildPlatformDataForPlan({
  plan,
  userId = null,
  userMessage = '',
  limit,
} = {}) {
  const safePlan = plan ?? {};
  const intent = safePlan.intent ?? INTENTS.GENERAL_CHAT;

  logDebug('buildPlatformDataForPlan', {
    intent,
    mode: safePlan.mode ?? 'unknown',
    needsDatabase: Boolean(safePlan.needsDatabase),
    limit: limit ?? null,
  });

  if (safePlan.needsDatabase === false) return '';

  switch (intent) {
    case INTENTS.PLATFORM_INVENTORY_QUERY:
      return getPlatformInventory(limit ?? INVENTORY_LIMIT);

    case INTENTS.LEADERBOARD_QUERY:
      return getTopRatedGames(limit ?? DEFAULT_PLATFORM_LIMIT);

    case INTENTS.LOW_RATING_QUERY:
      return getLowRatedGames({ limit: limit ?? DEFAULT_PLATFORM_LIMIT });

    case INTENTS.COMMUNITY_SUMMARY:
      return getTrendingCommunityPosts(limit ?? DEFAULT_PLATFORM_LIMIT);

    case INTENTS.GAME_RECOMMENDATION:
      return getRecommendationCandidates({ userId, userMessage, limit: limit ?? RECOMMENDATION_CANDIDATE_LIMIT });

    case INTENTS.BOOKMARK_ANALYSIS: {
      const [bookmarks, candidates] = await Promise.all([
        getMyBookmarks(userId, Math.max(6, clampLimit(limit ?? DEFAULT_PLATFORM_LIMIT))),
        getRecommendationCandidates({ userId, userMessage, limit: limit ?? RECOMMENDATION_CANDIDATE_LIMIT }),
      ]);
      return `${bookmarks}\n\n${candidates}`;
    }

    default:
      return '';
  }
}

export async function buildPlatformDataForIntent(intent, options = {}) {
  const plan = {
    intent,
    mode: 'query',
    needsDatabase: intent !== INTENTS.GENERAL_CHAT,
  };
  return buildPlatformDataForPlan({ plan, ...options });
}

export async function fetchDataForIntent(intent, userId, userMessage = '') {
  try {
    const result = await buildPlatformDataForIntent(intent, { userId, userMessage });
    logDebug('fetchDataForIntent', {
      intent,
      resultLength: result.length,
    });
    return result;
  } catch (err) {
    console.warn('[platformTools] fetchDataForIntent error:', err?.message);
    return (
      'Platform Data Status:\n' +
      'No matching platform records were returned for this specific request.\n' +
      'This does not necessarily mean the platform database is empty.'
    );
  }
}

export const __test__ = {
  clampLimit,
  getGameTitle,
  getCommunityRating,
  getCount,
  normalizeTags,
  formatPostForPrompt,
  formatPostsForPrompt,
  selectLowRatedPosts,
};
