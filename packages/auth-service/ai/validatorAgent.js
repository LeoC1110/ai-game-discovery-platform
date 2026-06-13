// packages/auth-service/ai/validatorAgent.js
// Validator Agent
//
// Purpose:
// - Validate Nova answers before returning them to the user.
// - Protect against hallucinated recommendation cards.
// - Ensure machine-readable RECOMMENDATIONS blocks are valid.
// - Ensure recommendation titles come from Platform Data.
// - Keep legacy intent validation behavior.
// - Support the new routerAgent plan fields:
//   layer2Intent, entities, constraints, needsValidation.
//
// Design:
// - Rule-based
// - No LLM call
// - No database call
// - Safe to unit test in isolation

import { INTENTS, LAYER2_INTENTS } from './routerAgent.js';

// ── Constants ────────────────────────────────────────────────────────────────

const RECOMMENDATION_BLOCK_RE = /<!--RECOMMENDATIONS:(.*?)-->/s;

const SEVERITY_RANK = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

const VALIDATION_INTENTS = new Set([
  INTENTS.GAME_RECOMMENDATION,
  INTENTS.BOOKMARK_ANALYSIS,
  INTENTS.MIXED_QUERY_RECOMMENDATION,
  INTENTS.COMMUNITY_SUMMARY,
  INTENTS.LEADERBOARD_QUERY,
  INTENTS.LOW_RATING_QUERY,
  INTENTS.PLATFORM_INVENTORY_QUERY,
]);

const COMMUNITY_INTENTS = new Set([
  INTENTS.COMMUNITY_SUMMARY,
  INTENTS.LEADERBOARD_QUERY,
  INTENTS.LOW_RATING_QUERY,
]);

const PERSONALIZED_WORDING_PATTERNS = [
  /\bbased\s+on\s+your\s+(taste|bookmarks?|saved\s+games?|preferences?|profile)\b/i,
  /\byour\s+(taste|bookmarks?|saved\s+games?|preferences?|profile)\b/i,
  /\b(matches|fits)\s+your\s+(taste|preference|interest|style)\b/i,
  /\bfor\s+you\b/i,
  /\byou\s+(might|may|would)\s+(like|enjoy|prefer)\b/i,
];

const UNSUPPORTED_EMPTY_PLATFORM_PATTERNS = [
  /\b(no|zero)\s+games?\s+(are\s+)?(currently\s+)?(listed|available|found)\b/i,
  /\bthere\s+are\s+no\s+games?\b/i,
  /\bthe\s+(platform|database)\s+is\s+empty\b/i,
  /\bno\s+games?\s+currently\s+listed\s+on\s+the\s+platform\b/i,
  /平台.*(没有|暂无).*游戏/,
  /(数据库|平台).*空/,
];

// ── Generic helpers ──────────────────────────────────────────────────────────

function normalizeText(value) {
  return String(value ?? '').toLowerCase().trim();
}

