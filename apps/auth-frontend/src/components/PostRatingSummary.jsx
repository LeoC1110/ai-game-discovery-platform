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
  myCommunityRating = null,
  showAuthorRating = false,
  showMyRating = false,
  align = 'start',
  compact = false,
  interactive = false,
  disabled = false,
  onCommunityClick,
}) {
  const lineStyle = {
    margin: 0,
    color: compact ? '#d6d6db' : '#b8b8c2',
    fontSize: compact ? 12 : 13,
    lineHeight: compact ? 1.35 : 1.45,
  };

  const avgRatingText = formatAvgRating(authorRating, communityRating, ratingCount);
  const hasNoCommunityRatings = communityRating == null || ratingCount === 0;
  const communityLabel = `Avg Rating: ${avgRatingText} ⭐`;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'end' ? 'flex-end' : 'flex-start',
        gap: 2,
      }}
    >
      {showAuthorRating && (
        <p style={lineStyle}>
          <strong style={{ color: '#f5f5f7', fontWeight: 600 }}>Author Rating:</strong>{' '}
          {authorRating != null ? `${authorRating}/10` : 'Not rated yet'}
        </p>
      )}
      {interactive ? (
        <button
          type="button"
          style={{
            ...lineStyle,
            border: 'none',
            background: 'transparent',
            padding: 0,
            cursor: disabled ? 'default' : 'pointer',
            color: disabled ? '#9a9aa3' : lineStyle.color,
          }}
          onClick={disabled ? undefined : onCommunityClick}
          disabled={disabled}
          title={disabled ? 'You cannot rate this post' : 'Rate this game'}
        >
          <strong style={{ color: '#111111', fontWeight: 600 }}>{communityLabel}</strong>
          {!disabled && hasNoCommunityRatings && (
            <span style={{ marginLeft: 6, color: '#007aff', fontWeight: 500, fontSize: 'inherit' }}>(Rate)</span>
          )}
        </button>
      ) : (
        <p style={lineStyle}>
          <strong style={{ color: '#111111', fontWeight: 600 }}>{communityLabel}</strong>
        </p>
      )}
      {showMyRating && myCommunityRating != null && (
        <p style={lineStyle}>
          <strong style={{ color: '#f5f5f7', fontWeight: 600 }}>Your Rating:</strong>{' '}
          {myCommunityRating}/10
        </p>
      )}
    </div>
  );
}