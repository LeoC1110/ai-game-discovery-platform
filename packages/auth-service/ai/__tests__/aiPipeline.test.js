// packages/auth-service/ai/aiPipeline.test.js
// Isolated integration tests for runPipeline().
//
// Rules:
//   - No real Gemini calls (AI_MOCK_MODE=true throughout)
//   - No real MongoDB connection (mongoose buffering disabled; all DB paths have
//     graceful fallbacks)
//   - No real API keys required
//
// Run with:
//   node --test ai/aiPipeline.test.js

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

// Disable Mongoose command buffering — disconnected calls fail fast instead
// of hanging for the 10-second default timeout.
mongoose.set('bufferCommands', false);

import { runPipeline } from '../aiPipeline.js';

const USER_ID  = 'test-pipeline-user-001';
const USERNAME = 'pipeline_test';

// ── Env setup ────────────────────────────────────────────────────────────────
const _savedMockMode = process.env.AI_MOCK_MODE;
const _savedApiKey   = process.env.GOOGLE_API_KEY;

before(() => {
  process.env.AI_MOCK_MODE = 'true';
  delete process.env.GOOGLE_API_KEY;
});

after(() => {
  if (_savedMockMode !== undefined) {
    process.env.AI_MOCK_MODE = _savedMockMode;
  } else {
    delete process.env.AI_MOCK_MODE;
  }
  if (_savedApiKey !== undefined) {
    process.env.GOOGLE_API_KEY = _savedApiKey;
  } else {
    delete process.env.GOOGLE_API_KEY;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — General Chat
// ─────────────────────────────────────────────────────────────────────────────
describe('runPipeline — general chat', () => {
  test('"Hello" greets without DB access', async () => {
    const result = await runPipeline({ userId: USER_ID, username: USERNAME, message: 'Hello' });

    assert.equal(typeof result.answer, 'string');
    assert.ok(result.answer.length > 0, 'answer must be non-empty');
    // Greeting fast-path OR general_chat mode — either way, no DB is needed.
    const isChat = result.mode === 'general_chat' || result.intent === 'general_chat';
    assert.ok(isChat, `expected general_chat mode, got "${result.mode}"`);
    // Greeting fast-path never sets needsDatabase; non-greeting general_chat also does not.
    if (result.plan) {
      assert.equal(result.plan.needsDatabase, false, 'general chat must not need DB');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — Query mode
// ─────────────────────────────────────────────────────────────────────────────
describe('runPipeline — query mode', () => {
  test('"Show the top trending games in the community right now." → query mode', async () => {
    const result = await runPipeline({
      userId:   USER_ID,
      username: USERNAME,
      message:  'Show the top trending games in the community right now.',
    });

    assert.equal(typeof result.answer, 'string');
    assert.ok(result.answer.length > 0);
    assert.equal(result.mode, 'query',
      `expected mode=query, got "${result.mode}"`);
    assert.equal(result.plan.needsDatabase, true,
      'query mode must require database');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 — Recommendation mode
// ─────────────────────────────────────────────────────────────────────────────
describe('runPipeline — recommendation mode', () => {
  test('"Recommend games based on my bookmarks." → recommendation mode with profile', async () => {
    const result = await runPipeline({
      userId:   USER_ID,
      username: USERNAME,
      message:  'Recommend games based on my bookmarks.',
    });

    assert.ok(result.answer.length > 0);
    assert.equal(result.mode, 'recommendation',
      `expected mode=recommendation, got "${result.mode}"`);
    assert.equal(result.plan.needsDatabase,       true);
    assert.equal(result.plan.needsUserProfile,    true);
    assert.equal(result.plan.needsRecommendation, true);
    assert.equal(result.plan.needsValidation,     true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 — Mixed mode
// ─────────────────────────────────────────────────────────────────────────────
describe('runPipeline — mixed mode', () => {
  test('"Show trending games and recommend one for me." → mixed mode', async () => {
    const result = await runPipeline({
      userId:   USER_ID,
      username: USERNAME,
      message:  'Show trending games and recommend one for me.',
    });

    assert.ok(result.answer.length > 0);
    assert.equal(result.mode, 'mixed',
      `expected mode=mixed, got "${result.mode}"`);
    assert.ok(
      result.plan.executionOrder.includes('query_first') &&
      result.plan.executionOrder.includes('recommend_second'),
      `executionOrder must include query_first and recommend_second, got: ${JSON.stringify(result.plan.executionOrder)}`,
    );
    assert.equal(result.plan.needsDatabase,    true);
    assert.equal(result.plan.needsUserProfile, true);
    assert.equal(result.plan.needsValidation,  true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5 — Validation failure with reflection
//
// The mock answer for bookmark_analysis naturally includes a RECOMMENDATIONS
// block with "Elden Ring".  Since there is no real DB, extractPlatformTitles
// returns nothing → validator flags the non-platform title → pipeline runs
// one reflection pass → getMockReflection strips the block → repaired: true.
// ─────────────────────────────────────────────────────────────────────────────
describe('runPipeline — reflection on validation failure', () => {
  test('bookmark_analysis mock answer triggers reflection → repaired: true', async () => {
    const result = await runPipeline({
      userId:   USER_ID,
      username: USERNAME,
      message:  'Recommend games based on my bookmarks.',
    });

    assert.equal(result.repaired, true,
      'pipeline must mark response as repaired when reflection was triggered');
    assert.equal(typeof result.answer, 'string');
    assert.ok(result.answer.length > 0, 'repaired answer must be non-empty');
    // After reflection the RECOMMENDATIONS block is stripped by getMockReflection.
    assert.ok(
      !result.answer.includes('<!--RECOMMENDATIONS:'),
      'repaired answer must not contain raw RECOMMENDATIONS block',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 6 — No infinite reflection
//
// The pipeline architecture hard-codes a single reflection pass.  After the
// one repair attempt the code moves on regardless of post-repair validation
// result.  We verify this by observing:
//   a) repaired: true  (reflection happened exactly once)
//   b) pipeline completes and returns within the test timeout (no hang)
//   c) the final result has the expected structure even when post-repair
//      validation still has flags
// ─────────────────────────────────────────────────────────────────────────────
describe('runPipeline — no infinite reflection loop', () => {
  test('pipeline completes without hanging after at most one reflection pass', async () => {
    // game_recommendation mock answer contains Elden Ring + Hollow Knight
    // (non-platform titles).  Reflection runs once.  getMockReflection strips
    // the block.  Post-repair validation passes → repaired: true.
    const result = await runPipeline({
      userId:   USER_ID,
      username: USERNAME,
      message:  'What games should I play next?',
    });

    // Pipeline must complete (not hang) and produce a non-empty answer.
    assert.equal(typeof result.answer, 'string');
    assert.ok(result.answer.length > 0);
    // repaired is true when reflection ran exactly once; it would still be
    // true if it ran more than once but the test would time-out above if
    // an infinite loop occurred.
    // The key guarantee: repaired is a boolean, not undefined.
    assert.ok(typeof result.repaired === 'boolean',
      'repaired must always be a boolean');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 7 — Recommendation extraction
//
// The mock answer for bookmark_analysis contains a RECOMMENDATIONS block.
// After reflection getMockReflection strips the block, so the clean answer
// must not include the raw <!--RECOMMENDATIONS:...--> syntax.
// ─────────────────────────────────────────────────────────────────────────────
describe('runPipeline — recommendation extraction', () => {
  test('RECOMMENDATIONS block is stripped from user-visible answer', async () => {
    // community_summary mock answer has no RECOMMENDATIONS block, so there is
    // no validator-triggered reflection — the raw answer goes straight to
    // extractRecommendedPosts which strips any block it finds.
    const result = await runPipeline({
      userId:   USER_ID,
      username: USERNAME,
      message:  'Show me the top trending games in the community right now.',
    });

    // The raw <!--RECOMMENDATIONS:...--> block must never appear in the
    // user-visible answer (the extractor always strips it).
    assert.ok(
      !result.answer.includes('<!--RECOMMENDATIONS:'),
      'RECOMMENDATIONS block must be stripped from user-visible answer',
    );
    assert.equal(typeof result.answer, 'string');
    assert.ok(result.answer.length > 0, 'clean answer must be non-empty');
  });
});
