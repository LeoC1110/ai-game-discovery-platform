// src/test/PostPage.test.jsx
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers';
import PostPage from '../screens/PostPage';
import { CREATE_POST } from '../gql/gamePosts';
import { gql } from '@apollo/client';

const ME_QUERY = gql`query MePost { me { id role } }`;

const adminMeResult = { data: { me: { __typename: 'User', id: '1', role: 'Admin' } } };
const playerMeResult = { data: { me: { __typename: 'User', id: '2', role: 'Player' } } };

const createdPost = {
  __typename: 'GamePost',
  id: 'p1', title: 'Elden Ring', genre: 'RPG', platform: 'PC', developer: 'FromSoftware',
  releaseYear: 2022, gameType: 'Singleplayer', rating: 10, coverImageUrl: null, gameLink: null,
  tags: ['RPG', 'Souls'], review: 'Amazing game', featured: false,
  postedBy: { __typename: 'User', id: '1', username: 'testuser' },
  likesCount: 0, commentsCount: 0, bookmarksCount: 0, isLikedByMe: false, isBookmarkedByMe: false,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};

describe('PostPage', () => {
  test('renders all required form fields', async () => {
    const mocks = [{ request: { query: ME_QUERY }, result: playerMeResult }];
    renderWithProviders(<PostPage />, { mocks });
    expect(screen.getByText('Post a Game')).toBeInTheDocument();
    expect(screen.getAllByText(/game title/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/review/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /publish post/i })).toBeInTheDocument();
  });

  test('shows error when submitting without required fields', async () => {
    const mocks = [{ request: { query: ME_QUERY }, result: playerMeResult }];
    renderWithProviders(<PostPage />, { mocks });
    fireEvent.submit(screen.getByRole('button', { name: /publish post/i }).closest('form'));
    await waitFor(() => {
      expect(screen.getByText(/game title is required/i)).toBeInTheDocument();
    });
  });

  test('shows error when submitting without review', async () => {
    const mocks = [{ request: { query: ME_QUERY }, result: playerMeResult }];
    const { container } = renderWithProviders(<PostPage />, { mocks });
    fireEvent.change(container.querySelector('input[name="title"]'), {
      target: { value: 'Some Game' },
    });
    fireEvent.submit(container.querySelector('form.post-form'));
    await waitFor(() => {
      expect(screen.getByText(/Review.*recommendation.*required/i)).toBeInTheDocument();
    });
  });

  test('does NOT show Featured checkbox for Player role', async () => {
    const mocks = [{ request: { query: ME_QUERY }, result: playerMeResult }];
    renderWithProviders(<PostPage />, { mocks });
    await waitFor(() => {
      expect(screen.queryByText(/mark as featured/i)).toBeNull();
    });
  });

  test('shows Featured checkbox for Admin role', async () => {
    const mocks = [{ request: { query: ME_QUERY }, result: adminMeResult }];
    renderWithProviders(<PostPage />, { mocks });
    await waitFor(() => {
      expect(screen.getByText(/mark as featured/i)).toBeInTheDocument();
    });
  });

  test('Clear button resets the form', async () => {
    const mocks = [{ request: { query: ME_QUERY }, result: playerMeResult }];
    const { container } = renderWithProviders(<PostPage />, { mocks });
    const titleInput = container.querySelector('input[name="title"]');
    fireEvent.change(titleInput, { target: { value: 'Test Game' } });
    expect(titleInput.value).toBe('Test Game');
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(titleInput.value).toBe('');
  });

  test('calls CREATE_POST mutation on valid submit', async () => {
    let mutationCalled = false;
    const createMock = {
      request: {
        query: CREATE_POST,
        variables: {
          input: {
            title: 'Elden Ring',
            review: 'Amazing game',
            genre: undefined, platform: undefined, developer: undefined,
            releaseYear: undefined, gameType: undefined, rating: undefined,
            coverImageUrl: undefined, gameLink: undefined,
            tags: undefined, featured: undefined,
          },
        },
      },
      result: () => { mutationCalled = true; return { data: { createPost: createdPost } }; },
    };
    const mocks = [
      { request: { query: ME_QUERY }, result: playerMeResult },
      createMock,
      createMock,
    ];
    const { container } = renderWithProviders(<PostPage />, { mocks });

    fireEvent.change(container.querySelector('input[name="title"]'), { target: { value: 'Elden Ring' } });
    fireEvent.change(container.querySelector('textarea[name="review"]'), { target: { value: 'Amazing game' } });
    fireEvent.submit(container.querySelector('form.post-form'));

    await waitFor(() => {
      expect(mutationCalled).toBe(true);
    });
  });

  test('cover image upload area is present', () => {
    const mocks = [{ request: { query: ME_QUERY }, result: playerMeResult }];
    renderWithProviders(<PostPage />, { mocks });
    expect(screen.getByText(/click to upload jpg \/ png/i)).toBeInTheDocument();
  });
});
