// src/screens/PostPage.jsx — Recommend flow: select game first, then write recommendation
import React, { useState } from 'react';
import { useMutation, useQuery, useLazyQuery, gql } from '@apollo/client';
import { useNavigate, Link } from 'react-router-dom';
import DashboardNav from '../components/DashboardNav';
import { CREATE_POST, ALL_POSTS, MY_POSTS } from '../gql/gamePosts';
import { SEARCH_GAMES } from '../gql/games';
import './Post.css';

const ME_QUERY = gql`query MePost { me { id role } }`;

const GENRE_OPTIONS = [
  'Action', 'Adventure', 'RPG', 'Strategy', 'Simulation', 'Sports', 'Racing',
  'Puzzle', 'Platformer', 'Shooter', 'Fighting', 'Horror', 'Survival', 'Sandbox',
  'Roguelike', 'Open-world', 'Casual', 'Indie', 'Multiplayer', 'Other',
];

const INITIAL_FORM = {
  title: '',
  genre: '',
  genreOther: '',
  rating: '',
  coverImageUrl: '',
  gameLink: '',
  tags: '',
  review: '',
  featured: false,
};

export default function PostPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(INITIAL_FORM);
  const [message, setMessage] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [showPostChoice, setShowPostChoice] = useState(false);
  const [gameSearchText, setGameSearchText] = useState('');
  const [selectedGame, setSelectedGame] = useState(null);
  const fileInputRef = React.useRef(null);

  const { data: meData } = useQuery(ME_QUERY, { fetchPolicy: 'cache-first' });
  const isAdmin = meData?.me?.role === 'Admin';

  const [searchGames, { data: searchData, loading: searchingGames }] = useLazyQuery(SEARCH_GAMES, {
    fetchPolicy: 'network-only',
  });

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

  const handleSearchGames = async () => {
    const q = gameSearchText.trim();
    if (!q) return;
    await searchGames({ variables: { query: q, limit: 8 } });
  };

  const canContinueToStep2 = selectedGame || form.title.trim();

  const goToStep2 = () => {
    setMessage(null);

    if (!selectedGame && !form.title.trim()) {
      setMessage({ type: 'error', text: 'Please select an existing game or enter a new game title.' });
      return;
    }

    if (!selectedGame && !form.genre) {
      setMessage({ type: 'error', text: 'Genre is required for a new game.' });
      return;
    }

    if (!selectedGame && form.genre === 'Other' && !form.genreOther.trim()) {
      setMessage({ type: 'error', text: 'Please specify a genre.' });
      return;
    }

    setStep(2);
  };

  const publishRecommendation = async () => {
    setMessage(null);

    if (!form.review.trim()) {
      setMessage({ type: 'error', text: 'Recommendation content is required.' });
      return;
    }

    if (!form.rating || Number(form.rating) < 1 || Number(form.rating) > 10) {
      setMessage({ type: 'error', text: 'Author Rating (1–10) is required.' });
      return;
    }

    if (!selectedGame && !form.title.trim()) {
      setMessage({ type: 'error', text: 'Game title is required.' });
      return;
    }

    if (!selectedGame && !form.genre) {
      setMessage({ type: 'error', text: 'Genre is required.' });
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
            gameId: selectedGame?.id,
            title: selectedGame ? undefined : form.title.trim(),
            genre: selectedGame
              ? undefined
              : (form.genre === 'Other' ? (form.genreOther.trim() || 'Other') : (form.genre || undefined)),
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
      setSelectedGame(null);
      setGameSearchText('');
      setCoverPreview(null);
      setStep(1);
      setMessage({ type: 'success', text: 'Your recommendation has been published.' });
      setTimeout(() => navigate('/community'), 2200);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleSubmitStep2 = (e) => {
    e.preventDefault();
    setShowPostChoice(true);
  };

  const searchResults = searchData?.searchGames ?? [];

  return (
    <div className="app-root">
      <div className="app-container">
        <DashboardNav />
        <h1 className="app-title">Recommend a Game</h1>
        <p className="page-subtitle post-subtitle">
          Choose a game, then share your recommendation.
        </p>

        <div className="post-grid" style={{ gridTemplateColumns: '1fr' }}>
          <div className="post-card">
            <header className="post-card__header">
              <h2>{step === 1 ? 'Step 1 · Select Game' : 'Step 2 · Write Recommendation'}</h2>
              <p>
                {step === 1
                  ? 'Choose an existing game or add a new one, then share your recommendation.'
                  : 'Write your recommendation, rating, tags, and reason for this game.'}
              </p>
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

            {step === 1 && (
              <div className="post-form" style={{ gap: 16 }}>
                <label>
                  Search Existing Game
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="input"
                      value={gameSearchText}
                      onChange={(e) => setGameSearchText(e.target.value)}
                      placeholder="e.g. Portal 2"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSearchGames();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className={`btn-ghost ${searchingGames ? 'is-loading' : ''}`}
                      onClick={handleSearchGames}
                      disabled={searchingGames || !gameSearchText.trim()}
                      aria-busy={searchingGames}
                    >
                      Search
                    </button>
                  </div>
                </label>

                {searchResults.length > 0 && (
                  <div className="card" style={{ padding: 12, background: 'var(--color-surface-alt)' }}>
                    <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--color-text-muted)' }}>Matching games</p>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {searchResults.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          className="btn-ghost"
                          style={{ justifyContent: 'space-between', height: 38 }}
                          onClick={() => {
                            setSelectedGame(g);
                            setForm((prev) => ({
                              ...prev,
                              title: g.title || prev.title,
                              genre: g.genre || prev.genre,
                            }));
                            setMessage(null);
                          }}
                        >
                          <span>{g.title}</span>
                          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{g.genre || 'Genre N/A'}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {selectedGame && (
                  <div className="card" style={{ padding: 12, borderColor: 'rgba(0,122,255,0.35)' }}>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>Selected game</p>
                    <p style={{ margin: '6px 0 0', fontSize: 16, fontWeight: 700 }}>{selectedGame.title}</p>
                  </div>
                )}

                <div className="card" style={{ padding: 14 }}>
                  <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--color-text-muted)' }}>
                    Can’t find the game? Create a new game entry
                  </p>
                  <div className="post-form__row">
                    <label>
                      Game Title {!selectedGame ? '*' : ''}
                      <input
                        className="input"
                        name="title"
                        value={form.title}
                        onChange={handleChange}
                        placeholder="e.g. Portal 2"
                        required={!selectedGame}
                        disabled={Boolean(selectedGame)}
                      />
                    </label>
                    <label>
                      Genre {!selectedGame ? '*' : ''}
                      <select
                        className="input"
                        name="genre"
                        value={form.genre}
                        onChange={handleChange}
                        required={!selectedGame}
                        disabled={Boolean(selectedGame)}
                      >
                        <option value="">Select a genre…</option>
                        {GENRE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
                      </select>
                      {form.genre === 'Other' && !selectedGame && (
                        <input
                          className="input"
                          name="genreOther"
                          value={form.genreOther}
                          onChange={handleChange}
                          placeholder="Specify genre…"
                          style={{ marginTop: 6 }}
                          required
                        />
                      )}
                    </label>
                  </div>
                </div>

                <div className="post-form__footer">
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ flex: 1 }}
                    onClick={goToStep2}
                    disabled={!canContinueToStep2}
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <form className="post-form" onSubmit={handleSubmitStep2}>
                <div className="card" style={{ padding: 12, background: 'var(--color-surface-alt)' }}>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>Game</p>
                  <p style={{ margin: '6px 0 0', fontSize: 16, fontWeight: 700 }}>{selectedGame?.title || form.title}</p>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ marginTop: 10, height: 34, fontSize: 13 }}
                    onClick={() => setStep(1)}
                  >
                    Change Game
                  </button>
                </div>

                <div className="post-form__row">
                  <label>
                    Author Rating (1-10) *
                    <input className="input" name="rating" type="number" min="1" max="10" value={form.rating} onChange={handleChange} required />
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
                  <input className="input" name="tags" value={form.tags} onChange={handleChange} placeholder="Puzzle, Co-op, Indie" />
                </label>

                <label>
                  Recommendation / Why do you recommend this game? *
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
                    {loading ? 'Publishing…' : 'Publish'}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      setForm(INITIAL_FORM);
                      setMessage(null);
                      setCoverPreview(null);
                      setSelectedGame(null);
                      setGameSearchText('');
                      setStep(1);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                  >
                    Reset
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {showPostChoice && (
        <div className="modal-overlay" onClick={() => setShowPostChoice(false)}>
          <div className="modal-box post-choice-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowPostChoice(false)}>✕</button>
            <h2 className="modal-title">Publish recommendation</h2>
            <p className="post-choice-modal__desc">
              Confirm publishing your recommendation for {(selectedGame?.title || form.title).trim()}.
            </p>
            <div className="post-choice-modal__actions">
              <button
                type="button"
                className={`btn-primary ${loading ? 'is-loading' : ''}`}
                disabled={loading}
                aria-busy={loading}
                onClick={async () => {
                  setShowPostChoice(false);
                  await publishRecommendation();
                }}
              >
                Publish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
