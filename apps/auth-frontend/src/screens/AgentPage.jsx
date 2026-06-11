// src/screens/AgentPage.jsx — AI Game Agent (LangChain + Google Gemini)
import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useMutation, useQuery } from '@apollo/client';
import { useLocation } from 'react-router-dom';
import DashboardNav from '../components/DashboardNav';
import PostRatingSummary from '../components/PostRatingSummary';
import { ASK_AI, CLEAR_AI_HISTORY, MY_AI_HISTORY } from '../gql/askAI';

const SUGGESTIONS = [
  'Show the top trending games in the community right now.',
  'Recommend games for me based on my bookmarks.',
  'Find high-rated RPG games with strong community engagement.',
  'Summarize the most popular community posts this week.',
  'Analyze my game taste from bookmarks and suggest something new.',
  'Suggest 3 community games I might like, and explain each briefly.',
];

// ── Small recommendation card ──────────────────────────────────────────────────
function RecommendedCard({ post }) {
  return (
    <div className="agent-recommended-card">
      <p className="agent-recommended-card__title">
        {post.title}
      </p>
      {(post.authorRating != null || post.communityRating != null || post.rating != null) && (
        <div className="agent-recommended-card__rating">
          <PostRatingSummary
            authorRating={post.authorRating}
            communityRating={post.communityRating ?? post.rating}
            ratingCount={post.ratingCount}
            compact
          />
        </div>
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
  const location = useLocation();
  const sessionVersionRef = useRef(0);
  const greetingMessage = {
    id: 'greeting',
    role: 'agent',
    text: "Hi, I'm Nova. I can help you find games you might like, understand community trends, and get recommendations based on your bookmarks and preferences. What would you like to explore today?",
  };

  const toUiMessages = (history = []) =>
    history.map((m, idx) => ({
      id: m.createdAt || `${m.role}-${idx}`,
      role: m.role === 'user' ? 'user' : 'agent',
      text: m.content,
    }));

  const hydrateHistoryWithRecommendations = (history = [], previousMessages = []) => {
    const recommendationMap = new Map(
      (previousMessages || [])
        .filter((m) => m.role === 'agent' && m.text && m.recommendedPosts?.length)
        .map((m) => [m.text, m.recommendedPosts]),
    );

    return toUiMessages(history).map((m) => {
      if (m.role !== 'agent') return m;
      const recos = recommendationMap.get(m.text);
      return recos ? { ...m, recommendedPosts: recos } : m;
    });
  };

  // Load previous conversation history on mount
  const { data: historyData, loading: historyLoading, refetch: refetchHistory } = useQuery(MY_AI_HISTORY, {
    fetchPolicy: 'cache-and-network',
  });

  const [messages, setMessages] = useState(null); // null = not yet initialised
  const [input, setInput] = useState(location.state?.prompt ?? '');

  // Initialise messages once history loads
  useEffect(() => {
    if (historyLoading || messages !== null) return;
    const history = historyData?.myAIHistory ?? [];
    const restored = toUiMessages(history);
    setMessages(restored.length ? restored : [greetingMessage]);
  }, [historyLoading, historyData, messages]);

  const [askAI, { loading: asking }] = useMutation(ASK_AI);
  const [clearHistory] = useMutation(CLEAR_AI_HISTORY);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, asking]);

  const sendMessage = async (text) => {
    const userText = (text ?? input).trim();
    if (!userText || asking) return;
    const activeSessionVersion = sessionVersionRef.current;
    setInput('');
    setMessages((prev) => [
      ...(prev ?? []),
      { id: `user-${Date.now()}`, role: 'user', text: userText },
    ]);

    try {
      const { data } = await askAI({ variables: { message: userText } });
      if (activeSessionVersion !== sessionVersionRef.current) return;
      const { answer, recommendedPosts } = data.askAI;
      setMessages((prev) => [
        ...(prev ?? []),
        {
          id: `agent-${Date.now()}`,
          role: 'agent',
          text: answer,
          recommendedPosts: recommendedPosts ?? [],
        },
      ]);

      // Sync with canonical server history to avoid transient UI drift.
      const refreshed = await refetchHistory();
      if (activeSessionVersion !== sessionVersionRef.current) return;
      const latestHistory = refreshed?.data?.myAIHistory ?? [];
      if (latestHistory.length) {
        setMessages((prev) => hydrateHistoryWithRecommendations(latestHistory, prev));
      }
    } catch (err) {
      if (activeSessionVersion !== sessionVersionRef.current) return;
      const errMsg =
        err?.graphQLErrors?.[0]?.message ??
        'Something went wrong. Please check that GOOGLE_API_KEY is configured on the server.';
      setMessages((prev) => [
        ...(prev ?? []),
        { id: `error-${Date.now()}`, role: 'agent', text: `⚠️ ${errMsg}`, isError: true },
      ]);
    }
  };

  const handleClear = async () => {
    sessionVersionRef.current += 1;
    await clearHistory();
    setInput('');
    setMessages([greetingMessage]);
  };

  const isLoading = messages === null || historyLoading;

  return (
    <div className="app-root">
      <div className="app-container">
        <DashboardNav />

        <div className="agent-header">
          <h1 className="app-title">Ask Nova</h1>
          <p className="page-subtitle">
            Your intelligent game discovery assistant.
          </p>
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
                <span className="agent-message__label">Nova</span>
                <p className="agent-message__text agent-message__text--muted">Loading conversation history…</p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={msg.id || i}
                  className={`agent-message agent-message--${msg.role} ${msg.isError ? 'agent-message--error' : ''}`}
                >
                  <span className="agent-message__label">
                    {msg.role === 'user' ? 'You' : 'Nova'}
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
                <span className="agent-message__label">Nova</span>
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

          {/* Clear history */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              className="btn-ghost agent-clear-btn"
              onClick={handleClear}
              title="Delete all your AI conversation history"
            >
              Clear History
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

