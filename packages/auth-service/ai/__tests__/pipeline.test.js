// packages/auth-service/ai/__tests__/pipeline.test.js
// Integration tests for the full AI pipeline (runPipeline).
//
// These tests do NOT require a MongoDB connection or a Gemini API key:
//   - All DB-dependent functions have graceful try/catch fallbacks.
//   - Gemini is bypassed by setting AI_MOCK_MODE=true in mock-mode suites.
//   - Mongoose buffering is disabled so disconnected DB calls fail immediately
//     instead of waiting for the 10-second default buffer timeout.
//
// Run with:
//   node --test ai/__tests__/pipeline.test.js
// Or via npm:
//   npm test --workspace @services/auth

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

// Disable Mongoose command buffering so disconnected DB calls throw immediately
// rather than hanging for 10 s before timing out. All relevant callers already
// have try/catch fallbacks, so this only affects test speed.
mongoose.set('bufferCommands', false);

import { runPipeline } from '../aiPipeline.js';
import { CHINESE_GREETING_RESPONSE, GREETING_RESPONSE } from '../../prompts/fallbackResponses.js';

const TEST_USER_ID  = 'pipeline-test-user-000';
const TEST_USERNAME = 'pipeline_testuser';

// ── Save + restore env so suites are isolated ────────────────────────────────
const _origMockMode = process.env.AI_MOCK_MODE;
const _origApiKey   = process.env.GOOGLE_API_KEY;

