// packages/auth-service/ai/recommendationExtractor.js
// Extracts the structured block from Gemini output,
// strips it from the visible answer, and enriches each entry with real DB data.
//
// Hallucination guard: any recommended title that has no matching record in the
// database is silently removed — it will never reach the frontend.

import GamePost from '../models/GamePost.js';
import { attachCommunityRatingData } from '../services/communityRatingService.js';

const RECO_BLOCK_START = '<!--RECOMMENDATIONS:';
const RECO_BLOCK_END = '-->';
const MAX_CANDIDATES = 5;

function dedupeTitles(parsed) {
  const seen = new Set();
  const titles = [];
  for (const item of parsed.slice(0, MAX_CANDIDATES)) {
    const rawTitle = String(item?.title ?? '').trim();
    if (!rawTitle) continue;
    const normalized = rawTitle.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    titles.push(rawTitle);
  }
  return titles;
}

export function extractRecommendationsPayload(aiText) {
  if (!aiText || typeof aiText !== 'string') {
    return { cleanAnswer: '', parsed: [] };
  }

  const start = aiText.indexOf(RECO_BLOCK_START);
  if (start === -1) return { cleanAnswer: aiText, parsed: [] };

  const payloadStart = start + RECO_BLOCK_START.length;
  const end = aiText.indexOf(RECO_BLOCK_END, payloadStart);
  if (end === -1) return { cleanAnswer: aiText, parsed: [] };

  const payload = aiText.slice(payloadStart, end).trim();
  const cleanAnswer = `${aiText.slice(0, start)}${aiText.slice(end + RECO_BLOCK_END.length)}`.trimEnd();

  try {
    const parsed = JSON.parse(payload);
    if (!Array.isArray(parsed)) return { cleanAnswer, parsed: [] };
    return { cleanAnswer, parsed };
  } catch {
    return { cleanAnswer, parsed: [] };
  }
}

async function findPostsByTitles(candidateTitles) {
  if (!candidateTitles.length) return [];

  const normalizedTitles = candidateTitles.map((title) => title.toLowerCase());

  return GamePost.find({
    $or: [
      { titleNormalized: { $in: normalizedTitles } },
      { title: { $in: candidateTitles } },
    ],
  })
    .select('title titleNormalized rating tags likedBy comments bookmarkedBy')
    .lean();
}

/**
 * Parse and enrich the RECOMMENDATIONS block embedded in AI text.
 * Optimized to eliminate ReDoS vulnerabilities and preserve MongoDB index performance.
 *
 * @param {string} aiText - Raw text returned by the answer agent
 * @returns {Promise<{
 * cleanAnswer: string,
 * recommendations: Array<{
 * id: string|null, title: string, rating: number|null,
 * authorRating: number|null, communityRating: number|null, ratingCount: number,
 * tags: string[], likesCount: number, commentsCount: number,
 * reason: string|null, confidence: number|null, matchedTags: string[]
 * }>
 * }>}
 */
export async function extractRecommendedPosts(aiText, deps = {}) {
  const {
    findPosts = findPostsByTitles,
    attachRatings = attachCommunityRatingData,
    onError = console.error,
  } = deps;

  const { cleanAnswer, parsed } = extractRecommendationsPayload(aiText);
  if (!parsed.length) return { cleanAnswer, recommendations: [] };

  // ── 2. Secure Data Enrichment & Hallucination Guard ───────────────────────
  try {
    // Hard limit to top candidates to prevent model payload explosion
    const candidateTitles = dedupeTitles(parsed);

    if (!candidateTitles.length) {
      return { cleanAnswer, recommendations: [] };
    }

    const posts = await findPosts(candidateTitles);

    const ratedPosts = await attachRatings(posts);
    const postMap = new Map(
      ratedPosts.map((p) => [String(p.titleNormalized || p.title || '').toLowerCase(), p]),
    );

    const seenRecommendationTitles = new Set();

    const recommendations = parsed
      .slice(0, MAX_CANDIDATES)
      .map((item) => {
        const itemTitle = String(item?.title ?? '').trim();
        const normalizedTitle = itemTitle.toLowerCase();
        if (!itemTitle || seenRecommendationTitles.has(normalizedTitle)) return null;
        seenRecommendationTitles.add(normalizedTitle);

        const dbPost = postMap.get(normalizedTitle);

        return {
          id: dbPost ? dbPost._id.toString() : null,
          title: dbPost ? dbPost.title : itemTitle,
          rating: dbPost?.communityRating ?? dbPost?.authorRating ?? null,
          authorRating: dbPost?.authorRating ?? null,
          communityRating: dbPost?.communityRating ?? null,
          ratingCount: dbPost?.ratingCount ?? 0,
          tags: dbPost?.tags ?? [],
          likesCount: dbPost?.likedBy?.length ?? 0,
          bookmarksCount: dbPost?.bookmarkedBy?.length ?? 0,
          commentsCount: dbPost?.comments?.length ?? 0,
          reason: item.reason ?? null,
          confidence: typeof item.confidence === 'number' ? item.confidence : null,
          matchedTags: Array.isArray(item.matchedTags) ? item.matchedTags : [],
        };
      })
      .filter(Boolean)
      .filter((item) => item.id !== null);

    return { cleanAnswer, recommendations };
  } catch (err) {
    onError('[recommendationExtractor] Internal data enrichment failed:', err);
    return { cleanAnswer, recommendations: [] };
  }
}

export const __test__ = {
  RECO_BLOCK_START,
  RECO_BLOCK_END,
  MAX_CANDIDATES,
  dedupeTitles,
  extractRecommendationsPayload,
};