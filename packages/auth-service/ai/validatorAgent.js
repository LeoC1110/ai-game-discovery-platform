// packages/auth-service/ai/validatorAgent.js
// Agent 3: Validation / Verification Agent.
//
// Design goals for this pass:
// - Deterministic, fast, rule-based validation.
// - No Gemini calls.
// - No direct MongoDB queries.
// - Return structured validation results and actionable flags.

import { INTENTS } from './routerAgent.js';

const LOW_RATING_MAX = 6.0;
const HIGH_RATING_MIN = 8.0;

const COMMUNITY_INTENTS = new Set([
  INTENTS.COMMUNITY_SUMMARY,
  INTENTS.LEADERBOARD_QUERY,
  INTENTS.LOW_RATING_QUERY,
]);

const VALIDATION_INTENTS = new Set([
  INTENTS.GAME_RECOMMENDATION,
  INTENTS.BOOKMARK_ANALYSIS,
  INTENTS.COMMUNITY_SUMMARY,
  INTENTS.LEADERBOARD_QUERY,
  INTENTS.LOW_RATING_QUERY,
]);

const SEVERITY_RANK = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

const ACTION_RANK = {
  return: 0,
  log_only: 1,
  filter_cards: 2,
  reflect: 3,
  hide_cards: 4,
};

function normalizeTitle(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/["'`]+/g, '')
    .replace(/[\s]+/g, ' ')
    .replace(/[.,;:!?]+$/g, '');
}

function isBlank(value) {
  return typeof value !== 'string' || value.trim().length === 0;
}

function hasRecommendationBlock(answer) {
  return typeof answer === 'string' && answer.includes('<!--RECOMMENDATIONS:');
}

function looksLikeHighRiskAnswer(answer) {
  if (typeof answer !== 'string') return false;
  return /\b(rating|rank|leaderboard|likes?|bookmarks?|comments?|community\s+rating|rating\s+count|\d+(?:\.\d+)?\/10)\b/i.test(answer);
}

function isGeneralChatLike(answer) {
  if (typeof answer !== 'string') return false;
  return /^(hi|hello|hey|thanks|thank you|help)\b/i.test(answer.trim());
}

function isInventoryIntent(intent) {
  return intent === INTENTS.PLATFORM_INVENTORY_QUERY;
}

function compareSeverity(current, candidate) {
  return SEVERITY_RANK[candidate] > SEVERITY_RANK[current] ? candidate : current;
}

function compareAction(current, candidate) {
  return ACTION_RANK[candidate] > ACTION_RANK[current] ? candidate : current;
}

function addFlag(state, message, severity, action) {
  state.flags.push(message);
  state.severity = compareSeverity(state.severity, severity);
  state.suggestedAction = compareAction(state.suggestedAction, action);
}

/**
 * Extract a RECOMMENDATIONS block payload (JSON text) from an answer.
 * @param {string} answer
 * @returns {string | null}
 */
export function extractRecommendationBlock(answer) {
  if (typeof answer !== 'string') return null;
  const match = answer.match(/<!--RECOMMENDATIONS:(\[.*?\])-->/s);
  return match?.[1] ?? null;
}

/**
 * Safely parse recommendation block JSON.
 * @param {string | null} block
 * @returns {{ ok: boolean, data: any[], error: string | null }}
 */
export function parseRecommendationBlock(block) {
  if (!block) return { ok: true, data: [], error: null };
  try {
    const parsed = JSON.parse(block);
    if (!Array.isArray(parsed)) {
      return { ok: false, data: [], error: 'RECOMMENDATIONS block must be a JSON array.' };
    }
    return { ok: true, data: parsed, error: null };
  } catch {
    return { ok: false, data: [], error: 'Invalid RECOMMENDATIONS block JSON.' };
  }
}

/**
 * Extract platform titles from text payload in common formats.
 * @param {string} platformData
 * @returns {string[]} normalized unique titles
 */
export function extractPlatformTitles(platformData) {
  if (typeof platformData !== 'string' || platformData.trim().length === 0) return [];

  const titles = new Set();
  const lines = platformData.split(/\r?\n/);

  for (const line of lines) {
    const gameLine = line.match(/^\s*(?:Game|Title)\s*:\s*(.+?)\s*$/i);
    if (gameLine?.[1]) titles.add(normalizeTitle(gameLine[1]));

    const numberedLine = line.match(/^\s*\d+\.\s+(.+?)\s*$/);
    if (numberedLine?.[1]) titles.add(normalizeTitle(numberedLine[1]));

    const jsonTitle = line.match(/"title"\s*:\s*"([^"]+)"/i);
    if (jsonTitle?.[1]) titles.add(normalizeTitle(jsonTitle[1]));
  }

  return [...titles].filter(Boolean);
}

