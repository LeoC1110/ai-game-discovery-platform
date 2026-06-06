import React, { useState } from 'react';
import { useMutation } from '@apollo/client';
import { Link, useNavigate } from 'react-router-dom';
import { LOGIN } from '../gql/login';

const FEATURES = [
  {
    icon: '🎮',
    label: 'Game Discovery & Community',
    desc: 'Explore games, create posts, comment, bookmark content, and interact with other players.',
  },
  {
    icon: '🤖',
    label: 'AI Game Assistant',
    desc: 'Get personalized game recommendations powered by LangChain and Google Gemini AI.',
  },
  {
    icon: '📊',
    label: 'Leaderboards & Tournaments',
    desc: 'Compete for top rankings based on ratings, engagement, and community contributions.',
  },
  {
    icon: '🔐',
    label: 'Full-Stack Architecture',
    desc: 'JWT-based auth, GraphQL APIs, MongoDB data models, and role-based access control.',
  },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const [msg, setMsg] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [login, { loading }] = useMutation(LOGIN);

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg('');
    const form = new FormData(e.currentTarget);
    const identifier = (form.get('identifier') || '').toString().trim();
    const password = (form.get('password') || '').toString().trim();
    if (!identifier || !password) {
      setMsg('Please enter username/email and password');
      return;
    }
    try {
      const { data } = await login({ variables: { identifier, password } });
      const res = data?.login;
      if (res?.ok) {
        if (res.token) localStorage.setItem('token', res.token);
        localStorage.setItem('me', JSON.stringify(res.user));
        navigate('/home', { replace: true });
      } else {
        setMsg(res?.message || 'Login failed');
      }
    } catch (err) {
      setMsg(err.message || 'Network error');
    }
  };

  return (
    <div className="login-page">
      {/* ── Left panel: project overview ── */}
      <div className="login-overview">
        <div className="login-brand">
          <span className="login-brand__icon" aria-hidden="true">🎮</span>
          <div>
            <h1 className="login-brand__name">GameDiscover AI</h1>
            <p className="login-brand__tagline">AI-Powered Game Discovery Platform</p>
          </div>
        </div>

        <p className="login-overview__desc">
          A recruiter-friendly full-stack project demonstrating modern web development — from
          authentication and GraphQL APIs to AI-driven recommendations and community features.
        </p>

        <ul className="login-features" aria-label="Platform features">
          {FEATURES.map((f) => (
            <li key={f.label} className="login-feature">
              <span className="login-feature__icon" aria-hidden="true">{f.icon}</span>
              <div>
                <strong className="login-feature__label">{f.label}</strong>
                <p className="login-feature__desc">{f.desc}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="login-tech-stack" aria-label="Tech stack">
          {['React', 'Node.js', 'GraphQL', 'MongoDB', 'JWT', 'LangChain', 'Gemini AI'].map((t) => (
            <span key={t} className="tech-chip">{t}</span>
          ))}
        </div>
      </div>

      {/* ── Right panel: sign-in form ── */}
      <div className="login-panel">
        <div className="login-form-card">
          <h2 className="login-form-title">Sign In</h2>
          <p className="login-form-sub">Enter your credentials to access the platform.</p>

          <form className="auth-form" onSubmit={onSubmit} autoComplete="on">
            <input
              className="input"
              name="identifier"
              type="text"
              placeholder="Username or Email"
              autoComplete="username"
              required
            />
            <input
              className="input"
              name="password"
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              required
            />

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
                Reset my password
              </Link>
            </div>

            {showResetMsg && (
              <p className="login-reset-msg" role="status">
                Password reset is coming soon. Please contact an admin.
              </p>
            )}

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

            {msg && <div className="auth-hint" role="alert">{msg}</div>}
          </form>

          {/* ── Demo / test account ── */}
          <div className="login-demo-card" aria-label="Test account credentials">
            <p className="login-demo-label">
              <span aria-hidden="true">🧪</span> Test Account
            </p>
            <div className="login-demo-row">
              <span>Username</span>
              <code>Test</code>
            </div>
            <div className="login-demo-row">
              <span>Email</span>
              <code>Test@gmail.com</code>
            </div>
            <div className="login-demo-row">
              <span>Password</span>
              <code>233333</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

