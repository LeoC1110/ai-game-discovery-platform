import React, { useEffect } from 'react';
import { NavLink } from 'react-router-dom';

const links = [
  { to: '/home', label: 'Home' },
  { to: '/share', label: 'Share' },
  { to: '/post', label: 'Post' },
  { to: '/community', label: 'Community' },
  { to: '/bookmarks', label: 'Bookmarks' },
  { to: '/agent', label: 'AI Agent' },
  { to: '/leaderboard', label: 'Trends' },
  { to: '/users', label: 'Users' },
  { to: '/profile', label: 'Profile' },
];

const routePreloaders = {
  '/home': () => import('../screens/HomePage.jsx'),
  '/share': () => import('../screens/SharePage.jsx'),
  '/post': () => import('../screens/PostPage.jsx'),
  '/community': () => import('../screens/CommunityPage.jsx'),
  '/bookmarks': () => import('../screens/BookmarksPage.jsx'),
  '/agent': () => import('../screens/AgentPage.jsx'),
  '/leaderboard': () => import('../screens/LeaderboardPage.jsx'),
  '/users': () => import('../screens/UsersPage.jsx'),
  '/profile': () => import('../screens/ProfilePage.jsx'),
};

const HIGH_FREQUENCY_ROUTES = ['/community', '/agent', '/profile', '/bookmarks'];

const preloadedRoutes = new Set();

function preloadRouteChunk(path) {
  if (preloadedRoutes.has(path)) return;
  const loader = routePreloaders[path];
  if (!loader) return;
  preloadedRoutes.add(path);
  loader().catch(() => {
    preloadedRoutes.delete(path);
  });
}

export default function DashboardNav() {
  useEffect(() => {
    // Warm high-traffic route chunks during idle time to reduce first-switch latency.
    if (typeof window === 'undefined') return undefined;

    let timeoutId = null;
    let idleId = null;

    const preloadHighFrequencyRoutes = () => {
      HIGH_FREQUENCY_ROUTES.forEach((path) => preloadRouteChunk(path));
    };

    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(preloadHighFrequencyRoutes, { timeout: 1500 });
      return () => {
        if (idleId != null) window.cancelIdleCallback(idleId);
      };
    }

    timeoutId = window.setTimeout(preloadHighFrequencyRoutes, 450);
    return () => {
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <nav className="dashboard-nav" aria-label="Dashboard navigation">
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          onMouseEnter={() => preloadRouteChunk(link.to)}
          onFocus={() => preloadRouteChunk(link.to)}
          className={({ isActive }) =>
            isActive ? 'dashboard-link dashboard-link--active' : 'dashboard-link'
          }
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}
