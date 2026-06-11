// src/screens/CommunityPage.jsx — Browse & interact with game recommendation posts
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { useNavigate, useLocation } from 'react-router-dom';
import DashboardNav from '../components/DashboardNav';
import PostRatingSummary from '../components/PostRatingSummary';
import {
  PAGED_POSTS,
  LIKE_POST,
  ADD_COMMENT,
  RATE_POST,
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

const GENRE_OPTIONS = [
  'Action', 'Adventure', 'RPG', 'Strategy', 'Simulation', 'Sports', 'Racing',
  'Puzzle', 'Platformer', 'Shooter', 'Fighting', 'Horror', 'Survival', 'Sandbox',
  'Roguelike', 'Open-world', 'Casual', 'Indie', 'Multiplayer', 'Other',
];
const PLATFORM_OPTIONS = [
  'PC', 'PlayStation', 'Xbox', 'Nintendo Switch', 'iOS', 'Android',
  'Web Browser', 'Steam Deck', 'Other',
];

function PostCard({ post, currentUser, onLike, onBookmark, onExpand, onDelete, onEdit, onFeature, onRate }) {
  const isOwner = currentUser?.id === post.postedBy?.id;
  const isAdmin = currentUser?.role === 'Admin';
  const isIdea = post.postType === 'IDEA';
  const canRate = Boolean(currentUser?.id) && !isOwner && !isIdea;
  const [showRatePopover, setShowRatePopover] = useState(false);
  const [ratingValue, setRatingValue] = useState(post.myCommunityRating != null ? String(post.myCommunityRating) : '');
  const [ratingError, setRatingError] = useState(null);
  const [savingRating, setSavingRating] = useState(false);

  useEffect(() => {
    setRatingValue(post.myCommunityRating != null ? String(post.myCommunityRating) : '');
  }, [post.myCommunityRating]);

  const submitCardRating = async () => {
    const score = Number(ratingValue);
    if (!Number.isInteger(score) || score < 1 || score > 10) {
      setRatingError('Rating must be an integer from 1 to 10.');
      return;
    }
    setSavingRating(true);
    setRatingError(null);
    try {
      await onRate(post.id, score);
      setShowRatePopover(false);
    } catch (err) {
      setRatingError(err?.message || 'Unable to submit rating.');
    } finally {
      setSavingRating(false);
    }
  };

  return (
    <div className={`community-card card ${isIdea ? 'community-card--idea' : ''}`}>
      {!isIdea && post.coverImageUrl && (
        <img
          src={post.coverImageUrl}
          alt={post.title}
          className="community-card__cover"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
      )}
      <div className="community-card__body">
        <div className="community-card__type-badge">
          <span className={`badge ${isIdea ? 'badge--type-idea' : 'badge--type-game'}`}>
            {isIdea ? 'Idea' : 'Game Post'}
          </span>
        </div>
        <div className="community-card__top">
          {isIdea ? (
            <h3
              className="community-card__title community-card__title--idea"
              style={isOwner ? { color: '#e03535' } : undefined}
            >
              Share Your Idea
            </h3>
          ) : (
            <h3
              className="community-card__title"
              style={isOwner ? { color: '#e03535' } : undefined}
            >
              {post.title}
              {post.featured && (
                <span className="badge badge--featured community-card__featured">⭐ Featured</span>
              )}
            </h3>
          )}
          {!isIdea && (
            <PostRatingSummary
              communityRating={post.communityRating}
              ratingCount={post.ratingCount}
              interactive
              disabled={!canRate}
              onCommunityClick={() => {
                if (!canRate) return;
                setRatingError(null);
                setShowRatePopover((prev) => !prev);
              }}
              align="end"
              compact
            />
          )}
        </div>
        {!isIdea && showRatePopover && canRate && (
          <div className="community-rating-popover" role="dialog" aria-label="Rate this game">
            <p className="community-rating-popover__title">Rate this game</p>
            <div className="community-rating-popover__grid">
              {Array.from({ length: 10 }, (_entry, idx) => {
                const value = String(idx + 1);
                return (
                  <button
                    key={value}
                    type="button"
                    className={`community-rating-popover__score ${ratingValue === value ? 'community-rating-popover__score--active' : ''}`}
                    onClick={() => setRatingValue(value)}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
            <div className="community-rating-popover__actions">
              <button
                type="button"
                className={`btn-primary ${savingRating ? 'is-loading' : ''}`}
                disabled={savingRating}
                aria-busy={savingRating}
                onClick={submitCardRating}
              >
                {savingRating ? 'Saving…' : post.myCommunityRating != null ? 'Update' : 'Submit'}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowRatePopover(false)}
              >
                Cancel
              </button>
            </div>
            {ratingError && <p className="msg-error msg-error--spaced">{ratingError}</p>}
          </div>
        )}
        {!isIdea && (
          <div className="community-card__meta">
            {post.genre && <span className="badge">{post.genre}</span>}
            {post.platform && <span className="badge">{post.platform}</span>}
            {post.gameType && <span className="badge badge--dim">{post.gameType}</span>}
          </div>
        )}
        {!isIdea && post.tags?.length > 0 && (
          <div className="community-card__tags">
            {post.tags.slice(0, 3).map((t) => (
              <span key={t} className="tag">#{t}</span>
            ))}
            {post.tags.length > 3 && (
              <span className="tag tag--more">+{post.tags.length - 3}</span>
            )}
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
  const isIdea = post.postType === 'IDEA';
  const initGenre = GENRE_OPTIONS.includes(post.genre || '') ? (post.genre || '') : (post.genre ? 'Other' : '');
  const initPlatform = PLATFORM_OPTIONS.includes(post.platform || '') ? (post.platform || '') : (post.platform ? 'Other' : '');
  const [form, setForm] = useState({
    title: post.title || '',
    genre: initGenre,
    genreOther: initGenre === 'Other' ? (post.genre || '') : '',
    platform: initPlatform,
    platformOther: initPlatform === 'Other' ? (post.platform || '') : '',
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
    onCompleted: (data) => { onSaved(data.editPost); onClose(); },
    onError: (err) => setErrMsg(err.message),
  });

  const handle = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (!isIdea && !form.title.trim()) { setErrMsg('Title is required'); return; }
    if (!form.review.trim()) { setErrMsg(isIdea ? 'Content is required' : 'Review is required'); return; }
    if (isIdea && form.review.trim().length > 500) { setErrMsg('Idea content must be 500 characters or less'); return; }
    const tags = form.tags.split(',').map((t) => t.trim()).filter(Boolean);
    editPost({
      variables: {
        id: post.id,
        input: {
          title: isIdea ? undefined : form.title.trim(),
          genre: isIdea ? undefined : (form.genre === 'Other' ? (form.genreOther.trim() || 'Other') : (form.genre || undefined)),
          platform: isIdea ? undefined : (form.platform === 'Other' ? (form.platformOther.trim() || 'Other') : (form.platform || undefined)),
          developer: isIdea ? undefined : form.developer || undefined,
          releaseYear: isIdea ? undefined : form.releaseYear ? Number(form.releaseYear) : undefined,
          gameType: isIdea ? undefined : form.gameType || undefined,
          rating: isIdea ? undefined : form.rating ? Number(form.rating) : undefined,
          coverImageUrl: isIdea ? undefined : form.coverImageUrl || undefined,
          gameLink: isIdea ? undefined : form.gameLink || undefined,
          tags: isIdea ? undefined : tags.length ? tags : undefined,
          review: form.review.trim(),
        },
      },
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box--edit" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2 className="modal-title">{isIdea ? 'Edit Idea' : 'Edit Post'}</h2>
        {errMsg && <div className="msg-error msg-error--spaced">{errMsg}</div>}
        <form onSubmit={submit} className="community-edit-form">
          {!isIdea && (
            <>
              <div className="community-edit-form__grid">
                <label className="community-form-label">
                  Game Title *
                  <input className="input" name="title" value={form.title} onChange={handle} required />
                </label>
                <label className="community-form-label">
                  Genre
                  <select className="input" name="genre" value={form.genre} onChange={handle}>
                    <option value="">Select a genre…</option>
                    {GENRE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                  {form.genre === 'Other' && (
                    <input className="input" name="genreOther" value={form.genreOther} onChange={handle} placeholder="Specify genre…" style={{ marginTop: 6 }} />
                  )}
                </label>
                <label className="community-form-label">
                  Platform
                  <select className="input" name="platform" value={form.platform} onChange={handle}>
                    <option value="">Select a platform…</option>
                    {PLATFORM_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  {form.platform === 'Other' && (
                    <input className="input" name="platformOther" value={form.platformOther} onChange={handle} placeholder="Specify platform…" style={{ marginTop: 6 }} />
                  )}
                </label>
                <label className="community-form-label">
                  Author Rating (1-10)
                  <input className="input" name="rating" type="number" min="1" max="10" value={form.rating} onChange={handle} />
                </label>
              </div>
              <label className="community-form-label">
                Tags (comma-separated)
                <input className="input" name="tags" value={form.tags} onChange={handle} />
              </label>
            </>
          )}
          <label className="community-form-label">
            {isIdea ? 'Idea content *' : 'Review *'}
            <textarea className="input textarea community-review-input" name="review" value={form.review} onChange={handle} rows={4} required maxLength={isIdea ? 500 : undefined} />
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

function PostModal({ post, currentUser, onClose, onUpdate }) {
  const [commentText, setCommentText] = useState('');
  const [ratingValue, setRatingValue] = useState(post.myCommunityRating ? String(post.myCommunityRating) : '');
  const [ratingError, setRatingError] = useState(null);
  const isAdmin = currentUser?.role === 'Admin';
  const isIdea = post.postType === 'IDEA';
  const isOwner = currentUser?.id === post.postedBy?.id;

  const formatCommentDate = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString(undefined, {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const [addComment, { loading: commenting }] = useMutation(ADD_COMMENT, {
    variables: { postId: post.id, text: commentText },
    onCompleted: ({ addComment: updated }) => { setCommentText(''); onUpdate(updated); },
  });

  const [deleteComment] = useMutation(DELETE_COMMENT, {
    onCompleted: ({ deleteComment: updated }) => onUpdate(updated),
  });

  const [toggleCommentLike] = useMutation(TOGGLE_COMMENT_LIKE, {
    onCompleted: ({ toggleCommentLike: updated }) => onUpdate(updated),
  });

  const [ratePost, { loading: savingRating }] = useMutation(RATE_POST, {
    onCompleted: ({ ratePost: updated }) => {
      setRatingError(null);
      setRatingValue(updated?.myCommunityRating != null ? String(updated.myCommunityRating) : '');
      onUpdate(updated);
    },
    onError: (err) => setRatingError(err.message),
  });

  const handleDeleteComment = (commentId) => {
    if (!window.confirm('Delete this comment?')) return;
    deleteComment({ variables: { postId: post.id, commentId } });
  };

  const handleRatePost = () => {
    const numericScore = Number(ratingValue);
    if (!Number.isInteger(numericScore) || numericScore < 1 || numericScore > 10) {
      setRatingError('Community rating must be an integer from 1 to 10.');
      return;
    }
    ratePost({ variables: { postId: post.id, score: numericScore } });
  };


  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2 className="modal-title">
          {isIdea ? 'Share Your Idea' : post.title}
          {post.featured && <span className="badge badge--featured community-modal__featured">⭐ Featured</span>}
        </h2>
        {!isIdea && post.coverImageUrl && (
          <img src={post.coverImageUrl} alt={post.title} className="community-modal__cover" onError={(e) => { e.target.style.display = 'none'; }} />
        )}
        {!isIdea && (
          <PostRatingSummary
            communityRating={post.communityRating}
            ratingCount={post.ratingCount}
            myCommunityRating={post.myCommunityRating}
            showMyRating
          />
        )}
        {!isIdea && (
          <div className="community-modal__meta">
            {post.genre && <span className="badge">{post.genre}</span>}
            {post.platform && <span className="badge">{post.platform}</span>}
            {post.developer && <span className="badge badge--dim">{post.developer}</span>}
            {post.releaseYear && <span className="badge badge--dim">{post.releaseYear}</span>}
          </div>
        )}
        {!isIdea && post.tags?.length > 0 && (
          <div className="community-modal__tags">
            {post.tags.map((t) => <span key={t} className="tag">#{t}</span>)}
          </div>
        )}
        <p className="community-modal__review">{post.review}</p>
        {!isIdea && post.gameLink && (
          <a href={post.gameLink} target="_blank" rel="noopener noreferrer" className="btn-ghost community-modal__link">
            Game Link ↗
          </a>
        )}
        <p className="community-modal__stats">
          by {post.postedBy?.username} · {post.createdAt ? new Date(post.createdAt).toLocaleDateString() : ''}
          · ♥ {post.likesCount} · 💬 {post.commentsCount}
        </p>

        {!isIdea && !isOwner && (
          <div className="card" style={{ padding: 16, marginBottom: 18, background: 'rgba(255,255,255,0.03)' }}>
            <p style={{ margin: '0 0 10px', fontWeight: 600 }}>Your Community Rating</p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                className="input"
                type="number"
                min="1"
                max="10"
                step="1"
                value={ratingValue}
                onChange={(e) => setRatingValue(e.target.value)}
                placeholder="1-10"
                style={{ width: 120 }}
              />
              <button
                type="button"
                className={`btn-primary ${savingRating ? 'is-loading' : ''}`}
                disabled={savingRating}
                aria-busy={savingRating}
                onClick={handleRatePost}
              >
                {savingRating ? 'Saving…' : post.myCommunityRating != null ? 'Update Rating' : 'Rate Post'}
              </button>
            </div>
            {ratingError && <p className="msg-error msg-error--spaced">{ratingError}</p>}
          </div>
        )}
        {!isIdea && isOwner && (
          <p style={{ margin: '0 0 14px', color: '#9a9aa3', fontSize: 13 }}>
            You cannot rate your own post.
          </p>
        )}

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
  const location = useLocation();
  const [search, setSearch] = useState(location.state?.search ?? '');
  const [filterGenre, setFilterGenre] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('');
  const [sort, setSort] = useState('newest');
  const [expandedPost, setExpandedPost] = useState(null);
  const [editingPost, setEditingPost] = useState(null);
  const [filterType, setFilterType] = useState('');

  // ── Pagination state ─────────────────────────────────────────────────────
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(0);
  const [posts, setPosts] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const pageRef = React.useRef(0);
  pageRef.current = page;

  // Reset accumulation when filters change
  useEffect(() => {
    setPage(0);
    setPosts([]);
  }, [search, filterGenre, filterPlatform, sort]);

  const { data: meData } = useQuery(ME_QUERY, { fetchPolicy: 'cache-first' });
  const currentUser = meData?.me;

  const { loading, error } = useQuery(PAGED_POSTS, {
    variables: {
      search: search || undefined,
      genre: filterGenre || undefined,
      platform: filterPlatform || undefined,
      sort,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    },
    fetchPolicy: 'network-only',
    notifyOnNetworkStatusChange: true,
    onCompleted: ({ pagedPosts }) => {
      setTotalCount(pagedPosts.totalCount);
      if (pageRef.current === 0) {
        setPosts(pagedPosts.posts);
      } else {
        setPosts((prev) => {
          const seen = new Set(prev.map((post) => post.id));
          const next = pagedPosts.posts.filter((post) => !seen.has(post.id));
          return [...prev, ...next];
        });
      }
    },
  });

  const hasMore = posts.length < totalCount;
  const displayedPosts = filterType ? posts.filter((p) => p.postType === filterType) : posts;

  // ── Mutations — patch local state instead of full refetch ────────────────
  const patchPost = (updated) =>
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));

  const [likePost] = useMutation(LIKE_POST, {
    onCompleted: ({ likePost: updated }) => patchPost(updated),
  });
  const [toggleBookmark] = useMutation(TOGGLE_BOOKMARK, {
    onCompleted: ({ toggleBookmark: updated }) => patchPost(updated),
  });
  const [deletePost] = useMutation(DELETE_POST);
  const [featurePost] = useMutation(FEATURE_POST, {
    onCompleted: ({ featurePost: updated }) => patchPost(updated),
  });
  const [ratePost] = useMutation(RATE_POST);

  const handleDelete = (id) => {
    if (!window.confirm('Delete this post?')) return;
    deletePost({
      variables: { id },
      onCompleted: () => {
        setPosts((prev) => prev.filter((p) => p.id !== id));
        setTotalCount((prev) => prev - 1);
      },
    });
  };

  const handleFeature = (id, featured) => {
    featurePost({ variables: { id, featured } });
  };

  const handleRate = async (postId, score) => {
    const { data } = await ratePost({ variables: { postId, score } });
    if (data?.ratePost) patchPost(data.ratePost);
    return data?.ratePost;
  };

  // Always derive the modal's post from the live posts array so comments stay fresh
  const liveExpandedPost = expandedPost
    ? (posts.find((p) => p.id === expandedPost.id) ?? expandedPost)
    : null;

  return (
    <div className="app-root">
      <div className="app-container">
        <DashboardNav />
        <h1 className="app-title">Community</h1>
        <p className="page-subtitle post-subtitle">
          Explore games, ideas, and conversations from the community.
        </p>

        {/* Filters */}
        <div className="community-filters card community-filters--panel">
          <div className="community-filters__type-row">
            {[['', 'All'], ['GAME', 'Games'], ['IDEA', 'Ideas']].map(([val, label]) => (
              <button
                key={val}
                className={filterType === val ? 'btn-primary' : 'btn-ghost'}
                style={{ height: 34, padding: '0 16px', fontSize: 13 }}
                onClick={() => setFilterType(val)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="community-filters__row">
            <input
              className="input community-filters__search"
              placeholder="Search posts or games…"
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

        {loading && page === 0 && <p className="community-status community-status--loading">Loading posts…</p>}
        {error && <p className="community-status community-status--error">Error: {error.message}</p>}

        {!loading && posts.length === 0 && (
          <div className="empty-state">
            <p>No posts found. Be the first to post a game recommendation!</p>
          </div>
        )}
        {!loading && posts.length > 0 && displayedPosts.length === 0 && (
          <div className="empty-state">
            <p>No {filterType === 'GAME' ? 'game posts' : 'idea posts'} found.</p>
          </div>
        )}

        <div className="community-grid">
          {displayedPosts.map((post) => (
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
              onRate={handleRate}
            />
          ))}
        </div>

        {/* Load More */}
        {hasMore && (
          <div className="community-load-more">
            <button
              className={`btn-ghost community-load-more__btn ${loading ? 'is-loading' : ''}`}
              onClick={() => setPage((p) => p + 1)}
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? '…' : `Load More (${posts.length} / ${totalCount})`}
            </button>
          </div>
        )}
        {!hasMore && posts.length > 0 && (
          <p className="community-load-more__end">You’re all caught up.</p>
        )}
      </div>

      {liveExpandedPost && (
        <PostModal
          post={liveExpandedPost}
          currentUser={currentUser}
          onClose={() => setExpandedPost(null)}
          onUpdate={(updated) =>
            setPosts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)))
          }
        />
      )}

      {editingPost && (
        <EditModal
          post={editingPost}
          onClose={() => setEditingPost(null)}
          onSaved={(updatedPost) => {
            setEditingPost(null);
            if (updatedPost) patchPost(updatedPost);
          }}
        />
      )}
    </div>
  );
}
