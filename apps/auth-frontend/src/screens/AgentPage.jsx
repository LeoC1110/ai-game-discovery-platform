// src/screens/AgentPage.jsx — AI Game Agent (LangChain + Google Gemini)
import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useMutation, useQuery } from '@apollo/client';
import ThreeBackground from '../components/ThreeBackground';
import DashboardNav from '../components/DashboardNav';
import { ASK_AI, CLEAR_AI_HISTORY, MY_AI_HISTORY } from '../gql/askAI';

const SUGGESTIONS = [
  'Recommend games based on my bookmarks.',
  'Summarize the most liked community posts.',
  'What are the top-rated games?',
  'Find me a good co-op or multiplayer game.',
  'What should I play next based on my taste?',
  'Which games are trending in the community?',
];

// ── Small recommendation card ──────────────────────────────────────────────────
function RecommendedCard({ post }) {
  return (
    <div className="agent-recommended-card">
      <p className="agent-recommended-card__title">
        {post.title}
      </p>
      {post.rating != null && (
        <p className="agent-recommended-card__rating">
          ⭐ {post.rating}/10
        </p>
      )}
      {post.tags?.length > 0 && (
        <p className="agent-recommended-card__tags">
          {post.tags.slice(0, 3).join(' · ')}
        </p>
      )}
      <p className="agent-recommended-card__stats">
        {post.likesCount != null && `♥ ${post.likesCount}`}
        {post.commentsCount != null && `  💬 ${post.commentsCount}`}
      </p>
      {post.reason && (
        <p className="agent-recommended-card__reason">
          {post.reason}
        </p>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function AgentPage() {
  const bottomRef = useRef(null);

  // Load previous conversation history on mount
  const { data: historyData, loading: historyLoading } = useQuery(MY_AI_HISTORY, {
    fetchPolicy: 'network-only',
  });

  const [messages, setMessages] = useState(null); // null = not yet initialised
  const [input, setInput] = useState('');

  // Initialise messages once history loads
  useEffect(() => {
    if (historyLoading) return;
    const greeting = {
      role: 'agent',
      text: "Hello! I'm your AI Game Agent powered by Google Gemini. Ask me for game recommendations, community insights, or anything about your bookmarks!",
    };
    const history = historyData?.myAIHistory ?? [];
    const restored = history.map((m) => ({
      role: m.role === 'user' ? 'user' : 'agent',
      text: m.content,
    }));
    setMessages(restored.length ? restored : [greeting]);
  }, [historyLoading, historyData]);

  const [askAI, { loading: asking }] = useMutation(ASK_AI);
  const [clearHistory] = useMutation(CLEAR_AI_HISTORY);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, asking]);

  const sendMessage = async (text) => {
    const userText = (text ?? input).trim();
    if (!userText || asking) return;
    setInput('');
    setMessages((prev) => [...(prev ?? []), { role: 'user', text: userText }]);

    try {
      const { data } = await askAI({ variables: { message: userText } });
      const { answer, recommendedPosts } = data.askAI;
      setMessages((prev) => [
        ...(prev ?? []),
        { role: 'agent', text: answer, recommendedPosts: recommendedPosts ?? [] },
      ]);
    } catch (err) {
      const errMsg =
        err?.graphQLErrors?.[0]?.message ??
        'Something went wrong. Please check that GOOGLE_API_KEY is configured on the server.';
      setMessages((prev) => [
        ...(prev ?? []),
        { role: 'agent', text: `⚠️ ${errMsg}`, isError: true },
      ]);
    }
  };

  const handleClear = async () => {
    await clearHistory();
    setMessages([
      {
        role: 'agent',
        text: 'Conversation history cleared. How can I help you today?',
      },
    ]);
  };

  const isLoading = messages === null || historyLoading;

  return (
    <div className="app-root">
      <ThreeBackground />
      <div className="bg-vignette" />
      <div className="app-container">
        <DashboardNav />

        <div className="agent-header">
          <div>
            <h1 className="app-title">AI Game Agent</h1>
            <p className="page-subtitle post-subtitle">
              Powered by Google Gemini · Remembers your conversation · Uses your bookmarks &amp; community data
            </p>
          </div>
          <button
            className="btn-ghost agent-clear-btn"
            onClick={handleClear}
            title="Delete all your AI conversation history"
          >
            🗑 Clear History
          </button>
        </div>

        <div className="card agent-container">
          {/* Suggested prompts */}
          <div className="agent-suggestions">
            <p className="agent-suggestions__hint">Try asking:</p>
            <div className="agent-suggestions__list">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="btn-ghost agent-suggestion"
                  onClick={() => sendMessage(s)}
                  disabled={asking || isLoading}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Chat window */}
          <div className="agent-chat">
            {isLoading ? (
              <div className="agent-message agent-message--agent">
                <span className="agent-message__label">🤖 Agent</span>
                <p className="agent-message__text agent-message__text--muted">Loading conversation history…</p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={i}
                  className={`agent-message agent-message--${msg.role} ${msg.isError ? 'agent-message--error' : ''}`}
                >
                  <span className="agent-message__label">
                    {msg.role === 'user' ? 'You' : '🤖 Agent'}
                  </span>
                  {msg.role === 'agent' ? (
                    <div className="agent-message__markdown">
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="agent-message__text">{msg.text}</p>
                  )}

                  {/* Recommended game cards */}
                  {msg.recommendedPosts?.length > 0 && (
                    <div className="agent-recommendation-strip">
                      {msg.recommendedPosts.map((post) => (
                        <RecommendedCard key={post.id} post={post} />
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Thinking indicator */}
            {asking && (
              <div className="agent-message agent-message--agent">
                <span className="agent-message__label">🤖 Agent</span>
                <p className="agent-message__text agent-message__text--muted">
                  AI Game Agent is thinking…{' '}
                  <span className="agent-message__subtext">First response may take a few seconds.</span>
                </p>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input row */}
          <div className="agent-input-row">
            <input
              className="input agent-input-row__field"
              placeholder="Ask about games, ratings, recommendations…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !asking && !isLoading) sendMessage();
              }}
              disabled={asking || isLoading}
            />
            <button
              className={`btn-primary agent-input-row__send ${asking ? 'is-loading' : ''}`}
              onClick={() => sendMessage()}
              disabled={asking || isLoading || !input.trim()}
              aria-busy={asking}
            >
              {asking ? '…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