/**
 * Returns recommendation titles that are not found in platform data titles.
 * @param {Array<{ title?: string }>} recommendations
 * @param {string[]} normalizedPlatformTitles
 * @returns {string[]}
 */
export function findNonPlatformRecommendationTitles(recommendations, normalizedPlatformTitles) {
  const platform = new Set(normalizedPlatformTitles);
  const out = [];

  for (const rec of recommendations) {
    const title = typeof rec?.title === 'string' ? rec.title.trim() : '';
    if (!title) continue;
    if (!platform.has(normalizeTitle(title))) out.push(title);
  }

  return out;
}

/**
 * Detect unsupported "platform is empty" claims.
 * @param {string} answer
 * @returns {boolean}
 */
export function containsUnsupportedEmptyPlatformClaim(answer) {
  if (typeof answer !== 'string') return false;
  return [
    /there\s+are\s+no\s+games\s+currently\s+listed/i,
    /platform\s+has\s+no\s+games/i,
    /no\s+games\s+exist\s+on\s+the\s+platform/i,
    /database\s+is\s+empty/i,
  ].some((re) => re.test(answer));
}

/**
 * Detect personalized wording in community answers.
 * @param {string} answer
 * @returns {boolean}
 */
export function containsPersonalizedWordingInCommunityAnswer(answer) {
  if (typeof answer !== 'string') return false;
  return [
    /based\s+on\s+your\s+taste/i,
    /based\s+on\s+your\s+bookmarks/i,
    /your\s+saved\s+games/i,
    /fits\s+your\s+interest/i,
    /matches\s+your\s+preference/i,
    /recommended\s+for\s+you/i,
  ].some((re) => re.test(answer));
}

function containsStatisticClaims(answer) {
  if (typeof answer !== 'string') return false;
  return /\b(likes?|bookmarks?|comments?|rating\s+count|community\s+rating|\d+(?:\.\d+)?\/10)\b/i.test(answer);
}

function extractRatings(answer) {
  if (typeof answer !== 'string') return [];
  const matches = [...answer.matchAll(/\b(\d(?:\.\d+)?)\s*\/\s*10\b/g)];
  return matches
    .map((m) => Number.parseFloat(m[1]))
    .filter((n) => Number.isFinite(n));
}

/**
 * Decide whether answer validation is needed for this response.
 */
export function shouldValidateAnswer({ plan, intent, answer }) {
  if (plan?.needsValidation === true) return true;
  if (hasRecommendationBlock(answer)) return true;
  if (VALIDATION_INTENTS.has(intent)) return true;

  if (intent === INTENTS.GENERAL_CHAT || isGeneralChatLike(answer)) return false;
  if (isInventoryIntent(intent)) return false;

  return looksLikeHighRiskAnswer(answer);
}

/**
 * Validate generated AI answer using deterministic rule-based checks.
 */
