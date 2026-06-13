// src/test/AgentPage.test.jsx
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers';
import AgentPage from '../screens/AgentPage';
import { ASK_AI, CLEAR_AI_HISTORY, MY_AI_HISTORY } from '../gql/askAI';

// Empty history — resolves the historyLoading state so the chat UI renders
const historyMock = {
  request: { query: MY_AI_HISTORY },
  result: { data: { myAIHistory: [] } },
};

const populatedHistoryMock = {
  request: { query: MY_AI_HISTORY },
  result: {
    data: {
      myAIHistory: [
        { role: 'user', content: 'Old question', createdAt: '2026-06-12T00:00:00.000Z' },
        { role: 'assistant', content: 'Old answer', createdAt: '2026-06-12T00:00:01.000Z' },
      ],
    },
  },
};

const clearHistoryMock = {
  request: { query: CLEAR_AI_HISTORY },
  result: { data: { clearAIHistory: true } },
};

function makeAskAIMock(message, answer, recommendedPosts = []) {
  return {
    request: { query: ASK_AI, variables: { message } },
    result: { data: { askAI: { answer, recommendedPosts } } },
  };
}

describe('AgentPage — layout', () => {
  test('renders heading and suggestion buttons', () => {
    renderWithProviders(<AgentPage />, { mocks: [historyMock] });
    expect(screen.getByText(/Ask Nova/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });

  test('renders chat input and Send button', async () => {
    renderWithProviders(<AgentPage />, { mocks: [historyMock] });
    await waitFor(() => expect(screen.getByPlaceholderText(/ask about games/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });
});

describe('AgentPage — AI response logic', () => {
  test('responds to "top rated" query', async () => {
    const mocks = [
      historyMock,
      makeAskAIMock('Show me top rated games', 'Here are the top rated games on the platform. Elden Ring leads with a perfect score!'),
    ];
    renderWithProviders(<AgentPage />, { mocks });
    await waitFor(() => screen.getByPlaceholderText(/ask about games/i));

    const input = screen.getByPlaceholderText(/ask about games/i);
    fireEvent.change(input, { target: { value: 'Show me top rated games' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/top rated games/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Elden Ring/i).length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  test('responds to "most liked" query', async () => {
    const mocks = [
      historyMock,
      makeAskAIMock('What are the most liked posts?', 'The most liked posts in the community are highly rated by players.'),
    ];
    renderWithProviders(<AgentPage />, { mocks });
    await waitFor(() => screen.getByPlaceholderText(/ask about games/i));

    const input = screen.getByPlaceholderText(/ask about games/i);
    fireEvent.change(input, { target: { value: 'What are the most liked posts?' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/most liked/i).length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  test('responds to RPG tag query', async () => {
    const mocks = [
      historyMock,
      makeAskAIMock('Find RPG games', 'Great RPG picks: Elden Ring is a standout open-world RPG.'),
    ];
    renderWithProviders(<AgentPage />, { mocks });
    await waitFor(() => screen.getByPlaceholderText(/ask about games/i));

    const input = screen.getByPlaceholderText(/ask about games/i);
    fireEvent.change(input, { target: { value: 'Find RPG games' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText(/elden ring/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  test('responds to summarize query', async () => {
    const mocks = [
      historyMock,
      makeAskAIMock('Summarize the community', 'Here is a community summary of recent activity and popular games.'),
    ];
    renderWithProviders(<AgentPage />, { mocks });
    await waitFor(() => screen.getByPlaceholderText(/ask about games/i));

    const input = screen.getByPlaceholderText(/ask about games/i);
    fireEvent.change(input, { target: { value: 'Summarize the community' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText(/community summary/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  test('Send button is disabled when input is empty', async () => {
    renderWithProviders(<AgentPage />, { mocks: [historyMock] });
    await waitFor(() => screen.getByPlaceholderText(/ask about games/i));
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });

  test('clicking a suggestion populates and sends the message', async () => {
    const suggestionText = 'Recommend games based on my bookmarks and preferences.';
    const mocks = [
      historyMock,
      makeAskAIMock(suggestionText, 'Based on your bookmarks, here are some top picks for you.'),
    ];
    renderWithProviders(<AgentPage />, { mocks });
    await waitFor(() => screen.getByPlaceholderText(/ask about games/i));

    fireEvent.click(screen.getByRole('button', { name: /for me/i }));

    await waitFor(() => {
      // The suggestion text should appear as the user message bubble
      expect(screen.getAllByText(/bookmarks and preferences/i).length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  test('Clear History removes visible chat bubbles immediately', async () => {
    renderWithProviders(<AgentPage />, {
      mocks: [populatedHistoryMock, clearHistoryMock],
    });

    await waitFor(() => expect(screen.getByText(/old question/i)).toBeInTheDocument());
    expect(screen.getByText(/old answer/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /clear history/i }));

    await waitFor(() => {
      expect(screen.queryByText(/old question/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/old answer/i)).not.toBeInTheDocument();
      expect(screen.getByText(/i['’]m nova/i)).toBeInTheDocument();
    });
  });
});
