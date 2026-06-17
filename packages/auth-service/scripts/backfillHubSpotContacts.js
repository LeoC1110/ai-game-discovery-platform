#!/usr/bin/env node
import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { syncContactToHubSpot } from '../services/hubspotService.js';

const { MONGODB_URI, MONGO_URI } = process.env;
const mongoUri = MONGODB_URI ?? MONGO_URI ?? 'mongodb://localhost:27017/auth_service';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isApply = args.includes('--apply');

if (!isDryRun && !isApply) {
  console.log(`
  Usage: node backfillHubSpotContacts.js [--dry-run|--apply]
  
  --dry-run   Show what would be synced without making changes
  --apply     Actually sync all users to HubSpot
  
  Default (no args): dry-run mode
  `);
  console.log('Running in DRY-RUN mode...\n');
}

async function backfillHubSpot() {
  const mode = isApply ? 'APPLY' : 'DRY-RUN';
  console.log(`[${mode}] Starting HubSpot contact backfill...`);

  try {
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB connected\n');

    const users = await User.find({}).lean();
    console.log(`Found ${users.length} users to process\n`);

    let synced = 0;
    let failed = 0;
    let skipped = 0;

    const isDryRunMode = isDryRun || (!isDryRun && !isApply);

    for (const user of users) {
      if (!user.email || !user.username) {
        console.log(`⊘ SKIP: User ${user._id} missing email or username`);
        skipped++;
        continue;
      }
      
      if (isDryRunMode) {
        console.log(`[DRY] Would sync: ${user.email} (${user.username}) - verified: ${user.emailVerified}`);
        synced++;
      } else {
        try {
          await syncContactToHubSpot({
            email: user.email,
            username: user.username,
            emailVerified: user.emailVerified === true,
          });
          console.log(`✅ Synced: ${user.email} (${user.username})`);
          synced++;
        } catch (err) {
          console.error(`❌ Failed: ${user.email} - ${err?.message || err}`);
          failed++;
        }
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${mode}] Results:`);
    console.log(`  ✅ Synced:  ${synced}`);
    console.log(`  ❌ Failed:  ${failed}`);
    console.log(`  ⊘ Skipped: ${skipped}`);
    console.log(`${'='.repeat(60)}\n`);

    if (isDryRunMode) {
      console.log('💡 This was a DRY-RUN. Run with --apply to actually sync.\n');
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Backfill failed:', err?.message || err);
    if (err?.stack) console.error(err.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

backfillHubSpot();
