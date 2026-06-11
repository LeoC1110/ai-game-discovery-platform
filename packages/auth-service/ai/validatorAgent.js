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

// HIGH-IMPACT OPTIMIZATION: Increased default TTL from 1 minute (60000ms) to 1 hour (3600000ms).
// Since the ground-truth titles collection is highly static (~15 entries), 
// fetching from the database on every minute interval introduces unnecessary I/O overhead.
const KNOWN_TITLES_TTL_MS = parseInt(process.env.AI_KNOWN_TITLES_TTL_MS ?? '3600000', 10);

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
 * Load all known game post titles from the database with localized memory caching.
 * Used as the ground-truth list for downstream hallucination verification.
 * @returns {Promise<string[] | null>} Array of titles, or null if DB is unavailable and no cache exists.
 */
export async function loadKnownTitles() {
  const now = Date.now();
  
  // Fast path: return unexpired in-memory cache instantly (0ms latency)
  if (_knownTitlesCache.value && now < _knownTitlesCache.expiresAt) {
    return _knownTitlesCache.value;
  }

  try {
    // Highly efficient projection using lean queries for rapid document processing
    const posts = await GamePost.find().select('title').lean();
    const titles = posts.map((p) => p.title).filter(Boolean); // Sanitize and remove null/undefined values
    
    _knownTitlesCache = {
      value: titles,
      expiresAt: now + KNOWN_TITLES_TTL_MS,
    };
    return titles;
  } catch (error) {
    console.error('[validatorAgent] Failed to load known titles from DB:', error?.message);
    
    // Graceful degradation: Fallback to existing stale cache if database flashes or disconnects
    if (_knownTitlesCache.value) return _knownTitlesCache.value;
    
    // Fail-safe protection: If server cold-starts while DB is down, return null instead of [].
    // Returning an empty array forces the evaluator to flag every single legitimate title 
    // as a hallucination, triggering a catastrophic broken reflection loop.
    return null; 
  }
}

/**
 * Event-Driven Cache Invalidation
 * Call this hook inside post-creation or content management controllers to clear memory instantly
 * whenever a title is added, updated, or removed. This enables long-lived TTL configurations safely.
 */
export const invalidateTitlesCache = () => {
  _knownTitlesCache = { value: null, expiresAt: 0 };
};

/**
 * Run grounding, hallucination, and safety evaluation on a response.
 * Wraps aiEvaluationService — keeps evaluation logic in one place.
 *
 * @param {string}   answer
 * @param {Array}    recommendedPosts  - enriched recommendation objects
 * @param {string[]} knownTitles       - game titles from DB (or null if DB infrastructure failed)
 * @returns {{
 * evaluation: object,       - full evaluation result from aiEvaluationService
 * needsReflection: boolean  - true if the pipeline should run a correction pass
 * }}
 */
export function evaluateResponse(answer, recommendedPosts = [], knownTitles = []) {
  // Fault-tolerant safety net: If database fails and no cache exists, bypass hallucination gates
  // to avoid sweeping false positives, while preserving critical safety checks.
  if (knownTitles === null) {
    const evaluation = evaluateAIResponse({ answer, recommendedPosts, knownTitles: [] });
    return { 
      evaluation: { ...evaluation, hallucinations: [] }, 
      needsReflection: !evaluation.safetyPassed // Flag reflection solely on safety violations
    };
  }

  const evaluation = evaluateAIResponse({ answer, recommendedPosts, knownTitles });
  const needsReflection = evaluation.hallucinations.length > 0 || !evaluation.safetyPassed;
  return { evaluation, needsReflection };
}