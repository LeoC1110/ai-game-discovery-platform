import { useQuery } from '@apollo/client';
import { MY_PROGRESS } from '../gql/myProgress.js';

export default function AchievementsPage() {
  const { data, loading, error } = useQuery(MY_PROGRESS, { fetchPolicy: 'cache-first' });

  if (loading) return <p>Loading achievements…</p>;
  if (error) return <p role="alert">Failed to load achievements: {error.message}</p>;

  const entries = data?.myProgress || [];
  const totalAchievements = entries.reduce((sum, slot) => sum + (slot.achievements?.length || 0), 0);

  return (
    <div className="progress-view">
      <section className="card achievements-card">
        <header>
          <h2>Achievements Overview</h2>
          <p className="hint">Unlocked {totalAchievements} achievements across {entries.length} games.</p>
        </header>
        {entries.length === 0 ? (
          <p className="achievement-empty">No tracked games yet. Add one in the My Progress tab.</p>
        ) : (
          entries.map((slot) => (
            <article className="achievement-group" key={slot.id}>
              <h3>{slot.gameTitle || slot.gameId}</h3>
              {slot.achievements?.length ? (
                <ul className="achievement-list">
                  {slot.achievements.map((badge) => (
                    <li key={badge}>{badge}</li>
                  ))}
                </ul>
              ) : (
                <p className="achievement-empty">No achievements recorded yet.</p>
              )}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
