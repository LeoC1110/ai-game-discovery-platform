// src/screens/UsersPage.jsx — Search and discover platform users
import React, { useEffect, useState } from 'react';
import { useLazyQuery, useMutation, useQuery, gql } from '@apollo/client';
import { useNavigate } from 'react-router-dom';
import DashboardNav from '../components/DashboardNav';
import { SEARCH_USERS, TOGGLE_FOLLOW_USER } from '../gql/users';
import './Users.css';

const ME_QUERY = gql`query MeUsersPage { me { id } }`;

function UserCard({ user, isOwnProfile, onToggleFollow, followLoading }) {
  const navigate = useNavigate();
  return (
    <div className="users-card">
      <div className="users-card__header">
        <p className="users-card__username">{user.username}</p>
        <p className="users-card__id">ID: {user.id}</p>
      </div>
      <p className="users-card__stats">
        Followers: {user.followerCount}
      </p>
      <div className="users-card__actions">
        {!isOwnProfile && (
          <button
            type="button"
            className={`btn-primary users-card__btn users-follow-btn${followLoading ? ' is-loading' : ''}`}
            disabled={followLoading}
            aria-busy={followLoading}
            onClick={() => onToggleFollow(user)}
          >
            {followLoading ? 'Saving…' : user.isFollowedByMe ? 'Unfollow' : 'Follow'}
          </button>
        )}
        <button
          className="btn-primary users-card__btn"
          onClick={() => navigate(`/users/${user.id}`)}
        >
          View Profile
        </button>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState([]);
  const [pendingFollowUserId, setPendingFollowUserId] = useState(null);

  const { data: meData } = useQuery(ME_QUERY, { fetchPolicy: 'cache-first' });
  const [runSearch, { data, loading, error }] = useLazyQuery(SEARCH_USERS, {
    fetchPolicy: 'cache-and-network',
  });
  const [toggleFollowUser] = useMutation(TOGGLE_FOLLOW_USER);

  useEffect(() => {
    setResults(data?.searchUsers ?? []);
  }, [data]);

  const handleSearch = (e) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearched(true);
    runSearch({ variables: { query: q } });
  };

  return (
    <div className="app-root">
      <div className="app-container">
        <DashboardNav />

        <h1 className="app-title">Users</h1>
        <p className="page-subtitle users-subtitle">
          Find player in the community.
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
              <UserCard
                key={u.id}
                user={u}
                isOwnProfile={meData?.me?.id === u.id}
                followLoading={pendingFollowUserId === u.id}
                onToggleFollow={async (targetUser) => {
                  setPendingFollowUserId(targetUser.id);
                  try {
                    const { data: mutationData } = await toggleFollowUser({
                      variables: { userId: targetUser.id },
                    });
                    const nextProfile = mutationData?.toggleFollowUser;
                    if (nextProfile) {
                      setResults((prev) => prev.map((entry) => (
                        entry.id === targetUser.id
                          ? {
                              ...entry,
                              followerCount: nextProfile.followerCount,
                              followingCount: nextProfile.followingCount,
                              isFollowedByMe: nextProfile.isFollowedByMe,
                            }
                          : entry
                      )));
                    }
                  } finally {
                    setPendingFollowUserId(null);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
