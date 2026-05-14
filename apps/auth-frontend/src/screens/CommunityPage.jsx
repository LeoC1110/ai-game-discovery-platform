// src/screens/CommunityPage.jsx — Browse & interact with game recommendation posts
import React, { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { useNavigate } from 'react-router-dom';
import ThreeBackground from '../components/ThreeBackground';
import DashboardNav from '../components/DashboardNav';
import {
  ALL_POSTS,
  LIKE_POST,
  ADD_COMMENT,
  TOGGLE_BOOKMARK,
  DELETE_POST,
  EDIT_POST,
  DELETE_COMMENT,
  FEATURE_POST,
  TOGGLE_COMMENT_LIKE,
} from '../gql/gamePosts';

const ME_QUERY = gql`query MeCommunity { me { id username role } }`;

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'rating', label: 'Highest Rated' },
  { value: 'likes', label: 'Most Liked' },
  { value: 'comments', label: 'Most Commented' },
];

function StarRating({ value }) {
  if (!value) return <span style={{ color: '#666', fontSize: 13 }}>No rating</span>;
  return (
    <span style={{ color: '#ffd60a', fontWeight: 700, fontSize: 14 }}>
      {'★'.repeat(Math.round(value / 2))}{'☆'.repeat(5 - Math.round(value / 2))}
      <span style={{ color: '#aaa', marginLeft: 4, fontSize: 13 }}>{value}/10</span>
    </span>
  );
}

