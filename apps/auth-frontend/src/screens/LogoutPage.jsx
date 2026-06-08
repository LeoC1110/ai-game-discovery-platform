import { useEffect } from 'react';
import { useMutation, useApolloClient } from '@apollo/client';
import { useNavigate } from 'react-router-dom';
import { LOGOUT } from '../gql/logout.js';

export default function LogoutPage() {
  const navigate = useNavigate();
  const client = useApolloClient();
  const [logout] = useMutation(LOGOUT);

  useEffect(() => {
    const run = async () => {
      try {
        await logout();
      } catch (err) {
        console.error('Logout failed', err);
      } finally {
        localStorage.removeItem('token');
        localStorage.removeItem('me');
        await client.clearStore().catch(() => {});
        navigate('/', { replace: true });
      }
    };
    run();
  }, [logout, navigate, client]);

  return (
    <div className="app-root">
      <div className="app-container">
        <div className="card" style={{ maxWidth: 360, margin: '80px auto', textAlign: 'center' }}>
          <div className="auth-flow__status" role="status">
            Logging you out…
          </div>
        </div>
      </div>
    </div>
  );
}
