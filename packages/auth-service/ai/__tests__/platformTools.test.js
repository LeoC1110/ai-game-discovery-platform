// packages/auth-service/ai/__tests__/platformTools.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import { __test__, LOW_RATING_MAX_SCORE } from '../platformTools.js';

const {
  formatPostsForPrompt,
  formatPostForPrompt,
  selectLowRatedPosts,
} = __test__;

test('formatter includes stable game title lines and core metrics', () => {
  const posts = [
    {
      _id: '1',
      title: 'Portal 2',
      genre: 'Puzzle',
      platform: 'PC',
      communityRating: 9.2,
      ratingCount: 14,
      likesCount: 20,
      bookmarksCount: 8,
      commentsCount: 5,
      tags: ['puzzle', 'co-op', 'logic'],
    },
    {
      _id: '2',
      title: 'Stardew Valley',
      genre: 'Simulation',
      platform: 'PC, Switch',
      communityRating: 9.0,
      ratingCount: 11,
      likesCount: 16,
      bookmarksCount: 12,
      commentsCount: 4,
      tags: ['farming', 'relaxing', 'co-op'],
    },
  ];

  const output = formatPostsForPrompt({ title: 'Platform Data Summary', posts });

  assert.match(output, /1\. Game: Portal 2/);
  assert.match(output, /2\. Game: Stardew Valley/);
  assert.match(output, /Community Rating: 9\.2\/10/);
  assert.match(output, /Likes: 20/);
  assert.match(output, /Bookmarks: 8/);
  assert.match(output, /Comments: 5/);
});

test('formatter handles missing fields safely', () => {
  const post = {
    _id: '3',
    title: 'Unknown Game',
    // missing rating/tags/likes/bookmarks/comments
  };

  const output = formatPostForPrompt(post, 1);

  assert.match(output, /1\. Game: Unknown Game/);
  assert.match(output, /Community Rating: N\/A/);
  assert.match(output, /Rating Count: 0/);
  assert.match(output, /Likes: 0/);
  assert.match(output, /Bookmarks: 0/);
  assert.match(output, /Comments: 0/);
  assert.match(output, /Tags: N\/A/);
});

test('low-rated selection uses threshold and deterministic low-first ordering', () => {
  const posts = [
    { _id: 'a', title: 'High One', communityRating: 8.5, ratingCount: 9 },
    { _id: 'b', title: 'Low A', communityRating: 5.2, ratingCount: 12 },
    { _id: 'c', title: 'Low B', communityRating: 5.8, ratingCount: 8 },
    { _id: 'd', title: 'Boundary Low', communityRating: LOW_RATING_MAX_SCORE, ratingCount: 2 },
    { _id: 'e', title: 'TooFewRatings', communityRating: 4.9, ratingCount: 1 },
  ];

  const selected = selectLowRatedPosts(posts, {
    maxCommunityRating: LOW_RATING_MAX_SCORE,
    minRatingCount: 2,
    limit: 10,
  });

  assert.deepEqual(
    selected.map((p) => p.title),
    ['Low A', 'Low B', 'Boundary Low'],
  );
  assert.ok(selected.every((p) => p.communityRating <= LOW_RATING_MAX_SCORE));
});
