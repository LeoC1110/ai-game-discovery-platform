import React, { useState } from 'react';
import { useMutation, useApolloClient } from '@apollo/client';
import { Link, useNavigate } from 'react-router-dom';
import { LOGIN } from '../gql/login';

const FEATURES = [
  {
    label: 'Discover Games',
    desc: 'Find game recommendations from the community.',
  },
  {
    label: 'Share and Save',
    desc: 'Post games or ideas, comment, like, and bookmark favorites.',
  },
  {
    label: 'AI Recommendations',
    desc: 'Get personalized suggestions based on user preferences and community data.',
  },
  {
    label: 'Community Trends',
    desc: 'View popular posts and active game discussions.',
  },
  {
    label: 'Account Features',
    desc: 'Sign in, create an account, reset your password, and access protected pages.',
  },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const client = useApolloClient();
  const [msg, setMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Restore remembered identifier on mount
  const savedIdentifier = localStorage.getItem('rememberedIdentifier') ?? '';
  const [rememberMe, setRememberMe] = useState(!!savedIdentifier);
  const [identifier, setIdentifier] = useState(savedIdentifier);
  const [password, setPassword] = useState('');
  const [login, { loading }] = useMutation(LOGIN);

  const fillDemo = () => {
    setIdentifier('demo@example.com');
    setPassword('Demo123456!');
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg('');

    const trimmedIdentifier = identifier.trim();
    const trimmedPassword = password.trim();

    if (!trimmedIdentifier || !trimmedPassword) {
      setMsg('Please enter your username or email and password.');
      return;
    }

    try {
      const { data } = await login({
        variables: {
          identifier: trimmedIdentifier,
          password: trimmedPassword,
        },
      });

      const res = data?.login;

      if (res?.ok) {
        if (res.token) {
          localStorage.setItem('token', res.token);
        }

        localStorage.setItem('me', JSON.stringify(res.user));

        // Persist or clear the remembered identifier
        if (rememberMe) {
          localStorage.setItem('rememberedIdentifier', trimmedIdentifier);
        } else {
          localStorage.removeItem('rememberedIdentifier');
        }

        // Clear stale cache from a previously logged-in account before
        // navigating. resetStore re-runs active queries with the new token.
        await client.resetStore().catch(() => {});
        navigate('/home', { replace: true });
      } else {
        setMsg(res?.message || 'Login failed. Please try again.');
      }
    } catch (err) {
      setMsg(err.message || 'Network error. Please try again.');
    }
  };

  return (
    <div className="login-page">
      {/* Left panel: project overview */}
      <div className="login-overview">
        <div className="login-brand">
          <div>
            <h1 className="login-brand__name">
              AI-Powered Game Discovery Platform
            </h1>
          </div>
        </div>

        <p className="login-overview__desc">
          A deployed full-stack platform for game discovery, community posts, saved favorites, trends, and AI-powered recommendations.
        </p>

        <p className="login-overview__desc">
          Built for quick review with a demo account.
        </p>

        <p className="login-overview__section-label">Key Features</p>

        <ul className="login-features" aria-label="Platform features">
          {FEATURES.map((f) => (
            <li key={f.label} className="login-feature">
              <div>
                <strong className="login-feature__label">{f.label}</strong>
                <p className="login-feature__desc">{f.desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Right panel: sign-in form */}
      <div className="login-panel">
        <div className="login-form-card">
          <h2 className="login-form-title">Sign In</h2>
          <p className="login-form-sub">
            Enter your account information to access the platform.
          </p>

          <form className="auth-form" onSubmit={onSubmit} autoComplete="on">
            <input
              className="input"
              name="identifier"
              type="text"
              placeholder="Username or Email"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />

            <div className="password-input-wrap">
              <input
                className="input password-input"
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            <div className="login-form-extras">
              <label className="login-remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Remember me</span>
              </label>

              <Link to="/forgot-password" className="login-reset-link">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              className={`btn-primary${loading ? ' is-loading' : ''}`}
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>

            <div className="auth-actions">
              <Link to="/register" className="btn-ghost" role="button">
                Create Account
              </Link>
            </div>

            {msg && (
              <div className="auth-hint" role="alert">
                {msg}
              </div>
            )}
          </form>

          {/* Demo account */}
          <div className="login-demo-card" aria-label="Demo account credentials">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <p className="login-demo-label" style={{ margin: 0 }}>Demo Account</p>
              <button
                type="button"
                className="btn-ghost"
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                onClick={fillDemo}
              >
                Use Demo Account
              </button>
            </div>

            <div className="login-demo-row">
              <span>Username</span>
              <code>Demo</code>
            </div>

            <div className="login-demo-row">
              <span>Email</span>
              <code>demo@example.com</code>
            </div>

            <div className="login-demo-row">
              <span>Password</span>
              <code>Demo123456!</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}