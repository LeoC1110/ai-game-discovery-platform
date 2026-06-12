import React, { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@apollo/client';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { SEND_EMAIL_VERIFICATION_CODE } from '../gql/sendEmailVerification';
import { VERIFY_EMAIL_CODE } from '../gql/verifyEmail';

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState(location.state?.email || '');
  const [code, setCode] = useState('');
  const [resendUntil, setResendUntil] = useState(0);

  const [sendStatus, setSendStatus] = useState(location.state?.message ? 'success' : null);
  const [sendMessage, setSendMessage] = useState(location.state?.message || '');
  const [verifyStatus, setVerifyStatus] = useState(null);
  const [verifyMessage, setVerifyMessage] = useState('');

  const [sendCode, { loading: sendingCode }] = useMutation(SEND_EMAIL_VERIFICATION_CODE);
  const [verifyCode, { loading: verifyingCode }] = useMutation(VERIFY_EMAIL_CODE);

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
      const { data } = await sendCode({ variables: { email: normalizedEmail } });
      const demoCode = data?.sendEmailVerificationCode?.demoCode;
      setSendStatus('success');
      if (demoCode) {
        setSendMessage(`Demo mode - your verification code: ${demoCode}`);
        setCode(demoCode);
      } else {
        setSendMessage('If this account exists and is unverified, a verification code has been sent.');
      }
      setResendUntil(Date.now() + 60000);
    } catch (err) {
      setSendStatus('error');
      setSendMessage(err.message || 'Failed to send verification code. Please try again.');
    }
  };

  const onVerify = async (e) => {
    e.preventDefault();
    setVerifyStatus(null);

    const normalizedEmail = email.trim();
    const normalizedCode = code.trim();

    if (!normalizedEmail || normalizedCode.length !== 6) {
      setVerifyStatus('error');
      setVerifyMessage('Please enter your email and a valid 6-digit code.');
      return;
    }

    try {
      const { data } = await verifyCode({
        variables: {
          email: normalizedEmail,
          code: normalizedCode,
        },
      });

      if (data?.verifyEmailCode) {
        setVerifyStatus('success');
        setVerifyMessage('Email verified successfully. You can now sign in.');
        setTimeout(() => navigate('/login', { replace: true }), 1000);
      } else {
        setVerifyStatus('error');
        setVerifyMessage('Email verification failed. Please try again.');
      }
    } catch (err) {
      setVerifyStatus('error');
      setVerifyMessage(err.message || 'Email verification failed. Please try again.');
    }
  };

  return (
    <div className="app-root">
      <main className="app-container">
        <h1 className="app-title auth-title">Verify Email</h1>

        <section className="card auth-card" aria-label="Verify Email">
          <form className="auth-form" onSubmit={onVerify} autoComplete="on">
            <p style={{ margin: '0 0 6px', color: 'var(--color-text-muted)', fontSize: 14 }}>
              Enter your registration email, request a 6-digit code, and verify your account.
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

            <button
              type="submit"
              className={`btn-primary${verifyingCode ? ' is-loading' : ''}`}
              disabled={verifyingCode || !email.trim() || code.trim().length !== 6}
              aria-busy={verifyingCode}
            >
              {verifyingCode ? 'Verifying...' : 'Verify Email'}
            </button>

            {verifyStatus === 'success' && (
              <div className="msg-success" role="status">
                {verifyMessage}
              </div>
            )}
            {verifyStatus === 'error' && (
              <div className="auth-hint" role="alert">
                {verifyMessage}
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