export function validateAnswer({
  answer,
  intent,
  plan = null,
  platformData = '',
  userMemoryContext = '',
}) {
  void userMemoryContext;

  const shouldValidate = shouldValidateAnswer({ plan, intent, answer });
  if (!shouldValidate) {
    return {
      passed: true,
      severity: 'none',
      flags: [],
      suggestedAction: 'return',
    };
  }

  const state = {
    severity: 'none',
    flags: [],
    suggestedAction: 'return',
  };

  if (isBlank(answer)) {
    addFlag(state, 'Answer is blank or not a string.', 'high', 'reflect');
    return {
      passed: false,
      severity: state.severity,
      flags: state.flags,
      suggestedAction: state.suggestedAction,
    };
  }

  const hasPlatformData = typeof platformData === 'string' && platformData.trim().length > 0;
  const platformTitles = extractPlatformTitles(platformData);

  const block = extractRecommendationBlock(answer);
  const parsedBlock = parseRecommendationBlock(block);

  if (block && !parsedBlock.ok) {
    addFlag(state, 'Invalid RECOMMENDATIONS block JSON.', 'high', 'hide_cards');
  }

  if (block && parsedBlock.ok) {
    for (const item of parsedBlock.data) {
      const badShape =
        typeof item?.title !== 'string' ||
        typeof item?.reason !== 'string' ||
        typeof item?.confidence !== 'number' ||
        item.confidence < 0 ||
        item.confidence > 1 ||
        !Array.isArray(item?.matchedTags);

      if (badShape) {
        addFlag(
          state,
          'RECOMMENDATIONS item is missing required fields or contains malformed values.',
          'medium',
          'filter_cards',
        );
      }
    }

    if (!hasPlatformData) {
      addFlag(
        state,
        'Recommendation block cannot be verified because platform data is missing.',
        'high',
        'reflect',
      );
    } else {
      const nonPlatformTitles = findNonPlatformRecommendationTitles(parsedBlock.data, platformTitles);
      for (const title of nonPlatformTitles) {
        addFlag(
          state,
          `Recommendation block contains a non-platform title: ${title}`,
          'high',
          'reflect',
        );
      }
    }
  }

  if (!hasPlatformData && containsUnsupportedEmptyPlatformClaim(answer)) {
    addFlag(
      state,
      'Answer claims the platform/database is empty without attached platform data.',
      'high',
      'reflect',
    );
  }

  if (COMMUNITY_INTENTS.has(intent) && containsPersonalizedWordingInCommunityAnswer(answer)) {
    addFlag(
      state,
      'Community answer contains personalized wording that should not be used for this intent.',
      'medium',
      'reflect',
    );
  }

  if (intent === INTENTS.LOW_RATING_QUERY) {
    const ratings = extractRatings(answer);
    if (ratings.some((r) => r > LOW_RATING_MAX)) {
      addFlag(
        state,
        `Low-rating answer includes rating above ${LOW_RATING_MAX.toFixed(1)}/10.`,
        'medium',
        'reflect',
      );
    }
  }

  if (intent === INTENTS.LEADERBOARD_QUERY) {
    if (/\blow[\s-]?rated|poorly\s+rated|worst\b/i.test(answer)) {
      addFlag(
        state,
        'Leaderboard/top-rated answer includes low-rated wording.',
        'medium',
        'reflect',
      );
    }
  }

  if (!hasPlatformData && containsStatisticClaims(answer)) {
    addFlag(
      state,
      'Answer contains statistic claims (ratings/likes/bookmarks/comments) without attached platform data.',
      'high',
      'reflect',
    );
  }

  return state.flags.length > 0
    ? {
        passed: false,
        severity: state.severity,
        flags: state.flags,
        suggestedAction: state.suggestedAction,
      }
    : {
        passed: true,
        severity: 'none',
        flags: [],
        suggestedAction: 'return',
      };
}

// ---------------------------------------------------------------------------
// Compatibility exports for current pipeline integration.
// ---------------------------------------------------------------------------

/**
 * Legacy structural check used by aiPipeline.
 */
export function validate(response) {
  if (response == null || typeof response !== 'string') {
    return { valid: false, reason: 'Response is not a string.' };
  }
  if (response.trim().length === 0) {
    return { valid: false, reason: 'Response is blank.' };
  }
  return { valid: true, reason: null };
}

/**
 * Legacy hook used by aiPipeline; DB access intentionally removed in this pass.
 */
export async function loadKnownTitles() {
  return null;
}

/**
 * Legacy hook used by GraphQL resolvers.
 */
export const invalidateTitlesCache = () => {};

/**
 * Legacy evaluation shape adapter used by aiPipeline.
 */
export function evaluateResponse(answer, recommendedPosts = [], knownTitles = []) {
  const intent = recommendedPosts.length > 0 ? INTENTS.GAME_RECOMMENDATION : INTENTS.GENERAL_CHAT;

  let platformData = '';
  if (Array.isArray(knownTitles) && knownTitles.length > 0) {
    platformData = knownTitles.map((t) => `Title: ${t}`).join('\n');
  }

  const validation = validateAnswer({ answer, intent, platformData });
  const hallucinations = validation.flags
    .filter((f) => f.toLowerCase().includes('non-platform title'))
    .map((f) => f.replace(/^.*?:\s*/, '').trim())
    .filter(Boolean);

  const evaluation = {
    groundingScore: validation.passed ? 1 : null,
    hallucinations,
    safetyPassed: true,
    flags: validation.flags,
    validation,
  };

  return {
    evaluation,
    needsReflection: !validation.passed && validation.suggestedAction !== 'log_only',
  };
}

export const __test__ = {
  extractPlatformTitles,
  extractRecommendationBlock,
  parseRecommendationBlock,
  findNonPlatformRecommendationTitles,
  containsUnsupportedEmptyPlatformClaim,
  containsPersonalizedWordingInCommunityAnswer,
};