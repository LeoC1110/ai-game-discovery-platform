// src/test/mockData.js — shared mock data factories
// addTypename=true in MockedProvider requires __typename on all result objects.

export const makeUser = (overrides = {}) => ({
  __typename: 'User',
  id: 'u1',
  username: 'alice',
  email: 'alice@example.com',
  role: 'Player',
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

export const makePost = (overrides = {}) => ({
  __typename: 'GamePost',
  id: 'p1',
  title: 'Elden Ring',
  genre: 'RPG',
  platform: 'PC',
  developer: 'FromSoftware',
  releaseYear: 2022,
  gameType: 'Singleplayer',
  rating: 10,
  authorRating: 10,
  communityRating: 8.6,
  ratingCount: 12,
  myCommunityRating: null,
  coverImageUrl: null,
  gameLink: null,
  tags: ['RPG', 'Souls'],
  review: 'A masterpiece of exploration and combat.',
  featured: false,
  postedBy: makeUser({ id: 'u1', username: 'alice' }),
  likesCount: 5,
  commentsCount: 2,
  bookmarksCount: 1,
  isLikedByMe: false,
  isBookmarkedByMe: false,
  createdAt: '2024-01-15T00:00:00.000Z',
  updatedAt: '2024-01-15T00:00:00.000Z',
  ...overrides,
  // Ensure nested postedBy gets __typename too
  ...(overrides.postedBy
    ? { postedBy: { __typename: 'User', ...overrides.postedBy } }
    : {}),
});
