// src/screens/LeaderboardPage.jsx — Community leaderboard based on GamePost data
import React, { useState, useMemo } from 'react';
import { useQuery } from '@apollo/client';
import DashboardNav from '../components/DashboardNav';
import { ALL_POSTS } from '../gql/gamePosts';

const TABS = [
  { key: 'rated', label: 'Top Rated' },
  { key: 'liked', label: 'Most Liked' },
  { key: 'commented', label: 'Most Commented' },
  { key: 'contributors', label: 'Top Contributors' },
];

function MedalIcon({ rank }) {
  if (rank === 1) return <span style={{ fontSize: 20 }}>🥇</span>;
  if (rank === 2) return <span style={{ fontSize: 20 }}>🥈</span>;
  if (rank === 3) return <span style={{ fontSize: 20 }}>🥉</span>;
  return <span style={{ color: '#888', fontWeight: 700, minWidth: 22, display: 'inline-block' }}>#{rank}</span>;
}

function LeaderboardRow({ rank, name, subtitle, stat, statLabel }) {
  return (
    <div className="lb-row card">
      <div className="lb-row__rank"><MedalIcon rank={rank} /></div>
      <div className="lb-row__info">
        <p className="lb-row__name">{name}</p>
        {subtitle && <p className="lb-row__sub">{subtitle}</p>}
      </div>
      <div className="lb-row__stat">
        <span className="lb-stat-value">{stat}</span>
        <span className="lb-stat-label">{statLabel}</span>
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  const [activeTab, setActiveTab] = useState('rated');
  const { data, loading, error } = useQuery(ALL_POSTS, {
    variables: { postType: 'GAME' },
    fetchPolicy: 'cache-and-network',
  });

  const posts = data?.allPosts ?? [];

  const topRated = useMemo(() =>
    [...posts].filter((p) => p.rating != null)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 10),
    [posts]);

  const mostLiked = useMemo(() =>
    [...posts].sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0)).slice(0, 10),
    [posts]);

  const mostCommented = useMemo(() =>
    [...posts].sort((a, b) => (b.commentsCount || 0) - (a.commentsCount || 0)).slice(0, 10),
    [posts]);

  const contributors = useMemo(() => {
    const map = {};
    posts.forEach((p) => {
      const user = p.postedBy?.username || 'Unknown';
      if (!map[user]) map[user] = { username: user, postCount: 0, totalLikes: 0 };
      map[user].postCount += 1;
      map[user].totalLikes += p.likesCount || 0;
    });
    return Object.values(map)
      .sort((a, b) => b.postCount - a.postCount || b.totalLikes - a.totalLikes)
      .slice(0, 10);
  }, [posts]);

  return (
    <div className="app-root">
      <div className="app-container">
        <DashboardNav />
        <h1 className="app-title">Leaderboard</h1>
        <p className="page-subtitle post-subtitle">
          Game recommendation rankings only.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={activeTab === tab.key ? 'btn-primary' : 'btn-ghost'}
              style={{ height: 38, padding: '0 18px', fontSize: 13 }}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading && <p style={{ color: '#aaa', textAlign: 'center' }}>Loading…</p>}
        {error && <p style={{ color: '#ff6b6b', textAlign: 'center' }}>Error: {error.message}</p>}

        {!loading && posts.length === 0 && (
          <div className="empty-state">
            <p>No community posts yet. Be the first to post a game recommendation!</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {activeTab === 'rated' && topRated.map((post, i) => (
            <LeaderboardRow
              key={post.id}
              rank={i + 1}
              name={post.title}
              subtitle={`by ${post.postedBy?.username || 'Unknown'} · ${post.genre || ''} ${post.platform ? '· ' + post.platform : ''}`}
              stat={post.rating + '/10'}
              statLabel="rating"
            />
          ))}

          {activeTab === 'liked' && mostLiked.map((post, i) => (
            <LeaderboardRow
              key={post.id}
              rank={i + 1}
              name={post.title}
              subtitle={`by ${post.postedBy?.username || 'Unknown'} · ${post.genre || ''}`}
              stat={post.likesCount}
              statLabel="likes"
            />
          ))}

          {activeTab === 'commented' && mostCommented.map((post, i) => (
            <LeaderboardRow
              key={post.id}
              rank={i + 1}
              name={post.title}
              subtitle={`by ${post.postedBy?.username || 'Unknown'}`}
              stat={post.commentsCount}
              statLabel="comments"
            />
          ))}

          {activeTab === 'contributors' && contributors.map((c, i) => (
            <LeaderboardRow
              key={c.username}
              rank={i + 1}
              name={c.username}
              subtitle={`${c.postCount} post${c.postCount !== 1 ? 's' : ''} · ${c.totalLikes} total likes`}
              stat={c.postCount}
              statLabel="posts"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
