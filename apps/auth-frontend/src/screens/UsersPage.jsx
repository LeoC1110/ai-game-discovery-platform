// src/screens/UsersPage.jsx — Search and discover platform users
import React, { useState } from 'react';
import { useLazyQuery } from '@apollo/client';
import { useNavigate } from 'react-router-dom';
import DashboardNav from '../components/DashboardNav';
import { SEARCH_USERS } from '../gql/users';
import './Users.css';

function UserCard({ user }) {
  const navigate = useNavigate();
  return (
    <div className="users-card">
      <div className="users-card__header">
        <p className="users-card__username">{user.username}</p>
        <p className="users-card__id">ID: {user.id}</p>
      </div>
      <p className="users-card__stats">
        {user.postCount} post{user.postCount !== 1 ? 's' : ''}
        {' · '}
        ♥ {user.likesReceived} like{user.likesReceived !== 1 ? 's' : ''}
        {' · '}
        💬 {user.commentCount} comment{user.commentCount !== 1 ? 's' : ''}
        {' · '}
        🔖 {user.bookmarkCount} bookmark{user.bookmarkCount !== 1 ? 's' : ''}
      </p>
      <button
        className="btn-primary users-card__btn"
        onClick={() => navigate(`/users/${user.id}`)}
      >
        View Profile
      </button>
    </div>
  );
}

export default function UsersPage() {
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState(false);

  const [runSearch, { data, loading, error }] = useLazyQuery(SEARCH_USERS, {
    fetchPolicy: 'network-only',
  });

  const handleSearch = (e) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearched(true);
    runSearch({ variables: { query: q } });
  };

  const results = data?.searchUsers ?? [];

  return (
    <div className="app-root">
      <div className="app-container">
        <DashboardNav />

        <h1 className="app-title">Users</h1>
        <p className="page-subtitle users-subtitle">
          Search for platform users by username or user ID.
        </p>

        {/* Search bar */}
        <form className="users-search-form" onSubmit={handleSearch}>
          <input
            className="input users-search-form__field"
            placeholder="Search by username or user ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="submit"
            className="btn-primary users-search-form__btn"
            disabled={loading || !query.trim()}
          >
            {loading ? '…' : 'Search'}
          </button>
        </form>

        {/* States */}
        {error && (
          <p className="users-status users-status--error">Error: {error.message}</p>
        )}

        {!loading && searched && results.length === 0 && !error && (
          <div className="empty-state">
            <p>No users found for "{query}".</p>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="users-results">
            {results.map((u) => (
              <UserCard key={u.id} user={u} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
