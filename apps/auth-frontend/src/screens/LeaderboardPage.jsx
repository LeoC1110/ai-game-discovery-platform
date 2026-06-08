// src/screens/LeaderboardPage.jsx — Community Trends
import React, { useMemo, useState } from 'react';
import { useQuery } from '@apollo/client';
import { useNavigate } from 'react-router-dom';
import DashboardNav from '../components/DashboardNav';
import { ALL_POSTS } from '../gql/gamePosts';
import './Trends.css';

const RANK_PAGE_SIZE = 10;

function MedalIcon({ rank }) {
  return <span className="trends-rank">#{rank}</span>;
}

function SectionCard({ title, children }) {
  return (
    <div className="trends-section-card">
      <h2 className="trends-section-title">{title}</h2>
      {children}
    </div>
  );
}

function Pagination({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;
  return (
    <div className="trends-pagination">
      <button
        className="btn-ghost trends-pagination__btn"
        onClick={() => onPage(page - 1)}
        disabled={page === 0}
      >
        ‹ Prev
      </button>
      {Array.from({ length: totalPages }, (_, i) => (
        <button
          key={i}
          className={`trends-pagination__btn trends-pagination__page ${i === page ? 'trends-pagination__page--active' : ''}`}
          onClick={() => onPage(i)}
        >
          {i + 1}
        </button>
      ))}
      <button
        className="btn-ghost trends-pagination__btn"
        onClick={() => onPage(page + 1)}
        disabled={page === totalPages - 1}
      >
        Next ›
      </button>
    </div>
  );
}

export default function LeaderboardPage() {
  const navigate = useNavigate();
  const [rankPage, setRankPage] = useState(0);

  const { data, loading, error } = useQuery(ALL_POSTS, {
    fetchPolicy: 'cache-and-network',
  });

  const allPosts = data?.allPosts ?? [];
  const gamePosts = useMemo(() => allPosts.filter((p) => p.postType === 'GAME'), [allPosts]);

  const allTrending = useMemo(() =>
    [...gamePosts]
      .map((p) => ({
        ...p,
        trendScore:
          (p.rating || 0) +
          (p.likesCount || 0) +
          (p.commentsCount || 0) * 2 +
          (p.bookmarksCount || 0) * 2,
      }))
      .sort((a, b) => b.trendScore - a.trendScore),
    [gamePosts]);

  const rankTotalPages = Math.ceil(allTrending.length / RANK_PAGE_SIZE);
  const rankPageGames = allTrending.slice(
    rankPage * RANK_PAGE_SIZE,
    (rankPage + 1) * RANK_PAGE_SIZE,
  );

  const popularTags = useMemo(() => {
    const map = {};
    gamePosts.forEach((p) => {
      (p.tags || []).forEach((t) => { map[t] = (map[t] || 0) + 1; });
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
  }, [gamePosts]);

  const recentDiscussions = useMemo(() =>
    [...allPosts]
      .sort((a, b) =>
        (b.commentsCount || 0) - (a.commentsCount || 0) ||
        new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5),
    [allPosts]);

  const activeContributors = useMemo(() => {
    const map = {};
    allPosts.forEach((p) => {
      const user = p.postedBy?.username || 'Unknown';
      if (!map[user]) map[user] = { username: user, postCount: 0, totalLikes: 0, totalComments: 0 };
      map[user].postCount += 1;
      map[user].totalLikes += p.likesCount || 0;
      map[user].totalComments += p.commentsCount || 0;
    });
    return Object.values(map)
      .sort((a, b) => b.postCount - a.postCount || b.totalLikes - a.totalLikes)
      .slice(0, 5);
  }, [allPosts]);

  const isEmpty = !loading && allPosts.length === 0;

  return (
    <div className="app-root">
      <div className="app-container">
        <DashboardNav />
        <h1 className="app-title">Community Trends</h1>
        <p className="page-subtitle trends-subtitle"></p>

        {loading && <p className="trends-status">Loading...</p>}
        {error && <p className="trends-status trends-status--error">Error: {error.message}</p>}

        {isEmpty && (
          <div className="empty-state">
            <p>No community posts yet. Be the first to post a game recommendation!</p>
          </div>
        )}

        {!isEmpty && (
          <div className="trends-grid">

            <SectionCard title={`Game Rankings (${allTrending.length} total)`}>
              {allTrending.length === 0
                ? <p className="trends-empty">No games ranked yet.</p>
                : (
                  <>
                    <ol className="trends-game-list" start={rankPage * RANK_PAGE_SIZE + 1}>
                      {rankPageGames.map((post, i) => {
                        const globalRank = rankPage * RANK_PAGE_SIZE + i + 1;
                        return (
                          <li key={post.id} className="trends-game-row">
                            <div className="trends-game-row__rank">
                              <MedalIcon rank={globalRank} />
                            </div>
                            <div className="trends-game-row__body">
                              <p className="trends-game-row__title">{post.title}</p>
                              <p className="trends-game-row__meta">
                                {post.genre && <span className="badge">{post.genre}</span>}
                                {post.rating && <span className="trends-game-row__rating">&#11088; {post.rating}/10</span>}
                                <span className="trends-game-row__score">Score: {post.trendScore}</span>
                              </p>
                            </div>
                            <div className="trends-game-row__stats">
                              <span className="trends-stat">&#9825; {post.likesCount || 0}</span>
                              <span className="trends-stat">&#128172; {post.commentsCount || 0}</span>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                    <Pagination page={rankPage} totalPages={rankTotalPages} onPage={(p) => setRankPage(p)} />
                  </>
                )}
            </SectionCard>

            <SectionCard title="Popular Tags">
              {popularTags.length === 0
                ? <p className="trends-empty">No tags available yet.</p>
                : (
                  <div className="trends-tag-cloud">
                    {popularTags.map(([tag, count]) => (
                      <button
                        key={tag}
                        type="button"
                        className="trends-tag-chip"
                        onClick={() => navigate('/community', { state: { search: tag } })}
                      >
                        #{tag}
                        <span className="trends-tag-chip__count">{count}</span>
                      </button>
                    ))}
                  </div>
                )}
            </SectionCard>

            <SectionCard title="Recent Discussions">
              {recentDiscussions.length === 0
                ? <p className="trends-empty">No recent discussions yet.</p>
                : (
                  <ul className="trends-discussion-list">
                    {recentDiscussions.map((post) => (
                      <li key={post.id} className="trends-discussion-row">
                        <div className="trends-discussion-row__body">
                          <p className="trends-discussion-row__title">
                            {post.title || 'Idea post'}
                          </p>
                          <p className="trends-discussion-row__meta">
                            by {post.postedBy?.username || 'Unknown'}
                            {post.genre ? ` · ${post.genre}` : ''}
                          </p>
                        </div>
                        <div className="trends-discussion-row__stats">
                          <span className="trends-stat">Comments: {post.commentsCount || 0}</span>
                          <span className="trends-stat">Likes: {post.likesCount || 0}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
            </SectionCard>

            <SectionCard title="Active Contributors">
              {activeContributors.length === 0
                ? <p className="trends-empty">No active contributors yet.</p>
                : (
                  <ol className="trends-contributor-list">
                    {activeContributors.map((c, i) => (
                      <li key={c.username} className="trends-contributor-row">
                        <div className="trends-contributor-row__rank">
                          <MedalIcon rank={i + 1} />
                        </div>
                        <div className="trends-contributor-row__body">
                          <p className="trends-contributor-row__name">{c.username}</p>
                          <p className="trends-contributor-row__meta">
                            {c.postCount} post{c.postCount !== 1 ? 's' : ''}
                            {' · '}Likes: {c.totalLikes}
                            {' · '}Comments: {c.totalComments}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              <button
                type="button"
                className="btn-ghost"
                style={{ alignSelf: 'flex-start', fontSize: 13, marginTop: 4 }}
                onClick={() => navigate('/users')}
              >
                Find Users
              </button>
            </SectionCard>

          </div>
        )}

        <div className="trends-ai-cta">
          <button
            type="button"
            className="btn-primary trends-ai-cta__btn"
            onClick={() =>
              navigate('/agent', {
                state: { prompt: 'Based on current community trends, what games should I try next?' },
              })
            }
          >
            Ask AI About These Trends
          </button>
        </div>

      </div>
    </div>
  );
}