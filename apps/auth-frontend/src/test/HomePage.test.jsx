// src/test/HomePage.test.jsx
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers';
import HomePage from '../screens/HomePage';
import { LOGOUT } from '../gql/logout';
import { gql } from '@apollo/client';

const ME_QUERY = gql`query MeForHome { me { id username role } }`;

const playerMe = { __typename: 'User', id: 'u1', username: 'alice', role: 'Player' };
const adminMe = { __typename: 'User', id: 'u99', username: 'admin', role: 'Admin' };

describe('HomePage', () => {
  const baseMocks = (me = playerMe) => [
    { request: { query: ME_QUERY }, result: { data: { me } } },
    { request: { query: LOGOUT }, result: { data: { logout: true } } },
  ];

  test('renders Dashboard heading', async () => {
    renderWithProviders(<HomePage />, { mocks: baseMocks() });
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  test('shows welcome message with username', async () => {
    renderWithProviders(<HomePage />, { mocks: baseMocks() });
    await waitFor(() => {
      expect(screen.getByText(/welcome back, alice/i)).toBeInTheDocument();
    });
  });

  test('shows role in welcome message', async () => {
    renderWithProviders(<HomePage />, { mocks: baseMocks() });
    await waitFor(() => {
      expect(screen.getByText(/player/i)).toBeInTheDocument();
    });
  });

  test('shows admin role in welcome for Admin user', async () => {
    renderWithProviders(<HomePage />, { mocks: baseMocks(adminMe) });
    await waitFor(() => {
      expect(screen.getByText(/admin/i)).toBeInTheDocument();
    });
  });

  test('renders all 6 navigation card sections', () => {
    renderWithProviders(<HomePage />, { mocks: baseMocks() });
    expect(screen.getByRole('heading', { name: /^Post$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Community$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Bookmarks$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /my profile/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /ai game agent/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /leaderboard/i })).toBeInTheDocument();
  });

  test('Sign Out button is visible', () => {
    renderWithProviders(<HomePage />, { mocks: baseMocks() });
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  test('Sign Out clears localStorage and navigates', async () => {
    localStorage.setItem('token', 'fake-token');
    localStorage.setItem('me', '{}');
    renderWithProviders(<HomePage />, { mocks: baseMocks() });
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    await waitFor(() => {
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('me')).toBeNull();
    });
  });

  test('renders DashboardNav', () => {
    renderWithProviders(<HomePage />, { mocks: baseMocks() });
    expect(screen.getByTestId('dashboard-nav')).toBeInTheDocument();
  });
});
