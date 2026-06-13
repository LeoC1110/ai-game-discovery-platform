// packages/auth-service/ai/__tests__/routerAgent.test.js
// Isolated unit tests for classifyIntent() in routerAgent.js.
//
// No MongoDB, no Gemini, no aiPipeline, no AnswerAgent, no ValidatorAgent.
// classifyIntent() is a pure function — tests are fully synchronous.
//
// Run with:
//   node --test ai/__tests__/routerAgent.test.js
// Or via the workspace test script after adding this file to the test list.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { classifyIntent, INTENTS, MODES } from '../routerAgent.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Assert that a plan contains every expected key/value pair.
 * Extra keys in the plan are ignored.
 */
function assertPlan(plan, expected) {
  for (const [key, value] of Object.entries(expected)) {
    if (Array.isArray(value)) {
      assert.deepEqual(
        plan[key],
        value,
        `Expected plan.${key} to equal ${JSON.stringify(value)}, got ${JSON.stringify(plan[key])}`,
      );
    } else {
      assert.equal(
        plan[key],
        value,
        `Expected plan.${key} = ${JSON.stringify(value)}, got ${JSON.stringify(plan[key])}`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — Query mode
// ─────────────────────────────────────────────────────────────────────────────
describe('classifyIntent — Query mode', () => {

  // ── PLATFORM_INVENTORY_QUERY ──────────────────────────────────────────────

  test('show all games on the platform → platform_inventory_query / query', () => {
    const plan = classifyIntent('show all games on the platform');
    assertPlan(plan, {
      intent:              INTENTS.PLATFORM_INVENTORY_QUERY,
      mode:                MODES.QUERY,
      needsDatabase:       true,
      needsUserProfile:    false,
      needsRecommendation: false,
      needsValidation:     false,
      executionOrder:      ['query'],
      responseStyle:       'factual_list',
    });
  });

  test('find all games in platform → platform_inventory_query', () => {
    const plan = classifyIntent('find all games in platform');
    assert.equal(plan.intent, INTENTS.PLATFORM_INVENTORY_QUERY);
    assert.equal(plan.mode,   MODES.QUERY);
  });

  test('list available games → platform_inventory_query', () => {
    const plan = classifyIntent('list available games');
    assert.equal(plan.intent, INTENTS.PLATFORM_INVENTORY_QUERY);
  });

  test('what games are available → platform_inventory_query', () => {
    const plan = classifyIntent('what games are available on the platform');
    assert.equal(plan.intent, INTENTS.PLATFORM_INVENTORY_QUERY);
  });

  test('show the first 10 games on the platform → platform_inventory_query', () => {
    const plan = classifyIntent('show the first 10 games on the platform');
    assert.equal(plan.intent, INTENTS.PLATFORM_INVENTORY_QUERY);
    assert.equal(plan.mode, MODES.QUERY);
  });

  test('show more platform games → platform_inventory_query', () => {
    const plan = classifyIntent('show more platform games');
    assert.equal(plan.intent, INTENTS.PLATFORM_INVENTORY_QUERY);
    assert.equal(plan.mode, MODES.QUERY);
  });

  // ── LOW_RATING_QUERY ──────────────────────────────────────────────────────

  test('find low-rated games → low_rating_query / query', () => {
    const plan = classifyIntent('find low-rated games');
    assertPlan(plan, {
      intent:              INTENTS.LOW_RATING_QUERY,
      mode:                MODES.QUERY,
      needsDatabase:       true,
      needsUserProfile:    false,
      needsRecommendation: false,
      needsValidation:     true,   // HIGH_RISK
      executionOrder:      ['query'],
      responseStyle:       'factual_list',
    });
  });

  test('find low-rated games on the platform → low_rating_query', () => {
    const plan = classifyIntent('find low-rated games on the platform');
    assert.equal(plan.intent, INTENTS.LOW_RATING_QUERY);
    assert.equal(plan.mode, MODES.QUERY);
  });

  test('show worst rated games → low_rating_query', () => {
    const plan = classifyIntent('show worst rated games');
    assert.equal(plan.intent, INTENTS.LOW_RATING_QUERY);
    assert.equal(plan.needsValidation, true);
  });

  test('show poorly rated games → low_rating_query', () => {
    assert.equal(classifyIntent('show poorly rated games').intent, INTENTS.LOW_RATING_QUERY);
  });

  test('bottom rated games → low_rating_query', () => {
    assert.equal(classifyIntent('bottom rated games').intent, INTENTS.LOW_RATING_QUERY);
  });

  // ── LEADERBOARD_QUERY ─────────────────────────────────────────────────────

  test('list top-rated games → leaderboard_query / query', () => {
    const plan = classifyIntent('list top-rated games');
    assertPlan(plan, {
      intent:              INTENTS.LEADERBOARD_QUERY,
      mode:                MODES.QUERY,
      needsDatabase:       true,
      needsUserProfile:    false,
      needsRecommendation: false,
      needsValidation:     true,   // HIGH_RISK
      executionOrder:      ['query'],
      responseStyle:       'factual_list',
    });
  });

  test('show the leaderboard → leaderboard_query', () => {
    assert.equal(classifyIntent('show the leaderboard').intent, INTENTS.LEADERBOARD_QUERY);
  });

  test('highest rated games → leaderboard_query', () => {
    assert.equal(classifyIntent('highest rated games').intent, INTENTS.LEADERBOARD_QUERY);
  });

  test('best game on the platform → leaderboard_query', () => {
    assert.equal(classifyIntent('what is the best game').intent, INTENTS.LEADERBOARD_QUERY);
  });

  // ── COMMUNITY_SUMMARY ─────────────────────────────────────────────────────

  test('summarize community activity → community_summary / query', () => {
    const plan = classifyIntent('summarize community activity');
    assertPlan(plan, {
      intent:              INTENTS.COMMUNITY_SUMMARY,
      mode:                MODES.QUERY,
      needsDatabase:       true,
      needsUserProfile:    false,
      needsRecommendation: false,
      needsValidation:     true,   // HIGH_RISK
      executionOrder:      ['query'],
      responseStyle:       'factual_list',
    });
  });

  test('show trending games → community_summary', () => {
    assert.equal(classifyIntent('show trending games').intent, INTENTS.COMMUNITY_SUMMARY);
  });

  test('most liked games → community_summary', () => {
    assert.equal(classifyIntent('most liked games').intent, INTENTS.COMMUNITY_SUMMARY);
  });

  test('community picks → community_summary', () => {
    assert.equal(classifyIntent('community picks').intent, INTENTS.COMMUNITY_SUMMARY);
  });

  test('another batch → community_summary', () => {
    assert.equal(classifyIntent('show another batch').intent, INTENTS.COMMUNITY_SUMMARY);
  });

  test('换一批 → community_summary', () => {
    assert.equal(classifyIntent('换一批').intent, INTENTS.COMMUNITY_SUMMARY);
  });

  // ── PLATFORM_INVENTORY_QUERY has needsValidation false ───────────────────

  test('platform_inventory_query needsValidation is false (not high-risk)', () => {
    assert.equal(classifyIntent('list all games').needsValidation, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — Recommendation mode
// ─────────────────────────────────────────────────────────────────────────────
describe('classifyIntent — Recommendation mode', () => {

  const EXPECTED_REC_PLAN = {
    mode:                MODES.RECOMMENDATION,
    needsDatabase:       true,
    needsUserProfile:    true,
    needsRecommendation: true,
    needsValidation:     true,
    dataSources:         ['platform_posts', 'user_bookmarks', 'user_profile'],
    executionOrder:      ['retrieve_candidates', 'rank', 'answer'],
    responseStyle:       'personalized_recommendation',
  };

  // ── GAME_RECOMMENDATION ───────────────────────────────────────────────────

  test('recommend games for me → game_recommendation / recommendation', () => {
    const plan = classifyIntent('recommend games for me');
    assertPlan(plan, { intent: INTENTS.GAME_RECOMMENDATION, ...EXPECTED_REC_PLAN });
  });

  test('suggest something to play → game_recommendation', () => {
    assert.equal(classifyIntent('suggest something to play').intent, INTENTS.GAME_RECOMMENDATION);
  });

  test('what should I play next → game_recommendation', () => {
    assert.equal(classifyIntent('what should I play next').intent, INTENTS.GAME_RECOMMENDATION);
  });

  test('I like puzzle games → game_recommendation', () => {
    const plan = classifyIntent('I like puzzle games');
    assert.equal(plan.intent, INTENTS.GAME_RECOMMENDATION);
    assert.equal(plan.mode,   MODES.RECOMMENDATION);
  });

  test('games similar to Minecraft → game_recommendation', () => {
    assert.equal(classifyIntent('games similar to Minecraft').intent, INTENTS.GAME_RECOMMENDATION);
  });

  test('games like Dark Souls → game_recommendation', () => {
    assert.equal(classifyIntent('games like Dark Souls').intent, INTENTS.GAME_RECOMMENDATION);
  });

  test('find me some games to play → game_recommendation', () => {
    assert.equal(classifyIntent('find me some games to play').intent, INTENTS.GAME_RECOMMENDATION);
  });

  test('game recommendation plan has all required fields', () => {
    const plan = classifyIntent('recommend a game for me');
    assertPlan(plan, EXPECTED_REC_PLAN);
  });

  // ── BOOKMARK_ANALYSIS ─────────────────────────────────────────────────────

  test('recommend based on my bookmarks → bookmark_analysis / recommendation', () => {
    const plan = classifyIntent('recommend based on my bookmarks');
    assertPlan(plan, { intent: INTENTS.BOOKMARK_ANALYSIS, ...EXPECTED_REC_PLAN });
  });

  test('analyze my saved games → bookmark_analysis', () => {
    assert.equal(classifyIntent('analyze my saved games').intent, INTENTS.BOOKMARK_ANALYSIS);
  });

  test('what games have I saved → bookmark_analysis', () => {
    assert.equal(classifyIntent('what games have I saved').intent, INTENTS.BOOKMARK_ANALYSIS);
  });

  test('analyze my taste → bookmark_analysis', () => {
    assert.equal(classifyIntent('analyze my taste').intent, INTENTS.BOOKMARK_ANALYSIS);
  });

  test('bookmark list → bookmark_analysis', () => {
    assert.equal(classifyIntent('show my bookmark list').intent, INTENTS.BOOKMARK_ANALYSIS);
  });

  test('bookmark_analysis is recommendation mode (not query)', () => {
    assert.equal(classifyIntent('my bookmarks').mode, MODES.RECOMMENDATION);
  });

  test('analyze my taste and recommend a game → bookmark_analysis, not mixed', () => {
    const plan = classifyIntent('analyze my taste and recommend a game');
    assert.equal(plan.intent, INTENTS.BOOKMARK_ANALYSIS);
    assert.equal(plan.mode, MODES.RECOMMENDATION);
  });

  test('what is my game taste → bookmark_analysis', () => {
    const plan = classifyIntent('what is my game taste');
    assert.equal(plan.intent, INTENTS.BOOKMARK_ANALYSIS);
    assert.equal(plan.mode, MODES.RECOMMENDATION);
  });

  test('summarize my taste → bookmark_analysis', () => {
    const plan = classifyIntent('summarize my taste');
    assert.equal(plan.intent, INTENTS.BOOKMARK_ANALYSIS);
    assert.equal(plan.mode, MODES.RECOMMENDATION);
  });

  test('what kind of gamer am I → bookmark_analysis', () => {
    const plan = classifyIntent('what kind of gamer am I');
    assert.equal(plan.intent, INTENTS.BOOKMARK_ANALYSIS);
    assert.equal(plan.mode, MODES.RECOMMENDATION);
  });

  test('based on my bookmarks suggest a game → bookmark_analysis, not mixed', () => {
    const plan = classifyIntent('based on my bookmarks suggest a game');
    assert.equal(plan.intent, INTENTS.BOOKMARK_ANALYSIS);
    assert.equal(plan.mode, MODES.RECOMMENDATION);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 — Mixed mode
// ─────────────────────────────────────────────────────────────────────────────
describe('classifyIntent — Mixed mode', () => {

  const EXPECTED_MIXED_PLAN = {
    intent:              INTENTS.MIXED_QUERY_RECOMMENDATION,
    mode:                MODES.MIXED,
    needsDatabase:       true,
    needsUserProfile:    true,
    needsRecommendation: true,
    needsValidation:     true,
    dataSources:         ['platform_posts', 'community_signals', 'user_bookmarks', 'user_profile'],
    executionOrder:      ['query_first', 'recommend_second'],
    responseStyle:       'facts_then_recommendation',
  };

  test('show trending games and recommend one for me → mixed', () => {
    assertPlan(classifyIntent('Show trending games and recommend one for me'), EXPECTED_MIXED_PLAN);
  });

  test('find top-rated games and suggest one based on my bookmarks → mixed', () => {
    assertPlan(
      classifyIntent('Find top-rated games and suggest one based on my bookmarks'),
      EXPECTED_MIXED_PLAN,
    );
  });

  test('list popular games and tell me which one I should play → mixed', () => {
    assertPlan(classifyIntent('List popular games and tell me which one I should play'), EXPECTED_MIXED_PLAN);
  });

  test('find low-rated games and suggest something better for me → mixed', () => {
    assertPlan(classifyIntent('find low-rated games and suggest something better for me'), EXPECTED_MIXED_PLAN);
  });

  test('show community favorites and recommend one based on my taste → mixed', () => {
    assertPlan(
      classifyIntent('show community favorites and recommend one based on my taste'),
      EXPECTED_MIXED_PLAN,
    );
  });

  test('analyze community trends and suggest a game for me → mixed', () => {
    assertPlan(classifyIntent('analyze community trends and suggest a game for me'), EXPECTED_MIXED_PLAN);
  });

  test('mixed confidence is signal_match', () => {
    const plan = classifyIntent('show popular games and recommend one for me');
    assert.equal(plan.confidence, 'signal_match');
  });

  test('mixed needsDatabase is true', () => {
    assert.equal(classifyIntent('list trending games and suggest one for me').needsDatabase, true);
  });

  test('mixed needsUserProfile is true', () => {
    assert.equal(classifyIntent('show top-rated games and recommend based on my preference').needsUserProfile, true);
  });

  test('mixed executionOrder runs query first', () => {
    const plan = classifyIntent('show trending and recommend for me');
    assert.equal(plan.executionOrder[0], 'query_first');
    assert.equal(plan.executionOrder[1], 'recommend_second');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 — General Chat mode
// ─────────────────────────────────────────────────────────────────────────────
describe('classifyIntent — General Chat mode', () => {

  const EXPECTED_CHAT_PLAN = {
    intent:              INTENTS.GENERAL_CHAT,
    mode:                MODES.GENERAL_CHAT,
    needsDatabase:       false,
    needsUserProfile:    false,
    needsRecommendation: false,
    needsValidation:     false,
    dataSources:         [],
    executionOrder:      ['short_guidance'],
    responseStyle:       'general_guidance',
  };

  test('"Hello" → general_chat, needsDatabase false', () => {
    assertPlan(classifyIntent('Hello'), EXPECTED_CHAT_PLAN);
  });

  test('"hi" → general_chat', () => {
    assertPlan(classifyIntent('hi'), EXPECTED_CHAT_PLAN);
  });

  test('"hey!" → general_chat', () => {
    assertPlan(classifyIntent('hey!'), EXPECTED_CHAT_PLAN);
  });

  test('"Thanks" → general_chat', () => {
    assertPlan(classifyIntent('Thanks'), EXPECTED_CHAT_PLAN);
  });

  test('"thank you" → general_chat', () => {
    assertPlan(classifyIntent('thank you'), EXPECTED_CHAT_PLAN);
  });

  test('"help" → general_chat', () => {
    assertPlan(classifyIntent('help'), EXPECTED_CHAT_PLAN);
  });

  test('"What can you do?" → general_chat', () => {
    assertPlan(classifyIntent('What can you do?'), EXPECTED_CHAT_PLAN);
  });

  test('"How does Nova work?" → general_chat', () => {
    assertPlan(classifyIntent('How does Nova work?'), EXPECTED_CHAT_PLAN);
  });

  test('"What can I ask you?" → general_chat', () => {
    assertPlan(classifyIntent('What can I ask you?'), EXPECTED_CHAT_PLAN);
  });

  test('"Tell me about this platform." → general_chat', () => {
    assertPlan(classifyIntent('Tell me about this platform.'), EXPECTED_CHAT_PLAN);
  });

  test('unrecognised message falls back to general_chat', () => {
    const plan = classifyIntent('blah blah xyz 12345');
    assertPlan(plan, EXPECTED_CHAT_PLAN);
  });

  test('fallback confidence is default', () => {
    assert.equal(classifyIntent('some random unknown message').confidence, 'default');
  });

  test('general_chat needsDatabase is false (never queries MongoDB)', () => {
    assert.equal(classifyIntent('hi there').needsDatabase, false);
  });

  test('empty string falls back to general_chat', () => {
    assertPlan(classifyIntent(''), EXPECTED_CHAT_PLAN);
  });

  test('null input falls back to general_chat', () => {
    assertPlan(classifyIntent(null), EXPECTED_CHAT_PLAN);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5 — Chinese routing coverage
// ─────────────────────────────────────────────────────────────────────────────
describe('classifyIntent — Chinese intent coverage', () => {
  test('查看社区的高分评价游戏 → leaderboard_query', () => {
    const plan = classifyIntent('查看社区的高分评价游戏');
    assert.equal(plan.intent, INTENTS.LEADERBOARD_QUERY);
    assert.equal(plan.mode, MODES.QUERY);
    assert.equal(plan.needsDatabase, true);
  });

  test('查看社区低分游戏 → low_rating_query', () => {
    const plan = classifyIntent('查看社区低分游戏');
    assert.equal(plan.intent, INTENTS.LOW_RATING_QUERY);
    assert.equal(plan.mode, MODES.QUERY);
    assert.equal(plan.needsDatabase, true);
  });

  test('总结社区热门趋势 → community_summary', () => {
    const plan = classifyIntent('总结社区热门趋势');
    assert.equal(plan.intent, INTENTS.COMMUNITY_SUMMARY);
    assert.equal(plan.mode, MODES.QUERY);
  });

  test('推荐三款适合我的游戏 → game_recommendation', () => {
    const plan = classifyIntent('推荐三款适合我的游戏');
    assert.equal(plan.intent, INTENTS.GAME_RECOMMENDATION);
    assert.equal(plan.mode, MODES.RECOMMENDATION);
  });

  test('根据我的收藏推荐游戏 → bookmark_analysis', () => {
    const plan = classifyIntent('根据我的收藏推荐游戏');
    assert.equal(plan.intent, INTENTS.BOOKMARK_ANALYSIS);
    assert.equal(plan.mode, MODES.RECOMMENDATION);
  });

  test('查看我的收藏夹推荐 → bookmark_analysis, not mixed', () => {
    const plan = classifyIntent('查看我的收藏夹推荐');
    assert.equal(plan.intent, INTENTS.BOOKMARK_ANALYSIS);
    assert.equal(plan.mode, MODES.RECOMMENDATION);
  });

  test('我的游戏品味如何 → bookmark_analysis', () => {
    const plan = classifyIntent('我的游戏品味如何');
    assert.equal(plan.intent, INTENTS.BOOKMARK_ANALYSIS);
    assert.equal(plan.mode, MODES.RECOMMENDATION);
  });

  test('我的品味如何 → bookmark_analysis', () => {
    const plan = classifyIntent('我的品味如何');
    assert.equal(plan.intent, INTENTS.BOOKMARK_ANALYSIS);
    assert.equal(plan.mode, MODES.RECOMMENDATION);
  });

  test('我是怎样的玩家 → bookmark_analysis', () => {
    const plan = classifyIntent('我是怎样的玩家');
    assert.equal(plan.intent, INTENTS.BOOKMARK_ANALYSIS);
    assert.equal(plan.mode, MODES.RECOMMENDATION);
  });

  test('我的口味如何 → bookmark_analysis', () => {
    const plan = classifyIntent('我的口味如何');
    assert.equal(plan.intent, INTENTS.BOOKMARK_ANALYSIS);
    assert.equal(plan.mode, MODES.RECOMMENDATION);
  });

  test('我适合什么类型游戏 → bookmark_analysis', () => {
    const plan = classifyIntent('我适合什么类型游戏');
    assert.equal(plan.intent, INTENTS.BOOKMARK_ANALYSIS);
    assert.equal(plan.mode, MODES.RECOMMENDATION);
  });

  test('分析我的游戏品味 → bookmark_analysis', () => {
    const plan = classifyIntent('分析我的游戏品味');
    assert.equal(plan.intent, INTENTS.BOOKMARK_ANALYSIS);
    assert.equal(plan.mode, MODES.RECOMMENDATION);
  });

  test('查看热门游戏并推荐一个给我 → mixed_query_recommendation', () => {
    const plan = classifyIntent('查看热门游戏并推荐一个给我');
    assert.equal(plan.intent, INTENTS.MIXED_QUERY_RECOMMENDATION);
    assert.equal(plan.mode, MODES.MIXED);
  });

  test('列出平台所有游戏 → platform_inventory_query', () => {
    const plan = classifyIntent('列出平台所有游戏');
    assert.equal(plan.intent, INTENTS.PLATFORM_INVENTORY_QUERY);
    assert.equal(plan.mode, MODES.QUERY);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5 — Misclassification prevention
// ─────────────────────────────────────────────────────────────────────────────
describe('classifyIntent — Misclassification prevention', () => {

  // Platform inventory queries must not be classified as recommendations.
  test('"find all games on the platform" → NOT game_recommendation', () => {
    const plan = classifyIntent('find all games on the platform');
    assert.notEqual(plan.intent, INTENTS.GAME_RECOMMENDATION);
    assert.equal(plan.intent, INTENTS.PLATFORM_INVENTORY_QUERY);
  });

  test('"show every game available" → platform_inventory_query, not recommendation', () => {
    const plan = classifyIntent('show every game available');
    assert.equal(plan.intent, INTENTS.PLATFORM_INVENTORY_QUERY);
    assert.equal(plan.mode,   MODES.QUERY);
  });

  test('"list all available titles on the platform" → platform_inventory_query', () => {
    assert.equal(
      classifyIntent('list all available titles on the platform').intent,
      INTENTS.PLATFORM_INVENTORY_QUERY,
    );
  });

  // Bookmark queries must be recommendation mode, not query mode.
  test('"my bookmark list" → RECOMMENDATION mode, not QUERY', () => {
    assert.equal(classifyIntent('my bookmark list').mode, MODES.RECOMMENDATION);
  });

  // Leaderboard query must not trigger recommendation mode.
  test('"top-rated games" alone → leaderboard_query, not recommendation', () => {
    const plan = classifyIntent('top-rated games');
    assert.equal(plan.intent, INTENTS.LEADERBOARD_QUERY);
    assert.equal(plan.mode,   MODES.QUERY);
    assert.equal(plan.needsRecommendation, false);
  });

  // Trending alone must not trigger recommendation mode.
  test('"trending games" alone → community_summary, not recommendation', () => {
    const plan = classifyIntent('trending games');
    assert.equal(plan.intent, INTENTS.COMMUNITY_SUMMARY);
    assert.equal(plan.mode,   MODES.QUERY);
    assert.equal(plan.needsRecommendation, false);
  });

  // "recommend" alone must not trigger a query (no database-only path).
  test('"recommend me a game" → recommendation, needsUserProfile true', () => {
    const plan = classifyIntent('recommend me a game');
    assert.equal(plan.mode,            MODES.RECOMMENDATION);
    assert.equal(plan.needsUserProfile, true);
  });

  // Mixed must win over pure query when both signals are present.
  test('"show popular games and recommend for me" → mixed, not community_summary', () => {
    const plan = classifyIntent('show popular games and recommend for me');
    assert.equal(plan.mode,   MODES.MIXED);
    assert.equal(plan.intent, INTENTS.MIXED_QUERY_RECOMMENDATION);
  });

  // Mixed must win over pure recommendation when both signals are present.
  test('"find top-rated and suggest one for me" → mixed, not game_recommendation', () => {
    const plan = classifyIntent('find top-rated and suggest one for me');
    assert.equal(plan.mode,   MODES.MIXED);
    assert.equal(plan.intent, INTENTS.MIXED_QUERY_RECOMMENDATION);
  });

  // "find me games to play" must be recommendation, not platform inventory.
  test('"find me games to play" → game_recommendation, not platform_inventory_query', () => {
    const plan = classifyIntent('find me games to play');
    assert.equal(plan.intent, INTENTS.GAME_RECOMMENDATION);
    assert.notEqual(plan.intent, INTENTS.PLATFORM_INVENTORY_QUERY);
  });

  // General chat must not reach the database even if "game" is mentioned.
  test('"what can you do with games?" → general_chat, needsDatabase false', () => {
    const plan = classifyIntent('what can you do with games?');
    assert.equal(plan.mode,         MODES.GENERAL_CHAT);
    assert.equal(plan.needsDatabase, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 6 — Backward compatibility
// ─────────────────────────────────────────────────────────────────────────────
describe('classifyIntent — Backward compatibility', () => {

  test('always returns an intent field', () => {
    const messages = [
      'recommend a game',
      'show all games',
      'hello',
      'show trending and recommend for me',
      'unknown message xyz',
    ];
    for (const msg of messages) {
      const plan = classifyIntent(msg);
      assert.ok(plan.intent, `Expected intent field for message: "${msg}"`);
    }
  });

  test('always returns a confidence field', () => {
    const plan = classifyIntent('recommend games like Zelda');
    assert.ok(['pattern_match', 'signal_match', 'default'].includes(plan.confidence));
  });

  test('pattern_match confidence for recognised single-intent', () => {
    assert.equal(classifyIntent('recommend a game').confidence, 'pattern_match');
  });

  test('signal_match confidence for mixed intent', () => {
    assert.equal(classifyIntent('list popular games and recommend for me').confidence, 'signal_match');
  });

  test('default confidence for unrecognised input', () => {
    assert.equal(classifyIntent('xyzzy frobble wibble').confidence, 'default');
  });
});
