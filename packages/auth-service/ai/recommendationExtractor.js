// packages/auth-service/ai/recommendationExtractor.js
// Extracts the structured block from Gemini output,
// strips it from the visible answer, and enriches each entry with real DB data.
//
// Hallucination guard: any recommended title that has no matching record in the
// database is silently removed — it will never reach the frontend.

import GamePost from '../models/GamePost.js';
import { attachCommunityRatingData } from '../services/communityRatingService.js';

const RECO_BLOCK_RE = /<!--RECOMMENDATIONS:(\[.*?\])-->/s;

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
export async function extractRecommendedPosts(aiText) {
  if (!aiText || typeof aiText !== 'string') {
    return { cleanAnswer: '', recommendations: [] };
  }

  const match = RECO_BLOCK_RE.exec(aiText);
  if (!match) return { cleanAnswer: aiText, recommendations: [] };

  // Strip the hidden block so the chat bubble shows clean prose
  const cleanAnswer = aiText.replace(RECO_BLOCK_RE, '').trimEnd();

  let parsed;
  try {
    parsed = JSON.parse(match[1]);
    if (!Array.isArray(parsed)) return { cleanAnswer, recommendations: [] };
  } catch {
    return { cleanAnswer, recommendations: [] };
  }

  // ── 2. Secure Data Enrichment & Hallucination Guard ───────────────────────
  try {
    // Hard limit to top 5 candidates to prevent model payload explosion
    const candidateTitles = parsed
      .slice(0, 5)
      .map((item) => String(item?.title ?? '').trim())
      .filter(Boolean);

    if (!candidateTitles.length) {
      return { cleanAnswer, recommendations: [] };
    }

    const titleRegexes = candidateTitles.map((title) => new RegExp(`^${escapeRegex(title)}$`, 'i'));
    const posts = await GamePost.find({ title: { $in: titleRegexes } })
      .select('title rating tags likedBy comments bookmarkedBy')
      .lean();

    const ratedPosts = await attachCommunityRatingData(posts);
    const postMap = new Map(ratedPosts.map((p) => [p.title.toLowerCase(), p]));

    const recommendations = parsed
      .slice(0, 5)
      .map((item) => {
        const itemTitle = String(item?.title ?? '').trim();
        const dbPost = postMap.get(itemTitle.toLowerCase());

        return {
          id: dbPost ? dbPost._id.toString() : null,
          title: dbPost ? dbPost.title : itemTitle,
          rating: dbPost?.communityRating ?? dbPost?.authorRating ?? null,
          authorRating: dbPost?.authorRating ?? null,
          communityRating: dbPost?.communityRating ?? null,
          ratingCount: dbPost?.ratingCount ?? 0,
          tags: dbPost?.tags ?? [],
          likesCount: dbPost?.likedBy?.length ?? 0,
          commentsCount: dbPost?.comments?.length ?? 0,
          reason: item.reason ?? null,
          confidence: typeof item.confidence === 'number' ? item.confidence : null,
          matchedTags: Array.isArray(item.matchedTags) ? item.matchedTags : [],
        };
      })
      .filter((item) => item.id !== null);

    return { cleanAnswer, recommendations };
  } catch (err) {
    console.error('[recommendationExtractor] Internal data enrichment failed:', err);
    return { cleanAnswer, recommendations: [] };
  }
}