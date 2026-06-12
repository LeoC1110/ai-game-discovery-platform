import CommunityRating from '../models/CommunityRating.js';
import GamePost from '../models/GamePost.js';

const COMMUNITY_RATING_DAMPING = 4;

const getRatingKey = (post) => post?.game?._id || post?.game?.id || post?.game || post?._id || post?.id;

const roundToOneDecimal = (value) => {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value * 10) / 10;
};

export function getWeightedCommunityRating(communityRating, ratingCount) {
  if (communityRating == null || !ratingCount) return 0;
  return communityRating * (ratingCount / (ratingCount + COMMUNITY_RATING_DAMPING));
}

export function calculateTrendScore({
  communityRating,
  ratingCount = 0,
  likesCount = 0,
  commentsCount = 0,
  bookmarksCount = 0,
}) {
  const dampedCommunityRating = getWeightedCommunityRating(communityRating, ratingCount);
  return Number((
    dampedCommunityRating * 2 +
    likesCount +
    commentsCount * 2 +
    bookmarksCount * 2 +
    ratingCount * 1.5
  ).toFixed(2));
}

export async function getCommunityRatingSnapshots(postIds, userId = null) {
  const normalizedIds = (postIds || []).filter(Boolean);
  if (!normalizedIds.length) {
    return { statsByPostId: new Map(), myRatingsByPostId: new Map() };
  }

  const normalizedKeySet = new Set(normalizedIds.map((id) => id.toString()));
  const postLookup = await GamePost.find({
    $or: [{ game: { $in: normalizedIds } }, { _id: { $in: normalizedIds } }],
  })
    .select('_id game')
    .lean();

  const canonicalKeyByPostId = new Map();
  const linkedPostIds = new Set();
  for (const post of postLookup) {
    const postId = post._id.toString();
    const gameId = post.game ? post.game.toString() : null;
    canonicalKeyByPostId.set(postId, gameId || postId);
    if (gameId) {
      linkedPostIds.add(postId);
      normalizedKeySet.add(gameId);
    }
  }

  const ratingDocs = await CommunityRating.find({
    $or: [
      { gameId: { $in: [...normalizedKeySet] } },
      { postId: { $in: [...linkedPostIds, ...normalizedIds.map((id) => id.toString())] } },
    ],
  })
    .select('gameId postId score userId updatedAt createdAt')
    .lean();

  const dedupedRatings = new Map();
  for (const doc of ratingDocs) {
    const gameKey = doc.gameId ? doc.gameId.toString() : canonicalKeyByPostId.get(doc.postId.toString()) || doc.postId.toString();
    const userKey = doc.userId?.toString();
    if (!userKey) continue;
    const compositeKey = `${gameKey}:${userKey}`;
    const existing = dedupedRatings.get(compositeKey);
    const existingTime = existing ? new Date(existing.updatedAt || existing.createdAt || 0).getTime() : 0;
    const nextTime = new Date(doc.updatedAt || doc.createdAt || 0).getTime();
    if (!existing || nextTime >= existingTime) {
      dedupedRatings.set(compositeKey, { ...doc, gameKey });
    }
  }

  const statsAccumulator = new Map();
  const myRatings = [];
  for (const doc of dedupedRatings.values()) {
    const gameKey = doc.gameKey;
    const current = statsAccumulator.get(gameKey) || { total: 0, count: 0 };
    current.total += doc.score;
    current.count += 1;
    statsAccumulator.set(gameKey, current);
    if (userId && doc.userId?.toString() === userId.toString()) {
      myRatings.push({ key: gameKey, score: doc.score });
    }
  }

  const statsByPostId = new Map(
    [...statsAccumulator.entries()].map(([key, entry]) => [
      key,
      {
        communityRating: roundToOneDecimal(entry.count ? entry.total / entry.count : null),
        ratingCount: entry.count || 0,
      },
    ]),
  );

  const myRatingsByPostId = new Map(
    myRatings.map((entry) => [entry.key, entry.score]),
  );

  return { statsByPostId, myRatingsByPostId };
}

export async function getCommunityRatingSnapshot(postId, userId = null) {
  const { statsByPostId, myRatingsByPostId } = await getCommunityRatingSnapshots([postId], userId);
  const key = postId?.toString?.() || String(postId);
  const stats = statsByPostId.get(key) || { communityRating: null, ratingCount: 0 };
  return {
    ...stats,
    myCommunityRating: myRatingsByPostId.get(key) ?? null,
  };
}

export async function attachCommunityRatingData(posts, userId = null) {
  const normalizedPosts = Array.isArray(posts) ? posts : [];
  if (!normalizedPosts.length) return [];

  const ids = normalizedPosts.map((post) => getRatingKey(post)).filter(Boolean);
  const { statsByPostId, myRatingsByPostId } = await getCommunityRatingSnapshots(ids, userId);

  return normalizedPosts.map((post) => {
    const base = post?.toObject ? post.toObject() : { ...post };
    const key = getRatingKey(base)?.toString?.() || String(getRatingKey(base));
    const stats = statsByPostId.get(key) || { communityRating: null, ratingCount: 0 };
    return {
      ...base,
      authorRating: base.rating ?? null,
      communityRating: stats.communityRating,
      ratingCount: stats.ratingCount,
      myCommunityRating: myRatingsByPostId.get(key) ?? null,
    };
  });
}

export async function attachCommunityRatingDataToPost(post, userId = null) {
  if (!post) return null;
  const [ratedPost] = await attachCommunityRatingData([post], userId);
  return ratedPost;
}

export const __test__ = {
  getRatingKey,
};