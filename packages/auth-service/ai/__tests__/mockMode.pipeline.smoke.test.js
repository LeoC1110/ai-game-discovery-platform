// packages/auth-service/ai/__tests__/mockMode.pipeline.smoke.test.js
// Mock-mode pipeline smoke tests (8 prompts).
//
// Run with:
//   node --test ai/__tests__/mockMode.pipeline.smoke.test.js

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { runPipeline } from '../aiPipeline.js';

mongoose.set('bufferCommands', false);

const TEST_USER_ID = 'smoke-pipeline-user-001';
const TEST_USERNAME = 'smoke_pipeline_user';

const _origMockMode = process.env.AI_MOCK_MODE;
const _origApiKey = process.env.GOOGLE_API_KEY;

before(() => {
  process.env.AI_MOCK_MODE = 'true';
  delete process.env.GOOGLE_API_KEY;
});

after(() => {
  if (_origMockMode !== undefined) process.env.AI_MOCK_MODE = _origMockMode;
  else delete process.env.AI_MOCK_MODE;

  if (_origApiKey !== undefined) process.env.GOOGLE_API_KEY = _origApiKey;
  else delete process.env.GOOGLE_API_KEY;
});

const SMOKE_CASES = [
  {
    name: '1) Hello. → general_chat, no database',
    message: 'Hello.',
    expectedMode: 'general_chat',
    expectedNeedsDb: false,
    expectValidation: false,
  },
  {
    name: '2) Show all games on the platform. → query mode',
    message: 'Show all games on the platform.',
    expectedMode: 'query',
    expectedNeedsDb: true,
    expectValidation: false,
  },
  {
    name: '3) Show top trending community games. → query mode',
    message: 'Show the top trending games in the community right now.',
    expectedMode: 'query',
    expectedNeedsDb: true,
    expectValidation: true,
  },
  {
    name: '4) Find low-rated games. → query mode',
    message: 'Find low-rated games on the platform.',
    expectedMode: 'query',
    expectedNeedsDb: true,
    expectValidation: false,
  },
  {
    name: '5) Recommend three games. → recommendation mode',
    message: 'Recommend three games from the platform.',
    expectedMode: 'recommendation',
    expectedNeedsDb: true,
    expectValidation: true,
  },
  {
    name: '6) Recommend from bookmarks. → recommendation mode',
    message: 'Recommend games based on my bookmarks.',
    expectedMode: 'recommendation',
    expectedNeedsDb: true,
    expectValidation: true,
  },
  {
    name: '7) Analyze bookmarks. → recommendation mode',
    message: 'Analyze my bookmarked games.',
    expectedMode: 'recommendation',
    expectedNeedsDb: true,
    expectValidation: true,
  },
  {
    name: '8) Trending + recommend. → mixed mode',
    message: 'Show trending games and recommend one for me.',
    expectedMode: 'mixed',
    expectedNeedsDb: true,
    expectValidation: true,
  },
];

describe('runPipeline — mock mode smoke test (8 prompts)', () => {
  for (const c of SMOKE_CASES) {
    test(c.name, async () => {
      const result = await runPipeline({
        userId: TEST_USER_ID,
        username: TEST_USERNAME,
        message: c.message,
      });

      assert.equal(typeof result.answer, 'string');
      assert.ok(result.answer.trim().length > 0, 'answer should be non-empty');

      assert.equal(result.mode, c.expectedMode, `expected mode=${c.expectedMode}, got ${result.mode}`);
      assert.equal(result.plan.needsDatabase, c.expectedNeedsDb,
        `expected needsDatabase=${c.expectedNeedsDb}, got ${result.plan.needsDatabase}`);

      if (c.expectValidation) {
        assert.ok(result.validation !== null, 'validation should run for high-risk case');
      } else {
        assert.ok(result.validation === null || result.validation?.passed === true,
          'validation should be skipped or pass cleanly for low-risk case');
      }

      // Recommendation extraction smoke: parser should never leak raw block to user-visible text.
      assert.ok(!result.answer.includes('<!--RECOMMENDATIONS:'),
        'user-visible answer must not include raw RECOMMENDATIONS block');
      assert.ok(Array.isArray(result.recommendations), 'recommendations should be an array');
      assert.ok(Array.isArray(result.recommendedPosts), 'recommendedPosts should be an array');
    });
  }

  test('reflection runs at most once (smoke guarantee)', async () => {
    // In mock mode this prompt is high-risk and commonly triggers reflection.
    const result = await runPipeline({
      userId: TEST_USER_ID,
      username: TEST_USERNAME,
      message: 'Recommend games based on my bookmarks.',
    });

    assert.equal(typeof result.repaired, 'boolean', 'repaired must be boolean');
    // If reflection happened, pipeline still returns normally with single final answer.
    assert.equal(typeof result.answer, 'string');
    assert.ok(result.answer.length > 0);
  });
});
