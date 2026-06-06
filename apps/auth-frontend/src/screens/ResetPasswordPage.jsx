// src/screens/ResetPasswordPage.jsx
import React, { useState } from 'react';
import { useMutation } from '@apollo/client';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { RESET_PASSWORD } from '../gql/resetPassword';

export default function ResetPasswordPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null); // null | 'success' | 'error'
  const [message, setMessage] = useState('');
  const [manualToken, setManualToken] = useState(token || '');

  const [resetPassword, { loading }] = useMutation(RESET_PASSWORD);

  const onSubmit = async (e) => {
    e.preventDefault();
    setStatus(null);
    const form = new FormData(e.currentTarget);
    const newPassword = (form.get('newPassword') || '').toString().trim();
    const confirmPassword = (form.get('confirmPassword') || '').toString().trim();
    const resolvedToken = manualToken.trim();

    if (!resolvedToken) {
      setStatus('error');
      setMessage('Reset token is missing. Please use the link from your reset email.');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setStatus('error');
      setMessage('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus('error');
      setMessage('Passwords do not match. Please try again.');
      return;
    }

    try {
      const { data } = await resetPassword({
        variables: { token: resolvedToken, newPassword },
      });
      const res = data?.resetPassword;
      if (res?.ok) {
        // Store auth credentials so the user is immediately logged in.
        if (res.token) localStorage.setItem('token', res.token);
        if (res.user) localStorage.setItem('me', JSON.stringify(res.user));
        setStatus('success');
        setMessage(res.message || 'Password reset successful!');
        // Redirect to home after a short delay so the user can read the confirmation.
        setTimeout(() => navigate('/home', { replace: true }), 2000);
      } else {
        setStatus('error');
        setMessage(res?.message || 'Password reset failed. The token may have expired.');
      }
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Network error. Please try again.');
    }
  };

  return (
    <div className="app-root">
      <main className="app-container">
        <h1 className="app-title auth-title">Set New Password</h1>

        <section className="card auth-card" aria-label="Reset Password Form">
          {status === 'success' ? (
            <div className="auth-form">
              <div className="msg-success" role="status">
                <strong>Password updated!</strong>
                <p style={{ margin: '6px 0 0', fontSize: 13 }}>
                  {message} Redirecting you to the dashboard…
                </p>
              </div>
              <div className="auth-actions">
                <Link to="/home" className="btn-primary" role="button">Go to Dashboard</Link>
              </div>
            </div>
          ) : (
            <form className="auth-form" onSubmit={onSubmit} autoComplete="off">
              {/* If token is not in URL, let the user paste it manually */}
              {!token && (
                <div>
                  <label
                    htmlFor="reset-token-input"
                    style={{ display: 'block', fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 4 }}
                  >
                    Reset token
                  </label>
                  <input
                    id="reset-token-input"
                    className="input"
                    type="text"
                    placeholder="Paste your reset token here"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              )}

              {token && (
                <div className="msg-success" style={{ fontSize: 13 }} role="status">
                  Reset token loaded from link. Enter your new password below.
                </div>
              )}

              <input
                className="input"
                name="newPassword"
                type="password"
                placeholder="New password (≥6 characters)"
                autoComplete="new-password"
                required
              />
              <input
                className="input"
                name="confirmPassword"
                type="password"
                placeholder="Confirm new password"
                autoComplete="new-password"
                required
              />

              <button
                type="submit"
                className={`btn-primary${loading ? ' is-loading' : ''}`}
                disabled={loading}
                aria-busy={loading}
              >
                {loading ? 'Saving…' : 'Reset Password'}
              </button>

              <div className="auth-actions">
                <Link to="/forgot-password" className="btn-ghost" role="button">Request new link</Link>
                <Link to="/login" className="btn-ghost" role="button">Back to Sign In</Link>
              </div>

              {status === 'error' && (
                <div className="auth-hint" role="alert">{message}</div>
              )}
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