function normalizeToken(value) {
  return normalizeText(value)
    .replace(/_/g, ' ')
    .replace(/[-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function uniqueList(values) {
  return [...new Set(values.filter(Boolean))];
}

function includesNormalizedText(haystack, needle) {
  const h = normalizeToken(haystack);
  const n = normalizeToken(needle);
  return Boolean(n) && h.includes(n);
}

function maxSeverity(current, next) {
  return SEVERITY_RANK[next] > SEVERITY_RANK[current] ? next : current;
}

function hasRecommendationBlock(answer) {
  return RECOMMENDATION_BLOCK_RE.test(String(answer ?? ''));
}

function getRecommendationBlockPayload(answer) {
  const match = String(answer ?? '').match(RECOMMENDATION_BLOCK_RE);
  return match?.[1] ?? null;
}

function hasPlatformData(platformData) {
  return typeof platformData === 'string' && platformData.trim().length > 0;
}

// ── Recommendation block parsing ─────────────────────────────────────────────

/**
 * Parse the JSON payload inside a RECOMMENDATIONS block.
 *
 * Expected input:
 * [{"title":"Portal 2","reason":"...","confidence":0.92,"matchedTags":["puzzle"]}]
 *
 * @param {string} payload
 * @returns {{
 *   ok: boolean,
 *   items: Array<{
 *     title: string,
 *     reason?: string,
 *     confidence?: number,
 *     matchedTags?: string[]
 *   }>,
 *   error?: string
 * }}
 */
function parseRecommendationBlock(payload) {
  try {
    const parsed = JSON.parse(String(payload ?? '').trim());

    if (!Array.isArray(parsed)) {
      return {
        ok: false,
        items: [],
        error: 'RECOMMENDATIONS block JSON must be a JSON array.',
      };
    }

    for (const item of parsed) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return {
          ok: false,
          items: [],
          error: 'Each RECOMMENDATIONS item must be an object.',
        };
      }

      if (typeof item.title !== 'string' || item.title.trim().length === 0) {
        return {
          ok: false,
          items: [],
          error: 'Each RECOMMENDATIONS item must include a non-empty title.',
        };
      }

      if (item.matchedTags !== undefined && !Array.isArray(item.matchedTags)) {
        return {
          ok: false,
          items: [],
          error:
            'Each RECOMMENDATIONS item matchedTags field must be an array when present.',
        };
      }

      if (
        item.confidence !== undefined &&
        (typeof item.confidence !== 'number' ||
          Number.isNaN(item.confidence) ||
          item.confidence < 0 ||
          item.confidence > 1)
      ) {
        return {
          ok: false,
          items: [],
          error:
            'Each RECOMMENDATIONS item confidence must be a number between 0 and 1.',
        };
      }
    }

    return {
      ok: true,
      items: parsed,
    };
  } catch (err) {
    return {
      ok: false,
      items: [],
      error: `Invalid RECOMMENDATIONS block JSON. ${err?.message ?? ''}`.trim(),
    };
  }
}

/**
 * Extract recommendation items from the full answer.
 *
 * @param {string} answer
 * @returns {{
 *   hasBlock: boolean,
 *   ok: boolean,
 *   items: Array<object>,
 *   error?: string
 * }}
 */
function extractRecommendedItems(answer) {
  const payload = getRecommendationBlockPayload(answer);

  if (!payload) {
    return {
      hasBlock: false,
      ok: true,
      items: [],
    };
  }

  const parsed = parseRecommendationBlock(payload);

  return {
    hasBlock: true,
    ok: parsed.ok,
    items: parsed.items,
    error: parsed.error,
  };
}

// ── Platform data title extraction ───────────────────────────────────────────

/**
 * Extract normalized game titles from Platform Data.
 *
 * Supported formats:
 * - Game: Portal 2
 * - Title: Stardew Valley
 * - 1. Hollow Knight
 * - {"title": "Celeste"}
 *
 * @param {string} platformData
 * @returns {string[]} normalized lowercase titles
 */
function extractPlatformTitles(platformData = '') {
  const text = String(platformData ?? '');
  if (!text.trim()) return [];

  const titles = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const gameMatch =
      line.match(/^Game:\s*(.+)$/i) || line.match(/^Title:\s*(.+)$/i);

    if (gameMatch?.[1]) {
      titles.push(normalizeToken(gameMatch[1]));
      continue;
    }

    const numberedMatch = line.match(/^\d+\.\s*(.+)$/);
    if (numberedMatch?.[1]) {
      titles.push(normalizeToken(numberedMatch[1]));
      continue;
    }

    const jsonTitleMatch = line.match(
      /["']title["']\s*:\s*["']([^"']+)["']/i
    );
    if (jsonTitleMatch?.[1]) {
      titles.push(normalizeToken(jsonTitleMatch[1]));
    }
  }

  return uniqueList(titles);
}

/**
 * Extract per-game records from Platform Data.
 *
 * Example:
 * Game: Portal 2
 * Platforms: PC, Switch
 * Tags: puzzle, co-op
 *
 * becomes:
 * {
 *   title: "Portal 2",
 *   raw: "Game: Portal 2\nPlatforms: PC, Switch\nTags: puzzle, co-op"
 * }
 *
 * @param {string} platformData
 * @returns {{ title: string, raw: string }[]}
 */
function extractPlatformGameRecords(platformData = '') {
  const text = String(platformData ?? '');
  if (!text.trim()) return [];

  const lines = text.split('\n');
  const records = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const gameMatch =
      line.match(/^Game:\s*(.+)$/i) ||
      line.match(/^Title:\s*(.+)$/i) ||
      line.match(/^\d+\.\s*(.+)$/);

    if (gameMatch?.[1]) {
      if (current) records.push(current);

      current = {
        title: gameMatch[1].trim(),
        raw: line,
      };
      continue;
    }

    if (current) {
      current.raw += `\n${line}`;
    }
  }

  if (current) records.push(current);

  return records;
}

function findPlatformRecordByTitle(platformData, title) {
  const normalizedTitle = normalizeToken(title);
  if (!normalizedTitle) return null;

  return (
    extractPlatformGameRecords(platformData).find(
      (record) => normalizeToken(record.title) === normalizedTitle
    ) ?? null
  );
}

// ── Validation requirement gate ──────────────────────────────────────────────

/**
 * Decide whether an answer should be validated.
 *
 * @param {{
 *   plan?: object | null,
 *   intent?: string,
 *   answer?: string,
 * }} params
 * @returns {boolean}
 */
export function shouldValidateAnswer({
  plan = null,
  intent,
  answer = '',
}) {
  const answerText = String(answer ?? '');
  const containsRecommendationBlock = hasRecommendationBlock(answerText);

  if (plan?.needsValidation === true) {
    return true;
  }

  if (plan?.needsValidation === false) {
    // Even if a route says validation is not needed, machine-readable cards
    // should still be checked if they exist.
    return containsRecommendationBlock;
  }

  if (containsRecommendationBlock) {
    return true;
  }

  return VALIDATION_INTENTS.has(intent);
}

// ── Legacy validation checks ─────────────────────────────────────────────────

function validateRecommendationBlockAndTitles({ answer, platformData }) {
  const flags = [];
  let severity = 'none';
  let invalidRecommendationJson = false;

  const extracted = extractRecommendedItems(answer);

  if (!extracted.hasBlock) {
    return {
      flags,
      severity,
      invalidRecommendationJson,
      recommendedItems: [],
    };
  }

  if (!extracted.ok) {
    flags.push(extracted.error ?? 'Invalid RECOMMENDATIONS block JSON.');
    severity = maxSeverity(severity, 'high');
    invalidRecommendationJson = true;

    return {
      flags,
      severity,
      invalidRecommendationJson,
      recommendedItems: [],
    };
  }

  const platformTitles = extractPlatformTitles(platformData);

  for (const item of extracted.items) {
    const normalizedTitle = normalizeToken(item.title);

    if (!platformTitles.includes(normalizedTitle)) {
      flags.push(
        `Recommendation block contains non-platform title: "${item.title}".`
      );
      severity = maxSeverity(severity, 'high');
    }
  }

  return {
    flags,
    severity,
    invalidRecommendationJson,
    recommendedItems: extracted.items,
  };
}

function validateCommunityPersonalizedWording({ answer, intent }) {
  const flags = [];
  let severity = 'none';

  if (!COMMUNITY_INTENTS.has(intent)) {
    return {
      flags,
      severity,
    };
  }

  const hasPersonalizedWording = PERSONALIZED_WORDING_PATTERNS.some((pattern) =>
    pattern.test(String(answer ?? ''))
  );

  if (hasPersonalizedWording) {
    flags.push(
      'Community/ranking answer contains personalized wording that is not appropriate for a platform-data query.'
    );
    severity = maxSeverity(severity, 'medium');
  }

  return {
    flags,
    severity,
  };
}

function validateUnsupportedEmptyPlatformClaim({ answer, platformData }) {
  const flags = [];
  let severity = 'none';

  if (hasPlatformData(platformData)) {
    return {
      flags,
      severity,
    };
  }

  const claimsEmptyPlatform = UNSUPPORTED_EMPTY_PLATFORM_PATTERNS.some(
    (pattern) => pattern.test(String(answer ?? ''))
  );

  if (claimsEmptyPlatform) {
    flags.push(
      'Unsupported claim that the platform/database is empty when platform data was not attached.'
    );
    severity = maxSeverity(severity, 'high');
  }

  return {
    flags,
    severity,
  };
}

// ── New router constraint validation ─────────────────────────────────────────

function validateRouterConstraints({
  answer,
  plan,
  platformData,
  recommendedItems = [],
}) {
  const flags = [];
  let severity = 'none';

  if (!plan) {
    return {
      flags,
      severity,
    };
  }

  const layer2Intent = plan.layer2Intent;
  const entities = plan.entities ?? {};
  const constraints = plan.constraints ?? {};

  const answerText = String(answer ?? '');

  const requestedPlatform = constraints.platform;
  const excludedGenres = asArray(constraints.excludedGenres);
  const preferredGenres = asArray(constraints.preferredGenres);
  const excludedTags = asArray(constraints.excludedTags);
  const preferredTags = asArray(constraints.preferredTags);
  const sessionLength = constraints.sessionLength;
  const referenceGames = asArray(entities.games);

  // 1. Platform constraint validation.
  //    Only enforce when:
  //    - user requested a platform
  //    - recommendation cards exist
  //    - platform data has per-game platform fields
  if (requestedPlatform && recommendedItems.length > 0) {
    for (const item of recommendedItems) {
      const record = findPlatformRecordByTitle(platformData, item.title);
      const raw = record?.raw ?? '';
      const hasPlatformField = /platforms?:/i.test(raw);

      if (
        hasPlatformField &&
        !includesNormalizedText(raw, requestedPlatform)
      ) {
        flags.push(
          `Platform constraint mismatch: "${item.title}" does not appear to support requested platform "${requestedPlatform}" in Platform Data.`
        );
        severity = maxSeverity(severity, 'high');
      }
    }
  }

  // 2. Excluded genre/tag validation.
  if (
    (excludedGenres.length > 0 || excludedTags.length > 0) &&
    recommendedItems.length > 0
  ) {
    for (const item of recommendedItems) {
      const record = findPlatformRecordByTitle(platformData, item.title);
      const evidence = [
        record?.raw ?? '',
        ...asArray(item.matchedTags),
        item.reason ?? '',
      ].join('\n');

      for (const genre of excludedGenres) {
        if (includesNormalizedText(evidence, genre)) {
          flags.push(
            `Excluded genre violation: "${item.title}" appears to match excluded genre "${genre}".`
          );
          severity = maxSeverity(severity, 'high');
        }
      }

      for (const tag of excludedTags) {
        if (includesNormalizedText(evidence, tag)) {
          flags.push(
            `Excluded tag violation: "${item.title}" appears to match excluded tag "${tag}".`
          );
          severity = maxSeverity(severity, 'high');
        }
      }
    }
  }

  // 3. Preferred genre/tag soft validation.
  //    This is medium severity because platform data may be sparse.
  if (
    (preferredGenres.length > 0 || preferredTags.length > 0) &&
    recommendedItems.length > 0
  ) {
    const combinedEvidence = recommendedItems
      .map((item) => {
        const record = findPlatformRecordByTitle(platformData, item.title);

        return [
          record?.raw ?? '',
          ...asArray(item.matchedTags),
          item.reason ?? '',
        ].join('\n');
      })
      .join('\n');

    const preferredSignals = [...preferredGenres, ...preferredTags];

    const hasPreferredMatch = preferredSignals.some((signal) =>
      includesNormalizedText(combinedEvidence, signal)
    );

    if (!hasPreferredMatch) {
      flags.push(
        `Preferred genre/tag not reflected: recommendations do not clearly match preferred signals "${preferredSignals.join(
          ', '
        )}".`
      );
      severity = maxSeverity(severity, 'medium');
    }
  }

  // 4. Session length acknowledgment.
  //    Only enforce for contextual recommendations with recommendation cards.
  if (
    sessionLength &&
    layer2Intent === LAYER2_INTENTS.CONTEXT_BASED_RECOMMENDATION &&
    recommendedItems.length > 0
  ) {
    const sessionKeywords = {
      short_session: ['short', 'quick', 'finish quickly', 'shorter'],
      weekend_session: ['weekend', 'over the weekend', 'weekend session'],
      long_session: [
        'long',
        'months',
        'long term',
        'long-term',
        'hundreds of hours',
      ],
    };

    const expectedKeywords = sessionKeywords[sessionLength] ?? [];

    const mentioned = expectedKeywords.some((keyword) =>
      includesNormalizedText(answerText, keyword)
    );

    if (!mentioned) {
      flags.push(
        `Session length constraint not acknowledged: expected answer to reflect "${sessionLength}".`
      );
      severity = maxSeverity(severity, 'medium');
    }
  }

  // 5. Compare games should mention all compared game titles.
  if (
    layer2Intent === LAYER2_INTENTS.COMPARE_GAMES &&
    referenceGames.length >= 2
  ) {
    const missingGames = referenceGames.filter(
      (game) => !includesNormalizedText(answerText, game)
    );

    if (missingGames.length > 0) {
      flags.push(
        `Compare intent mismatch: answer does not mention compared game(s): ${missingGames.join(
          ', '
        )}.`
      );
      severity = maxSeverity(severity, 'medium');
    }
  }

  // 6. Similar game discovery should reference the source game.
  if (
    layer2Intent === LAYER2_INTENTS.SIMILAR_GAME_DISCOVERY &&
    referenceGames.length > 0
  ) {
    const referencesSource = referenceGames.some((game) =>
      includesNormalizedText(answerText, game)
    );

    if (!referencesSource) {
      flags.push(
        `Reference game missing: similar-game answer should reference source game "${referenceGames.join(
          ', '
        )}".`
      );
      severity = maxSeverity(severity, 'medium');
    }
  }

  // 7. Recommendation explanation should actually explain.
  if (layer2Intent === LAYER2_INTENTS.RECOMMENDATION_EXPLANATION) {
    const explanationSignals = [
      'because',
      'fits',
      'fit',
      'matches',
      'match',
      'based on',
      'your taste',
      'your bookmarks',
      'preference',
      'reason',
      'why',
      '适合',
      '因为',
      '基于',
      '符合',
    ];

    const hasExplanation = explanationSignals.some((signal) =>
      includesNormalizedText(answerText, signal)
    );

    if (!hasExplanation) {
      flags.push(
        'Recommendation explanation missing: answer should explain why the recommendation fits the user.'
      );
      severity = maxSeverity(severity, 'medium');
    }
  }

  return {
    flags,
    severity,
  };
}

// ── Suggested action resolver ────────────────────────────────────────────────

function resolveSuggestedAction({
  flags,
  severity,
  invalidRecommendationJson,
}) {
  if (invalidRecommendationJson) {
    return 'hide_cards';
  }

  if (flags.length > 0 || severity !== 'none') {
    return 'reflect';
  }

  return 'return';
}

// ── Public validation API ────────────────────────────────────────────────────

/**
 * Validate an answer.
 *
 * Backward compatible:
 * validateAnswer({ answer, intent, platformData })
 *
 * New router compatible:
 * validateAnswer({ answer, intent, platformData, plan })
 *
 * @param {{
 *   answer: string,
 *   intent?: string,
 *   platformData?: string,
 *   plan?: object | null,
 * }} params
 * @returns {{
 *   passed: boolean,
 *   severity: 'none' | 'low' | 'medium' | 'high',
 *   flags: string[],
 *   suggestedAction: 'return' | 'reflect' | 'hide_cards',
 * }}
 */
export function validateAnswer({
  answer,
  intent,
  platformData = '',
  plan = null,
}) {
  const flags = [];
  let severity = 'none';
  let invalidRecommendationJson = false;

  // 1. Validate RECOMMENDATIONS block format and titles.
  const recommendationResult = validateRecommendationBlockAndTitles({
    answer,
    platformData,
  });

  flags.push(...recommendationResult.flags);
  severity = maxSeverity(severity, recommendationResult.severity);
  invalidRecommendationJson = recommendationResult.invalidRecommendationJson;

  // 2. Validate community/ranking answers do not use personalized wording.
  const communityWordingResult = validateCommunityPersonalizedWording({
    answer,
    intent,
  });

  flags.push(...communityWordingResult.flags);
  severity = maxSeverity(severity, communityWordingResult.severity);

  // 3. Validate answer does not claim platform/database is empty when data was missing.
  const emptyPlatformResult = validateUnsupportedEmptyPlatformClaim({
    answer,
    platformData,
  });

  flags.push(...emptyPlatformResult.flags);
  severity = maxSeverity(severity, emptyPlatformResult.severity);

  // 4. Validate new router constraints.
  // Skip constraint validation if recommendation JSON is invalid, because
  // recommendedItems cannot be trusted in that case.
  if (!invalidRecommendationJson) {
    const constraintResult = validateRouterConstraints({
      answer,
      plan,
      platformData,
      recommendedItems: recommendationResult.recommendedItems,
    });

    flags.push(...constraintResult.flags);
    severity = maxSeverity(severity, constraintResult.severity);
  }

  const suggestedAction = resolveSuggestedAction({
    flags,
    severity,
    invalidRecommendationJson,
  });

  return {
    passed: flags.length === 0,
    severity,
    flags,
    suggestedAction,
  };
}

// ── Legacy compatibility exports (used by aiPipeline) ──────────────────────

export async function loadKnownTitles() {
  // Legacy evaluator consumes this list for post-extraction checks.
  // Keep async signature to preserve call-site compatibility.
  return [];
}

export function invalidateTitlesCache() {
  // Backward-compatible no-op: title cache is not used in the current validator.
}

export function evaluateResponse(_answer, recommendations = [], knownTitles = []) {
  const titleSet = new Set((knownTitles || []).map((t) => normalizeToken(t)));
  const hallucinations = (recommendations || [])
    .filter((item) => {
      const title = normalizeToken(item?.title);
      if (!title) return false;
      if (!titleSet.size) return false;
      return !titleSet.has(title);
    })
    .map((item) => item.title)
    .filter(Boolean);

  const groundingScore = titleSet.size
    ? Math.max(0, 1 - hallucinations.length / Math.max(1, recommendations.length || 1))
    : 1;

  return {
    evaluation: {
      groundingScore,
      hallucinations,
      safetyPassed: hallucinations.length === 0,
    },
  };
}

export function validate(answer) {
  const text = String(answer ?? '').trim();
  if (!text) {
    return { valid: false, reason: 'Answer is empty.' };
  }
  return { valid: true, reason: null };
}

// ── Test-only exports ────────────────────────────────────────────────────────

export const __test__ = {
  normalizeText,
  normalizeToken,
  asArray,
  includesNormalizedText,
  maxSeverity,
  parseRecommendationBlock,
  extractRecommendedItems,
  extractPlatformTitles,
  extractPlatformGameRecords,
  findPlatformRecordByTitle,
  validateRecommendationBlockAndTitles,
  validateCommunityPersonalizedWording,
  validateUnsupportedEmptyPlatformClaim,
  validateRouterConstraints,
  resolveSuggestedAction,
};