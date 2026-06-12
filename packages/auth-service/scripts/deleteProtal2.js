import dotenv from 'dotenv';
import mongoose from 'mongoose';

import Game from '../models/Game.js';
import GamePost from '../models/GamePost.js';

dotenv.config();

const TARGET_TITLE = 'Protal 2';
const TARGET_NORMALIZED = TARGET_TITLE.toLowerCase();

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  return {
    apply: args.has('--apply'),
  };
}

function buildTitleFilter() {
  return {
    $or: [
      { title: TARGET_TITLE },
      { titleNormalized: TARGET_NORMALIZED },
      { title: { $regex: '^Protal\\s+2$', $options: 'i' } },
    ],
  };
}

async function run() {
  const { apply } = parseArgs(process.argv);
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!uri) {
    console.error('[deleteProtal2] Missing MONGO_URI or MONGODB_URI.');
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(uri);

  try {
    const filter = buildTitleFilter();

    const [gameCount, postCount] = await Promise.all([
      Game.countDocuments(filter),
      GamePost.countDocuments({ postType: 'GAME', ...filter }),
    ]);

    console.log('[deleteProtal2] Target:', TARGET_TITLE);
    console.log(`[deleteProtal2] Game matches: ${gameCount}`);
    console.log(`[deleteProtal2] GamePost matches: ${postCount}`);

    if (!apply) {
      console.log('[deleteProtal2] Dry run mode. No writes performed.');
      console.log('[deleteProtal2] Re-run with --apply to delete the matching documents.');
      return;
    }

    const [gameResult, postResult] = await Promise.all([
      Game.deleteMany(filter),
      GamePost.deleteMany({ postType: 'GAME', ...filter }),
    ]);

    console.log('[deleteProtal2] Deletion completed.');
    console.log(`[deleteProtal2] Deleted Game documents: ${gameResult.deletedCount}`);
    console.log(`[deleteProtal2] Deleted GamePost documents: ${postResult.deletedCount}`);
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error('[deleteProtal2] Fatal error:', err);
  process.exitCode = 1;
});