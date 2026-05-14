// src/main.jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ApolloProvider } from '@apollo/client';
import client from './apolloClient';

import './index.css';
import './App.css';

import AppShell from './components/AppShell.jsx';
import MyProgressPage from './screens/MyProgressPage.jsx';
import LeaderboardPage from './screens/LeaderboardPage.jsx';
import AchievementsPage from './screens/AchievementsPage.jsx';

const AUTH_APP_URL = import.meta.env.VITE_AUTH_APP_URL || 'http://localhost:5173/';

function RequireAuth({ children }) {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.assign(AUTH_APP_URL);
    return null;
  }
  return children;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ApolloProvider client={client}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <RequireAuth>
                <AppShell>
                  <MyProgressPage />
                </AppShell>
              </RequireAuth>
            }
          />
          <Route
            path="/leaderboard"
            element={
              <RequireAuth>
                <AppShell>
                  <LeaderboardPage />
                </AppShell>
              </RequireAuth>
            }
          />
          <Route
            path="/achievements"
            element={
              <RequireAuth>
                <AppShell>
                  <AchievementsPage />
                </AppShell>
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ApolloProvider>
  </StrictMode>
);
