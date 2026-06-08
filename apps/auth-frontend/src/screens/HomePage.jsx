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
    description: 'Post your passion. Rate, review, and tag your favorite games in seconds.',
  },
  {
    to: '/community',
    title: 'Community',
    description: 'Connect with players. Discover your next favorite game through the eyes of the community.',
  },
  {
    to: '/bookmarks',
    title: 'Bookmarks',
    description: 'Your personal collection. Save the games you love and organize them beautifully.',
  },
  {
    to: '/profile',
    title: 'Profile',
    description: 'Everything you care about, all in one place. Your posts, your likes, your identity.',
  },
  {
    to: '/agent',
    title: 'Ask Nova',
    description: 'Meet Nova. A powerful AI designed to understand your taste and recommend perfection.',
  },
  {
    to: '/leaderboard',
    title: 'Trends',
    description: 'See what’s shaping the gaming world. The top games, the biggest posts, the best creators.',
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
              <span className="home-card__cta">Enter</span>
            </Link>
          ))}
        </section>

      </div>
    </div>
  );
}
