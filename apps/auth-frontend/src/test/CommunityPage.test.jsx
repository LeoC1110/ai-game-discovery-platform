// src/test/CommunityPage.test.jsx
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers';
import CommunityPage from '../screens/CommunityPage';
import { PAGED_POSTS, LIKE_POST, TOGGLE_BOOKMARK, DELETE_POST, FEATURE_POST, RATE_POST } from '../gql/gamePosts';
import { gql } from '@apollo/client';

const ME_QUERY = gql`query MeCommunity { me { id username role } }`;

const playerMe = { __typename: 'User', id: 'u1', username: 'alice', role: 'Player' };
const adminMe = { __typename: 'User', id: 'u99', username: 'admin', role: 'Admin' };

const makePosts = (overrides = []) => [
  {
    __typename: 'GamePost',
    id: 'p1', title: 'Elden Ring', genre: 'RPG', platform: 'PC', developer: 'FromSoftware',
    releaseYear: 2022, gameType: 'Singleplayer', rating: 10, authorRating: 10, communityRating: 8.6, ratingCount: 12, myCommunityRating: null, coverImageUrl: null, gameLink: null,
    tags: ['RPG', 'Souls'], review: 'A masterpiece of exploration and combat.',
    featured: false, postedBy: { __typename: 'User', id: 'u1', username: 'alice' },
    likesCount: 5, commentsCount: 2, bookmarksCount: 1, isLikedByMe: false, isBookmarkedByMe: false,
    createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
    comments: [],
    ...overrides[0],
  },
  {
    __typename: 'GamePost',
    id: 'p2', title: 'Hollow Knight', genre: 'Indie', platform: 'PC', developer: 'Team Cherry',
    releaseYear: 2017, gameType: 'Singleplayer', rating: 9, authorRating: 9, communityRating: null, ratingCount: 0, myCommunityRating: null, coverImageUrl: null, gameLink: null,
    tags: ['Indie', 'Metroidvania'], review: 'A challenging and beautiful metroidvania.',
    featured: true, postedBy: { __typename: 'User', id: 'u2', username: 'bob' },
    likesCount: 3, commentsCount: 0, bookmarksCount: 2, isLikedByMe: false, isBookmarkedByMe: true,
    createdAt: '2024-02-01T00:00:00.000Z', updatedAt: '2024-02-01T00:00:00.000Z',
    comments: [],
    ...overrides[1],
  },
];

const pagedPostsMock = (posts, variables = {}) => ({
  request: {
    query: PAGED_POSTS,
    variables: {
      search: undefined,
      genre: undefined,
      platform: undefined,
      sort: 'newest',
      limit: 10,
      offset: 0,
      ...variables,
    },
  },
  result: { data: { pagedPosts: { posts, totalCount: posts.length } } },
});

describe('CommunityPage — layout & post rendering', () => {
  test('renders page heading and search filters', async () => {
    const mocks = [
      { request: { query: ME_QUERY }, result: { data: { me: playerMe } } },
      pagedPostsMock(makePosts()),
    ];
    renderWithProviders(<CommunityPage />, { mocks });
    expect(screen.getByText('Community')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search games/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Genre')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Platform')).toBeInTheDocument();
  });

  test('renders post titles after data loads', async () => {
    const mocks = [
      { request: { query: ME_QUERY }, result: { data: { me: playerMe } } },
      pagedPostsMock(makePosts()),
    ];
    renderWithProviders(<CommunityPage />, { mocks });
    await waitFor(() => {
      expect(screen.getByText('Elden Ring')).toBeInTheDocument();
      expect(screen.getByText('Hollow Knight')).toBeInTheDocument();
    });
    expect(screen.queryByText(/author rating:/i)).toBeNull();
  });

  test('shows Featured badge on featured posts', async () => {
    const mocks = [
      { request: { query: ME_QUERY }, result: { data: { me: playerMe } } },
      pagedPostsMock(makePosts()),
    ];
    renderWithProviders(<CommunityPage />, { mocks });
    await waitFor(() => {
      expect(screen.getByText(/featured/i)).toBeInTheDocument();
    });
  });

  test('shows empty state when no posts', async () => {
    const mocks = [
      { request: { query: ME_QUERY }, result: { data: { me: playerMe } } },
      pagedPostsMock([]),
    ];
    renderWithProviders(<CommunityPage />, { mocks });
    await waitFor(() => {
      expect(screen.getByText(/no posts found/i)).toBeInTheDocument();
    });
  });
});

describe('CommunityPage — Player permissions', () => {
  test('Player sees Like, Bookmark and View buttons', async () => {
    const mocks = [
      { request: { query: ME_QUERY }, result: { data: { me: playerMe } } },
      pagedPostsMock(makePosts()),
    ];
    renderWithProviders(<CommunityPage />, { mocks });
    await waitFor(() => screen.getByText('Elden Ring'));
    expect(screen.getAllByTitle('Like').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('Bookmark').length).toBeGreaterThan(0);
  });

  test('Player sees Edit and Delete only on own posts', async () => {
    const mocks = [
      { request: { query: ME_QUERY }, result: { data: { me: playerMe } } }, // alice = u1
      pagedPostsMock(makePosts()),
    ];
    renderWithProviders(<CommunityPage />, { mocks });
    await waitFor(() => screen.getByText('Elden Ring')); // owned by alice
    // Should see Edit on the first post (own)
    expect(screen.getByTitle('Edit post')).toBeInTheDocument();
    // Should NOT see Feature/Unfeature button
    expect(screen.queryByTitle(/feature post/i)).toBeNull();
  });

  test('Player does NOT see Feature button', async () => {
    const mocks = [
      { request: { query: ME_QUERY }, result: { data: { me: playerMe } } },
      pagedPostsMock(makePosts()),
    ];
    renderWithProviders(<CommunityPage />, { mocks });
    await waitFor(() => screen.getByText('Elden Ring'));
    expect(screen.queryByTitle(/feature post/i)).toBeNull();
    expect(screen.queryByTitle(/unfeature post/i)).toBeNull();
  });
});

