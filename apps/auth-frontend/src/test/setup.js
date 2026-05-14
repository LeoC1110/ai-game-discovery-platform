import '@testing-library/jest-dom';
import React from 'react';

// Mock Three.js (WebGL not available in jsdom)
vi.mock('../components/ThreeBackground', () => ({
  default: () => null,
}));

// Mock DashboardNav
vi.mock('../components/DashboardNav', () => ({
  default: () => React.createElement('nav', { 'data-testid': 'dashboard-nav' }),
}));

// Stub CSS imports
vi.mock('../screens/Post.css', () => ({}));
vi.mock('../screens/PlayNow.css', () => ({}));
vi.mock('../screens/Tournaments.css', () => ({}));
vi.mock('../screens/Leaderboard.css', () => ({}));
vi.mock('../App.css', () => ({}));
vi.mock('../index.css', () => ({}));

// Clean localStorage between tests
beforeEach(() => {
  localStorage.clear();
});
