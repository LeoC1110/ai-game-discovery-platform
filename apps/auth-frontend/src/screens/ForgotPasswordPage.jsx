// src/screens/ForgotPasswordPage.jsx
import React, { useState } from 'react';
import { useMutation } from '@apollo/client';
import { Link, useNavigate } from 'react-router-dom';
import { REQUEST_PASSWORD_RESET } from '../gql/forgotPassword';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null); // null | 'success' | 'error'
  const [message, setMessage] = useState('');
  const [resetToken, setResetToken] = useState('');

  const [requestReset, { loading }] = useMutation(REQUEST_PASSWORD_RESET);

  const onSubmit = async (e) => {
    e.preventDefault();
    setStatus(null);
    const form = new FormData(e.currentTarget);
    const email = (form.get('email') || '').toString().trim();
    if (!email) {
      setStatus('error');
      setMessage('Please enter your email address.');
      return;
    }

    try {
      const { data } = await requestReset({ variables: { email } });
      const res = data?.requestPasswordReset;
      if (res?.ok) {
        setStatus('success');
        setMessage(res.message || 'Check below for your reset token.');
        setResetToken(res.resetToken || '');
      } else {
        setStatus('error');
        setMessage(res?.message || 'Something went wrong. Please try again.');
      }
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Network error. Please try again.');
    }
  };

  return (
    <div className="app-root">
      <main className="app-container">
        <h1 className="app-title auth-title">Reset Password</h1>

        <section className="card auth-card" aria-label="Forgot Password">
          {status !== 'success' ? (
            <form className="auth-form" onSubmit={onSubmit} autoComplete="on">
              <p style={{ margin: '0 0 4px', color: 'var(--color-text-muted)', fontSize: 14 }}>
                Enter the email address associated with your account and we will generate a reset link.
              </p>

              <input
                className="input"
                name="email"
                type="email"
                placeholder="Email address"
                autoComplete="email"
                required
              />

              <button
                type="submit"
                className={`btn-primary${loading ? ' is-loading' : ''}`}
                disabled={loading}
                aria-busy={loading}
              >
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>

              <div className="auth-actions">
                <Link to="/login" className="btn-ghost" role="button">Back to Sign In</Link>
              </div>

              {status === 'error' && (
                <div className="auth-hint" role="alert">{message}</div>
              )}
            </form>
          ) : (
            <div className="auth-form">
              {/* Success state */}
              <div className="msg-success" role="status">
                <strong>Reset link generated.</strong>
                <p style={{ margin: '6px 0 0', fontSize: 13 }}>{message}</p>
              </div>

              {resetToken && (
                <div className="forgot-token-box" aria-label="Reset token (demo)">
                  <p className="forgot-token-label">
                    <span aria-hidden="true">🔑</span> Your reset token{' '}
                    <span className="forgot-token-note">(demo — normally delivered by email)</span>
                  </p>
                  <code className="forgot-token-value" aria-label="Reset token">{resetToken}</code>
                  <p className="forgot-token-expiry">
                    This token is valid for <strong>1 hour</strong>.
                  </p>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => navigate(`/reset-password/${resetToken}`)}
                  >
                    Set New Password →
                  </button>
                </div>
              )}

              <div className="auth-actions" style={{ marginTop: 8 }}>
                <Link to="/login" className="btn-ghost" role="button">Back to Sign In</Link>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
