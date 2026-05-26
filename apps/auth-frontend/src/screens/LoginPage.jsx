// src/screens/LoginPage.jsx
import React, { useState } from 'react';
import { useMutation } from '@apollo/client';
import { Link, useNavigate } from 'react-router-dom';
import { LOGIN } from '../gql/login';
import ThreeBackground from '../components/ThreeBackground';

export default function LoginPage() {
  const navigate = useNavigate();
  const [msg, setMsg] = useState('');
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
    <>
      <ThreeBackground />
      <div className="bg-vignette" />
      <div className="app-root">
        <main className="app-container">
          <h1 className="app-title auth-title">Welcome</h1>

          <section className="card auth-card" aria-label="Login Panel">
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

              <button type="submit" className={`btn-primary ${loading ? 'is-loading' : ''}`} disabled={loading} aria-busy={loading}>
                {loading ? 'Signing in…' : 'Login'}
              </button>

              <div className="auth-actions">
                <Link to="/register" className="btn-ghost" role="button">Registration</Link>
              </div>

              {msg && <div className="auth-hint">{msg}</div>}
            </form>
          </section>
        </main>
      </div>
    </>
  );
}

