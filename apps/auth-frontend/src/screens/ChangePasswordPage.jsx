import React, { useState } from 'react';
import { useMutation } from '@apollo/client';
import { Link, useNavigate } from 'react-router-dom';
import { CHANGE_PASSWORD } from '../gql/changePassword';

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [msg, setMsg] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const [changePassword, { loading }] = useMutation(CHANGE_PASSWORD);

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg('');
    setIsSuccess(false);

    const form = new FormData(e.currentTarget);
    const identifier = (form.get('identifier') || '').toString().trim();
    const oldPassword = (form.get('oldPassword') || '').toString();
    const newPassword = (form.get('newPassword') || '').toString();
    const confirmPassword = (form.get('confirmPassword') || '').toString();

    if (!identifier || !oldPassword || !newPassword || !confirmPassword) {
      setMsg('Please fill in all fields.');
      return;
    }
    if (newPassword.length < 6) {
      setMsg('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setMsg('New password and confirm password must match.');
      return;
    }

    try {
      const { data } = await changePassword({
        variables: { identifier, oldPassword, newPassword },
      });
      const res = data?.changePassword;
      if (res?.ok) {
        setIsSuccess(true);
        setMsg('Password changed successfully. Redirecting to sign in…');
        setTimeout(() => navigate('/login', { replace: true }), 1500);
      } else {
        setMsg(res?.message || 'Password change failed. Please try again.');
      }
    } catch (err) {
      setMsg(err.message || 'Network error. Please try again.');
    }
  };

  return (
    <div className="app-root">
      <main className="app-container">
        <h1 className="app-title auth-title">Change Password</h1>

        <section className="card auth-card" aria-label="Change Password">
          <form className="auth-form" onSubmit={onSubmit} autoComplete="on">
            <p style={{ margin: '0 0 6px', color: 'var(--color-text-muted)', fontSize: 14 }}>
              Enter your username or email, your current password, then your new password.
            </p>

            <input
              className="input"
              name="identifier"
              type="text"
              placeholder="Username or Email"
              autoComplete="username"
              required
            />

            <div className="password-input-wrap">
              <input
                className="input password-input"
                name="oldPassword"
                type={showOld ? 'text' : 'password'}
                placeholder="Current password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={showOld ? 'Hide current password' : 'Show current password'}
                onClick={() => setShowOld((v) => !v)}
              >
                {showOld ? 'Hide' : 'Show'}
              </button>
            </div>

            <div className="password-input-wrap">
              <input
                className="input password-input"
                name="newPassword"
                type={showNew ? 'text' : 'password'}
                placeholder="New password (≥6)"
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={showNew ? 'Hide new password' : 'Show new password'}
                onClick={() => setShowNew((v) => !v)}
              >
                {showNew ? 'Hide' : 'Show'}
              </button>
            </div>

            <div className="password-input-wrap">
              <input
                className="input password-input"
                name="confirmPassword"
                type={showConfirm ? 'text' : 'password'}
                placeholder="Confirm new password"
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                onClick={() => setShowConfirm((v) => !v)}
              >
                {showConfirm ? 'Hide' : 'Show'}
              </button>
            </div>

            <button
              type="submit"
              className={`btn-primary${loading ? ' is-loading' : ''}`}
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? 'Changing…' : 'Change Password'}
            </button>

            {msg && (
              <div className={isSuccess ? 'msg-success' : 'auth-hint'} role={isSuccess ? 'status' : 'alert'}>
                {msg}
              </div>
            )}

            <div className="auth-actions">
              <Link to="/login" className="btn-ghost" role="button">Back to Sign In</Link>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
