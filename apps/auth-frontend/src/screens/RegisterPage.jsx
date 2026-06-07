// src/screens/RegisterPage.jsx
import React, { useState } from 'react';
import { useMutation } from '@apollo/client';
import { useNavigate } from 'react-router-dom';
import { REGISTER_USER } from '../gql/register';

export default function RegisterPage() {
  const nav = useNavigate();
  const [msg, setMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [registerUser, { loading }] = useMutation(REGISTER_USER);

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg('');

    const form = new FormData(e.currentTarget);
    const username = (form.get('username') || '').toString().trim();
    const email = (form.get('email') || '').toString().trim();
    const password = (form.get('password') || '').toString().trim();
    const confirmPassword = (form.get('confirmPassword') || '').toString().trim();

    if (!username || !email || !password || !confirmPassword) {
      setMsg('Please enter username, email, password, and confirm password');
      return;
    }
    if (password.length < 6) {
      setMsg('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setMsg('Password and confirm password must match');
      return;
    }

    try {
      const { data } = await registerUser({ variables: { input: { username, email, password } } });
      const res = data?.register;
      if (res?.ok) {
        if (res.token) localStorage.setItem('token', res.token);
        localStorage.setItem('me', JSON.stringify(res.user));
        nav('/home', { replace: true });
      } else {
        setMsg(res?.message || 'Registration failed');
      }
    } catch (err) {
      setMsg(err.message || 'Network error');
    }
  };

  return (
    <div className="app-root">
      <main className="app-container">
          <h1 className="app-title auth-title">Create Account</h1>

          <section className="card auth-card" aria-label="Register Panel">
            <form className="auth-form" onSubmit={onSubmit} autoComplete="on">
              <input
                name="username"
                type="text"
                className="input"
                placeholder="Username"
                autoComplete="username"
                required
              />
              <input
                name="email"
                type="email"
                className="input"
                placeholder="Email"
                autoComplete="email"
                required
              />
              <div className="password-input-wrap">
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input password-input"
                  placeholder="Password (≥6)"
                  autoComplete="new-password"
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

              <div className="password-input-wrap">
                <input
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  className="input password-input"
                  placeholder="Confirm Password"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  onClick={() => setShowConfirmPassword((v) => !v)}
                >
                  {showConfirmPassword ? 'Hide' : 'Show'}
                </button>
              </div>

              <div className="auth-actions">
                <button type="submit" className={`btn-primary ${loading ? 'is-loading' : ''}`} disabled={loading} aria-busy={loading}>
                  {loading ? 'Submitting…' : 'Register'}
                </button>
                <button type="button" className="btn-ghost" onClick={() => nav('/')}>
                  Cancel
                </button>
              </div>

              {msg && <div className="auth-hint">{msg}</div>}
            </form>
          </section>
        </main>
      </div>
  );
}
