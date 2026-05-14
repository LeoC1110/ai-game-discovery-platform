// src/test/BookmarksPage.test.jsx
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers';
import BookmarksPage from '../screens/BookmarksPage';
import { BOOKMARKED_POSTS, TOGGLE_BOOKMARK } from '../gql/gamePosts';
import { makePost, makeUser } from './mockData';

const bookmarkedPost = makePost({
  id: 'p1', title: 'Celeste', genre: 'Platformer', platform: 'PC', developer: 'Maddy Makes Games',
  releaseYear: 2018, rating: 9, tags: ['Indie', 'Platformer'],
  review: 'A beautiful game about overcoming anxiety.',
  postedBy: { id: 'u2', username: 'carol' },
  likesCount: 8, commentsCount: 3, bookmarksCount: 5,
  isLikedByMe: true, isBookmarkedByMe: true,
  createdAt: '2024-03-01T00:00:00.000Z', updatedAt: '2024-03-01T00:00:00.000Z',
});

describe('BookmarksPage', () => {
  test('renders heading and subtitle', () => {
    const mocks = [{ request: { query: BOOKMARKED_POSTS }, result: { data: { bookmarkedPosts: [] } } }];
    renderWithProviders(<BookmarksPage />, { mocks });
    expect(screen.getByText('Bookmarks')).toBeInTheDocument();
    expect(screen.getByText(/your saved game recommendations/i)).toBeInTheDocument();
  });

  test('shows loading state initially', () => {
    const mocks = [{ request: { query: BOOKMARKED_POSTS }, result: { data: { bookmarkedPosts: [] } } }];
    renderWithProviders(<BookmarksPage />, { mocks });
    expect(screen.getByText(/loading bookmarks/i)).toBeInTheDocument();
  });

  test('shows empty state with Browse Community button when no bookmarks', async () => {
    const mocks = [{ request: { query: BOOKMARKED_POSTS }, result: { data: { bookmarkedPosts: [] } } }];
    renderWithProviders(<BookmarksPage />, { mocks });
    await waitFor(() => {
      expect(screen.getByText(/no bookmarks yet/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /browse community/i })).toBeInTheDocument();
    });
  });

  test('renders bookmarked post title', async () => {
    const mocks = [{ request: { query: BOOKMARKED_POSTS }, result: { data: { bookmarkedPosts: [bookmarkedPost] } } }];
    renderWithProviders(<BookmarksPage />, { mocks });
    await waitFor(() => {
      expect(screen.getByText('Celeste')).toBeInTheDocument();
    });
  });

  test('renders Remove button for each bookmarked post', async () => {
    const mocks = [{ request: { query: BOOKMARKED_POSTS }, result: { data: { bookmarkedPosts: [bookmarkedPost] } } }];
    renderWithProviders(<BookmarksPage />, { mocks });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
    });
  });

  test('clicking Remove fires TOGGLE_BOOKMARK mutation', async () => {
    let mutationCalled = false;
    const toggleMock = {
      request: { query: TOGGLE_BOOKMARK, variables: { postId: 'p1' } },
      result: () => { mutationCalled = true; return { data: { toggleBookmark: { __typename: 'GamePost', id: 'p1', isBookmarkedByMe: false, bookmarksCount: 4 } } }; },
    };
    const mocks = [
      { request: { query: BOOKMARKED_POSTS }, result: { data: { bookmarkedPosts: [bookmarkedPost] } } },
      { request: { query: BOOKMARKED_POSTS }, result: { data: { bookmarkedPosts: [] } } },
      toggleMock,
      toggleMock,
    ];
    renderWithProviders(<BookmarksPage />, { mocks });
    await waitFor(() => screen.getByRole('button', { name: /remove/i }));
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    await waitFor(() => expect(mutationCalled).toBe(true));
  });

  test('shows error on query failure', async () => {
    const mocks = [{ request: { query: BOOKMARKED_POSTS }, error: new Error('Network error') }];
    renderWithProviders(<BookmarksPage />, { mocks });
    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    });
  });
});
