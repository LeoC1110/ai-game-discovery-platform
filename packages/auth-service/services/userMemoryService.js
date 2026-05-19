// packages/auth-service/services/userMemoryService.js
// Manages all four AI memory layers for a user.
//
// Short-term  — current chat history (handled by ConversationHistory model)
// Long-term   — persisted genre/platform/tone preferences (UserPreference model)
// Behavioral  — inferred on-the-fly from likes, bookmarks, comments (no storage)
// Explicit    — raw statements extracted from user messages and saved to UserPreference

import GamePost from '../models/GamePost.js';
import UserPreference from '../models/UserPreference.js';

// ── Explicit preference extractor ─────────────────────────────────────────────
// Parses a user message for direct preference statements.
// Returns { likedGenres, avoidedGenres, preferredPlatforms, recommendationTone, notes }
// all as arrays/strings (empty if nothing found).

const LIKED_RE    = /\b(?:i (?:love|like|enjoy|prefer)|i'm into|i play)\s+([a-z0-9 ,\-]+?)(?:\s+games?)?(?:[.,!]|$)/gi;
const AVOIDED_RE  = /\b(?:i (?:hate|dislike|don't like|avoid|skip)|not into|no)\s+([a-z0-9 ,\-]+?)(?:\s+games?)?(?:[.,!]|$)/gi;
const PLATFORM_RE = /\b(?:i (?:play on|use|prefer|have a?|own a?))\s+(pc|switch|playstation|ps[45]?|xbox|mobile|steam deck)/gi;
const TONE_SHORT  = /\b(?:keep it short|brief|concise|tldr|short and direct)\b/i;
const TONE_DETAIL = /\b(?:detailed|in[- ]depth|explain|elaborate|thorough)\b/i;

function extractExplicit(message) {
  const likedGenres = [];
  const avoidedGenres = [];
  const preferredPlatforms = [];
  let recommendationTone = null;
  const notes = [];

  let m;
  while ((m = LIKED_RE.exec(message)) !== null) {
    const val = m[1].trim();
    if (val.length > 1 && val.length < 40) { likedGenres.push(val); notes.push(`I like ${val}`); }
  }
  while ((m = AVOIDED_RE.exec(message)) !== null) {
    const val = m[1].trim();
    if (val.length > 1 && val.length < 40) { avoidedGenres.push(val); notes.push(`I avoid ${val}`); }
  }
  while ((m = PLATFORM_RE.exec(message)) !== null) {
    preferredPlatforms.push(m[1].trim());
  }
  if (TONE_SHORT.test(message))  recommendationTone = 'short';
  if (TONE_DETAIL.test(message)) recommendationTone = 'detailed';

  return { likedGenres, avoidedGenres, preferredPlatforms, recommendationTone, notes };
}

// ── Save explicit preferences detected in a user message ─────────────────────
export async function saveExplicitPreferences(userId, message) {
  const extracted = extractExplicit(message);
  const hasUpdates =
    extracted.likedGenres.length ||
    extracted.avoidedGenres.length ||
    extracted.preferredPlatforms.length ||
    extracted.recommendationTone ||
    extracted.notes.length;

  if (!hasUpdates) return;

  const update = {};
  if (extracted.likedGenres.length)
    update.$addToSet = { ...(update.$addToSet ?? {}), likedGenres: { $each: extracted.likedGenres } };
  if (extracted.avoidedGenres.length)
    update.$addToSet = { ...(update.$addToSet ?? {}), avoidedGenres: { $each: extracted.avoidedGenres } };
  if (extracted.preferredPlatforms.length)
    update.$addToSet = { ...(update.$addToSet ?? {}), preferredPlatforms: { $each: extracted.preferredPlatforms } };
  if (extracted.notes.length)
    update.$addToSet = { ...(update.$addToSet ?? {}), explicitNotes: { $each: extracted.notes.slice(0, 3) } };
  if (extracted.recommendationTone)
    update.$set = { recommendationTone: extracted.recommendationTone };

  try {
    await UserPreference.findOneAndUpdate(
      { userId },
      update,
      { upsert: true, new: true },
    );
    console.log('[Memory] Saved explicit preferences for user:', userId);
  } catch (err) {
    console.error('[Memory] Failed to save explicit preferences:', err?.message);
  }
}

// ── Load long-term stored preferences ────────────────────────────────────────
export async function loadStoredPreferences(userId) {
  try {
    return await UserPreference.findOne({ userId }).lean() ?? null;
  } catch {
    return null;
  }
}

// ── Behavioral memory: infer from likes + bookmarks ──────────────────────────
// Counts genre/tag occurrences across posts the user has liked or bookmarked.
export async function inferBehavioralMemory(userId) {
  try {
    const posts = await GamePost.find({
      $or: [{ likedBy: userId }, { bookmarkedBy: userId }],
    })
      .select('genre tags likedBy bookmarkedBy')
      .lean();

    const counts = {};
    for (const p of posts) {
      const weight = (p.likedBy?.some(id => String(id) === String(userId)) ? 1 : 0)
                   + (p.bookmarkedBy?.some(id => String(id) === String(userId)) ? 2 : 0); // bookmarks weigh more
      const terms = [p.genre, ...(p.tags ?? [])].filter(Boolean);
      for (const t of terms) {
        counts[t.toLowerCase()] = (counts[t.toLowerCase()] ?? 0) + weight;
      }
    }

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([tag]) => tag);
  } catch {
    return [];
  }
}

// ── Build the full memory context string for the system prompt ────────────────
export async function buildUserMemoryContext(userId) {
  const [stored, behavioral] = await Promise.all([
    loadStoredPreferences(userId),
    inferBehavioralMemory(userId),
  ]);

  const lines = [];

  // Long-term explicit preferences
  if (stored?.likedGenres?.length)
    lines.push(`- Likes: ${stored.likedGenres.join(', ')}`);
  if (stored?.avoidedGenres?.length)
    lines.push(`- Avoids: ${stored.avoidedGenres.join(', ')}`);
  if (stored?.preferredPlatforms?.length)
    lines.push(`- Preferred platforms: ${stored.preferredPlatforms.join(', ')}`);
  if (stored?.recommendationTone && stored.recommendationTone !== 'balanced')
    lines.push(`- Recommendation tone: ${stored.recommendationTone}`);
  if (stored?.explicitNotes?.length)
    lines.push(`- Explicit notes: ${stored.explicitNotes.slice(-5).join(' | ')}`);

  // Behavioral inferences
  if (behavioral.length)
    lines.push(`- Inferred interests (from likes/bookmarks): ${behavioral.join(', ')}`);

  if (!lines.length) return '';

  return `## User Preference Profile\n${lines.join('\n')}`;
}

// ── GraphQL-facing: update preferences manually ──────────────────────────────
export async function upsertUserPreferences(userId, input) {
  const update = { $set: {} };

  if (input.likedGenres        !== undefined) update.$set.likedGenres        = input.likedGenres;
  if (input.avoidedGenres      !== undefined) update.$set.avoidedGenres      = input.avoidedGenres;
  if (input.preferredPlatforms !== undefined) update.$set.preferredPlatforms = input.preferredPlatforms;
  if (input.recommendationTone !== undefined) update.$set.recommendationTone = input.recommendationTone;

  return UserPreference.findOneAndUpdate({ userId }, update, { upsert: true, new: true });
}

// ── GraphQL-facing: clear all preferences ────────────────────────────────────
export async function clearUserPreferences(userId) {
  try {
    await UserPreference.findOneAndDelete({ userId });
    return true;
  } catch {
    return false;
  }
}
