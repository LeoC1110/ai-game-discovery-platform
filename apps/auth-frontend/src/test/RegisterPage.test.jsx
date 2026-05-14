// src/test/RegisterPage.test.jsx
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers';
import RegisterPage from '../screens/RegisterPage';
import { REGISTER_USER } from '../gql/register';

const mockUser = { __typename: 'User', id: '2', username: 'newuser', email: 'new@example.com', role: 'Player' };

describe('RegisterPage', () => {
  test('renders all form fields and submit button', () => {
    renderWithProviders(<RegisterPage />, { mocks: [] });
    expect(screen.getByText('Registration')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Username')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /register/i })).toBeInTheDocument();
  });

  test('does NOT render a role selector (role is always Player)', () => {
    renderWithProviders(<RegisterPage />, { mocks: [] });
    expect(screen.queryByLabelText(/role/i)).toBeNull();
    expect(screen.queryByText(/admin/i)).toBeNull();
  });

  test('shows validation error when fields are empty', async () => {
    renderWithProviders(<RegisterPage />, { mocks: [] });
    fireEvent.submit(screen.getByRole('button', { name: /register/i }).closest('form'));
    await waitFor(() => {
      expect(screen.getByText(/please enter username, email, and password/i)).toBeInTheDocument();
    });
  });

  test('shows error when password is shorter than 6 characters', async () => {
    renderWithProviders(<RegisterPage />, { mocks: [] });
    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'u' } });
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'u@x.com' } });
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: '123' } });
    fireEvent.submit(screen.getByRole('button', { name: /register/i }).closest('form'));
    await waitFor(() => {
      expect(screen.getByText(/at least 6 characters/i)).toBeInTheDocument();
    });
  });

  test('calls REGISTER mutation and stores token on success', async () => {
    const regMock = {
      request: {
        query: REGISTER_USER,
        variables: { input: { username: 'newuser', email: 'new@example.com', password: 'password123' } },
      },
      result: { data: { register: { ok: true, token: 'new-token', user: mockUser, message: null } } },
    };
    renderWithProviders(<RegisterPage />, { mocks: [regMock, regMock] });

    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'newuser' } });
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: 'password123' } });
    fireEvent.submit(screen.getByRole('button', { name: /register/i }).closest('form'));

    await waitFor(() => {
      expect(localStorage.getItem('token')).toBe('new-token');
    });
  });

  test('shows error message when registration fails', async () => {
    const regMock = {
      request: {
        query: REGISTER_USER,
        variables: { input: { username: 'dup', email: 'dup@example.com', password: 'password123' } },
      },
      result: { data: { register: { ok: false, token: null, user: null, message: 'Username already registered' } } },
    };
    renderWithProviders(<RegisterPage />, { mocks: [regMock, regMock] });

    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'dup' } });
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'dup@example.com' } });
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: 'password123' } });
    fireEvent.submit(screen.getByRole('button', { name: /register/i }).closest('form'));

    await waitFor(() => {
      expect(screen.getByText(/username already registered/i)).toBeInTheDocument();
    });
  });
});
