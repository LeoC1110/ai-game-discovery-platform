import React from 'react';

function formatCommunityRating(communityRating, ratingCount) {
  if (communityRating == null || !ratingCount) return 'Not rated yet';
  return `${communityRating.toFixed(1)}/10 · ${ratingCount} ${ratingCount === 1 ? 'rating' : 'ratings'}`;
}

export default function PostRatingSummary({
  authorRating,
  communityRating,
  ratingCount = 0,
  myCommunityRating = null,
  showMyRating = false,
  align = 'start',
  compact = false,
}) {
  const lineStyle = {
    margin: 0,
    color: compact ? '#d6d6db' : '#b8b8c2',
    fontSize: compact ? 12 : 13,
    lineHeight: compact ? 1.35 : 1.45,
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'end' ? 'flex-end' : 'flex-start',
        gap: 2,
      }}
    >
      <p style={lineStyle}>
        <strong style={{ color: '#f5f5f7', fontWeight: 600 }}>Author Rating:</strong>{' '}
        {authorRating != null ? `${authorRating}/10` : 'Not rated yet'}
      </p>
      <p style={lineStyle}>
        <strong style={{ color: '#f5f5f7', fontWeight: 600 }}>Community Rating:</strong>{' '}
        {formatCommunityRating(communityRating, ratingCount)}
      </p>
      {showMyRating && myCommunityRating != null && (
        <p style={lineStyle}>
          <strong style={{ color: '#f5f5f7', fontWeight: 600 }}>Your Rating:</strong>{' '}
          {myCommunityRating}/10
        </p>
      )}
    </div>
  );
}