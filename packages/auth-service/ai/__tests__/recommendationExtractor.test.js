import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractRecommendedPosts,
  __test__,
} from '../recommendationExtractor.js';

test('extractRecommendationsPayload removes block using marker boundaries', () => {
  const aiText = [
    'Here are picks.',
    '<!--RECOMMENDATIONS:[{"title":"Portal 2"}]-->',
    'Enjoy.',
  ].join('\n');

  const { cleanAnswer, parsed } = __test__.extractRecommendationsPayload(aiText);

  assert.equal(cleanAnswer.includes('<!--RECOMMENDATIONS:'), false);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].title, 'Portal 2');
  assert.match(cleanAnswer, /Here are picks\./);
  assert.match(cleanAnswer, /Enjoy\./);
});

test('dedupeTitles keeps first case-insensitive occurrence and honors max candidates', () => {
  const parsed = [
    { title: 'Portal 2' },
    { title: 'portal 2' },
    { title: 'Stardew Valley' },
    { title: 'Hades' },
    { title: 'Celeste' },
    { title: 'Dead Cells' },
  ];

  const titles = __test__.dedupeTitles(parsed);

  assert.deepEqual(titles, ['Portal 2', 'Stardew Valley', 'Hades', 'Celeste']);
});

test('extractRecommendedPosts uses deduped exact titles and returns bookmarksCount', async () => {
  const aiText = [
    'Top matches:',
    '<!--RECOMMENDATIONS:[',
    '{"title":"Portal 2","reason":"Great co-op.","confidence":0.93,"matchedTags":["co-op"]},',
    '{"title":"portal 2","reason":"Duplicate case.","confidence":0.8,"matchedTags":["co-op"]},',
    '{"title":"Hades","reason":"Fast action.","confidence":0.9,"matchedTags":["action"]}',
    ']-->',
  ].join('');

  let receivedTitles = null;

  const result = await extractRecommendedPosts(aiText, {
    findPosts: async (candidateTitles) => {
      receivedTitles = candidateTitles;
      return [
        {
          _id: '1',
          title: 'Portal 2',
          titleNormalized: 'portal 2',
          tags: ['co-op'],
          likedBy: [1, 2],
          bookmarkedBy: [1],
          comments: [1, 2, 3],
        },
      ];
    },
    attachRatings: async (posts) => posts.map((p) => ({
      ...p,
      authorRating: 9.0,
      communityRating: 9.2,
      ratingCount: 12,
    })),
    onError: () => {},
  });

  assert.deepEqual(receivedTitles, ['Portal 2', 'Hades']);
  assert.equal(result.cleanAnswer.includes('<!--RECOMMENDATIONS:'), false);
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.recommendations[0].title, 'Portal 2');
  assert.equal(result.recommendations[0].bookmarksCount, 1);
});