after(() => {
  if (_origMockMode !== undefined) {
    process.env.AI_MOCK_MODE = _origMockMode;
  } else {
    delete process.env.AI_MOCK_MODE;
  }
  if (_origApiKey !== undefined) {
    process.env.GOOGLE_API_KEY = _origApiKey;
  } else {
    delete process.env.GOOGLE_API_KEY;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — Greeting fast-path
//
// The greeting fast-path returns before Step 1 (no DB call, no Gemini call).
// It should work even with AI_MOCK_MODE=false and no API key.
// ─────────────────────────────────────────────────────────────────────────────
describe('runPipeline — greeting fast-path', () => {
  before(() => {
    process.env.AI_MOCK_MODE = 'false';
    delete process.env.GOOGLE_API_KEY;
  });

  test('"hello" returns GREETING_RESPONSE', async () => {
    const result = await runPipeline({ userId: TEST_USER_ID, username: TEST_USERNAME, message: 'hello' });
    assert.strictEqual(result.answer, GREETING_RESPONSE);
  });

  test('"hi" returns GREETING_RESPONSE', async () => {
    const result = await runPipeline({ userId: TEST_USER_ID, username: TEST_USERNAME, message: 'hi' });
    assert.strictEqual(result.answer, GREETING_RESPONSE);
  });

  test('"你好" returns CHINESE_GREETING_RESPONSE', async () => {
    const result = await runPipeline({ userId: TEST_USER_ID, username: TEST_USERNAME, message: '你好' });
    assert.strictEqual(result.answer, CHINESE_GREETING_RESPONSE);
  });

  test('"nihao" returns CHINESE_GREETING_RESPONSE', async () => {
    const result = await runPipeline({ userId: TEST_USER_ID, username: TEST_USERNAME, message: 'nihao' });
    assert.strictEqual(result.answer, CHINESE_GREETING_RESPONSE);
  });

  test('greeting result has the correct shape', async () => {
    const result = await runPipeline({ userId: TEST_USER_ID, username: TEST_USERNAME, message: 'hello' });
    assert.strictEqual(result.intent, 'general_chat');
    assert.strictEqual(result.userTurnCount, 0);
    assert.deepStrictEqual(result.recommendedPosts, []);
    assert.strictEqual(result.evaluation, null);
  });

  test('greeting does not throw even without a GOOGLE_API_KEY', async () => {
    // A greeting short-circuits before Gemini is ever touched.
    await assert.doesNotReject(() =>
      runPipeline({ userId: TEST_USER_ID, username: TEST_USERNAME, message: 'hey' }),
    );
  });

  test('greeting with trailing punctuation is still handled by the fast-path', async () => {
    const result = await runPipeline({ userId: TEST_USER_ID, username: TEST_USERNAME, message: 'hello!' });
    assert.strictEqual(result.answer, GREETING_RESPONSE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — Full pipeline in mock mode
//
// With AI_MOCK_MODE=true the pipeline runs all 6 steps but Gemini is never
// called. DB calls hit their fallback paths (no real MongoDB).
// ─────────────────────────────────────────────────────────────────────────────
describe('runPipeline — AI_MOCK_MODE=true (full pipeline without Gemini)', () => {
  before(() => {
    process.env.AI_MOCK_MODE = 'true';
    delete process.env.GOOGLE_API_KEY;
  });

  test('completes without throwing (no API key required)', async () => {
    await assert.doesNotReject(() =>
      runPipeline({ userId: TEST_USER_ID, username: TEST_USERNAME, message: 'What games should I play?' }),
    );
  });

  test('result has the expected shape', async () => {
    const result = await runPipeline({
      userId: TEST_USER_ID,
      username: TEST_USERNAME,
      message: 'Show me trending games',
    });
    assert.strictEqual(typeof result.answer, 'string', 'answer must be a string');
    assert.strictEqual(typeof result.intent, 'string', 'intent must be a string');
    assert.strictEqual(typeof result.userTurnCount, 'number', 'userTurnCount must be a number');
    assert.ok(Array.isArray(result.recommendedPosts), 'recommendedPosts must be an array');
    assert.ok('evaluation' in result, 'evaluation key must be present');
  });

  test('result.answer is a non-empty string', async () => {
    const result = await runPipeline({
      userId: TEST_USER_ID,
      username: TEST_USERNAME,
      message: 'What are the top games on this platform?',
    });
    assert.ok(result.answer.trim().length > 0, 'answer must not be empty');
  });

  test('game recommendation message returns a non-empty answer', async () => {
    const result = await runPipeline({
      userId: TEST_USER_ID,
      username: TEST_USERNAME,
      message: 'Recommend me some RPG games',
    });
    // The RECOMMENDATIONS block is stripped by extractRecommendedPosts;
    // the clean answer text must still be non-empty.
    assert.ok(result.answer.trim().length > 0);
  });

  test('leaderboard query returns a non-empty answer', async () => {
    const result = await runPipeline({
      userId: TEST_USER_ID,
      username: TEST_USERNAME,
      message: 'Who is on the leaderboard?',
    });
    assert.ok(result.answer.trim().length > 0);
  });

  test('pipeline succeeds for multiple different messages', async () => {
    const messages = [
      'What games are popular right now?',
      'Tell me about the community',
      'Who are the top players?',
      'Analyze my bookmarks',
    ];
    for (const message of messages) {
      await assert.doesNotReject(
        () => runPipeline({ userId: TEST_USER_ID, username: TEST_USERNAME, message }),
        `pipeline should not throw for message: "${message}"`,
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 — Full pipeline in real mode (no API key)
//
// With AI_MOCK_MODE=false the Gemini path IS reached.
// With no API key the pipeline rejects, proving mock mode is what bypassed it.
// ─────────────────────────────────────────────────────────────────────────────
describe('runPipeline — AI_MOCK_MODE=false (real mode, Gemini path is reached)', () => {
  before(() => {
    process.env.AI_MOCK_MODE = 'false';
    delete process.env.GOOGLE_API_KEY;
  });

  test('non-greeting message rejects when GOOGLE_API_KEY is missing', async () => {
    // The pipeline reaches Step 4 (answerAgent → getModel()), which throws
    // because there is no API key. The error is caught and re-thrown as a
    // user-friendly message.
    await assert.rejects(() =>
      runPipeline({ userId: TEST_USER_ID, username: TEST_USERNAME, message: 'What games should I play?' }),
    );
  });

  test('a greeting still succeeds in real mode (fast-path before Gemini)', async () => {
    // Confirms that real-mode failure is caused by reaching Gemini,
    // not by some other pipeline issue.
    await assert.doesNotReject(() =>
      runPipeline({ userId: TEST_USER_ID, username: TEST_USERNAME, message: 'hello' }),
    );
  });
});
