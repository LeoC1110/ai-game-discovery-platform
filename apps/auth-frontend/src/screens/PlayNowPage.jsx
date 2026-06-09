// src/screens/PlayNowPage.jsx
// games is the primary catalog resource, comparable to a public store surface.
import React, { useMemo, useState } from 'react';
import { gql, useQuery } from '@apollo/client';
import DashboardNav from '../components/DashboardNav';
import './PlayNow.css';

const PAGE_SIZE = 10;

const GET_ALL_GAMES = gql`
  query GetAllGames($search: String, $sourceType: GameSourceType, $platform: String, $tag: String, $limit: Int, $offset: Int) {
    getAllGames(search: $search, sourceType: $sourceType, platform: $platform, tag: $tag, limit: $limit, offset: $offset) {
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
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(0);
  const [games, setGames] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [activeEmbed, setActiveEmbed] = useState(null);

  const { loading, error, refetch } = useQuery(GET_ALL_GAMES, {
    variables: {
      search: filters.search.trim() || undefined,
      sourceType: filters.sourceType === 'All' ? undefined : filters.sourceType,
      platform: filters.platform === 'All' ? undefined : filters.platform,
      tag: filters.tag || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    },
    fetchPolicy: 'cache-and-network',
    notifyOnNetworkStatusChange: true,
    onCompleted: ({ getAllGames }) => {
      const batch = getAllGames ?? [];
      setHasMore(batch.length === PAGE_SIZE);
      if (page === 0) {
        setGames(batch);
        return;
      }
      setGames((prev) => {
        const seen = new Set(prev.map((game) => game.id));
        const next = batch.filter((game) => !seen.has(game.id));
        return [...prev, ...next];
      });
    },
  });

  const uniquePlatforms = useMemo(
    () => Array.from(new Set(games.map((game) => game.platform).filter(Boolean))).sort(),
    [games],
  );

  const uniqueTags = useMemo(
    () => Array.from(new Set(games.flatMap((game) => game.tags || []))).sort(),
    [games],
  );

  const totalResults = games.length;

  const handleFilterChange = (key, value) => {
    if (key === 'search' || key === 'sourceType' || key === 'platform' || key === 'tag') {
      setPage(0);
      setGames([]);
      setHasMore(true);
    }
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setPage(0);
    setGames([]);
    setHasMore(true);
  };

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
            <span className="playnow-summary__count">{totalResults}{hasMore ? '+' : ''} games loaded</span>
            {filters.search && (
              <span className="playnow-summary__hint">Currently filtering by “{filters.search}”</span>
            )}
          </div>
        )}

        <ul className="game-list playnow-list" aria-live="polite">
          {games.map((game) => (
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

        {!loading && games.length === 0 && (
          <div className="empty-state">
            <p>No games found for the current filters.</p>
          </div>
        )}

        {hasMore && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
            <button
              className={`btn-ghost ${loading ? 'is-loading' : ''}`}
              type="button"
              disabled={loading}
              onClick={() => setPage((prev) => prev + 1)}
            >
              {loading ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}

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
