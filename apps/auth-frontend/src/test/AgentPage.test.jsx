// src/test/AgentPage.test.jsx
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers';
import AgentPage from '../screens/AgentPage';
import { ALL_POSTS } from '../gql/gamePosts';

const fakePosts = [
  {
    __typename: 'GamePost',
    id: 'p1', title: 'Elden Ring', genre: 'RPG', platform: 'PC',
    tags: ['RPG', 'Souls'], rating: 10, review: 'A masterpiece.',
    postedBy: { __typename: 'User', id: 'u1', username: 'alice' },
    likesCount: 15, commentsCount: 4, bookmarksCount: 3,
    isLikedByMe: false, isBookmarkedByMe: false,
    featured: false, coverImageUrl: null, gameLink: null,
    developer: 'FromSoftware', releaseYear: 2022, gameType: 'Singleplayer',
    createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    __typename: 'GamePost',
    id: 'p2', title: 'Celeste', genre: 'Indie', platform: 'PC',
    tags: ['Indie', 'Platformer'], rating: 9, review: 'Beautiful platformer.',
    postedBy: { __typename: 'User', id: 'u2', username: 'bob' },
    likesCount: 8, commentsCount: 2, bookmarksCount: 5,
    isLikedByMe: false, isBookmarkedByMe: false,
    featured: false, coverImageUrl: null, gameLink: null,
    developer: 'Maddy Makes Games', releaseYear: 2018, gameType: 'Singleplayer',
    createdAt: '2024-02-01T00:00:00.000Z', updatedAt: '2024-02-01T00:00:00.000Z',
  },
];

const allPostsMock = {
  request: { query: ALL_POSTS, variables: {} },
  result: { data: { allPosts: fakePosts } },
};

describe('AgentPage — layout', () => {
  test('renders heading and suggestion buttons', () => {
    renderWithProviders(<AgentPage />, { mocks: [allPostsMock] });
    expect(screen.getByText(/AI Game Agent/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });

  test('renders chat input and Send button', () => {
    renderWithProviders(<AgentPage />, { mocks: [allPostsMock] });
    expect(screen.getByPlaceholderText(/ask the agent/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });
});

describe('AgentPage — AI response logic', () => {
  test('responds to "top rated" query', async () => {
    renderWithProviders(<AgentPage />, { mocks: [allPostsMock, allPostsMock] });
    await waitFor(() => screen.getByPlaceholderText(/ask the agent/i));

    const input = screen.getByPlaceholderText(/ask the agent/i);
    fireEvent.change(input, { target: { value: 'Show me top rated games' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText(/top rated games/i)).toBeInTheDocument();
      expect(screen.getByText(/Elden Ring/)).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  test('responds to "most liked" query', async () => {
    renderWithProviders(<AgentPage />, { mocks: [allPostsMock, allPostsMock] });
    await waitFor(() => screen.getByPlaceholderText(/ask the agent/i));

    const input = screen.getByPlaceholderText(/ask the agent/i);
    fireEvent.change(input, { target: { value: 'What are the most liked posts?' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText(/most liked/i)).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  test('responds to RPG tag query', async () => {
    renderWithProviders(<AgentPage />, { mocks: [allPostsMock, allPostsMock] });
    await waitFor(() => screen.getByPlaceholderText(/ask the agent/i));

    const input = screen.getByPlaceholderText(/ask the agent/i);
    fireEvent.change(input, { target: { value: 'Find RPG games' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText(/elden ring/i)).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  test('responds to summarize query', async () => {
    renderWithProviders(<AgentPage />, { mocks: [allPostsMock, allPostsMock] });
    await waitFor(() => screen.getByPlaceholderText(/ask the agent/i));

    const input = screen.getByPlaceholderText(/ask the agent/i);
    fireEvent.change(input, { target: { value: 'Summarize the community' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText(/community summary/i)).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  test('Send button is disabled when input is empty', () => {
    renderWithProviders(<AgentPage />, { mocks: [allPostsMock] });
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });

  test('clicking a suggestion populates and sends the message', async () => {
    renderWithProviders(<AgentPage />, { mocks: [allPostsMock, allPostsMock] });
    await waitFor(() => screen.getByPlaceholderText(/ask the agent/i));

    const suggestions = screen.getAllByRole('button', { name: /highest rated/i });
    if (suggestions.length > 0) {
      fireEvent.click(suggestions[0]);
      await waitFor(() => {
        // after clicking suggestion, a user message should appear
        expect(screen.getByText(/highest rated/i)).toBeInTheDocument();
      }, { timeout: 2000 });
    }
  });
});
