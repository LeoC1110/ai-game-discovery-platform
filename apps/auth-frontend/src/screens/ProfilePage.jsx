// src/screens/ProfilePage.jsx — User profile with own posts and bookmarks
import React, { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import DashboardNav from '../components/DashboardNav';
import { MY_POSTS, BOOKMARKED_POSTS, DELETE_POST } from '../gql/gamePosts';
import { CHANGE_PASSWORD } from '../gql/changePassword';

const ME_QUERY = gql`
  query MeProfile {
    me { id username email role createdAt }
  }
`;

const TABS = ['My Posts', 'Bookmarks', 'Change Password'];

function StarRating({ value }) {
  if (!value) return <span style={{ color: '#666', fontSize: 13 }}>No rating</span>;
  return (
    <span style={{ color: '#ffd60a', fontWeight: 700, fontSize: 13 }}>
      {'★'.repeat(Math.round(value / 2))}{'☆'.repeat(5 - Math.round(value / 2))}
      <span style={{ color: '#aaa', marginLeft: 4 }}> {value}/10</span>
    </span>
  );
}

function PostRow({ post, isOwner, onDelete, deleting }) {
  const isIdea = post.postType === 'IDEA';
  return (
    <div className="community-card card" style={{ marginBottom: 0 }}>
      <div className="community-card__body">
        <div className="community-card__top">
          <h3 className="community-card__title" style={{ fontSize: 16 }}>
            {isIdea ? 'Share Your Idea' : post.title}
          </h3>
          {!isIdea && <StarRating value={post.rating} />}
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
        {isOwner && (
          <div className="community-card__actions" style={{ marginTop: 8 }}>
            <button
              className="btn-danger"
              style={{ fontSize: 12, height: 30 }}
              disabled={deleting}
              onClick={() => onDelete(post.id)}
            >
              Delete Post
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState('My Posts');

  // Change password form state
  const [cpCurrent, setCpCurrent] = useState('');
  const [cpNew, setCpNew] = useState('');
  const [cpConfirm, setCpConfirm] = useState('');
  const [cpMsg, setCpMsg] = useState('');
  const [cpOk, setCpOk] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const { data: meData, loading: meLoading } = useQuery(ME_QUERY, { fetchPolicy: 'cache-and-network' });
  const { data: postsData, loading: postsLoading, refetch: refetchPosts } = useQuery(MY_POSTS, { fetchPolicy: 'cache-and-network' });
  const { data: bookmarkData, loading: bookmarksLoading } = useQuery(BOOKMARKED_POSTS, { fetchPolicy: 'cache-and-network' });

  const [deletePost, { loading: deleting }] = useMutation(DELETE_POST, {
    onCompleted: () => refetchPosts(),
  });

  const [changePassword, { loading: cpLoading }] = useMutation(CHANGE_PASSWORD, {
    onCompleted: (data) => {
      const res = data?.changePassword;
      if (res?.ok) {
        setCpOk(true);
        setCpMsg('Password changed successfully.');
        setCpCurrent('');
        setCpNew('');
        setCpConfirm('');
      } else {
        setCpOk(false);
        setCpMsg(res?.message || 'Failed to change password.');
      }
    },
    onError: (err) => {
      setCpOk(false);
      setCpMsg(err.message || 'Network error. Please try again.');
    },
  });

  const handleChangePassword = (e) => {
    e.preventDefault();
    setCpMsg('');
    setCpOk(false);

    if (!cpCurrent || !cpNew || !cpConfirm) {
      setCpMsg('All fields are required.');
      return;
    }
    if (cpNew !== cpConfirm) {
      setCpMsg('New password and confirm password do not match.');
      return;
    }
    if (cpNew.length < 6) {
      setCpMsg('New password must be at least 6 characters.');
      return;
    }

    const me = meData?.me;
    changePassword({
      variables: {
        identifier: me?.email || me?.username || '',
        oldPassword: cpCurrent,
        newPassword: cpNew,
      },
    });
  };

  const me = meData?.me;
  const myPosts = postsData?.myPosts ?? [];
  const bookmarked = bookmarkData?.bookmarkedPosts ?? [];
  const myIdeaPosts = myPosts.filter((p) => p.postType === 'IDEA');
  const myGamePosts = myPosts.filter((p) => p.postType !== 'IDEA');

  return (
    <div className="app-root">
      <div className="app-container">
        <DashboardNav />
        <h1 className="app-title">My Profile</h1>
        <p className="page-subtitle post-subtitle">
          Manage your activity and account.
        </p>

        {/* User Info Card */}
        <div className="card" style={{ padding: 24, marginBottom: 28 }}>
          {meLoading ? (
            <p style={{ color: '#aaa' }}>Loading…</p>
          ) : me ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #0a84ff, #30d158)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24, fontWeight: 700, color: '#fff', flexShrink: 0,
                }}>
                  {me.username?.[0]?.toUpperCase() || '?'}
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{me.username}</p>
                  <p style={{ margin: 0, fontSize: 14, color: '#aaa' }}>{me.email}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                <span className="badge">{me.role || 'Player'}</span>
                <span className="badge badge--dim">Posts: {myPosts.length}</span>
                <span className="badge badge--dim">Ideas: {myIdeaPosts.length}</span>
                <span className="badge badge--dim">Bookmarks: {bookmarked.length}</span>
                {me.createdAt && (
                  <span className="badge badge--dim">
                    Joined {new Date(me.createdAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p style={{ color: '#aaa' }}>Unable to load profile.</p>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {TABS.map((tab) => (
            <button
              key={tab}
              className={activeTab === tab ? 'btn-primary' : 'btn-ghost'}
              style={{ height: 38, padding: '0 20px', fontSize: 14 }}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'My Posts' ? `My Posts (${myPosts.length})` : tab === 'Bookmarks' ? `Bookmarks (${bookmarked.length})` : tab}
            </button>
          ))}
        </div>

        {/* My Posts */}
        {activeTab === 'My Posts' && (
          <div>
            {postsLoading && <p style={{ color: '#aaa' }}>Loading posts…</p>}
            {!postsLoading && myPosts.length === 0 && (
              <div className="empty-state">
                <p>You haven't posted anything yet.</p>
              </div>
            )}
            {!postsLoading && myIdeaPosts.length > 0 && (
              <>
                <h3 style={{ margin: '0 0 12px' }}>My Ideas</h3>
                <div className="community-grid" style={{ marginBottom: 18 }}>
                  {myIdeaPosts.map((post) => (
                    <PostRow
                      key={post.id}
                      post={post}
                      isOwner={true}
                      onDelete={(id) => {
                        if (window.confirm('Delete this post?')) {
                          deletePost({ variables: { id } });
                        }
                      }}
                      deleting={deleting}
                    />
                  ))}
                </div>
              </>
            )}
            {!postsLoading && myGamePosts.length > 0 && (
              <>
                <h3 style={{ margin: '0 0 12px' }}>My Game Posts</h3>
                <div className="community-grid">
                  {myGamePosts.map((post) => (
                    <PostRow
                      key={post.id}
                      post={post}
                      isOwner={true}
                      onDelete={(id) => {
                        if (window.confirm('Delete this post?')) {
                          deletePost({ variables: { id } });
                        }
                      }}
                      deleting={deleting}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Bookmarks */}
        {activeTab === 'Bookmarks' && (
          <div>
            {bookmarksLoading && <p style={{ color: '#aaa' }}>Loading bookmarks…</p>}
            {!bookmarksLoading && bookmarked.length === 0 && (
              <div className="empty-state">
                <p>No bookmarks yet. Save games from the Community page.</p>
              </div>
            )}
            <div className="community-grid">
              {bookmarked.map((post) => (
                <PostRow
                  key={post.id}
                  post={post}
                  isOwner={false}
                  onDelete={() => {}}
                  deleting={false}
                />
              ))}
            </div>
          </div>
        )}

        {/* Change Password */}
        {activeTab === 'Change Password' && (
          <div className="card" style={{ padding: 24, maxWidth: 480 }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700 }}>Change Password</h2>
            <p style={{ margin: '0 0 20px', color: '#6e6e73', fontSize: 14 }}>
              Enter your current password to set a new one.
            </p>
            <form onSubmit={handleChangePassword} autoComplete="off">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                <label style={{ fontSize: 13, fontWeight: 600, color: '#3a3a3c' }}>
                  Current Password
                  <div className="password-input-wrap" style={{ marginTop: 4 }}>
                    <input
                      className="input password-input"
                      type={showCurrent ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={cpCurrent}
                      onChange={(e) => setCpCurrent(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
                      onClick={() => setShowCurrent((v) => !v)}
                    >
                      {showCurrent ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>

                <label style={{ fontSize: 13, fontWeight: 600, color: '#3a3a3c' }}>
                  New Password
                  <div className="password-input-wrap" style={{ marginTop: 4 }}>
                    <input
                      className="input password-input"
                      type={showNew ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={cpNew}
                      onChange={(e) => setCpNew(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      aria-label={showNew ? 'Hide new password' : 'Show new password'}
                      onClick={() => setShowNew((v) => !v)}
                    >
                      {showNew ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>

                <label style={{ fontSize: 13, fontWeight: 600, color: '#3a3a3c' }}>
                  Confirm New Password
                  <div className="password-input-wrap" style={{ marginTop: 4 }}>
                    <input
                      className="input password-input"
                      type={showConfirm ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={cpConfirm}
                      onChange={(e) => setCpConfirm(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                      onClick={() => setShowConfirm((v) => !v)}
                    >
                      {showConfirm ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>

                <button
                  type="submit"
                  className={`btn-primary${cpLoading ? ' is-loading' : ''}`}
                  disabled={cpLoading}
                  aria-busy={cpLoading}
                  style={{ marginTop: 4 }}
                >
                  {cpLoading ? 'Saving…' : 'Update Password'}
                </button>

                {cpMsg && (
                  <div
                    className="auth-hint"
                    role="alert"
                    style={cpOk ? { color: '#30d158', borderColor: '#30d158' } : undefined}
                  >
                    {cpMsg}
                  </div>
                )}
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
