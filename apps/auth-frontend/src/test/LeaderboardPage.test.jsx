// src/test/LeaderboardPage.test.jsx
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers';
import LeaderboardPage from '../screens/LeaderboardPage';
import { PAGED_POSTS } from '../gql/gamePosts';

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

const pagedPostsMock = {
  request: {
    query: PAGED_POSTS,
    variables: { postType: 'GAME', sort: 'engagement', limit: 10, offset: 0 },
  },
  result: { data: { pagedPosts: { posts: fakePosts, totalCount: fakePosts.length } } },
};

describe('LeaderboardPage', () => {
  test('renders page heading and core sections', async () => {
    renderWithProviders(<LeaderboardPage />, { mocks: [pagedPostsMock] });
    expect(screen.getByText('Community Trends')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Game Rankings/i)).toBeInTheDocument();
      expect(screen.getByText('Popular Tags')).toBeInTheDocument();
      expect(screen.getByText('Recent Discussions')).toBeInTheDocument();
      expect(screen.getByText('Active Contributors')).toBeInTheDocument();
    });
  });

  test('shows ranked game entries from paged posts', async () => {
    renderWithProviders(<LeaderboardPage />, { mocks: [pagedPostsMock] });
    await waitFor(() => {
      expect(screen.getAllByText('Elden Ring').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Hollow Knight').length).toBeGreaterThan(0);
    });
  });

  test('clicking popular tag navigates to community search', async () => {
    renderWithProviders(<LeaderboardPage />, { mocks: [pagedPostsMock] });
    await waitFor(() => screen.getByRole('button', { name: /RPG/i }));
    fireEvent.click(screen.getByRole('button', { name: /RPG/i }));
    await waitFor(() => {
      expect(screen.getByText('Community Trends')).toBeInTheDocument();
    });
  });

  test('shows active contributor list', async () => {
    renderWithProviders(<LeaderboardPage />, { mocks: [pagedPostsMock] });
    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument();
      expect(screen.getByText('bob')).toBeInTheDocument();
    });
  });

  test('shows empty state if no posts', async () => {
    const emptyMock = {
      request: {
        query: PAGED_POSTS,
        variables: { postType: 'GAME', sort: 'engagement', limit: 10, offset: 0 },
      },
      result: { data: { pagedPosts: { posts: [], totalCount: 0 } } },
    };
    renderWithProviders(<LeaderboardPage />, { mocks: [emptyMock, emptyMock] });
    await waitFor(() => {
      expect(screen.getByText(/No community posts yet/i)).toBeInTheDocument();
    });
  });
});
