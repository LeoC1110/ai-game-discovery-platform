// src/screens/BookmarksPage.jsx — Saved game posts
import React from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { useNavigate } from 'react-router-dom';
import DashboardNav from '../components/DashboardNav';
import { BOOKMARKED_POSTS, TOGGLE_BOOKMARK } from '../gql/gamePosts';

function StarRating({ value }) {
  if (!value) return <span style={{ color: '#6e6e73', fontSize: 13 }}>No rating</span>;
  return (
    <span style={{ color: '#c87000', fontWeight: 700, fontSize: 14 }}>
      {'★'.repeat(Math.round(value / 2))}{'☆'.repeat(5 - Math.round(value / 2))}
      <span style={{ color: '#6e6e73', marginLeft: 4, fontSize: 13 }}>{value}/10</span>
    </span>
  );
}

export default function BookmarksPage() {
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useQuery(BOOKMARKED_POSTS, {
    fetchPolicy: 'cache-and-network',
  });

  const [toggleBookmark, { loading: toggling }] = useMutation(TOGGLE_BOOKMARK, {
    onCompleted: () => refetch(),
  });

  const posts = data?.bookmarkedPosts ?? [];

  return (
    <div className="app-root">
      <div className="app-container">
        <DashboardNav />
        <h1 className="app-title">Bookmarks</h1>
        <p className="page-subtitle post-subtitle">
          
        </p>

        {loading && <p style={{ color: '#aaa', textAlign: 'center' }}>Loading bookmarks…</p>}
        {error && <p style={{ color: '#ff6b6b', textAlign: 'center' }}>Error: {error.message}</p>}

        {!loading && posts.length === 0 && (
          <div className="empty-state">
            <p>No bookmarks yet.</p>
            <p style={{ color: '#888', fontSize: 14 }}>Save games from the Community page.</p>
            <button className="btn-primary" style={{ marginTop: 16, padding: '0 24px', height: 42 }} onClick={() => navigate('/community')}>
              Browse Community
            </button>
          </div>
        )}

        <div className="community-grid">
          {posts.map((post) => (
            <div key={post.id} className="community-card card">
              {post.coverImageUrl && (
                <img
                  src={post.coverImageUrl}
                  alt={post.title}
                  className="community-card__cover"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              )}
              <div className="community-card__body">
                <div className="community-card__top">
                  <h3 className="community-card__title">{post.title}</h3>
                  <StarRating value={post.rating} />
                </div>
                <div className="community-card__meta">
                  {post.genre && <span className="badge">{post.genre}</span>}
                  {post.platform && <span className="badge">{post.platform}</span>}
                </div>
                {post.tags?.length > 0 && (
                  <div className="community-card__tags">
                    {post.tags.map((t) => <span key={t} className="tag">#{t}</span>)}
                  </div>
                )}
                <p className="community-card__review">
                  {post.review?.length > 140 ? post.review.slice(0, 140) + '…' : post.review}
                </p>
                <div className="community-card__footer">
                  <span className="community-card__author">
                    by <strong>{post.postedBy?.username || 'Unknown'}</strong>
                  </span>
                  <span>♥ {post.likesCount} · 💬 {post.commentsCount}</span>
                </div>
                <div className="community-card__actions">
                  <button
                    className="btn-ghost"
                    style={{ fontSize: 13, height: 32 }}
                    onClick={() => navigate('/community')}
                  >
                    View in Community
                  </button>
                  <button
                    className={`btn-danger ${toggling ? 'is-loading' : ''}`}
                    style={{ fontSize: 13, height: 32 }}
                    disabled={toggling}
                    aria-busy={toggling}
                    onClick={() => toggleBookmark({ variables: { postId: post.id } })}
                    title="Remove bookmark"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
