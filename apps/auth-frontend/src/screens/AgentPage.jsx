// src/screens/AgentPage.jsx — AI Game Agent (LangChain + Google Gemini)
import React, { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import ThreeBackground from '../components/ThreeBackground';
import DashboardNav from '../components/DashboardNav';
import { ASK_AI, CLEAR_AI_HISTORY, MY_AI_HISTORY } from '../gql/askAI';

const SUGGESTIONS = [
  'Recommend games based on my bookmarks.',
  'Summarize the most liked community posts.',
  'What are the top-rated games?',
  'Find multiplayer strategy games.',
  'What should I play next?',
  'Summarize reviews for a popular game.',
];

// ── Small recommendation card ──────────────────────────────────────────────────
function RecommendedCard({ post }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(0,255,200,0.2)',
        borderRadius: 10,
        padding: '10px 14px',
        minWidth: 180,
        maxWidth: 220,
        flex: '0 0 auto',
      }}
    >
      <p style={{ margin: '0 0 4px', fontWeight: 700, color: '#00ffc8', fontSize: 13 }}>
        {post.title}
      </p>
      {post.rating != null && (
        <p style={{ margin: '0 0 4px', color: '#ffd700', fontSize: 12 }}>
          ⭐ {post.rating}/10
        </p>
      )}
      {post.tags?.length > 0 && (
        <p style={{ margin: '0 0 4px', color: '#aaa', fontSize: 11 }}>
          {post.tags.slice(0, 3).join(' · ')}
        </p>
      )}
      <p style={{ margin: 0, color: '#777', fontSize: 11 }}>
        {post.likesCount != null && `♥ ${post.likesCount}`}
        {post.commentsCount != null && `  💬 ${post.commentsCount}`}
      </p>
      {post.reason && (
        <p style={{ margin: '6px 0 0', color: '#bbb', fontSize: 11, fontStyle: 'italic' }}>
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

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h1 className="app-title">AI Game Agent</h1>
            <p className="page-subtitle post-subtitle">
              Powered by Google Gemini · Remembers your conversation · Uses your bookmarks &amp; community data
            </p>
          </div>
          <button
            className="btn-ghost"
            style={{ fontSize: 12, padding: '6px 14px', opacity: 0.7 }}
            onClick={handleClear}
            title="Delete all your AI conversation history"
          >
            🗑 Clear History
          </button>
        </div>

        <div className="card agent-container">
          {/* Suggested prompts */}
          <div className="agent-suggestions">
            <p style={{ color: '#888', fontSize: 13, margin: '0 0 8px' }}>Try asking:</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                <p style={{ margin: 0, color: '#888' }}>Loading conversation history…</p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={i}
                  className={`agent-message agent-message--${msg.role}`}
                  style={msg.isError ? { borderLeft: '3px solid #ff4444' } : undefined}
                >
                  <span className="agent-message__label">
                    {msg.role === 'user' ? 'You' : '🤖 Agent'}
                  </span>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{msg.text}</p>

                  {/* Recommended game cards */}
                  {msg.recommendedPosts?.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        gap: 10,
                        marginTop: 10,
                        overflowX: 'auto',
                        paddingBottom: 4,
                      }}
                    >
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
                <p style={{ margin: 0, color: '#888' }}>
                  AI Game Agent is thinking…{' '}
                  <span style={{ fontSize: 12, opacity: 0.6 }}>First response may take a few seconds.</span>
                </p>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input row */}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder="Ask about games, ratings, recommendations…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !asking && !isLoading) sendMessage();
              }}
              disabled={asking || isLoading}
            />
            <button
              className="btn-primary"
              style={{ padding: '0 20px', height: 46 }}
              onClick={() => sendMessage()}
              disabled={asking || isLoading || !input.trim()}
            >
              {asking ? '…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

