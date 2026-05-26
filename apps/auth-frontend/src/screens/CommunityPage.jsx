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
  if (!value) return <span className="star-rating star-rating--empty">No rating</span>;
  return (
    <span className="star-rating">
      {'★'.repeat(Math.round(value / 2))}{'☆'.repeat(5 - Math.round(value / 2))}
      <span className="star-rating__value">{value}/10</span>
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
              <span className="badge badge--featured community-card__featured">⭐ Featured</span>
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
          <button className="btn-ghost community-card__view-btn" onClick={() => onExpand(post)}>
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
      <div className="modal-box modal-box--edit" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2 className="modal-title">Edit Post</h2>
        {errMsg && <div className="msg-error msg-error--spaced">{errMsg}</div>}
        <form onSubmit={submit} className="community-edit-form">
          <div className="community-edit-form__grid">
            <label className="community-form-label">
              Game Title *
              <input className="input" name="title" value={form.title} onChange={handle} required />
            </label>
            <label className="community-form-label">
              Genre
              <input className="input" name="genre" value={form.genre} onChange={handle} />
            </label>
            <label className="community-form-label">
              Platform
              <input className="input" name="platform" value={form.platform} onChange={handle} />
            </label>
            <label className="community-form-label">
              Rating (1-10)
              <input className="input" name="rating" type="number" min="1" max="10" value={form.rating} onChange={handle} />
            </label>
          </div>
          <label className="community-form-label">
            Tags (comma-separated)
            <input className="input" name="tags" value={form.tags} onChange={handle} />
          </label>
          <label className="community-form-label">
            Review *
            <textarea className="input textarea community-review-input" name="review" value={form.review} onChange={handle} rows={4} required />
          </label>
          <div className="community-edit-form__actions">
            <button className={`btn-primary community-edit-form__submit ${loading ? 'is-loading' : ''}`} type="submit" disabled={loading} aria-busy={loading}>
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
        <h2 className="modal-title">
          {post.title}
          {post.featured && <span className="badge badge--featured community-modal__featured">⭐ Featured</span>}
        </h2>
        {post.coverImageUrl && (
          <img src={post.coverImageUrl} alt={post.title} className="community-modal__cover" onError={(e) => { e.target.style.display = 'none'; }} />
        )}
        <StarRating value={post.rating} />
        <div className="community-modal__meta">
          {post.genre && <span className="badge">{post.genre}</span>}
          {post.platform && <span className="badge">{post.platform}</span>}
          {post.developer && <span className="badge badge--dim">{post.developer}</span>}
          {post.releaseYear && <span className="badge badge--dim">{post.releaseYear}</span>}
        </div>
        {post.tags?.length > 0 && (
          <div className="community-modal__tags">
            {post.tags.map((t) => <span key={t} className="tag">#{t}</span>)}
          </div>
        )}
        <p className="community-modal__review">{post.review}</p>
        {post.gameLink && (
          <a href={post.gameLink} target="_blank" rel="noopener noreferrer" className="btn-ghost community-modal__link">
            Game Link ↗
          </a>
        )}
        <p className="community-modal__stats">
          by {post.postedBy?.username} · {post.createdAt ? new Date(post.createdAt).toLocaleDateString() : ''}
          · ♥ {post.likesCount} · 💬 {post.commentsCount}
        </p>

        <h4 className="community-modal__comments-title">Comments ({post.commentsCount})</h4>
        <div className="community-comments-list">
          {(!post.comments || post.comments.length === 0) && (
            <p className="community-comments-list__empty">No comments yet. Be the first!</p>
          )}
          {post.comments?.map((c) => (
            <div key={c.id} className="community-comment">
              <strong className="community-comment__author">{c.author?.username}</strong>
              <span className="community-comment__time">{formatCommentDate(c.createdAt)}</span>
              {(isAdmin || currentUser?.id === c.author?.id) && (
                <button
                  onClick={() => handleDeleteComment(c.id)}
                  className="community-comment__delete"
                  title={isAdmin && currentUser?.id !== c.author?.id ? 'Delete comment (Admin)' : 'Delete your comment'}
                >
                  🗑
                </button>
              )}
              <p className="community-comment__text">{c.text}</p>
              <button
                onClick={() => toggleCommentLike({ variables: { postId: post.id, commentId: c.id } })}
                className={`community-comment__like ${c.likedBy?.includes(currentUser?.id) ? 'community-comment__like--active' : ''}`}
                title={c.likedBy?.includes(currentUser?.id) ? 'Unlike' : 'Like'}
              >
                ❤ {c.likeCount ?? 0} {c.likeCount === 1 ? 'like' : 'likes'}
              </button>
            </div>
          ))}
        </div>

        <div className="community-comment-form">
          <input
            className="input community-comment-form__input"
            placeholder="Add a comment…"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && commentText.trim()) addComment(); }}
          />
          <button
            className={`btn-primary community-comment-form__submit ${commenting ? 'is-loading' : ''}`}
            onClick={() => commentText.trim() && addComment()}
            disabled={commenting || !commentText.trim()}
            aria-busy={commenting}
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
        <div className="community-filters card community-filters--panel">
          <div className="community-filters__row">
            <input
              className="input community-filters__search"
              placeholder="Search games, keywords…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <input
              className="input community-filters__field"
              placeholder="Genre"
              value={filterGenre}
              onChange={(e) => setFilterGenre(e.target.value)}
            />
            <input
              className="input community-filters__field"
              placeholder="Platform"
              value={filterPlatform}
              onChange={(e) => setFilterPlatform(e.target.value)}
            />
            <select
              className="input community-filters__select"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {loading && <p className="community-status community-status--loading">Loading posts…</p>}
        {error && <p className="community-status community-status--error">Error: {error.message}</p>}

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
