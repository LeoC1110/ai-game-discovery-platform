import { useQuery } from '@apollo/client';
import { ME } from '../gql/me.js';

export default function UserBadge() {
  const { data } = useQuery(ME, { fetchPolicy: 'cache-first' });
  const fallback = (() => {
    try {
      return JSON.parse(localStorage.getItem('me') || '{}');
    } catch (err) {
      console.warn('Failed to parse cached profile', err);
      return {};
    }
  })();

  const user = data?.me || fallback;
  if (!user?.username) {
    return <span className="user-badge user-badge--anon">Guest</span>;
  }

  return (
    <span className="user-badge">
      <span className="user-badge__avatar" aria-hidden="true">
        {user.username.slice(0, 1).toUpperCase()}
      </span>
      <span className="user-badge__meta">
        <strong>{user.username}</strong>
        <small>{user.role || 'Player'}</small>
      </span>
    </span>
  );
}
