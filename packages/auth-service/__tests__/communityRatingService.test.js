import test from 'node:test';
import assert from 'node:assert/strict';

import { __test__ } from '../services/communityRatingService.js';

test('rating key prefers canonical game ids over post ids', () => {
  assert.equal(__test__.getRatingKey({ game: { _id: 'game-1' }, _id: 'post-1' }), 'game-1');
  assert.equal(__test__.getRatingKey({ game: { id: 'game-2' }, _id: 'post-2' }), 'game-2');
  assert.equal(__test__.getRatingKey({ game: 'game-3', _id: 'post-3' }), 'game-3');
  assert.equal(__test__.getRatingKey({ _id: 'post-4' }), 'post-4');
});