import React from 'react';
import { NavLink } from 'react-router-dom';

const links = [
  { to: '/home', label: 'Home' },
  { to: '/share', label: 'Share' },
  { to: '/post', label: 'Post' },
  { to: '/community', label: 'Community' },
  { to: '/bookmarks', label: 'Bookmarks' },
  { to: '/agent', label: 'AI Agent' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/profile', label: 'Profile' },
];

export default function DashboardNav() {
  return (
    <nav className="dashboard-nav" aria-label="Dashboard navigation">
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
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
