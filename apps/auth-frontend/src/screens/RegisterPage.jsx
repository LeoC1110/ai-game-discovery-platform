// src/screens/RegisterPage.jsx
import React, { useState } from 'react';
import { useMutation } from '@apollo/client';
import { useNavigate } from 'react-router-dom';
import { REGISTER_USER } from '../gql/register';
import ThreeBackground from '../components/ThreeBackground';

export default function RegisterPage() {
  const nav = useNavigate();
  const [msg, setMsg] = useState('');
  const [registerUser, { loading }] = useMutation(REGISTER_USER);

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg('');

    const form = new FormData(e.currentTarget);
    const username = (form.get('username') || '').toString().trim();
    const email = (form.get('email') || '').toString().trim();
    const password = (form.get('password') || '').toString().trim();

    if (!username || !email || !password) {
      setMsg('Please enter username, email, and password');
      return;
    }
    if (password.length < 6) {
      setMsg('Password must be at least 6 characters');
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
    <>
      <ThreeBackground />
      <div className="bg-vignette" />
      <div className="app-root">
        <main className="app-container">
          <h1 className="app-title auth-title">Registration</h1>

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
              <input
                name="password"
                type="password"
                className="input"
                placeholder="Password (≥6)"
                autoComplete="new-password"
                required
              />

              <div className="auth-actions">
                <button type="submit" className="btn-primary" disabled={loading}>
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
    </>
  );
}
