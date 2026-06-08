// src/screens/PostPage.jsx — Create a game recommendation post
import React, { useState } from 'react';
import { useMutation, useQuery, gql } from '@apollo/client';
import { useNavigate } from 'react-router-dom';
import DashboardNav from '../components/DashboardNav';
import { CREATE_POST } from '../gql/gamePosts';
import './Post.css';

const ME_QUERY = gql`query MePost { me { id role } }`;

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

  const [createPost, { loading }] = useMutation(CREATE_POST);

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
            featured: isAdmin ? form.featured : undefined,
          },
        },
      });
      setForm(INITIAL_FORM);
      setMessage({ type: 'success', text: 'Game post published! Redirecting to Community...' });
      setTimeout(() => navigate('/community'), 1200);
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
          Share a game recommendation with the community.
        </p>

        <div className="post-grid" style={{ gridTemplateColumns: '1fr' }}>
          <div className="post-card">
            <header className="post-card__header">
              <h2>New Recommendation</h2>
              <p>Fill in the details below. Title and Review are required.</p>
            </header>

            {message && (
              <div
                className={message.type === 'success' ? 'msg-success' : 'msg-error'}
                role="alert"
              >
                {message.text}
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
                  <input className="input" name="genre" value={form.genre} onChange={handleChange} placeholder="e.g. RPG, FPS" />
                </label>
              </div>

              <div className="post-form__row">
                <label>
                  Platform
                  <input className="input" name="platform" value={form.platform} onChange={handleChange} placeholder="e.g. PC, PS5" />
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
                  <input className="input" name="gameType" value={form.gameType} onChange={handleChange} placeholder="e.g. Singleplayer, Multiplayer" />
                </label>
              </div>

              <div className="post-form__row">
                <label>
                  Rating (1-10)
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
                        <span>Click to upload JPG / PNG</span>
                        <span className="cover-upload-area__hint">Max 2 MB</span>
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
                  required
                  style={{ minHeight: 120 }}
                />
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
                  {loading ? 'Publishing...' : 'Post'}
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
                Post a Game
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