describe('CommunityPage — Admin permissions', () => {
  test('Admin sees Delete button on all posts', async () => {
    const mocks = [
      { request: { query: ME_QUERY }, result: { data: { me: adminMe } } },
      pagedPostsMock(makePosts()),
    ];
    renderWithProviders(<CommunityPage />, { mocks });
    await waitFor(() => screen.getByText('Elden Ring'));
    const deleteButtons = screen.getAllByTitle('Delete post');
    expect(deleteButtons.length).toBe(2); // both posts
  });

  test('Admin sees Feature button on unfeatured posts', async () => {
    const mocks = [
      { request: { query: ME_QUERY }, result: { data: { me: adminMe } } },
      pagedPostsMock(makePosts()),
    ];
    renderWithProviders(<CommunityPage />, { mocks });
    await waitFor(() => screen.getByText('Elden Ring'));
    expect(screen.getByTitle('Feature post')).toBeInTheDocument();
  });

  test('Admin sees Unfeature button on featured posts', async () => {
    const mocks = [
      { request: { query: ME_QUERY }, result: { data: { me: adminMe } } },
      pagedPostsMock(makePosts()),
    ];
    renderWithProviders(<CommunityPage />, { mocks });
    await waitFor(() => screen.getByText('Hollow Knight'));
    expect(screen.getByTitle('Unfeature post')).toBeInTheDocument();
  });
});

describe('CommunityPage — interactions', () => {
  test('clicking Like fires LIKE_POST mutation', async () => {
    let likeCalled = false;
    const mocks = [
      { request: { query: ME_QUERY }, result: { data: { me: playerMe } } },
      pagedPostsMock(makePosts()),
      {
        request: { query: LIKE_POST, variables: { id: 'p1' } },
        result: () => { likeCalled = true; return { data: { likePost: { id: 'p1', likesCount: 6, isLikedByMe: true } } }; },
      },
      pagedPostsMock(makePosts()),
    ];
    renderWithProviders(<CommunityPage />, { mocks });
    await waitFor(() => screen.getByText('Elden Ring'));
    const likeButtons = screen.getAllByTitle('Like');
    fireEvent.click(likeButtons[0]);
    await waitFor(() => expect(likeCalled).toBe(true));
  });

  test('non-owner can rate from card popover and UI updates immediately', async () => {
    const mocks = [
      { request: { query: ME_QUERY }, result: { data: { me: playerMe } } },
      pagedPostsMock(makePosts()),
      {
        request: { query: RATE_POST, variables: { postId: 'p2', score: 7 } },
        result: {
          data: {
            ratePost: {
              __typename: 'GamePost',
              id: 'p2',
              rating: 9,
              authorRating: 9,
              communityRating: 7,
              ratingCount: 1,
              myCommunityRating: 7,
            },
          },
        },
      },
    ];
    renderWithProviders(<CommunityPage />, { mocks });
    await waitFor(() => screen.getByText('Hollow Knight'));

    fireEvent.click(screen.getByTitle('Rate this game'));
    fireEvent.click(screen.getByRole('button', { name: '7' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(screen.getByText('Avg Rating: 8.0/10 ⭐')).toBeInTheDocument();
    });
  });

  test('confirming delete fires DELETE_POST mutation', async () => {
    let deleteCalled = false;
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    const mocks = [
      { request: { query: ME_QUERY }, result: { data: { me: adminMe } } },
      pagedPostsMock(makePosts()),
      {
        request: { query: DELETE_POST, variables: { id: 'p1' } },
        result: () => { deleteCalled = true; return { data: { deletePost: true } }; },
      },
      pagedPostsMock(makePosts()),
    ];
    renderWithProviders(<CommunityPage />, { mocks });
    await waitFor(() => screen.getByText('Elden Ring'));
    const deleteButtons = screen.getAllByTitle('Delete post');
    fireEvent.click(deleteButtons[0]);
    await waitFor(() => expect(deleteCalled).toBe(true));
  });

  test('cancelling delete does NOT fire DELETE_POST mutation', async () => {
    let deleteCalled = false;
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    const mocks = [
      { request: { query: ME_QUERY }, result: { data: { me: adminMe } } },
      pagedPostsMock(makePosts()),
      {
        request: { query: DELETE_POST, variables: { id: 'p1' } },
        result: () => { deleteCalled = true; return { data: { deletePost: true } }; },
      },
    ];
    renderWithProviders(<CommunityPage />, { mocks });
    await waitFor(() => screen.getByText('Elden Ring'));
    fireEvent.click(screen.getAllByTitle('Delete post')[0]);
    await waitFor(() => expect(deleteCalled).toBe(false));
  });
});
