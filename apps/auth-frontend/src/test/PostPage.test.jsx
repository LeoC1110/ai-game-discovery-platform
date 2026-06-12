// src/test/PostPage.test.jsx
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers';
import PostPage from '../screens/PostPage';
import { CREATE_POST, ALL_POSTS, MY_POSTS } from '../gql/gamePosts';
import { SEARCH_GAMES } from '../gql/games';
import { gql } from '@apollo/client';

const ME_QUERY = gql`query MePost { me { id role } }`;

const playerMeResult = { data: { me: { __typename: 'User', id: '2', role: 'Player' } } };

const selectedGame = {
  __typename: 'Game',
  id: 'g-portal-2',
  title: 'Portal 2',
  titleNormalized: 'portal 2',
  genre: 'Puzzle',
  platform: 'PC',
  developer: 'Valve',
  releaseYear: 2011,
};

const createdPost = {
  __typename: 'GamePost',
  id: 'p1',
  postType: 'GAME',
  game: selectedGame,
  title: 'Portal 2',
  genre: 'Puzzle',
  platform: 'PC',
  developer: 'Valve',
  releaseYear: 2011,
  gameType: null,
  rating: 9,
  authorRating: 9,
  communityRating: null,
  ratingCount: 0,
  myCommunityRating: null,
  coverImageUrl: null,
  gameLink: null,
  tags: ['Puzzle'],
  review: 'Great co-op puzzles.',
  featured: false,
  postedBy: { __typename: 'User', id: '2', username: 'player' },
  likesCount: 0,
  commentsCount: 0,
  bookmarksCount: 0,
  isLikedByMe: false,
  isBookmarkedByMe: false,
  comments: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('PostPage recommend flow', () => {
  test('renders step 1 game selection UI', async () => {
    const mocks = [{ request: { query: ME_QUERY }, result: playerMeResult }];
    renderWithProviders(<PostPage />, { mocks });

    expect(screen.getByText('Recommend a Game')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Step 1 .* Select Game/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Search Existing Game/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue to recommendation/i })).toBeInTheDocument();
  });

  test('disables continue when no game is selected or entered', async () => {
    const mocks = [{ request: { query: ME_QUERY }, result: playerMeResult }];
    renderWithProviders(<PostPage />, { mocks });

    expect(screen.getByRole('button', { name: /continue to recommendation/i })).toBeDisabled();
  });

  test('can search/select existing game and publish recommendation', async () => {
    let mutationCalled = false;

    const mocks = [
      { request: { query: ME_QUERY }, result: playerMeResult },
      {
        request: { query: SEARCH_GAMES, variables: { query: 'Portal 2', limit: 8 } },
        result: { data: { searchGames: [selectedGame] } },
      },
      {
        request: {
          query: CREATE_POST,
          variables: {
            input: {
              postType: 'GAME',
              gameId: 'g-portal-2',
              title: undefined,
              genre: undefined,
              rating: 9,
              coverImageUrl: undefined,
              gameLink: undefined,
              tags: ['Puzzle'],
              review: 'Great co-op puzzles.',
              featured: undefined,
            },
          },
        },
        result: () => {
          mutationCalled = true;
          return { data: { createPost: createdPost } };
        },
      },
      {
        request: {
          query: ALL_POSTS,
          variables: {
            search: undefined,
            genre: undefined,
            platform: undefined,
            tag: undefined,
            sort: undefined,
            postType: undefined,
            limit: undefined,
            offset: undefined,
          },
        },
        result: { data: { allPosts: [] } },
      },
      {
        request: {
          query: MY_POSTS,
          variables: {
            limit: undefined,
            offset: undefined,
          },
        },
        result: { data: { myPosts: [] } },
      },
    ];

    renderWithProviders(<PostPage />, { mocks });

    fireEvent.change(screen.getByLabelText(/Search Existing Game/i), { target: { value: 'Portal 2' } });
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /portal 2/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /portal 2/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue to recommendation/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 2 .* Write Recommendation/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Author Rating/i), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText(/Tags/i), { target: { value: 'Puzzle' } });
    fireEvent.change(screen.getByLabelText(/Recommendation/i), { target: { value: 'Great co-op puzzles.' } });

    fireEvent.click(screen.getByRole('button', { name: /publish recommendation/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^publish$/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }));

    await waitFor(() => {
      expect(mutationCalled).toBe(true);
    });
  });
});
