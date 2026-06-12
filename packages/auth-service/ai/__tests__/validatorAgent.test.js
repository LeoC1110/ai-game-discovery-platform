import test from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldValidateAnswer,
  validateAnswer,
  __test__,
} from '../validatorAgent.js';

import { INTENTS } from '../routerAgent.js';

const VALID_RECO_BLOCK =
  '<!--RECOMMENDATIONS:[{"title":"Portal 2","reason":"Great puzzle co-op fit.","confidence":0.92,"matchedTags":["puzzle","co-op"]}]-->';

test('valid recommendation block with platform title should pass', () => {
  const answer = `Top match from platform data.\n${VALID_RECO_BLOCK}`;

  const result = validateAnswer({
    answer,
    intent: INTENTS.GAME_RECOMMENDATION,
    platformData: 'Game: Portal 2\nTags: puzzle, co-op',
  });

  assert.equal(result.passed, true);
  assert.equal(result.severity, 'none');
  assert.deepEqual(result.flags, []);
  assert.equal(result.suggestedAction, 'return');
});

test('recommendation block with non-platform title should fail', () => {
  const answer =
    'Recommendation based on your request.\n' +
    '<!--RECOMMENDATIONS:[{"title":"Elden Ring","reason":"Popular action RPG.","confidence":0.9,"matchedTags":["rpg"]}]-->';

  const result = validateAnswer({
    answer,
    intent: INTENTS.GAME_RECOMMENDATION,
    platformData: 'Game: Portal 2\nTags: puzzle, co-op',
  });

  assert.equal(result.passed, false);
  assert.equal(result.severity, 'high');
  assert.ok(result.flags.some((f) => /non-platform title/i.test(f)));
  assert.equal(result.suggestedAction, 'reflect');
});

test('invalid recommendation JSON should fail with hide_cards', () => {
  const answer =
    'Some answer text\n' +
    '<!--RECOMMENDATIONS:[{"title":"Portal 2","reason":"Good""confidence":0.9}]-->';

  const result = validateAnswer({
    answer,
    intent: INTENTS.GAME_RECOMMENDATION,
    platformData: 'Game: Portal 2',
  });

  assert.equal(result.passed, false);
  assert.equal(result.severity, 'high');
  assert.ok(result.flags.some((f) => /Invalid RECOMMENDATIONS block JSON\./i.test(f)));
  assert.equal(result.suggestedAction, 'hide_cards');
});

test('community intent with personalized wording should fail', () => {
  const result = validateAnswer({
    answer: 'Based on your taste, this community trend is best for you.',
    intent: INTENTS.COMMUNITY_SUMMARY,
    platformData: 'Game: Portal 2\nCommunity Rating: 8.7/10',
  });

  assert.equal(result.passed, false);
  assert.ok(result.severity === 'medium' || result.severity === 'high');
  assert.equal(result.suggestedAction, 'reflect');
  assert.ok(result.flags.some((f) => /personalized wording/i.test(f)));
});

test('unsupported empty platform claim should fail when platformData missing', () => {
  const result = validateAnswer({
    answer: 'There are no games currently listed on the platform.',
    intent: INTENTS.GAME_RECOMMENDATION,
    platformData: '',
  });

  assert.equal(result.passed, false);
  assert.equal(result.severity, 'high');
  assert.equal(result.suggestedAction, 'reflect');
  assert.ok(result.flags.some((f) => /platform\/database is empty/i.test(f)));
});

test('general chat should not require validation', () => {
  const needed = shouldValidateAnswer({
    plan: null,
    intent: INTENTS.GENERAL_CHAT,
    answer: 'Hi! I can help you explore games.',
  });

  assert.equal(needed, false);
});

test('recommendation intent should require validation', () => {
  const needed = shouldValidateAnswer({
    plan: null,
    intent: INTENTS.GAME_RECOMMENDATION,
    answer: 'Sure, I can recommend games for you.',
  });

  assert.equal(needed, true);
});

test('helper: extractPlatformTitles supports Game/Title/numbered/json-like lines', () => {
  const titles = __test__.extractPlatformTitles(
    [
      'Game: Portal 2',
      'Title: Stardew Valley',
      '1. Hollow Knight',
      '{"title": "Celeste"}',
    ].join('\n'),
  );

  assert.ok(titles.includes('portal 2'));
  assert.ok(titles.includes('stardew valley'));
  assert.ok(titles.includes('hollow knight'));
  assert.ok(titles.includes('celeste'));
});

test('helper: parseRecommendationBlock rejects non-array JSON', () => {
  const parsed = __test__.parseRecommendationBlock('{"title":"Portal 2"}');
  assert.equal(parsed.ok, false);
  assert.match(parsed.error ?? '', /JSON array/i);
});
