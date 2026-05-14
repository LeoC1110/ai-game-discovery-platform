// src/screens/PlayNowPage.jsx
// games is the primary catalog resource, comparable to a public store surface.
import React, { useMemo, useState } from 'react';
import { gql, useQuery } from '@apollo/client';
import ThreeBackground from '../components/ThreeBackground';
import DashboardNav from '../components/DashboardNav';
import './PlayNow.css';

const GET_ALL_GAMES = gql`
  query GetAllGames {
    getAllGames {
      id
      title
      description
      genre
      platform
      developer
      releaseYear
      rating
      sourceType
      externalUrl
      embedUrl
      coverImage
      tags
      updatedAt
      createdAt
      owner {
        id
        username
      }
    }
  }
`;

const DEFAULT_FILTERS = {
  search: '',
  sourceType: 'All',
  platform: 'All',
  tag: '',
};

export default function PlayNowPage() {
  const { data, loading, error, refetch } = useQuery(GET_ALL_GAMES, {
    fetchPolicy: 'cache-and-network',
  });

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [activeEmbed, setActiveEmbed] = useState(null);

  const games = data?.getAllGames ?? [];

  const uniquePlatforms = useMemo(
    () => Array.from(new Set(games.map((game) => game.platform).filter(Boolean))).sort(),
    [games],
  );

  const uniqueTags = useMemo(
    () => Array.from(new Set(games.flatMap((game) => game.tags || []))).sort(),
    [games],
  );

  const filteredGames = useMemo(() => {
    const searchQuery = filters.search.trim().toLowerCase();
    return games.filter((game) => {
      if (filters.sourceType !== 'All' && game.sourceType !== filters.sourceType) {
        return false;
      }
      if (filters.platform !== 'All' && filters.platform) {
        if ((game.platform || '').toLowerCase() !== filters.platform.toLowerCase()) {
          return false;
        }
      }
      if (filters.tag) {
        const hasTag = (game.tags || []).some((tag) => tag.toLowerCase() === filters.tag.toLowerCase());
        if (!hasTag) {
          return false;
        }
      }
      if (searchQuery) {
        const haystack = [game.title, game.description, game.genre, game.developer]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(searchQuery)) {
          return false;
        }
      }
      return true;
    });
  }, [filters, games]);

  const totalResults = filteredGames.length;
  const totalGames = games.length;

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  const handlePlay = (game) => {
    if (game.sourceType === 'ExternalLink' && game.externalUrl) {
      window.open(game.externalUrl, '_blank', 'noopener');
    }
    if (game.sourceType === 'Embeddable' && game.embedUrl) {
      setActiveEmbed({ title: game.title, url: game.embedUrl });
    }
  };

  return (
    <div className="app-root">
      <ThreeBackground />
      <div className="bg-vignette" />

      <div className="app-container playnow">
        <DashboardNav />
        <h1 className="app-title">Play Now</h1>
        <p className="page-subtitle playnow-subtitle">Browse every public game shared across the platform.</p>

        <div className="card playnow-card playnow-card--filters">
          <div className="playnow-filters">
            <label>
              Search
              <input
                className="input"
                value={filters.search}
                onChange={(event) => handleFilterChange('search', event.target.value)}
                placeholder="Search by title, genre, or studio"
              />
            </label>
            <label>
              Source
              <select
                className="input"
                value={filters.sourceType}
                onChange={(event) => handleFilterChange('sourceType', event.target.value)}
              >
                <option value="All">All</option>
                <option value="LocalMeta">Local</option>
                <option value="ExternalLink">External Link</option>
                <option value="Embeddable">Embeddable</option>
              </select>
            </label>
            <label>
              Platform
              <select
                className="input"
                value={filters.platform}
                onChange={(event) => handleFilterChange('platform', event.target.value)}
              >
                <option value="All">All</option>
                {uniquePlatforms.map((platform) => (
                  <option key={platform} value={platform}>{platform}</option>
                ))}
              </select>
            </label>
            <label>
              Tag
              <select
                className="input"
                value={filters.tag}
                onChange={(event) => handleFilterChange('tag', event.target.value)}
              >
                <option value="">All</option>
                {uniqueTags.map((tag) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </label>
            <button
              className="btn-ghost"
              type="button"
              onClick={resetFilters}
            >
              Reset Filters
            </button>
            <button
              className="btn-ghost"
              type="button"
              onClick={() => refetch()}
            >
              Refresh
            </button>
          </div>
        </div>

        {loading && <p style={{ marginTop: 16 }}>Loading catalog…</p>}
        {error && <p style={{ marginTop: 16, color: '#ff6b6b' }}>Failed to load games: {error.message}</p>}

        {!loading && !error && (
          <div className="playnow-summary" role="status" aria-live="polite">
            <span className="playnow-summary__count">{totalResults} / {totalGames} games match your filters</span>
            {filters.search && (
              <span className="playnow-summary__hint">Currently filtering by “{filters.search}”</span>
            )}
          </div>
        )}

        <ul className="game-list playnow-list" aria-live="polite">
          {filteredGames.map((game) => (
            <li key={game.id} className="game-item playnow-item">
              <div className="game-card__media playnow-media" aria-hidden="true">
                {game.coverImage ? (
                  <img src={game.coverImage} alt="" loading="lazy" />
                ) : (
                  <div className="game-card__placeholder">{game.title.slice(0, 1).toUpperCase()}</div>
                )}
                <span className={`badge badge--${game.sourceType?.toLowerCase() || 'localmeta'}`}>
                  {game.sourceType === 'LocalMeta' && 'Local'}
                  {game.sourceType === 'ExternalLink' && 'External'}
                  {game.sourceType === 'Embeddable' && 'Embeddable'}
                </span>
              </div>

              <div className="playnow-body">
                <div className="item-header">
                <div className="title-row">
                  <strong>{game.title}</strong>
                  <span style={{ opacity: 0.7 }}>
                    {' '}
                    — {game.genre || 'Uncategorized'} ({game.platform || 'Various'})
                  </span>
                </div>
                </div>
                <div className="subtitle-row playnow-meta">
                  <small>
                    By {game.owner?.username || 'Community'} · {game.releaseYear || 'Unknown'}
                    {game.rating ? ` · Rating ${game.rating}` : ''}
                    {game.updatedAt ? ` · Updated ${new Date(game.updatedAt).toLocaleDateString()}` : ''}
                  </small>
                </div>

                <p className="game-description playnow-description">{game.description || 'No description provided yet.'}</p>

                {game.tags?.length ? (
                  <div className="tag-row playnow-tags">
                    {game.tags.map((tag) => (
                      <span key={tag} className="tag">#{tag}</span>
                    ))}
                  </div>
                ) : null}

                <div className="actions playnow-actions">
                  {(game.sourceType === 'ExternalLink' || game.sourceType === 'Embeddable') && (
                    <button
                      className="btn-primary"
                      type="button"
                      onClick={() => handlePlay(game)}
                    >
                      {game.sourceType === 'ExternalLink' ? 'Download / Visit' : 'Launch' }
                    </button>
                  )}
                  {game.externalUrl && (
                    <a
                      className="btn-ghost"
                      href={game.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open in new tab
                    </a>
                  )}
                </div>
              </div>
            </li>
          ))}

          {!loading && !error && filteredGames.length === 0 && (
            <li className="game-item">
              <p className="achievement-empty">No games match your filters just yet.</p>
            </li>
          )}
        </ul>

        {activeEmbed && (
          <div className="modal-overlay" role="dialog" aria-modal="true">
            <div className="modal-card">
              <header className="modal-header">
                <h2>{activeEmbed.title}</h2>
                <button className="btn-ghost" type="button" onClick={() => setActiveEmbed(null)}>
                  Close
                </button>
              </header>
              <div className="modal-body">
                <iframe title={activeEmbed.title} src={activeEmbed.url} allowFullScreen />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
