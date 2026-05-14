// packages/auth-service/prompts/platformContextTemplate.js
// Converts MongoDB GamePost documents into a compact text summary for the AI prompt.
// Only selected fields are included — never full documents.

import GamePost from '../models/GamePost.js';

const AI_MAX_PLATFORM_POSTS = parseInt(process.env.AI_MAX_PLATFORM_POSTS ?? '20', 10);

/**
 * Format a single post into one concise line.
 * Includes only the fields the AI needs — keeps token usage low.
 */
function formatPost(p) {
  const reviewPreview = p.review ? ` · "${p.review.slice(0, 80).replace(/\n/g, ' ')}…"` : '';
  return (
    `• "${p.title}"` +
    (p.genre ? ` [${p.genre}]` : '') +
    (p.platform ? ` on ${p.platform}` : '') +
    (p.rating != null ? ` — ${p.rating}/10` : '') +
    (p.tags?.length ? ` tags: ${p.tags.slice(0, 4).join(', ')}` : '') +
    (p.likedBy?.length ? ` ♥${p.likedBy.length}` : '') +
    (p.comments?.length ? ` 💬${p.comments.length}` : '') +
    reviewPreview
  );
}

/**
 * Fetch and summarise platform data for a given user.
 * Respects AI_MAX_PLATFORM_POSTS from environment.
 * Returns a ready-to-embed string for the system prompt.
 */
export async function buildPlatformContext(userId) {
  try {
    const [recentPosts, topRated, bookmarks] = await Promise.all([
      // Recent community posts — limited to AI_MAX_PLATFORM_POSTS
      GamePost.find()
        .sort({ createdAt: -1 })
        .limit(AI_MAX_PLATFORM_POSTS)
        .select('title genre platform rating tags review likedBy comments')
        .lean(),

      // Top rated (up to 10)
      GamePost.find({ rating: { $exists: true, $ne: null } })
        .sort({ rating: -1 })
        .limit(10)
        .select('title genre platform rating tags likedBy')
        .lean(),

      // User's bookmarks (up to 10)
      GamePost.find({ bookmarkedBy: userId })
        .limit(10)
        .select('title genre platform rating tags review likedBy comments')
        .lean(),
    ]);

    let context = '';

    if (bookmarks.length) {
      context += `## Your Bookmarked Games (${bookmarks.length})\n`;
      context += bookmarks.map(formatPost).join('\n');
    }

    if (topRated.length) {
      context += `\n\n## Top Rated Community Games\n`;
      context += topRated.map(formatPost).join('\n');
    }

    if (recentPosts.length) {
      context += `\n\n## Recent Community Posts (up to ${AI_MAX_PLATFORM_POSTS})\n`;
      context += recentPosts.map(formatPost).join('\n');
    }

    return context.trim() || '';
  } catch {
    // Non-fatal — return empty so the AI can still respond
    return '';
  }
}
