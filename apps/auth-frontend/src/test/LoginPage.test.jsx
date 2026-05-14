// src/test/LoginPage.test.jsx
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers';
import LoginPage from '../screens/LoginPage';
import { LOGIN } from '../gql/login';

const mockToken = 'mock-jwt-token';
const mockUser = { __typename: 'User', id: '1', username: 'testuser', email: 'test@example.com', role: 'Player' };

describe('LoginPage', () => {
  test('renders title, username/email field, password field and login button', () => {
    renderWithProviders(<LoginPage />, { mocks: [] });
    expect(screen.getByText('Welcome')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Username or Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
  });

  test('renders Registration link', () => {
    renderWithProviders(<LoginPage />, { mocks: [] });
    expect(screen.getByRole('button', { name: /registration/i })).toBeInTheDocument();
  });

  test('shows error when submitting empty form', async () => {
    renderWithProviders(<LoginPage />, { mocks: [] });
    fireEvent.submit(screen.getByRole('button', { name: /login/i }).closest('form'));
    await waitFor(() => {
      expect(screen.getByText(/please enter username\/email and password/i)).toBeInTheDocument();
    });
  });

  test('calls LOGIN mutation and stores token on success', async () => {
    const loginMock = {
      request: { query: LOGIN, variables: { identifier: 'testuser', password: 'password123' } },
      result: { data: { login: { ok: true, token: mockToken, user: mockUser, message: null } } },
    };
    renderWithProviders(<LoginPage />, { mocks: [loginMock, loginMock] });

    fireEvent.change(screen.getByPlaceholderText('Username or Email'), {
      target: { value: 'testuser' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /login/i }).closest('form'));

    await waitFor(() => {
      expect(localStorage.getItem('token')).toBe(mockToken);
    });
  });

  test('shows server error message on failed login', async () => {
    const loginMock = {
      request: { query: LOGIN, variables: { identifier: 'wronguser', password: 'wrongpass' } },
      result: { data: { login: { ok: false, token: null, user: null, message: 'Invalid credentials' } } },
    };
    renderWithProviders(<LoginPage />, { mocks: [loginMock, loginMock] });

    fireEvent.change(screen.getByPlaceholderText('Username or Email'), {
      target: { value: 'wronguser' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'wrongpass' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /login/i }).closest('form'));

    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
    });
  });

  test('disables button while loading', async () => {
    const mocks = [
      {
        request: { query: LOGIN, variables: { identifier: 'testuser', password: 'pass' } },
        result: { data: { login: { ok: true, token: mockToken, user: mockUser, message: null } } },
        delay: 500,
      },
    ];
    renderWithProviders(<LoginPage />, { mocks });
    fireEvent.change(screen.getByPlaceholderText('Username or Email'), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pass' } });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
  });
});
