import { useState } from 'react';
import { useQuery, useLazyQuery } from '@apollo/client';
import { LEADERBOARD } from '../gql/leaderboard.js';
import { MY_PROGRESS } from '../gql/myProgress.js';
import './Leaderboard.css';

export default function LeaderboardPage() {
  const { data: myProgressData } = useQuery(MY_PROGRESS, { fetchPolicy: 'cache-first' });
  const [fetchLeaderboard, { data, loading, error }] = useLazyQuery(LEADERBOARD);
  const [gameIdInput, setGameIdInput] = useState('');

  const trackedGames = myProgressData?.myProgress || [];

  const onSubmit = (e) => {
    e.preventDefault();
    const gid = gameIdInput.trim();
    if (!gid) return;
    fetchLeaderboard({ variables: { gameId: gid } });
  };

  return (
    <div className="progress-view leaderboard-view">
      <section className="card progress-intro leaderboard-intro">
        <h2>View Leaderboard</h2>
        <form className="progress-intro__form" onSubmit={onSubmit}>
          <input
            className="input"
            list="tracked-games"
            value={gameIdInput}
            onChange={(event) => setGameIdInput(event.target.value)}
            placeholder="Enter game ID"
            required
          />
          <datalist id="tracked-games">
            {trackedGames.map((slot) => (
              <option key={slot.id} value={slot.gameId}>{slot.gameTitle || slot.gameId}</option>
            ))}
          </datalist>
          <button type="submit" className="btn-primary">Load</button>
        </form>
      </section>

      {loading && <p>Loading leaderboard…</p>}
      {error && <p role="alert">Failed to load leaderboard: {error.message}</p>}

  <section className="card leaderboard-card leaderboard-card--primary">
        <header>
          <h2>Leaderboard</h2>
          <p className="hint">Showing up to top 25 players by score.</p>
        </header>
        {data?.leaderboard?.length ? (
          <ol className="leaderboard-list">
            {data.leaderboard.map((entry) => (
              <li key={`${entry.userId}-${entry.rank}`}>
                <span className="leaderboard-rank">#{entry.rank.toString().padStart(2, '0')}</span>
                <div className="leaderboard-player">
                  <strong>{entry.username}</strong>
                  <small>Level {entry.level} · {entry.experience} XP</small>
                </div>
                <span className="leaderboard-score">{entry.score}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="achievement-empty">Choose a game to view its leaderboard.</p>
        )}
      </section>
    </div>
  );
}
