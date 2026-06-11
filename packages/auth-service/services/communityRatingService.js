import CommunityRating from '../models/CommunityRating.js';

const COMMUNITY_RATING_DAMPING = 4;

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

  const [stats, myRatings] = await Promise.all([
    CommunityRating.aggregate([
      { $match: { postId: { $in: normalizedIds } } },
      {
        $group: {
          _id: '$postId',
          communityRating: { $avg: '$score' },
          ratingCount: { $sum: 1 },
        },
      },
    ]),
    userId
      ? CommunityRating.find({ postId: { $in: normalizedIds }, userId })
        .select('postId score')
        .lean()
      : Promise.resolve([]),
  ]);

  const statsByPostId = new Map(
    stats.map((entry) => [
      entry._id.toString(),
      {
        communityRating: roundToOneDecimal(entry.communityRating),
        ratingCount: entry.ratingCount || 0,
      },
    ]),
  );

  const myRatingsByPostId = new Map(
    myRatings.map((entry) => [entry.postId.toString(), entry.score]),
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

  const ids = normalizedPosts.map((post) => post?._id || post?.id).filter(Boolean);
  const { statsByPostId, myRatingsByPostId } = await getCommunityRatingSnapshots(ids, userId);

  return normalizedPosts.map((post) => {
    const base = post?.toObject ? post.toObject() : { ...post };
    const key = (base._id || base.id)?.toString?.() || String(base._id || base.id);
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