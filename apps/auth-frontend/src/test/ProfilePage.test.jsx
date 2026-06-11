// src/test/ProfilePage.test.jsx
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers';
import ProfilePage from '../screens/ProfilePage';
import { MY_POSTS, BOOKMARKED_POSTS, DELETE_POST } from '../gql/gamePosts';
import { gql } from '@apollo/client';

const ME_QUERY = gql`query MeProfile { me { id username email role createdAt } }`;

const meData = {
  __typename: 'User',
  id: 'u1',
  username: 'alice',
  email: 'alice@example.com',
  role: 'Player',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const myPost = {
  __typename: 'GamePost',
  id: 'p1', title: 'Elden Ring', genre: 'RPG', platform: 'PC',
  developer: null, releaseYear: 2022, gameType: 'Singleplayer', rating: 10, authorRating: 10, communityRating: 9.1, ratingCount: 8, myCommunityRating: null,
  coverImageUrl: null, gameLink: null, tags: ['RPG'],
  review: 'A masterpiece.', featured: false,
  postedBy: { __typename: 'User', id: 'u1', username: 'alice' },
  likesCount: 5, commentsCount: 2, bookmarksCount: 1,
  isLikedByMe: false, isBookmarkedByMe: false,
  createdAt: '2024-01-15T00:00:00.000Z', updatedAt: '2024-01-15T00:00:00.000Z',
};

const bookmarkedPost = {
  ...myPost, id: 'p2', title: 'Celeste', postedBy: { id: 'u2', username: 'carol' },
};

describe('ProfilePage', () => {
  const baseMocks = () => {
    const meMock = { request: { query: ME_QUERY }, result: { data: { me: meData } } };
    const myPostsMock = { request: { query: MY_POSTS, variables: {} }, result: { data: { myPosts: [myPost] } } };
    const bookmarksMock = { request: { query: BOOKMARKED_POSTS, variables: {} }, result: { data: { bookmarkedPosts: [bookmarkedPost] } } };
    // Duplicate each mock: cache-and-network fires a network request even when cache has data
    return [meMock, meMock, myPostsMock, myPostsMock, bookmarksMock, bookmarksMock];
  };

  test('renders username and email after load', async () => {
    renderWithProviders(<ProfilePage />, { mocks: baseMocks() });
    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument();
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    });
  });

  test('shows Player role badge', async () => {
    renderWithProviders(<ProfilePage />, { mocks: baseMocks() });
    await waitFor(() => {
      expect(screen.getByText('Player')).toBeInTheDocument();
    });
  });

  test('renders My Posts tab active by default', async () => {
    renderWithProviders(<ProfilePage />, { mocks: baseMocks() });
    await waitFor(() => {
      expect(screen.getByText('Elden Ring')).toBeInTheDocument();
    });
  });

  test('switching to Bookmarks tab shows bookmarked post', async () => {
    renderWithProviders(<ProfilePage />, { mocks: baseMocks() });
    await waitFor(() => screen.getByText('Elden Ring'));
    fireEvent.click(screen.getByRole('button', { name: /bookmarks/i }));
    await waitFor(() => {
      expect(screen.getByText('Celeste')).toBeInTheDocument();
    });
  });

  test('Delete Post button is present on own posts', async () => {
    renderWithProviders(<ProfilePage />, { mocks: baseMocks() });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /delete post/i })).toBeInTheDocument();
    });
  });

  test('Delete Post calls confirm and DELETE_POST mutation', async () => {
    let deleteCalled = false;
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    const mocks = [
      ...baseMocks(),
      {
        request: { query: DELETE_POST, variables: { id: 'p1' } },
        result: () => { deleteCalled = true; return { data: { deletePost: true } }; },
      },
      { request: { query: MY_POSTS, variables: {} }, result: { data: { myPosts: [] } } },
    ];
    renderWithProviders(<ProfilePage />, { mocks });
    await waitFor(() => screen.getByText('Elden Ring'));
    fireEvent.click(screen.getByRole('button', { name: /delete post/i }));
    await waitFor(() => expect(deleteCalled).toBe(true));
  });

  test('shows post count and bookmark count stats', async () => {
    renderWithProviders(<ProfilePage />, { mocks: baseMocks() });
    await waitFor(() => {
      expect(screen.getByText(/Posts: \d/)).toBeInTheDocument();
    });
  });
});
