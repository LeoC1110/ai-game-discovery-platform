// src/screens/UserProfilePage.jsx — Public user profile view
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, gql } from '@apollo/client';
import DashboardNav from '../components/DashboardNav';
import PostRatingSummary from '../components/PostRatingSummary';
import { PUBLIC_USER_PROFILE } from '../gql/users';
import './Users.css';

const TABS = ['Posts', 'Bookmarks'];
const ME_QUERY = gql`query MeUserProfile { me { id } }`;

function PostCard({ post }) {
  const isIdea = post.postType === 'IDEA';
  return (
    <div className="community-card card">
      <div className="community-card__body">
        <div className="community-card__top">
          <h3 className="community-card__title" style={{ fontSize: 15 }}>
            {isIdea ? <em>Idea Post</em> : post.title}
          </h3>
          {!isIdea && (
            <PostRatingSummary
              authorRating={post.authorRating}
              communityRating={post.communityRating}
              ratingCount={post.ratingCount}
              align="end"
              compact
            />
          )}
        </div>
        <div className="community-card__meta">
          <span className="badge badge--dim">{isIdea ? 'IDEA' : 'GAME'}</span>
          {!isIdea && post.genre && <span className="badge">{post.genre}</span>}
          {!isIdea && post.platform && <span className="badge">{post.platform}</span>}
        </div>
        {!isIdea && post.tags?.length > 0 && (
          <div className="community-card__tags">
            {post.tags.map((t) => <span key={t} className="tag">#{t}</span>)}
          </div>
        )}
        <p className="community-card__review" style={{ fontSize: 13 }}>
          {post.review?.length > 120 ? post.review.slice(0, 120) + '…' : post.review}
        </p>
        <div className="community-card__footer">
          <span style={{ fontSize: 12, color: '#888' }}>
            {post.createdAt ? new Date(post.createdAt).toLocaleDateString() : ''}
          </span>
          <span>♥ {post.likesCount} · 💬 {post.commentsCount} · 🔖 {post.bookmarksCount}</span>
        </div>
      </div>
    </div>
  );
}

export default function UserProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('Posts');

  const source = location.state?.from;
  const backTarget = source === 'community'
    ? '/community'
    : source === 'bookmarks'
      ? '/bookmarks'
      : '/users';
  const backLabel = source === 'community'
    ? '← Back to Community'
    : source === 'bookmarks'
      ? '← Back to Bookmarks'
      : '← Back to Users';

  const { data: meData } = useQuery(ME_QUERY, { fetchPolicy: 'cache-first' });
  const { data, loading, error } = useQuery(PUBLIC_USER_PROFILE, {
    variables: { id },
    fetchPolicy: 'cache-and-network',
  });
  const [profile, setProfile] = useState(null);
  useEffect(() => {
    setProfile(data?.publicUserProfile ?? null);
  }, [data]);

  const isOwnProfile = profile?.id && meData?.me?.id === profile.id;

  const tabContent = {
    Posts: profile?.posts ?? [],
    Bookmarks: profile?.bookmarkedPosts ?? [],
  };

  const currentList = tabContent[activeTab] ?? [];

  return (
    <div className="app-root">
      <div className="app-container">
        <DashboardNav />

        <button
          className="btn-ghost users-back-btn"
          onClick={() => navigate(backTarget)}
        >
          {backLabel}
        </button>

        {loading && <p className="users-status">Loading profile…</p>}
        {error && <p className="users-status users-status--error">Error: {error.message}</p>}
        {!loading && !error && !profile && (
          <div className="empty-state"><p>User not found.</p></div>
        )}

        {profile && (
          <>
            {/* ── Profile header card ───────────────────────────────────── */}
            <div className="card users-profile-card">
              <h1 className="users-profile-card__name">{profile.username}</h1>
              <p className="users-profile-card__id">ID: {profile.id}</p>
              <div className="users-profile-card__stats">
                <div className="users-profile-stat">
                  <span className="users-profile-stat__num">{profile.postCount}</span>
                  <span className="users-profile-stat__label">Posts</span>
                </div>
                <div className="users-profile-stat">
                  <span className="users-profile-stat__num">{profile.likesReceived}</span>
                  <span className="users-profile-stat__label">Likes received</span>
                </div>
                <div className="users-profile-stat">
                  <span className="users-profile-stat__num">{profile.commentCount}</span>
                  <span className="users-profile-stat__label">Comments</span>
                </div>
                <div className="users-profile-stat">
                  <span className="users-profile-stat__num">{profile.bookmarkCount}</span>
                  <span className="users-profile-stat__label">Bookmarks</span>
                </div>
                <div className="users-profile-stat">
                  <span className="users-profile-stat__num">{profile.followerCount}</span>
                  <span className="users-profile-stat__label">Followers</span>
                </div>
                <div className="users-profile-stat">
                  <span className="users-profile-stat__num">{profile.followingCount}</span>
                  <span className="users-profile-stat__label">Following</span>
                </div>
              </div>
            </div>

            {/* ── Tabs ─────────────────────────────────────────────────── */}
            <div className="users-tabs">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  className={`users-tab ${activeTab === tab ? 'users-tab--active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                  <span className="users-tab__count">
                    {tabContent[tab].length}
                  </span>
                </button>
              ))}
            </div>

            {/* ── Tab content ──────────────────────────────────────────── */}
            {currentList.length === 0 ? (
              <div className="empty-state">
                <p>
                  {activeTab === 'Posts'
                    ? 'This user has no posts yet.'
                    : 'No bookmarked posts to show.'}
                </p>
              </div>
            ) : (
              <div className="users-post-grid">
                {currentList.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
