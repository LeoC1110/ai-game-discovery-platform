// packages/auth-service/ai/__tests__/routerAgent.test.js
// Isolated unit tests for classifyIntent() and extractEntitiesAndConstraints() in routerAgent.js
//
// No MongoDB, no Gemini, no aiPipeline, no AnswerAgent, no ValidatorAgent.
// Both functions are pure — tests are fully synchronous.
//
// Run with:
//   node --test ai/__tests__/routerAgent.test.js
// Or via workspace test script:
//   npm test

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  classifyIntent,
  extractEntitiesAndConstraints,
  LAYER1_BEHAVIORS,
  LAYER2_INTENTS,
  MODES,
} from "../routerAgent.js";

// ── Test Helpers ──────────────────────────────────────────────────────────────

function assertContainsAll(arr, expected) {
  for (const item of expected) {
    assert.ok(arr.includes(item), `Expected array to contain ${item}, but got ${JSON.stringify(arr)}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — extractEntitiesAndConstraints
// ─────────────────────────────────────────────────────────────────────────────

describe("extractEntitiesAndConstraints", () => {
  describe("Game extraction", () => {
    test('extracts quoted titles: "Portal 2"', () => {
      const result = extractEntitiesAndConstraints('I love "Portal 2"');
      assert.ok(result.entities.games.includes("Portal 2"));
    });

    test("extracts games from 'games like X' phrasing", () => {
      const result = extractEntitiesAndConstraints("find games like Stardew Valley");
      assert.ok(result.entities.games.includes("Stardew Valley"));
    });

    test("extracts games from comparison 'X or Y'", () => {
      const result = extractEntitiesAndConstraints("should I play Elden Ring or Sekiro");
      assertContainsAll(result.entities.games, ["Elden Ring", "Sekiro"]);
    });

    test("filters out generic phrases", () => {
      const result = extractEntitiesAndConstraints("what games are good");
      assert.ok(!result.entities.games.includes("game"));
      assert.ok(!result.entities.games.includes("games"));
    });

    test("handles empty message gracefully", () => {
      const result = extractEntitiesAndConstraints("");
      assert.equal(result.entities.games.length, 0);
    });
  });

  describe("Platform detection", () => {
    test("detects PC platform", () => {
      const result = extractEntitiesAndConstraints("Can I play this on PC?");
      assert.ok(result.entities.platforms.includes("pc"));
    });

    test("detects Switch platform", () => {
      const result = extractEntitiesAndConstraints("Is this on Switch?");
      assert.ok(result.entities.platforms.includes("switch"));
    });

    test("detects PlayStation", () => {
      const result = extractEntitiesAndConstraints("does this run on PS5?");
      assert.ok(result.entities.platforms.includes("playstation"));
    });

    test("detects mobile platform", () => {
      const result = extractEntitiesAndConstraints("Looking for iOS games");
      assert.ok(result.entities.platforms.includes("mobile"));
    });
  });

  describe("Genre detection", () => {
    test("detects horror", () => {
      const result = extractEntitiesAndConstraints("Recommend me a horror game");
      assert.ok(result.entities.genres.includes("horror"));
    });

    test("detects RPG", () => {
      const result = extractEntitiesAndConstraints("I love RPGs");
      assert.ok(result.entities.genres.includes("rpg"));
    });

    test("detects open_world", () => {
      const result = extractEntitiesAndConstraints("Find me open-world games");
      assert.ok(result.entities.genres.includes("open_world"));
    });

    test("detects story_driven", () => {
      const result = extractEntitiesAndConstraints("I prefer story-driven narratives");
      assert.ok(result.entities.genres.includes("story_driven"));
    });

    test("detects multiplayer", () => {
      const result = extractEntitiesAndConstraints("Looking for co-op games");
      assert.ok(result.entities.genres.includes("multiplayer"));
    });
  });

  describe("Constraint extraction", () => {
    test("extracts hardware: low_end_pc", () => {
      const result = extractEntitiesAndConstraints("Can run on low-end PC?");
      assert.equal(result.constraints.hardware, "low_end_pc");
    });

    test("extracts hardware: high_end_pc", () => {
      const result = extractEntitiesAndConstraints("high-end PC gaming");
      assert.equal(result.constraints.hardware, "high_end_pc");
    });

    test("extracts playStyle: co_op", () => {
      const result = extractEntitiesAndConstraints("Looking for co-op games");
      assert.equal(result.constraints.playStyle, "co_op");
    });

    test("extracts playStyle: multiplayer", () => {
      const result = extractEntitiesAndConstraints("multiplayer experience");
      assert.equal(result.constraints.playStyle, "multiplayer");
    });

    test("extracts playStyle: story_driven", () => {
      const result = extractEntitiesAndConstraints("story-driven gameplay");
      assert.equal(result.constraints.playStyle, "story_driven");
    });

    test("extracts playStyle: open_world", () => {
      const result = extractEntitiesAndConstraints("open-world adventures");
      assert.equal(result.constraints.playStyle, "open_world");
    });

    test("extracts difficulty: beginner_friendly", () => {
      const result = extractEntitiesAndConstraints("beginner-friendly games");
      assert.equal(result.constraints.difficulty, "beginner_friendly");
    });

    test("extracts difficulty: challenging", () => {
      const result = extractEntitiesAndConstraints("I like challenging games");
      assert.equal(result.constraints.difficulty, "challenging");
    });

    test("extracts sessionLength: short_session", () => {
      const result = extractEntitiesAndConstraints("short games to finish quickly");
      assert.equal(result.constraints.sessionLength, "short_session");
    });

    test("extracts sessionLength: weekend_session", () => {
      const result = extractEntitiesAndConstraints("games for the weekend");
      assert.equal(result.constraints.sessionLength, "weekend_session");
    });

    test("extracts sessionLength: long_session", () => {
      const result = extractEntitiesAndConstraints("long games with hundreds of hours");
      assert.equal(result.constraints.sessionLength, "long_session");
    });

    test("extracts mood: relaxing", () => {
      const result = extractEntitiesAndConstraints("relaxing, cozy games");
      assert.equal(result.constraints.mood, "relaxing");
    });

    test("extracts mood: emotional", () => {
      const result = extractEntitiesAndConstraints("touching, emotional story");
      assert.equal(result.constraints.mood, "emotional");
    });
  });

  describe("Feedback constraints", () => {
    test("detects feedbackDirection: more_like_this", () => {
      const result = extractEntitiesAndConstraints("more like this RPG");
      assert.equal(result.constraints.feedbackDirection, "more_like_this");
    });

    test("detects feedbackDirection: less_like_this", () => {
      const result = extractEntitiesAndConstraints("less like this, fewer puzzles");
      assert.equal(result.constraints.feedbackDirection, "less_like_this");
    });

    test("detects feedbackDirection: not_for_me", () => {
      const result = extractEntitiesAndConstraints("This is not for me");
      assert.equal(result.constraints.feedbackDirection, "not_for_me");
    });

    test("tracks excluded genres", () => {
      const result = extractEntitiesAndConstraints("I dislike horror games and puzzles");
      assertContainsAll(result.constraints.excludedGenres, ["horror", "puzzle"]);
    });

    test("tracks preferred genres", () => {
      const result = extractEntitiesAndConstraints("I prefer RPGs and strategy games");
      assertContainsAll(result.constraints.preferredGenres, ["rpg", "strategy"]);
    });
  });

  describe("Return structure", () => {
    test("always returns entities object with required fields", () => {
      const result = extractEntitiesAndConstraints("test message");
      assert.ok(result.entities);
      assert.ok(Array.isArray(result.entities.games));
      assert.ok(Array.isArray(result.entities.genres));
      assert.ok(Array.isArray(result.entities.platforms));
      assert.ok(Array.isArray(result.entities.tags));
      assert.ok(Array.isArray(result.entities.actions));
    });

    test("always returns constraints object with all fields", () => {
      const result = extractEntitiesAndConstraints("test message");
      assert.ok(result.constraints);
      assert.ok(result.constraints.hasOwnProperty("mood"));
      assert.ok(result.constraints.hasOwnProperty("hardware"));
      assert.ok(result.constraints.hasOwnProperty("platform"));
      assert.ok(result.constraints.hasOwnProperty("playStyle"));
      assert.ok(result.constraints.hasOwnProperty("difficulty"));
      assert.ok(result.constraints.hasOwnProperty("sessionLength"));
      assert.ok(result.constraints.hasOwnProperty("feedbackDirection"));
      assert.ok(result.constraints.hasOwnProperty("excludedGenres"));
      assert.ok(result.constraints.hasOwnProperty("preferredGenres"));
      assert.ok(result.constraints.hasOwnProperty("excludedTags"));
      assert.ok(result.constraints.hasOwnProperty("preferredTags"));
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — classifyIntent Layer 1 behavior detection
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyIntent — Layer 1 behavior detection", () => {
  test("detects DISCOVERY", () => {
    const result = classifyIntent("show me some games");
    assert.ok(result.layer1Behaviors.includes(LAYER1_BEHAVIORS.DISCOVERY));
  });

  test("detects RANKING", () => {
    const result = classifyIntent("What are the trending games?");
    assert.ok(result.layer1Behaviors.includes(LAYER1_BEHAVIORS.RANKING));
  });

  test("detects RECOMMENDATION", () => {
    const result = classifyIntent("Can you recommend a game?");
    assert.ok(result.layer1Behaviors.includes(LAYER1_BEHAVIORS.RECOMMENDATION));
  });

  test("detects PERSONALIZATION", () => {
    const result = classifyIntent("What games match my taste?");
    assert.ok(result.layer1Behaviors.includes(LAYER1_BEHAVIORS.PERSONALIZATION));
  });

  test("detects ACTION_ENGAGEMENT", () => {
    const result = classifyIntent("Save this game to my bookmarks");
    assert.ok(result.layer1Behaviors.includes(LAYER1_BEHAVIORS.ACTION_ENGAGEMENT));
  });

  test("detects GENERAL_CHAT for greeting", () => {
    const result = classifyIntent("Hello!");
    assert.ok(result.layer1Behaviors.includes(LAYER1_BEHAVIORS.GENERAL_CHAT));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 — classifyIntent Layer 2 intent detection
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyIntent — Layer 2 intent detection", () => {
  test("detects CONTEXT_BASED_RECOMMENDATION", () => {
    const result = classifyIntent("Recommend relaxing games for the weekend");
    assert.equal(result.layer2Intent, LAYER2_INTENTS.CONTEXT_BASED_RECOMMENDATION);
  });

  test("detects SIMILAR_GAME_DISCOVERY", () => {
    const result = classifyIntent("Games like Elden Ring");
    assert.equal(result.layer2Intent, LAYER2_INTENTS.SIMILAR_GAME_DISCOVERY);
  });

  test("detects COMPARE_GAMES", () => {
    const result = classifyIntent("Which is better: Elden Ring or Sekiro?");
    assert.equal(result.layer2Intent, LAYER2_INTENTS.COMPARE_GAMES);
  });

  test("detects RECOMMENDATION_EXPLANATION", () => {
    const result = classifyIntent("Why did you recommend this game?");
    assert.equal(result.layer2Intent, LAYER2_INTENTS.RECOMMENDATION_EXPLANATION);
  });

  test("detects TASTE_PROFILE_ANALYSIS", () => {
    const result = classifyIntent("Analyze my bookmarks and summarize my taste");
    assert.equal(result.layer2Intent, LAYER2_INTENTS.TASTE_PROFILE_ANALYSIS);
  });

  test("detects GAME_DETAIL_QUERY", () => {
    const result = classifyIntent("Tell me about this game");
    assert.equal(result.layer2Intent, LAYER2_INTENTS.GAME_DETAIL_QUERY);
  });

  test("detects FOLLOW_UP_ACTION", () => {
    const result = classifyIntent("Bookmark this game");
    assert.equal(result.layer2Intent, LAYER2_INTENTS.FOLLOW_UP_ACTION);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 — classifyIntent mode resolution
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyIntent — mode resolution", () => {
  test("resolves GENERAL_CHAT mode for greeting", () => {
    const result = classifyIntent("Hi there!");
    assert.equal(result.mode, MODES.GENERAL_CHAT);
  });

  test("resolves DISCOVERY mode", () => {
    const result = classifyIntent("Show me games");
    assert.equal(result.mode, MODES.DISCOVERY);
  });

  test("resolves RECOMMENDATION mode", () => {
    const result = classifyIntent("Recommend me a game");
    assert.equal(result.mode, MODES.RECOMMENDATION);
  });

  test("resolves RANKING mode", () => {
    const result = classifyIntent("Show top-rated games");
    assert.equal(result.mode, MODES.RANKING);
  });

  test("resolves mode based on primary behavior (even with multiple behaviors detected)", () => {
    const result = classifyIntent("Show trending games and recommend one for me");
    // Multiple behaviors (RANKING, RECOMMENDATION, DISCOVERY, PERSONALIZATION) are detected,
    // but mode follows primaryBehavior (PERSONALIZATION based on priority)
    assert.equal(result.mode, MODES.PERSONALIZATION);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5 — classifyIntent confidence levels
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyIntent — confidence levels", () => {
  test("returns default confidence for empty message", () => {
    const result = classifyIntent("");
    assert.equal(result.confidence, "default");
  });

  test("returns pattern_match confidence for Layer 1 detection", () => {
    const result = classifyIntent("Show me games");
    assert.equal(result.confidence, "pattern_match");
  });

  test("returns layer2_match confidence when Layer 2 intent detected", () => {
    const result = classifyIntent("Games like Stardew Valley");
    assert.equal(result.confidence, "layer2_match");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 6 — classifyIntent extracted entities and constraints
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyIntent — extracted entities and constraints", () => {
  test("includes extracted entities in result", () => {
    const result = classifyIntent('Recommend games like "Portal 2" for PC');
    assert.ok(result.entities.games.includes("Portal 2"));
    assert.ok(result.entities.platforms.includes("pc"));
  });

  test("includes extracted constraints in result", () => {
    const result = classifyIntent("short, beginner-friendly PC games for the weekend");
    assert.equal(result.constraints.difficulty, "beginner_friendly");
    assert.equal(result.constraints.sessionLength, "weekend_session");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 7 — classifyIntent edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyIntent — edge cases", () => {
  test("handles null message gracefully", () => {
    const result = classifyIntent(null);
    assert.ok(result.layer1Behaviors.includes(LAYER1_BEHAVIORS.GENERAL_CHAT));
  });

  test("handles whitespace-only message", () => {
    const result = classifyIntent("   ");
    assert.ok(result.layer1Behaviors.includes(LAYER1_BEHAVIORS.GENERAL_CHAT));
  });

  test("handles unrecognized message", () => {
    const result = classifyIntent("xyz abc 123 !@#$%");
    assert.ok(result.layer1Behaviors.includes(LAYER1_BEHAVIORS.GENERAL_CHAT));
    assert.equal(result.confidence, "default");
  });

  test("case-insensitive matching", () => {
    const result1 = classifyIntent("SHOW ME GAMES");
    const result2 = classifyIntent("show me games");
    assert.deepEqual(result1.layer1Behaviors, result2.layer1Behaviors);
  });

  test("handles Chinese language input", () => {
    const result = classifyIntent("推荐一些放松的游戏");
    assert.ok(result.layer1Behaviors.includes(LAYER1_BEHAVIORS.RECOMMENDATION));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 8 — classifyIntent return structure validation
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyIntent — return structure validation", () => {
  test("returns all required fields", () => {
    const result = classifyIntent("Recommend a game");
    const requiredFields = [
      "routerVersion",
      "layer1Behaviors",
      "primaryBehavior",
      "layer2Intent",
      "mode",
      "confidence",
      "needsDatabase",
      "needsUserProfile",
      "needsRecommendation",
      "needsValidation",
      "needsAction",
      "dataSources",
      "executionOrder",
      "responseStyle",
      "entities",
      "constraints",
    ];
    for (const field of requiredFields) {
      assert.ok(result.hasOwnProperty(field), `Missing field: ${field}`);
    }
  });

  test("entities object has correct structure", () => {
    const result = classifyIntent("Recommend RPG games");
    assert.ok(Array.isArray(result.entities.games));
    assert.ok(Array.isArray(result.entities.genres));
    assert.ok(Array.isArray(result.entities.platforms));
    assert.ok(Array.isArray(result.entities.tags));
    assert.ok(Array.isArray(result.entities.actions));
  });

  test("constraints object has correct structure", () => {
    const result = classifyIntent("short PC games");
    assert.ok(result.constraints.hasOwnProperty("mood"));
    assert.ok(result.constraints.hasOwnProperty("hardware"));
    assert.ok(result.constraints.hasOwnProperty("platform"));
    assert.ok(result.constraints.hasOwnProperty("playStyle"));
    assert.ok(result.constraints.hasOwnProperty("difficulty"));
    assert.ok(result.constraints.hasOwnProperty("sessionLength"));
    assert.ok(result.constraints.hasOwnProperty("feedbackDirection"));
    assert.ok(Array.isArray(result.constraints.excludedGenres));
    assert.ok(Array.isArray(result.constraints.preferredGenres));
    assert.ok(Array.isArray(result.constraints.excludedTags));
    assert.ok(Array.isArray(result.constraints.preferredTags));
  });

  test("dataSources is always an array", () => {
    const result = classifyIntent("Recommend me a game");
    assert.ok(Array.isArray(result.dataSources));
  });

  test("executionOrder is always an array", () => {
    const result = classifyIntent("Show me games");
    assert.ok(Array.isArray(result.executionOrder));
  });
});
