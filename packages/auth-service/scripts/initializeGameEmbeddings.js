#!/usr/bin/env node
import 'dotenv/config';
import mongoose from 'mongoose';
import Game from '../models/Game.js';
import { storeGameEmbedding, getEmbeddingCount } from '../services/vectorEmbedService.js';

const { MONGODB_URI, MONGO_URI } = process.env;
const mongoUri = MONGODB_URI ?? MONGO_URI ?? 'mongodb://localhost:27017/auth_service';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isApply = args.includes('--apply');
const isForce = args.includes('--force');

if (!isDryRun && !isApply) {
  console.log(`
  Usage: node initializeGameEmbeddings.js [--dry-run|--apply] [--force]
  
  --dry-run   Show what would be embedded without making changes
  --apply     Actually generate and store embeddings
  --force     Re-embed all games (ignore existing embeddings)
  
  Default (no args): dry-run mode
  `);
  console.log('Running in DRY-RUN mode...\n');
}

function buildEmbeddingContent(game) {
  const parts = [
    game.title,
    game.genre || 'game',
    game.platform || 'platform',
    game.developer,
    game.description,
  ]
    .filter(Boolean)
    .join(' ');

  return parts.substring(0, 1000); // Limit to 1000 chars for API efficiency
}

async function initializeEmbeddings() {
  const mode = isApply ? 'APPLY' : 'DRY-RUN';
  const isDryRunMode = isDryRun || (!isDryRun && !isApply);
  console.log(`[${mode}] Starting game embedding initialization...`);

  try {
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB connected\n');

    const games = await Game.find({}).lean();
    console.log(`Found ${games.length} games to process\n`);

    let embedded = 0;
    let skipped = 0;
    let failed = 0;

    for (const game of games) {
      if (!game._id || !game.title) {
        console.log(`⊘ SKIP: Game missing _id or title`);
        skipped++;
        continue;
      }

      if (isDryRunMode) {
        const content = buildEmbeddingContent(game);
        console.log(`[DRY] Would embed: ${game.title} (${game.genre || 'no genre'})`);
        console.log(`      Content: "${content.substring(0, 60)}..."`);
        embedded++;
      } else {
        try {
          const content = buildEmbeddingContent(game);
          await storeGameEmbedding(
            game._id.toString(),
            game.title,
            content
          );
          console.log(`✅ Embedded: ${game.title}`);
          embedded++;
        } catch (err) {
          console.error(
            `❌ Failed: ${game.title} - ${err?.message || err}`
          );
          failed++;
        }
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${mode}] Results:`);
    console.log(`  ✅ Embedded: ${embedded}`);
    console.log(`  ❌ Failed:   ${failed}`);
    console.log(`  ⊘ Skipped:  ${skipped}`);
    console.log(`${'='.repeat(60)}\n`);

    if (isDryRunMode) {
      const existingCount = await getEmbeddingCount();
      console.log(
        `💡 This was a DRY-RUN. Currently ${existingCount} embeddings exist.`
      );
      console.log(
        '   Run with --apply to actually generate and store embeddings.\n'
      );
    } else {
      const finalCount = await getEmbeddingCount();
      console.log(`✅ Total embeddings now in database: ${finalCount}\n`);
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Initialization failed:', err?.message || err);
    if (err?.stack) console.error(err.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

initializeEmbeddings();
