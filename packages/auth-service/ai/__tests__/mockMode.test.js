// packages/auth-service/ai/__tests__/mockMode.test.js
// Unit tests for AI mock mode.
//
// Run with:
//   node --test ai/__tests__/mockMode.test.js
// Or via npm:
//   npm test --workspace @services/auth
//
// What these tests verify:
//   1. getMockAnswer / getMockReflection return valid content for every intent
//   2. generateAnswer in mock mode skips Gemini (does not throw on missing API key)
//   3. generateAnswer in real mode reaches Gemini (throws about missing API key)
//   4. generateReflection behaves correctly in both modes
//   5. Model singleton stays null after a mock-mode call (confirms no Gemini call)

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { generateAnswer, generateReflection, resetModel, getModel } from '../answerAgent.js';
import { getMockAnswer, getMockReflection } from '../mockAiService.js';
import { INTENTS } from '../routerAgent.js';

// ── Save original env so each suite can restore it cleanly ───────────────────
const _origMockMode = process.env.AI_MOCK_MODE;
const _origApiKey   = process.env.GOOGLE_API_KEY;

function restoreEnv() {
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
  resetModel();
}

after(restoreEnv);

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — mockAiService unit tests (pure functions, no env dependency)
// ─────────────────────────────────────────────────────────────────────────────
describe('mockAiService — getMockAnswer', () => {
  test('returns a non-empty string for every defined intent', () => {
    for (const intent of Object.values(INTENTS)) {
      const result = getMockAnswer({ intent });
      assert.strictEqual(typeof result, 'string', `Expected string for intent "${intent}"`);
      assert.ok(result.trim().length > 0, `Expected non-empty response for intent "${intent}"`);
    }
  });

  test('game_recommendation response includes a RECOMMENDATIONS block', () => {
    const result = getMockAnswer({ intent: INTENTS.GAME_RECOMMENDATION });
    assert.ok(
      result.includes('<!--RECOMMENDATIONS:'),
      'game_recommendation mock should embed a RECOMMENDATIONS block',
    );
  });

  test('bookmark_analysis response includes a RECOMMENDATIONS block', () => {
    const result = getMockAnswer({ intent: INTENTS.BOOKMARK_ANALYSIS });
    assert.ok(
      result.includes('<!--RECOMMENDATIONS:'),
      'bookmark_analysis mock should embed a RECOMMENDATIONS block',
    );
  });

  test('community_summary, leaderboard_query, and low_rating_query responses do NOT include a RECOMMENDATIONS block', () => {
    const community  = getMockAnswer({ intent: INTENTS.COMMUNITY_SUMMARY });
    const leaderboard = getMockAnswer({ intent: INTENTS.LEADERBOARD_QUERY });
    const lowRating = getMockAnswer({ intent: INTENTS.LOW_RATING_QUERY });
    assert.ok(!community.includes('<!--RECOMMENDATIONS:'));
    assert.ok(!leaderboard.includes('<!--RECOMMENDATIONS:'));
    assert.ok(!lowRating.includes('<!--RECOMMENDATIONS:'));
  });

  test('returns a non-empty fallback for an unknown intent', () => {
    const result = getMockAnswer({ intent: 'intent_that_does_not_exist' });
    assert.strictEqual(typeof result, 'string');
    assert.ok(result.trim().length > 0);
  });
});

