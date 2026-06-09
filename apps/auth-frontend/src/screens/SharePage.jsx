// src/screens/SharePage.jsx — Share an idea with the community
import React, { useState } from 'react';
import { useMutation } from '@apollo/client';
import { useNavigate } from 'react-router-dom';
import DashboardNav from '../components/DashboardNav';
import { CREATE_POST, ALL_POSTS } from '../gql/gamePosts';
import './Share.css';

const IDEA_TEXT_REGEX = /^[\p{L}\p{N}\p{P}\p{S}\p{Z}\r\n\t]+$/u;

export default function SharePage() {
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [message, setMessage] = useState(null);

  const [createPost, { loading }] = useMutation(CREATE_POST, {
    refetchQueries: [{ query: ALL_POSTS }],
    awaitRefetchQueries: true,
  });

  const handlePublish = async () => {
    setMessage(null);
    const trimmed = content.trim();
    if (!trimmed) {
      setMessage({ type: 'error', text: 'Content cannot be empty.' });
      return;
    }
    if (trimmed.length > 500) {
      setMessage({ type: 'error', text: 'Content must be 500 characters or less.' });
      return;
    }
    if (!IDEA_TEXT_REGEX.test(trimmed)) {
      setMessage({ type: 'error', text: 'Only text and emoji are allowed.' });
      return;
    }

    try {
      await createPost({
        variables: {
          input: {
            postType: 'IDEA',
            review: trimmed,
          },
        },
      });
      setContent('');
      setMessage({ type: 'success', text: 'Your idea has been published.' });
      setTimeout(() => navigate('/community'), 1200);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="app-root">
      <div className="app-container">
        <DashboardNav />
        <h1 className="app-title">Share an Idea</h1>
        <p className="page-subtitle share-subtitle">
          Share a thought with the community.
        </p>

        <div className="share-grid">
          <div className="share-card">
            <header className="share-card__header">
              <h2></h2>
            </header>

            {message && (
              <div
                className={message.type === 'success' ? 'msg-success' : 'msg-error'}
                role="alert"
              >
                {message.text}
              </div>
            )}

            <div className="share-form">
              <label className="share-form__label">
                <textarea
                  className="input textarea share-form__textarea"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  maxLength={500}
                  placeholder="Share a thought, question, or idea..."
                  rows={7}
                />
              </label>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: '#6e6e73' }}>Text and emoji only. 500 characters max.</span>
                <span className="share-form__count" style={{ margin: 0 }}>{content.length}/500</span>
              </div>

              <div className="share-form__footer">
                <button
                  type="button"
                  className={`btn-primary ${loading ? 'is-loading' : ''}`}
                  disabled={loading || !content.trim()}
                  aria-busy={loading}
                  onClick={handlePublish}
                  style={{ flex: 1 }}
                >
                  {loading ? 'Publishing…' : 'Publish Idea'}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setContent('');
                    setMessage(null);
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
