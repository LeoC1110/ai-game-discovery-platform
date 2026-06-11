// packages/auth-service/ai/validatorAgent.js
// Two-layer quality gate for AI responses.
//
// Layer 1 — structural (validate):  non-empty string check (sync, zero DB cost)
// Layer 2 — semantic  (evaluateResponse): grounding, hallucination, safety via aiEvaluationService
//
// The pipeline calls both layers. If Layer 2 finds issues, aiPipeline runs a
// reflection pass before returning the response to the frontend.
import { evaluateAIResponse } from '../services/aiEvaluationService.js';
import GamePost from '../models/GamePost.js';

const KNOWN_TITLES_TTL_MS = parseInt(process.env.AI_KNOWN_TITLES_TTL_MS ?? '60000', 10);
let _knownTitlesCache = {
  value: null,
  expiresAt: 0,
};

// ── Layer 1: Structural validation ───────────────────────────────────────────

/**
 * Quick structural check — no DB calls, no Gemini calls.
 * @param {string} response
 * @returns {{ valid: boolean, reason: string | null }}
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

// ── Layer 2: Semantic evaluation ─────────────────────────────────────────────

/**
 * Load all known game post titles from the database.
 * Used as the ground-truth list for hallucination detection.
 * @returns {Promise<string[]>}
 */
export async function loadKnownTitles() {
  const now = Date.now();
  if (_knownTitlesCache.value && now < _knownTitlesCache.expiresAt) {
    return _knownTitlesCache.value;
  }

  try {
    const posts = await GamePost.find().select('title').lean();
    const titles = posts.map((p) => p.title);
    _knownTitlesCache = {
      value: titles,
      expiresAt: now + KNOWN_TITLES_TTL_MS,
    };
    return titles;
  } catch {
    if (_knownTitlesCache.value) return _knownTitlesCache.value;
    return [];
  }
}

/**
 * Run grounding, hallucination, and safety evaluation on a response.
 * Wraps aiEvaluationService — keeps evaluation logic in one place.
 *
 * @param {string}   answer
 * @param {Array}    recommendedPosts  - enriched recommendation objects
 * @param {string[]} knownTitles       - all game titles from DB
 * @returns {{
 *   evaluation: object,       - full evaluation result from aiEvaluationService
 *   needsReflection: boolean  - true if the pipeline should run a correction pass
 * }}
 */
export function evaluateResponse(answer, recommendedPosts = [], knownTitles = []) {
  const evaluation = evaluateAIResponse({ answer, recommendedPosts, knownTitles });
  const needsReflection = evaluation.hallucinations.length > 0 || !evaluation.safetyPassed;
  return { evaluation, needsReflection };
}
