import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { MY_PROGRESS } from '../gql/myProgress.js';
import { ADD_EXPERIENCE } from '../gql/addExperience.js';
import { SET_SCORE } from '../gql/setScore.js';
import { UNLOCK_ACHIEVEMENT } from '../gql/unlockAchievement.js';

function ProgressCard({ slot, onAddExp, onSetScore, onUnlock }) {
  const [exp, setExp] = useState('');
  const [score, setScore] = useState('');
  const [achievement, setAchievement] = useState('');

  return (
    <article className="card progress-card">
      <header className="progress-card__header">
        <div>
          <h2>{slot.gameTitle || slot.gameId}</h2>
          <small>Game ID: {slot.gameId}</small>
        </div>
        <div className="progress-card__meta">
          <span>Level {slot.level}</span>
          <span>{slot.experience} XP</span>
          <span>Score {slot.score}</span>
        </div>
      </header>

      <section className="progress-card__actions">
        <form
          className="progress-card__form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!exp) return;
            onAddExp(Number(exp));
            setExp('');
          }}
        >
          <label>
            Add Experience
            <input
              className="input"
              type="number"
              min="1"
              value={exp}
              onChange={(e) => setExp(e.target.value)}
              placeholder="Amount"
              required
            />
          </label>
          <button type="submit" className="btn-primary">Add</button>
        </form>

        <form
          className="progress-card__form"
          onSubmit={(e) => {
            e.preventDefault();
            if (score === '') return;
            onSetScore(Number(score));
            setScore('');
          }}
        >
          <label>
            Update Score
            <input
              className="input"
              type="number"
              min="0"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              placeholder="New score"
              required
            />
          </label>
          <button type="submit" className="btn-primary">Save</button>
        </form>

        <form
          className="progress-card__form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!achievement.trim()) return;
            onUnlock(achievement.trim());
            setAchievement('');
          }}
        >
          <label>
            Unlock Achievement
            <input
              className="input"
              type="text"
              value={achievement}
              onChange={(e) => setAchievement(e.target.value)}
              placeholder="Achievement name"
              required
            />
          </label>
          <button type="submit" className="btn-primary">Unlock</button>
        </form>
      </section>

      {slot.achievements?.length ? (
        <ul className="achievement-list">
          {slot.achievements.map((badge) => (
            <li key={badge}>{badge}</li>
          ))}
        </ul>
      ) : (
        <p className="achievement-empty">No achievements yet.</p>
      )}
    </article>
  );
}

export default function MyProgressPage() {
  const [newGameId, setNewGameId] = useState('');
  const [newGameTitle, setNewGameTitle] = useState('');
  const { data, loading, error, refetch } = useQuery(MY_PROGRESS);
  const [addExperience] = useMutation(ADD_EXPERIENCE);
  const [setScore] = useMutation(SET_SCORE);
  const [unlockAchievement] = useMutation(UNLOCK_ACHIEVEMENT);

  const handleStartTracking = async (e) => {
    e.preventDefault();
    if (!newGameId.trim()) return;
    try {
      await setScore({
        variables: {
          gameId: newGameId.trim(),
          gameTitle: newGameTitle.trim() || undefined,
          score: 0,
        },
      });
      setNewGameId('');
      setNewGameTitle('');
      await refetch();
    } catch (err) {
      console.error('Failed to start tracking', err);
  window.alert(err.message || 'Unable to start tracking game');
    }
  };

  if (loading) return <p>Loading progress…</p>;
  if (error) return <p role="alert">Failed to load progress: {error.message}</p>;

  const slots = data?.myProgress || [];

  return (
    <div className="progress-view">
      <section className="card progress-intro">
        <h2>Track a New Game</h2>
        <form className="progress-intro__form" onSubmit={handleStartTracking}>
          <input
            className="input"
            value={newGameId}
            onChange={(e) => setNewGameId(e.target.value)}
            placeholder="Game ID (required)"
            required
          />
          <input
            className="input"
            value={newGameTitle}
            onChange={(e) => setNewGameTitle(e.target.value)}
            placeholder="Game title (optional)"
          />
          <button type="submit" className="btn-primary">Start Tracking</button>
        </form>
      </section>

      <section className="progress-list">
        {slots.length === 0 ? (
          <p className="achievement-empty">No games tracked yet. Add one above to begin.</p>
        ) : (
          slots.map((slot) => (
            <ProgressCard
              key={slot.id}
              slot={slot}
              onAddExp={async (amount) => {
                try {
                  await addExperience({
                    variables: {
                      gameId: slot.gameId,
                      gameTitle: slot.gameTitle,
                      amount,
                    },
                  });
                  await refetch();
                } catch (err) {
                  console.error('Failed to add experience', err);
                  window.alert(err.message || 'Unable to add experience');
                }
              }}
              onSetScore={async (score) => {
                try {
                  await setScore({
                    variables: {
                      gameId: slot.gameId,
                      gameTitle: slot.gameTitle,
                      score,
                    },
                  });
                  await refetch();
                } catch (err) {
                  console.error('Failed to set score', err);
                  window.alert(err.message || 'Unable to set score');
                }
              }}
              onUnlock={async (achievement) => {
                try {
                  await unlockAchievement({
                    variables: {
                      gameId: slot.gameId,
                      gameTitle: slot.gameTitle,
                      achievement,
                    },
                  });
                  await refetch();
                } catch (err) {
                  console.error('Failed to unlock achievement', err);
                  window.alert(err.message || 'Unable to unlock achievement');
                }
              }}
            />
          ))
        )}
      </section>
    </div>
  );
}
