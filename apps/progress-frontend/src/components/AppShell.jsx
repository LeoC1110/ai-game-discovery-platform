import { Suspense, lazy } from 'react';
import { NavLink } from 'react-router-dom';
import ThreeBackground from './ThreeBackground.jsx';

const RemoteUserBadge = lazy(() => import('auth_frontend/UserBadge'));

export default function AppShell({ children }) {
  return (
    <>
      <ThreeBackground />
      <div className="bg-vignette" />
      <div className="app-root">
        <header className="app-shell__header">
          <h1 className="app-title">Progress Center</h1>
          <Suspense fallback={<span className="user-badge user-badge--anon">Loading…</span>}>
            <RemoteUserBadge />
          </Suspense>
        </header>
        <nav className="app-shell__nav" aria-label="Progress navigation">
          <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}>
            My Progress
          </NavLink>
          <NavLink to="/leaderboard" className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}>
            Leaderboard
          </NavLink>
          <NavLink to="/achievements" className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}>
            Achievements
          </NavLink>
          <a className="nav-link" href={`${import.meta.env.VITE_AUTH_APP_URL}logout`}>Logout</a>
        </nav>
        <main className="app-shell__main">{children}</main>
      </div>
    </>
  );
}
