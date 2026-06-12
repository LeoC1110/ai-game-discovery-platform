import test from 'node:test';
import assert from 'node:assert/strict';

import ConversationHistory from '../../models/ConversationHistory.js';
import {
  loadHistory,
  saveExchange,
  __test__,
} from '../conversationManager.js';

test('loadHistory queries with DB-side slice projection', async () => {
  const originalFindOne = ConversationHistory.findOne;

  let capturedFilter;
  let capturedProjection;

  ConversationHistory.findOne = (filter, projection) => {
    capturedFilter = filter;
    capturedProjection = projection;
    return {
      lean: async () => ({
        messages: [{ role: 'user', content: 'hello' }],
      }),
    };
  };

  try {
    const result = await loadHistory('u1');
    assert.deepEqual(capturedFilter, { userId: 'u1' });
    assert.deepEqual(capturedProjection, { messages: { $slice: -__test__.MAX_HISTORY } });
    assert.deepEqual(result, [{ role: 'user', content: 'hello' }]);
  } finally {
    ConversationHistory.findOne = originalFindOne;
  }
});

test('saveExchange caps stored message array with negative slice', async () => {
  const originalFindOneAndUpdate = ConversationHistory.findOneAndUpdate;

  let capturedUpdate;

  ConversationHistory.findOneAndUpdate = async (_filter, update) => {
    capturedUpdate = update;
    return null;
  };

  try {
    await saveExchange('u2', 'demo', 'hi', 'hello');

    assert.equal(Array.isArray(capturedUpdate.$push.messages.$each), true);
    assert.equal(capturedUpdate.$push.messages.$slice, -__test__.MAX_STORED_MESSAGES);
    assert.equal(capturedUpdate.$push.messages.$each.length, 2);
    assert.equal(capturedUpdate.$push.messages.$each[0].role, 'user');
    assert.equal(capturedUpdate.$push.messages.$each[1].role, 'assistant');
  } finally {
    ConversationHistory.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test('saveExchange strips RECOMMENDATIONS blocks before persisting', async () => {
  const originalFindOneAndUpdate = ConversationHistory.findOneAndUpdate;

  let capturedUpdate;

  ConversationHistory.findOneAndUpdate = async (_filter, update) => {
    capturedUpdate = update;
    return null;
  };

  try {
    await saveExchange(
      'u3',
      'demo',
      'suggest a game',
      'Here you go. <!--RECOMMENDATIONS:[{"title":"Portal 2"}]--> Enjoy!',
    );

    const assistantMessage = capturedUpdate.$push.messages.$each[1].content;
    assert.equal(assistantMessage.includes('<!--RECOMMENDATIONS:'), false);
    assert.match(assistantMessage, /Here you go\./);
    assert.match(assistantMessage, /Enjoy!/);
  } finally {
    ConversationHistory.findOneAndUpdate = originalFindOneAndUpdate;
  }
});
