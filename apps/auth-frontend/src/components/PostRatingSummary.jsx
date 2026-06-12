import React from 'react';

function formatAvgRating(authorRating, communityRating, ratingCount) {
  // Community rating is the primary score; author rating is only a fallback
  // when no community ratings exist yet.
  if (communityRating != null && ratingCount > 0) return `${communityRating.toFixed(1)}/10`;
  if (authorRating != null) return `${authorRating}/10`;
  return '–';
}

export default function PostRatingSummary({
  authorRating,
  communityRating,
  ratingCount = 0,
  showAuthorRating = false,
  align = 'start',
  compact = false,
  interactive = false,
  disabled = false,
  onCommunityClick,
}) {
  const avgRatingText = formatAvgRating(authorRating, communityRating, ratingCount);
  const hasNoCommunityRatings = communityRating == null || ratingCount === 0;
  const communityLabel = `Avg Rating: ${avgRatingText}`;
  const rootClassName = [
    'post-rating-summary',
    compact ? 'post-rating-summary--compact' : '',
    align === 'end' ? 'post-rating-summary--end' : 'post-rating-summary--start',
  ].filter(Boolean).join(' ');

  const interactiveClassName = [
    'post-rating-summary__interactive',
    disabled ? 'post-rating-summary__interactive--disabled' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={rootClassName}>
      {showAuthorRating && (
        <p className="post-rating-summary__line">
          <strong className="post-rating-summary__label">Author Rating:</strong>{' '}
          {authorRating != null ? `${authorRating}/10` : 'Not rated yet'}
        </p>
      )}
      {interactive ? (
        <button
          type="button"
          className={interactiveClassName}
          onClick={disabled ? undefined : onCommunityClick}
          disabled={disabled}
          title={disabled ? 'You cannot rate this post' : 'Rate this game'}
        >
          <span className="post-rating-summary__line post-rating-summary__line--community">
            <strong className="post-rating-summary__value">{communityLabel}</strong>
          </span>
          {!disabled && hasNoCommunityRatings && (
            <span className="post-rating-summary__hint">Rate</span>
          )}
        </button>
      ) : (
        <p className="post-rating-summary__line post-rating-summary__line--community">
          <strong className="post-rating-summary__value">{communityLabel}</strong>
        </p>
      )}
    </div>
  );
}