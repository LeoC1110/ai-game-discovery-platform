import dotenv from 'dotenv';
import mongoose from 'mongoose';

import GamePost from '../models/GamePost.js';

dotenv.config();

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  return {
    apply: args.has('--apply'),
  };
}

function buildFilter() {
  return {
    $or: [
      { titleNormalized: { $exists: false } },
      { titleNormalized: null },
      {
        $expr: {
          $ne: [
            '$titleNormalized',
            {
              $toLower: {
                $trim: {
                  input: '$title',
                },
              },
            },
          ],
        },
      },
    ],
  };
}

function buildUpdatePipeline() {
  return [
    {
      $set: {
        titleNormalized: {
          $toLower: {
            $trim: {
              input: '$title',
            },
          },
        },
      },
    },
  ];
}

async function run() {
  const { apply } = parseArgs(process.argv);
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!uri) {
    console.error('[backfillTitleNormalized] Missing MONGO_URI or MONGODB_URI.');
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(uri);

  try {
    const filter = buildFilter();
    const toUpdate = await GamePost.countDocuments(filter);

    if (!apply) {
      console.log('[backfillTitleNormalized] Dry run mode. No writes performed.');
      console.log(`[backfillTitleNormalized] Documents needing update: ${toUpdate}`);
      console.log('[backfillTitleNormalized] Re-run with --apply to execute the migration.');
      return;
    }

    const updateResult = await GamePost.updateMany(filter, buildUpdatePipeline());

    console.log('[backfillTitleNormalized] Migration completed.');
    console.log(`[backfillTitleNormalized] Matched: ${updateResult.matchedCount}`);
    console.log(`[backfillTitleNormalized] Modified: ${updateResult.modifiedCount}`);
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error('[backfillTitleNormalized] Fatal error:', err);
  process.exitCode = 1;
});
