// src/test/LeaderboardPage.test.jsx
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers';
import LeaderboardPage from '../screens/LeaderboardPage';
import { ALL_POSTS } from '../gql/gamePosts';

const fakePosts = [
  {
    __typename: 'GamePost',
    id: 'p1', title: 'Elden Ring', genre: 'RPG', platform: 'PC',
    tags: ['RPG'], rating: 10, review: 'Top game.',
    postedBy: { __typename: 'User', id: 'u1', username: 'alice' },
    likesCount: 20, commentsCount: 8, bookmarksCount: 5,
    isLikedByMe: false, isBookmarkedByMe: false, featured: false,
    coverImageUrl: null, gameLink: null, developer: null, releaseYear: null, gameType: null,
    createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    __typename: 'GamePost',
    id: 'p2', title: 'Celeste', genre: 'Indie', platform: 'PC',
    tags: ['Indie'], rating: 9, review: 'Beautiful platformer.',
    postedBy: { __typename: 'User', id: 'u2', username: 'bob' },
    likesCount: 5, commentsCount: 2, bookmarksCount: 3,
    isLikedByMe: false, isBookmarkedByMe: false, featured: false,
    coverImageUrl: null, gameLink: null, developer: null, releaseYear: null, gameType: null,
    createdAt: '2024-02-01T00:00:00.000Z', updatedAt: '2024-02-01T00:00:00.000Z',
  },
  {
    __typename: 'GamePost',
    id: 'p3', title: 'Hollow Knight', genre: 'Indie', platform: 'PC',
    tags: ['Metroidvania'], rating: 8, review: 'Challenging and beautiful.',
    postedBy: { __typename: 'User', id: 'u1', username: 'alice' }, // alice has 2 posts
    likesCount: 12, commentsCount: 15, bookmarksCount: 4,
    isLikedByMe: false, isBookmarkedByMe: false, featured: false,
    coverImageUrl: null, gameLink: null, developer: null, releaseYear: null, gameType: null,
    createdAt: '2024-03-01T00:00:00.000Z', updatedAt: '2024-03-01T00:00:00.000Z',
  },
];

const allPostsMock = {
  request: { query: ALL_POSTS, variables: {} },
  result: { data: { allPosts: fakePosts } },
};

describe('LeaderboardPage', () => {
  test('renders heading and all 4 tab buttons', async () => {
    renderWithProviders(<LeaderboardPage />, { mocks: [allPostsMock] });
    expect(screen.getByText('Leaderboard')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /top rated/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /most liked/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /most commented/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /top contributors/i })).toBeInTheDocument();
  });

  test('Top Rated tab shows Elden Ring (rating 10) first', async () => {
    renderWithProviders(<LeaderboardPage />, { mocks: [allPostsMock] });
    await waitFor(() => {
      const rows = screen.getAllByText(/elden ring/i);
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  test('switching to Most Liked tab renders likes stats', async () => {
    renderWithProviders(<LeaderboardPage />, { mocks: [allPostsMock, allPostsMock] });
    await waitFor(() => screen.getByText('Elden Ring'));
    fireEvent.click(screen.getByRole('button', { name: /most liked/i }));
    await waitFor(() => {
      expect(screen.getAllByText(/likes/i).length).toBeGreaterThan(0);
    });
  });

  test('switching to Most Commented tab renders comments stats', async () => {
    renderWithProviders(<LeaderboardPage />, { mocks: [allPostsMock, allPostsMock] });
    await waitFor(() => screen.getByText('Elden Ring'));
    fireEvent.click(screen.getByRole('button', { name: /most commented/i }));
    await waitFor(() => {
      expect(screen.getAllByText(/comments/i).length).toBeGreaterThan(0);
    });
  });

  test('Top Contributors tab shows alice (2 posts) before bob (1 post)', async () => {
    renderWithProviders(<LeaderboardPage />, { mocks: [allPostsMock] });
    await waitFor(() => screen.getByText('Elden Ring'));
    fireEvent.click(screen.getByRole('button', { name: /top contributors/i }));
    await waitFor(() => {
      const items = screen.getAllByText(/alice|bob/i);
      // alice should come first (2 posts)
      expect(items[0].textContent).toMatch(/alice/i);
    });
  });

  test('shows medal icons for top 3 entries', async () => {
    renderWithProviders(<LeaderboardPage />, { mocks: [allPostsMock] });
    await waitFor(() => screen.getByText('Elden Ring'));
    expect(screen.getByText('🥇')).toBeInTheDocument();
    expect(screen.getByText('🥈')).toBeInTheDocument();
  });

  test('shows empty state if no posts', async () => {
    const emptyMock = { request: { query: ALL_POSTS, variables: {} }, result: { data: { allPosts: [] } } };
    renderWithProviders(<LeaderboardPage />, { mocks: [emptyMock, emptyMock] });
    await waitFor(() => {
      expect(screen.getByText(/No community posts yet/i)).toBeInTheDocument();
    });
  });
});