function PostCard({ post, currentUser, onLike, onBookmark, onExpand, onDelete, onEdit, onFeature }) {
  const isOwner = currentUser?.id === post.postedBy?.id;
  const isAdmin = currentUser?.role === 'Admin';

  return (
    <div className="community-card card">
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
          <h3 className="community-card__title">
            {post.title}
            {post.featured && (
              <span className="badge badge--featured" style={{ marginLeft: 8 }}>⭐ Featured</span>
            )}
          </h3>
          <StarRating value={post.rating} />
        </div>
        <div className="community-card__meta">
          {post.genre && <span className="badge">{post.genre}</span>}
          {post.platform && <span className="badge">{post.platform}</span>}
          {post.gameType && <span className="badge badge--dim">{post.gameType}</span>}
        </div>
        {post.tags?.length > 0 && (
          <div className="community-card__tags">
            {post.tags.map((t) => (
              <span key={t} className="tag">#{t}</span>
            ))}
          </div>
        )}
        <p className="community-card__review">
          {post.review?.length > 160 ? post.review.slice(0, 160) + '…' : post.review}
        </p>
        <div className="community-card__footer">
          <span className="community-card__author">
            by <strong>{post.postedBy?.username || 'Unknown'}</strong>
          </span>
          <span className="community-card__date">
            {post.createdAt ? new Date(post.createdAt).toLocaleDateString() : ''}
          </span>
        </div>

        {/* Reaction buttons — all users */}
        <div className="community-card__actions">
          <button
            className={`btn-reaction ${post.isLikedByMe ? 'btn-reaction--active' : ''}`}
            onClick={() => onLike(post.id)}
            title="Like"
          >
            ♥ {post.likesCount}
          </button>
          <button
            className={`btn-reaction ${post.isBookmarkedByMe ? 'btn-reaction--active' : ''}`}
            onClick={() => onBookmark(post.id)}
            title="Bookmark"
          >
            🔖 {post.bookmarksCount}
          </button>
          <button className="btn-ghost" style={{ fontSize: 13, height: 30 }} onClick={() => onExpand(post)}>
            💬 {post.commentsCount} · View
          </button>
        </div>

        {/* Owner actions */}
        {(isOwner || isAdmin) && (
          <div className="community-card__mod-actions">
            {isOwner && (
              <button className="btn-mod btn-mod--edit" onClick={() => onEdit(post)} title="Edit post">
                ✏ Edit
              </button>
            )}
            <button
              className="btn-mod btn-mod--delete"
              onClick={() => onDelete(post.id)}
              title="Delete post"
            >
              🗑 Delete
            </button>
          </div>
        )}

        {/* Admin-only moderation */}
        {isAdmin && (
          <div className="community-card__mod-actions">
            <button
              className={`btn-mod ${post.featured ? 'btn-mod--unfeature' : 'btn-mod--feature'}`}
              onClick={() => onFeature(post.id, !post.featured)}
              title={post.featured ? 'Unfeature post' : 'Feature post'}
            >
              {post.featured ? '★ Unfeature' : '☆ Feature'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EditModal({ post, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: post.title || '',
    genre: post.genre || '',
    platform: post.platform || '',
    developer: post.developer || '',
    releaseYear: post.releaseYear ? String(post.releaseYear) : '',
    gameType: post.gameType || '',
    rating: post.rating ? String(post.rating) : '',
    coverImageUrl: post.coverImageUrl || '',
    gameLink: post.gameLink || '',
    tags: post.tags?.join(', ') || '',
    review: post.review || '',
  });
  const [errMsg, setErrMsg] = useState(null);

  const [editPost, { loading }] = useMutation(EDIT_POST, {
    onCompleted: () => { onSaved(); onClose(); },
    onError: (err) => setErrMsg(err.message),
    refetchQueries: [{ query: ALL_POSTS }],
  });

  const handle = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setErrMsg('Title is required'); return; }
    if (!form.review.trim()) { setErrMsg('Review is required'); return; }
    const tags = form.tags.split(',').map((t) => t.trim()).filter(Boolean);
    editPost({
      variables: {
        id: post.id,
        input: {
          title: form.title.trim(),
          genre: form.genre || undefined,
          platform: form.platform || undefined,
          developer: form.developer || undefined,
          releaseYear: form.releaseYear ? Number(form.releaseYear) : undefined,
          gameType: form.gameType || undefined,
          rating: form.rating ? Number(form.rating) : undefined,
          coverImageUrl: form.coverImageUrl || undefined,
          gameLink: form.gameLink || undefined,
          tags: tags.length ? tags : undefined,
          review: form.review.trim(),
        },
      },
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2 style={{ marginTop: 0 }}>Edit Post</h2>
        {errMsg && <div className="msg-error" style={{ marginBottom: 12 }}>{errMsg}</div>}
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: '#bcc6da' }}>
              Game Title *
              <input className="input" name="title" value={form.title} onChange={handle} required />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: '#bcc6da' }}>
              Genre
              <input className="input" name="genre" value={form.genre} onChange={handle} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: '#bcc6da' }}>
              Platform
              <input className="input" name="platform" value={form.platform} onChange={handle} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: '#bcc6da' }}>
              Rating (1-10)
              <input className="input" name="rating" type="number" min="1" max="10" value={form.rating} onChange={handle} />
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: '#bcc6da' }}>
            Tags (comma-separated)
            <input className="input" name="tags" value={form.tags} onChange={handle} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: '#bcc6da' }}>
            Review *
            <textarea className="input textarea" name="review" value={form.review} onChange={handle} rows={4} required style={{ minHeight: 90 }} />
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-primary" type="submit" disabled={loading} style={{ flex: 1 }}>
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PostModal({ post, currentUser, onClose, onRefetch }) {
  const [commentText, setCommentText] = useState('');
  const isAdmin = currentUser?.role === 'Admin';

  const formatCommentDate = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString(undefined, {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const [addComment, { loading: commenting }] = useMutation(ADD_COMMENT, {
    variables: { postId: post.id, text: commentText },
    onCompleted: () => { setCommentText(''); onRefetch(); },
  });

  const [deleteComment] = useMutation(DELETE_COMMENT, {
    onCompleted: () => onRefetch(),
  });

  const [toggleCommentLike] = useMutation(TOGGLE_COMMENT_LIKE);

  const handleDeleteComment = (commentId) => {
    if (!window.confirm('Delete this comment?')) return;
    deleteComment({ variables: { postId: post.id, commentId } });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2 style={{ marginTop: 0 }}>
          {post.title}
          {post.featured && <span className="badge badge--featured" style={{ marginLeft: 10, fontSize: 13 }}>⭐ Featured</span>}
        </h2>
        {post.coverImageUrl && (
          <img src={post.coverImageUrl} alt={post.title} style={{ width: '100%', borderRadius: 8, marginBottom: 12 }} onError={(e) => { e.target.style.display = 'none'; }} />
        )}
        <StarRating value={post.rating} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
          {post.genre && <span className="badge">{post.genre}</span>}
          {post.platform && <span className="badge">{post.platform}</span>}
          {post.developer && <span className="badge badge--dim">{post.developer}</span>}
          {post.releaseYear && <span className="badge badge--dim">{post.releaseYear}</span>}
        </div>
        {post.tags?.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {post.tags.map((t) => <span key={t} className="tag">#{t}</span>)}
          </div>
        )}
        <p style={{ lineHeight: 1.7, color: '#d0d5e8' }}>{post.review}</p>
        {post.gameLink && (
          <a href={post.gameLink} target="_blank" rel="noopener noreferrer" className="btn-ghost" style={{ display: 'inline-block', marginBottom: 12 }}>
            Game Link ↗
          </a>
        )}
        <p style={{ fontSize: 13, color: '#888' }}>
          by {post.postedBy?.username} · {post.createdAt ? new Date(post.createdAt).toLocaleDateString() : ''}
          · ♥ {post.likesCount} · 💬 {post.commentsCount}
        </p>

        <h4 style={{ marginBottom: 8 }}>Comments ({post.commentsCount})</h4>
        <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(!post.comments || post.comments.length === 0) && (
            <p style={{ color: '#666', fontSize: 13 }}>No comments yet. Be the first!</p>
          )}
          {post.comments?.map((c) => (
            <div key={c.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 12px', position: 'relative' }}>
              <strong style={{ fontSize: 13 }}>{c.author?.username}</strong>
              <span style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>{formatCommentDate(c.createdAt)}</span>
              {(isAdmin || currentUser?.id === c.author?.id) && (
                <button
                  onClick={() => handleDeleteComment(c.id)}
                  style={{ position: 'absolute', right: 8, top: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,80,80,0.7)', fontSize: 12, padding: 0 }}
                  title={isAdmin && currentUser?.id !== c.author?.id ? 'Delete comment (Admin)' : 'Delete your comment'}
                >
                  🗑
                </button>
              )}
              <p style={{ margin: '4px 0 0', fontSize: 14, color: '#ccc' }}>{c.text}</p>
              <button
                onClick={() => toggleCommentLike({ variables: { postId: post.id, commentId: c.id } })}
                style={{
                  marginTop: 6,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  padding: 0,
                  color: c.likedBy?.includes(currentUser?.id) ? '#ff6b9d' : '#888',
                  fontWeight: c.likedBy?.includes(currentUser?.id) ? 700 : 400,
                }}
                title={c.likedBy?.includes(currentUser?.id) ? 'Unlike' : 'Like'}
              >
                ❤ {c.likeCount ?? 0} {c.likeCount === 1 ? 'like' : 'likes'}
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder="Add a comment…"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && commentText.trim()) addComment(); }}
          />
          <button
            className="btn-primary"
            style={{ height: 40, padding: '0 16px', fontSize: 13 }}
            onClick={() => commentText.trim() && addComment()}
            disabled={commenting || !commentText.trim()}
          >
            {commenting ? '…' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CommunityPage() {
  const [search, setSearch] = useState('');
  const [filterGenre, setFilterGenre] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('');
  const [sort, setSort] = useState('newest');
  const [expandedPost, setExpandedPost] = useState(null);
  const [editingPost, setEditingPost] = useState(null);

  const { data: meData } = useQuery(ME_QUERY, { fetchPolicy: 'cache-first' });
  const currentUser = meData?.me;

  const { data, loading, error, refetch } = useQuery(ALL_POSTS, {
    variables: { search: search || undefined, genre: filterGenre || undefined, platform: filterPlatform || undefined, sort },
    fetchPolicy: 'cache-and-network',
  });

  const [likePost] = useMutation(LIKE_POST, { onCompleted: () => refetch() });
  const [toggleBookmark] = useMutation(TOGGLE_BOOKMARK, { onCompleted: () => refetch() });
  const [deletePost] = useMutation(DELETE_POST, {
    onCompleted: () => refetch(),
    refetchQueries: [{ query: ALL_POSTS }],
  });
  const [featurePost] = useMutation(FEATURE_POST, { onCompleted: () => refetch() });

  const handleDelete = (id) => {
    if (!window.confirm('Delete this post?')) return;
    deletePost({ variables: { id } });
  };

  const handleFeature = (id, featured) => {
    featurePost({ variables: { id, featured } });
  };

  const posts = data?.allPosts ?? [];
  // Always derive the modal's post from the live posts array so that
  // after a refetch (cache-and-network or onRefetch) the modal sees
  // fresh comments instead of the stale snapshot stored in expandedPost state.
  const liveExpandedPost = expandedPost
    ? (posts.find((p) => p.id === expandedPost.id) ?? expandedPost)
    : null;

  return (
    <div className="app-root">
      <ThreeBackground />
      <div className="bg-vignette" />
      <div className="app-container">
        <DashboardNav />
        <h1 className="app-title">Community</h1>
        <p className="page-subtitle post-subtitle">
          Discover game recommendations from players around the world.
        </p>

        {/* Filters */}
        <div className="community-filters card" style={{ marginBottom: 24 }}>
          <div className="community-filters__row">
            <input
              className="input"
              placeholder="Search games, keywords…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 2, minWidth: 180 }}
            />
            <input
              className="input"
              placeholder="Genre"
              value={filterGenre}
              onChange={(e) => setFilterGenre(e.target.value)}
              style={{ flex: 1, minWidth: 120 }}
            />
            <input
              className="input"
              placeholder="Platform"
              value={filterPlatform}
              onChange={(e) => setFilterPlatform(e.target.value)}
              style={{ flex: 1, minWidth: 120 }}
            />
            <select
              className="input"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              style={{ flex: 1, minWidth: 140 }}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {loading && <p style={{ color: '#aaa', textAlign: 'center' }}>Loading posts…</p>}
        {error && <p style={{ color: '#ff6b6b', textAlign: 'center' }}>Error: {error.message}</p>}

        {!loading && posts.length === 0 && (
          <div className="empty-state">
            <p>No posts found. Be the first to post a game recommendation!</p>
          </div>
        )}

        <div className="community-grid">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUser={currentUser}
              onLike={(id) => likePost({ variables: { id } })}
              onBookmark={(id) => toggleBookmark({ variables: { postId: id } })}
              onExpand={(p) => setExpandedPost(p)}
              onDelete={handleDelete}
              onEdit={(p) => setEditingPost(p)}
              onFeature={handleFeature}
            />
          ))}
        </div>
      </div>

      {liveExpandedPost && (
        <PostModal
          post={liveExpandedPost}
          currentUser={currentUser}
          onClose={() => setExpandedPost(null)}
          onRefetch={refetch}
        />
      )}

      {editingPost && (
        <EditModal
          post={editingPost}
          onClose={() => setEditingPost(null)}
          onSaved={() => { setEditingPost(null); refetch(); }}
        />
      )}
    </div>
  );
}
