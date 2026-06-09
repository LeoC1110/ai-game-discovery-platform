// src/screens/HomePage.jsx
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { gql, useQuery, useMutation, useApolloClient } from '@apollo/client';
import DashboardNav from '../components/DashboardNav';
import { LOGOUT } from '../gql/logout.js';

const ME_QUERY = gql`
  query MeForHome {
    me {
      id
      username
      role
    }
  }
`;

const sections = [
  {
    to: '/post',
    title: 'Post',
    description: 'Create a game recommendation or share a quick idea with the community.',
  },
  {
    to: '/community',
    title: 'Community',
    description: 'Explore posts, comments, likes, and discussions from other users.',
  },
  {
    to: '/bookmarks',
    title: 'Bookmarks',
    description: 'View and manage your saved game recommendations.',
  },
  {
    to: '/profile',
    title: 'Profile',
    description: 'Review your posts, likes, bookmarks, and account settings.',
  },
  {
    to: '/agent',
    title: 'Nova',
    description: 'Ask Nova for AI-powered game suggestions based on your preferences and community data.',
  },
  {
    to: '/leaderboard',
    title: 'Community Trends',
    description: 'View popular game posts and active community discussions.',
  },
];

export default function HomePage() {
  const { data } = useQuery(ME_QUERY, { fetchPolicy: 'cache-and-network' });
  const username = data?.me?.username || 'Player';
  const role = data?.me?.role;

  const navigate = useNavigate();
  const client = useApolloClient();
  const [logout] = useMutation(LOGOUT);

  const handleSignOut = async () => {
    try {
      await logout();
    } catch (err) {
      console.error('Logout failed', err);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('me');
      await client.clearStore().catch(() => {});
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="app-root">
      <div className="app-container">
        <header className="home-header">
          <div className="home-header__top">
            <span />
            <button className="btn-signout" type="button" onClick={handleSignOut}>
              Sign Out
            </button>
          </div>
          <h1 className="app-title">Dashboard</h1>
          <p className="home-intro">
            Welcome back, {username}
            {role ? ` (${role})` : ''}. Choose a module below to continue your session.
          </p>
        </header>

        <DashboardNav />

        <section className="home-grid" aria-label="Primary navigation cards">
          {sections.map((section) => (
            <Link key={section.to} to={section.to} className="home-card">
              <div className="home-card__content">
                <h2>{section.title}</h2>
                <p>{section.description}</p>
              </div>
              <span className="home-card__cta">Open</span>
            </Link>
          ))}
        </section>

      </div>
    </div>
  );
}
