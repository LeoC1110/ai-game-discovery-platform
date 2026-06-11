// src/screens/PostPage.jsx — Create a game recommendation post
import React, { useState } from 'react';
import { useMutation, useQuery, gql } from '@apollo/client';
import { useNavigate, Link } from 'react-router-dom';
import DashboardNav from '../components/DashboardNav';
import { CREATE_POST, ALL_POSTS, MY_POSTS } from '../gql/gamePosts';
import './Post.css';

const ME_QUERY = gql`query MePost { me { id role } }`;

const GENRE_OPTIONS = [
  'Action', 'Adventure', 'RPG', 'Strategy', 'Simulation', 'Sports', 'Racing',
  'Puzzle', 'Platformer', 'Shooter', 'Fighting', 'Horror', 'Survival', 'Sandbox',
  'Roguelike', 'Open-world', 'Casual', 'Indie', 'Multiplayer', 'Other',
];
const PLATFORM_OPTIONS = [
  'PC', 'PlayStation', 'Xbox', 'Nintendo Switch', 'iOS', 'Android',
  'Web Browser', 'Steam Deck', 'Other',
];
const GAME_TYPE_OPTIONS = [
  'Single-player', 'Multiplayer', 'Online Co-op', 'Local Co-op', 'PvP', 'PvE',
  'Free-to-play', 'Premium', 'Early Access', 'Live Service', 'Other',
];

const INITIAL_FORM = {
  title: '',
  genre: '',
  platform: '',
  developer: '',
  releaseYear: '',
  gameType: '',
  rating: '',
  coverImageUrl: '',
  gameLink: '',
  tags: '',
  review: '',
  featured: false,
  genreOther: '',
  platformOther: '',
  gameTypeOther: '',
};

