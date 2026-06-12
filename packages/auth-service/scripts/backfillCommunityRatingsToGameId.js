import dotenv from 'dotenv';
import mongoose from 'mongoose';

import CommunityRating from '../models/CommunityRating.js';
import GamePost from '../models/GamePost.js';

dotenv.config();

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  return {
    apply: args.has('--apply'),
  };
}

async function loadRatingContext() {
  const ratings = await CommunityRating.find({})
    .select('_id gameId postId userId score createdAt updatedAt')
    .lean();

  if (!ratings.length) {
    return { ratings: [], postMap: new Map(), missingPostIds: [] };
  }

  const postIds = [...new Set(ratings.filter((rating) => !rating.gameId).map((rating) => rating.postId?.toString()).filter(Boolean))];
  const posts = await GamePost.find({ _id: { $in: postIds } })
    .select('_id game title')
    .lean();

  const postMap = new Map(posts.map((post) => [post._id.toString(), post]));
  const missingPostIds = postIds.filter((postId) => !postMap.has(postId));

  return { ratings, postMap, missingPostIds };
}

function buildMigrationPlan(ratings, postMap) {
  const grouped = new Map();
  const skipped = [];
  const eligibleIds = new Set();

  for (const rating of ratings) {
    const ratingId = rating._id.toString();
    const postId = rating.postId?.toString();
    const gameId = rating.gameId?.toString() || (postId ? postMap.get(postId)?.game?.toString() : null);
    if (!gameId) {
      skipped.push({ ratingId, postId, reason: rating.gameId ? 'missing_game_ref' : 'unlinked_post' });
      continue;
    }

    eligibleIds.add(ratingId);

    const userId = rating.userId?.toString();
    if (!userId) {
      skipped.push({ ratingId, postId, reason: 'missing_user_id' });
      continue;
    }

    const compositeKey = `${gameId}:${userId}`;
    const existing = grouped.get(compositeKey);
    const existingTime = existing ? new Date(existing.updatedAt || existing.createdAt || 0).getTime() : 0;
    const nextTime = new Date(rating.updatedAt || rating.createdAt || 0).getTime();
    if (!existing || nextTime >= existingTime) {
      grouped.set(compositeKey, {
        ratingId,
        postId,
        gameId,
        userId,
        score: rating.score,
        hasGameId: Boolean(rating.gameId),
        updatedAt: rating.updatedAt,
        createdAt: rating.createdAt,
      });
    }
  }

  return { grouped, skipped, eligibleIds };
}

async function run() {
  const { apply } = parseArgs(process.argv);
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!uri) {
    console.error('[backfillCommunityRatingsToGameId] Missing MONGO_URI or MONGODB_URI.');
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(uri);

  try {
    const { ratings, postMap, missingPostIds } = await loadRatingContext();
    const { grouped, skipped, eligibleIds } = buildMigrationPlan(ratings, postMap);

    const totalRatings = ratings.length;
    const migratable = grouped.size;
    const duplicates = Math.max(eligibleIds.size - migratable, 0);

    console.log('[backfillCommunityRatingsToGameId] Total ratings:', totalRatings);
    console.log('[backfillCommunityRatingsToGameId] Migratable unique game ratings:', migratable);
    console.log('[backfillCommunityRatingsToGameId] Duplicate rows to drop:', Math.max(duplicates, 0));
    console.log('[backfillCommunityRatingsToGameId] Skipped rows:', skipped.length);
    if (missingPostIds.length) {
      console.log(`[backfillCommunityRatingsToGameId] Missing linked posts: ${missingPostIds.length}`);
    }

    if (!apply) {
      console.log('[backfillCommunityRatingsToGameId] Dry run mode. No writes performed.');
      console.log('[backfillCommunityRatingsToGameId] Re-run with --apply to execute the migration.');
      return;
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const migrateOps = [];
        for (const entry of grouped.values()) {
          migrateOps.push({
            updateOne: {
              filter: { _id: entry.ratingId },
              update: {
                $set: { gameId: entry.gameId, score: entry.score },
                $unset: { postId: '' },
              },
            },
          });
        }

        const keepIds = new Set([...grouped.values()].map((entry) => entry.ratingId.toString()));
        const duplicateIds = [...eligibleIds].filter((ratingId) => !keepIds.has(ratingId));

        const deleteOps = duplicateIds.length
          ? [{
            deleteMany: {
              filter: { _id: { $in: duplicateIds } },
            },
          }]
          : [];

        if (migrateOps.length) {
          await CommunityRating.bulkWrite(migrateOps, { session });
        }
        if (deleteOps.length) {
          await CommunityRating.bulkWrite(deleteOps, { session });
        }
      });
    } finally {
      await session.endSession();
    }

    console.log('[backfillCommunityRatingsToGameId] Migration completed.');
    console.log(`[backfillCommunityRatingsToGameId] Updated documents: ${migratable}`);
    console.log(`[backfillCommunityRatingsToGameId] Deleted duplicate rows: ${Math.max(duplicates, 0)}`);
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error('[backfillCommunityRatingsToGameId] Fatal error:', err);
  process.exitCode = 1;
});