// src/screens/BookmarksPage.jsx — Saved game posts
import React, { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { useNavigate } from 'react-router-dom';
import DashboardNav from '../components/DashboardNav';
import PostRatingSummary from '../components/PostRatingSummary';
import { PAGED_BOOKMARKS, TOGGLE_BOOKMARK } from '../gql/gamePosts';

const PAGE_SIZE = 8;

export default function BookmarksPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);

  const { data, loading, error, refetch } = useQuery(PAGED_BOOKMARKS, {
    variables: {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    },
    fetchPolicy: 'cache-and-network',
    notifyOnNetworkStatusChange: true,
  });

  const [toggleBookmark, { loading: toggling }] = useMutation(TOGGLE_BOOKMARK, {
    onCompleted: async () => {
      const result = await refetch();
      const totalCount = result?.data?.pagedBookmarks?.totalCount ?? 0;
      const nextTotalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
      if (page > nextTotalPages - 1) {
        setPage(nextTotalPages - 1);
      }
    },
  });

  const posts = data?.pagedBookmarks?.posts ?? [];
  const totalCount = data?.pagedBookmarks?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);

  return (
    <div className="app-root">
      <div className="app-container">
        <DashboardNav />
        <h1 className="app-title">Bookmarks</h1>
        <p className="page-subtitle post-subtitle">
          Your saved games, all in one place.
        </p>

        {loading && <p style={{ color: '#aaa', textAlign: 'center' }}>Loading bookmarks…</p>}
        {error && <p style={{ color: '#ff6b6b', textAlign: 'center' }}>Error: {error.message}</p>}

        {!loading && totalCount === 0 && (
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
                  <PostRatingSummary
                    authorRating={post.authorRating}
                    communityRating={post.communityRating}
                    ratingCount={post.ratingCount}
                    align="end"
                    compact
                  />
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

        {/* Pagination */}
        {totalCount > PAGE_SIZE && (
          <div className="bookmarks-pagination">
            <button
              className="btn-ghost bookmarks-pagination__btn"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
            >
              ‹ Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                className={`bookmarks-pagination__page ${i === safePage ? 'bookmarks-pagination__page--active' : ''}`}
                onClick={() => setPage(i)}
              >
                {i + 1}
              </button>
            ))}
            <button
              className="btn-ghost bookmarks-pagination__btn"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage === totalPages - 1}
            >
              Next ›
            </button>
            <span className="bookmarks-pagination__info">
              {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, totalCount)} of {totalCount}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