describe('mockAiService — getMockReflection', () => {
  test('strips the RECOMMENDATIONS block from the bad answer', () => {
    const badAnswer = 'Some answer text.<!--RECOMMENDATIONS:[{"title":"Fake Game"}]-->trailing';
    const result = getMockReflection({ badAnswer });
    assert.ok(
      !result.includes('<!--RECOMMENDATIONS:'),
      'RECOMMENDATIONS block should be removed by reflection',
    );
  });

  test('appends the [MOCK REFLECTION] note', () => {
    const result = getMockReflection({ badAnswer: 'Original text.' });
    assert.ok(result.includes('[MOCK REFLECTION]'));
  });

  test('preserves the original prose content', () => {
    const result = getMockReflection({ badAnswer: 'My answer content.' });
    assert.ok(result.includes('My answer content.'));
  });

  test('handles a bad answer with no RECOMMENDATIONS block gracefully', () => {
    const result = getMockReflection({ badAnswer: 'Plain answer with no block.' });
    assert.ok(result.includes('Plain answer with no block.'));
    assert.ok(result.includes('[MOCK REFLECTION]'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — answerAgent in MOCK MODE
// Key property: no GOOGLE_API_KEY is set, yet all calls must succeed.
// This proves Gemini is never reached.
// ─────────────────────────────────────────────────────────────────────────────
describe('answerAgent — AI_MOCK_MODE=true (Gemini must NOT be called)', () => {
  before(() => {
    process.env.AI_MOCK_MODE = 'true';
    delete process.env.GOOGLE_API_KEY; // would cause getModel() to throw if reached
    resetModel();
  });

  test('generateAnswer returns a non-empty string', async () => {
    const result = await generateAnswer({
      userMessage: 'What games should I play?',
      intent: INTENTS.GAME_RECOMMENDATION,
      conversationContext: '',
      platformData: '',
    });
    assert.strictEqual(typeof result, 'string');
    assert.ok(result.length > 0);
  });

  test('generateAnswer does not throw even with no GOOGLE_API_KEY', async () => {
    // If Gemini were called, getModel() would throw "GOOGLE_API_KEY is missing".
    // Success here is proof that mock mode short-circuited before Gemini.
    await assert.doesNotReject(() =>
      generateAnswer({
        userMessage: 'Show me the leaderboard',
        intent: INTENTS.LEADERBOARD_QUERY,
        conversationContext: '',
        platformData: '',
      }),
    );
  });

  test('generateAnswer works for every intent without an API key', async () => {
    for (const intent of Object.values(INTENTS)) {
      await assert.doesNotReject(
        () => generateAnswer({ userMessage: 'test', intent, conversationContext: '', platformData: '' }),
        `generateAnswer should not throw for intent "${intent}" in mock mode`,
      );
    }
  });

  test('generateReflection returns a non-empty string', async () => {
    const result = await generateReflection({
      badAnswer: 'Some potentially hallucinated text.',
      flags: ['possible hallucinations: Fake Game'],
      userMessage: 'test',
      intent: INTENTS.GENERAL_CHAT,
      platformData: '',
    });
    assert.strictEqual(typeof result, 'string');
    assert.ok(result.length > 0);
  });

  test('model singleton stays null after a mock-mode call (Gemini never initialised)', async () => {
    resetModel();
    await generateAnswer({
      userMessage: 'hi',
      intent: INTENTS.GENERAL_CHAT,
      conversationContext: '',
      platformData: '',
    });
    // If the mock worked correctly, getModel() was never called, so _model is still null.
    // Calling getModel() now (without an API key) should throw — confirming the singleton
    // was never populated during the mock call.
    assert.throws(() => getModel(), /GOOGLE_API_KEY/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 — answerAgent in REAL MODE
// Key property: with no API key, the Gemini path IS reached and throws.
// ─────────────────────────────────────────────────────────────────────────────
describe('answerAgent — AI_MOCK_MODE=false (Gemini path must be reached)', () => {
  before(() => {
    process.env.AI_MOCK_MODE = 'false';
    delete process.env.GOOGLE_API_KEY;
    resetModel();
  });

  test('generateAnswer throws about missing GOOGLE_API_KEY (proves Gemini path is reached)', async () => {
    await assert.rejects(
      () =>
        generateAnswer({
          userMessage: 'test',
          intent: INTENTS.GENERAL_CHAT,
          conversationContext: '',
          platformData: '',
        }),
      /GOOGLE_API_KEY/,
    );
  });

  test('generateReflection throws about missing GOOGLE_API_KEY in real mode', async () => {
    await assert.rejects(
      () =>
        generateReflection({
          badAnswer: 'bad',
          flags: [],
          userMessage: 'test',
          intent: INTENTS.GENERAL_CHAT,
          platformData: '',
        }),
      /GOOGLE_API_KEY/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 — answerAgent with AI_MOCK_MODE unset (defaults to real mode)
// ─────────────────────────────────────────────────────────────────────────────
describe('answerAgent — AI_MOCK_MODE unset (defaults to real/Gemini mode)', () => {
  before(() => {
    delete process.env.AI_MOCK_MODE;
    delete process.env.GOOGLE_API_KEY;
    resetModel();
  });

  test('generateAnswer throws about missing GOOGLE_API_KEY when mock mode is not set', async () => {
    await assert.rejects(
      () =>
        generateAnswer({
          userMessage: 'test',
          intent: INTENTS.GENERAL_CHAT,
          conversationContext: '',
          platformData: '',
        }),
      /GOOGLE_API_KEY/,
    );
  });
});