export default function PostPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(INITIAL_FORM);
  const [message, setMessage] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [showPostChoice, setShowPostChoice] = useState(false);
  const fileInputRef = React.useRef(null);

  const { data: meData } = useQuery(ME_QUERY, { fetchPolicy: 'cache-first' });
  const isAdmin = meData?.me?.role === 'Admin';

  const [createPost, { loading }] = useMutation(CREATE_POST, {
    refetchQueries: [
      { query: ALL_POSTS },
      { query: MY_POSTS },
    ],
    awaitRefetchQueries: true,
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Please select a valid image file.' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Image must be smaller than 2 MB.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      setCoverPreview(dataUrl);
      setForm((prev) => ({ ...prev, coverImageUrl: dataUrl }));
      setMessage(null);
    };
    reader.readAsDataURL(file);
  };

  const publishGamePost = async () => {
    setMessage(null);
    if (!form.title.trim()) {
      setMessage({ type: 'error', text: 'Game title is required.' });
      return;
    }
    if (!form.review.trim()) {
      setMessage({ type: 'error', text: 'Review / recommendation is required.' });
      return;
    }
    const tags = form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      await createPost({
        variables: {
          input: {
            postType: 'GAME',
            title: form.title.trim(),
            genre: form.genre === 'Other' ? (form.genreOther.trim() || 'Other') : (form.genre || undefined),
            platform: form.platform === 'Other' ? (form.platformOther.trim() || 'Other') : (form.platform || undefined),
            developer: form.developer || undefined,
            releaseYear: form.releaseYear ? Number(form.releaseYear) : undefined,
            gameType: form.gameType === 'Other' ? (form.gameTypeOther.trim() || 'Other') : (form.gameType || undefined),
            rating: form.rating ? Number(form.rating) : undefined,
            coverImageUrl: form.coverImageUrl || undefined,
            gameLink: form.gameLink || undefined,
            tags: tags.length ? tags : undefined,
            review: form.review.trim(),
            featured: isAdmin ? form.featured : undefined,
          },
        },
      });
      setForm(INITIAL_FORM);
      setMessage({ type: 'success', text: 'Your game recommendation has been published.' });
      setTimeout(() => navigate('/community'), 2500);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setShowPostChoice(true);
  };

  return (
    <div className="app-root">
      <div className="app-container">
        <DashboardNav />
        <h1 className="app-title">Post a Game</h1>
        <p className="page-subtitle post-subtitle">
          Post a game you recommend.
        </p>

        <div className="post-grid" style={{ gridTemplateColumns: '1fr' }}>
          <div className="post-card">
            <header className="post-card__header">
              <h2>Game Details</h2>
              <p>Add the basic information for your recommendation. Game Title and Review are required.</p>
            </header>

            {message && (
              <div
                className={message.type === 'success' ? 'msg-success' : 'msg-error'}
                role="alert"
                style={message.type === 'success' ? { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 } : undefined}
              >
                <span>{message.text}</span>
                {message.type === 'success' && (
                  <Link to="/community" style={{ fontSize: 13, fontWeight: 500, color: 'inherit', textDecoration: 'underline', whiteSpace: 'nowrap' }}>
                    View in Community
                  </Link>
                )}
              </div>
            )}

            <form className="post-form" onSubmit={handleSubmit}>
              <div className="post-form__row">
                <label>
                  Game Title *
                  <input className="input" name="title" value={form.title} onChange={handleChange} required />
                </label>
                <label>
                  Genre
                  <select className="input" name="genre" value={form.genre} onChange={handleChange}>
                    <option value="">Select a genre…</option>
                    {GENRE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                  {form.genre === 'Other' && (
                    <input className="input" name="genreOther" value={form.genreOther} onChange={handleChange} placeholder="Specify genre…" style={{ marginTop: 6 }} />
                  )}
                </label>
              </div>

              <div className="post-form__row">
                <label>
                  Platform
                  <select className="input" name="platform" value={form.platform} onChange={handleChange}>
                    <option value="">Select a platform…</option>
                    {PLATFORM_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  {form.platform === 'Other' && (
                    <input className="input" name="platformOther" value={form.platformOther} onChange={handleChange} placeholder="Specify platform…" style={{ marginTop: 6 }} />
                  )}
                </label>
                <label>
                  Developer / Studio
                  <input className="input" name="developer" value={form.developer} onChange={handleChange} />
                </label>
              </div>

              <div className="post-form__row">
                <label>
                  Release Year
                  <input className="input" name="releaseYear" type="number" min="1970" max="2030" value={form.releaseYear} onChange={handleChange} placeholder="e.g. 2024" />
                </label>
                <label>
                  Game Type
                  <select className="input" name="gameType" value={form.gameType} onChange={handleChange}>
                    <option value="">Select a game type…</option>
                    {GAME_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {form.gameType === 'Other' && (
                    <input className="input" name="gameTypeOther" value={form.gameTypeOther} onChange={handleChange} placeholder="Specify game type…" style={{ marginTop: 6 }} />
                  )}
                </label>
              </div>

              <div className="post-form__row">
                <label>
                  Author Rating (1-10)
                  <input className="input" name="rating" type="number" min="1" max="10" value={form.rating} onChange={handleChange} />
                </label>
                <label>
                  Cover Image
                  <div className="cover-upload-area">
                    {coverPreview ? (
                      <img src={coverPreview} alt="Cover preview" className="cover-upload-area__img" />
                    ) : (
                      <div className="cover-upload-area__placeholder">
                        <span className="cover-upload-area__icon">🖼</span>
                        <span>Upload cover image</span>
                        <span className="cover-upload-area__hint">JPG or PNG, max 2 MB</span>
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />
                  {coverPreview && (
                    <button
                      type="button"
                      className="cover-upload-area__remove"
                      onClick={() => {
                        setCoverPreview(null);
                        setForm((prev) => ({ ...prev, coverImageUrl: '' }));
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                    >
                      ✕ Remove image
                    </button>
                  )}
                </label>
              </div>

              <label>
                Game Link / Trailer
                <input className="input" name="gameLink" value={form.gameLink} onChange={handleChange} placeholder="https://..." />
              </label>

              <label>
                Tags (comma-separated)
                <input className="input" name="tags" value={form.tags} onChange={handleChange} placeholder="Action, Open-world, Indie" />
              </label>

              <label>
                Review / Why do you recommend this game? *
                <textarea
                  className="input textarea"
                  name="review"
                  value={form.review}
                  onChange={handleChange}
                  rows={5}
                  maxLength={1500}
                  required
                  style={{ minHeight: 120 }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: '#6e6e73' }}>{form.review.length}/1500</span>
                </div>
              </label>

              {isAdmin && (
                <label style={{ flexDirection: 'row', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    name="featured"
                    checked={form.featured}
                    onChange={handleChange}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />
                  <span style={{ color: '#ffd60a', fontWeight: 600 }}>⭐ Mark as Featured (Admin Pick)</span>
                </label>
              )}

              <div className="post-form__footer">
                <button className={`btn-primary ${loading ? 'is-loading' : ''}`} type="submit" disabled={loading} aria-busy={loading} style={{ flex: 1 }}>
                  {loading ? 'Publishing…' : 'Publish Game'}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setForm(INITIAL_FORM);
                    setMessage(null);
                    setCoverPreview(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                >
                  Clear
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {showPostChoice && (
        <div className="modal-overlay" onClick={() => setShowPostChoice(false)}>
          <div className="modal-box post-choice-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowPostChoice(false)}>✕</button>
            <h2 className="modal-title">Choose what to publish</h2>
            <p className="post-choice-modal__desc">
              Pick one posting mode below.
            </p>
            <div className="post-choice-modal__actions">
              <button
                type="button"
                className={`btn-primary ${loading ? 'is-loading' : ''}`}
                disabled={loading}
                aria-busy={loading}
                onClick={async () => {
                  setShowPostChoice(false);
                  await publishGamePost();
                }}
              >
                Publish Game
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
