import React, { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@apollo/client';
import { Link, useNavigate } from 'react-router-dom';
import { SEND_PASSWORD_RESET_CODE } from '../gql/forgotPassword';
import { RESET_PASSWORD_WITH_CODE } from '../gql/resetPassword';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [sendStatus, setSendStatus] = useState(null);
  const [sendMessage, setSendMessage] = useState('');
  const [resetStatus, setResetStatus] = useState(null);
  const [resetMessage, setResetMessage] = useState('');

  const [resendUntil, setResendUntil] = useState(0);

  const [sendCode, { loading: sendingCode }] = useMutation(SEND_PASSWORD_RESET_CODE);
  const [resetWithCode, { loading: resettingPassword }] = useMutation(RESET_PASSWORD_WITH_CODE);

  const resendSeconds = useMemo(() => {
    const left = Math.ceil((resendUntil - Date.now()) / 1000);
    return left > 0 ? left : 0;
  }, [resendUntil]);

  useEffect(() => {
    if (!resendUntil) return undefined;
    const timer = setInterval(() => {
      if (Date.now() >= resendUntil) {
        setResendUntil(0);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [resendUntil]);

  const onSendCode = async (e) => {
    e.preventDefault();
    setSendStatus(null);

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setSendStatus('error');
      setSendMessage('Please enter your email address.');
      return;
    }

    try {
      await sendCode({ variables: { email: normalizedEmail } });
      setSendStatus('success');
      setSendMessage('If this email exists, a verification code has been sent.');
      setResendUntil(Date.now() + 60000);
    } catch (err) {
      setSendStatus('error');
      setSendMessage(err.message || 'Failed to send verification code. Please try again.');
    }
  };

  const onResetPassword = async (e) => {
    e.preventDefault();
    setResetStatus(null);

    const normalizedEmail = email.trim();
    const normalizedCode = code.trim();

    if (!normalizedEmail || !normalizedCode || !newPassword || !confirmPassword) {
      setResetStatus('error');
      setResetMessage('Please complete all fields before resetting your password.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setResetStatus('error');
      setResetMessage('New password and confirm password must match.');
      return;
    }

    try {
      const { data } = await resetWithCode({
        variables: {
          email: normalizedEmail,
          code: normalizedCode,
          newPassword,
          confirmPassword,
        },
      });

      if (data?.resetPasswordWithCode) {
        setResetStatus('success');
        setResetMessage('Your password has been reset successfully. Please log in with your new password.');
        setTimeout(() => navigate('/login', { replace: true }), 1200);
      } else {
        setResetStatus('error');
        setResetMessage('Password reset failed. Please request a new code and try again.');
      }
    } catch (err) {
      setResetStatus('error');
      setResetMessage(err.message || 'Password reset failed. Please try again.');
    }
  };

  return (
    <div className="app-root">
      <main className="app-container">
        <h1 className="app-title auth-title">Reset Password</h1>

        <section className="card auth-card" aria-label="Forgot Password">
          <form className="auth-form" onSubmit={onResetPassword} autoComplete="on">
            <p style={{ margin: '0 0 6px', color: 'var(--color-text-muted)', fontSize: 14 }}>
              Enter your account email, request a 6-digit verification code, then set your new password.
            </p>

            <input
              className="input"
              name="email"
              type="email"
              placeholder="Email address"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <button
              type="button"
              className={`btn-ghost${sendingCode ? ' is-loading' : ''}`}
              onClick={onSendCode}
              disabled={sendingCode || resendSeconds > 0 || !email.trim()}
              aria-busy={sendingCode}
            >
              {sendingCode
                ? 'Sending code...'
                : resendSeconds > 0
                  ? `Resend in ${resendSeconds}s`
                  : 'Send Verification Code'}
            </button>

            {sendStatus === 'success' && (
              <div className="msg-success" role="status">
                {sendMessage}
              </div>
            )}
            {sendStatus === 'error' && (
              <div className="auth-hint" role="alert">
                {sendMessage}
              </div>
            )}

            <input
              className="input"
              name="code"
              type="text"
              placeholder="6-digit verification code"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
            />
            <div className="password-input-wrap">
              <input
                className="input password-input"
                name="newPassword"
                type={showNewPassword ? 'text' : 'password'}
                placeholder="New password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                onClick={() => setShowNewPassword((v) => !v)}
              >
                {showNewPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            <div className="password-input-wrap">
              <input
                className="input password-input"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm new password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={showConfirmPassword ? 'Hide confirm new password' : 'Show confirm new password'}
                onClick={() => setShowConfirmPassword((v) => !v)}
              >
                {showConfirmPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            <button
              type="submit"
              className={`btn-primary${resettingPassword ? ' is-loading' : ''}`}
              disabled={resettingPassword || !email.trim() || code.trim().length !== 6 || !newPassword || !confirmPassword}
              aria-busy={resettingPassword}
            >
              {resettingPassword ? 'Resetting...' : 'Reset Password'}
            </button>

            {resetStatus === 'success' && (
              <div className="msg-success" role="status">
                {resetMessage}
              </div>
            )}
            {resetStatus === 'error' && (
              <div className="auth-hint" role="alert">
                {resetMessage}
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
