// src/main.jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ApolloProvider } from '@apollo/client';
import client from './apolloClient';

import './index.css';
import './App.css';

import LoginPage from './screens/LoginPage.jsx';
import RegisterPage from './screens/RegisterPage.jsx';
import LogoutPage from './screens/LogoutPage.jsx';
import ForgotPasswordPage from './screens/ForgotPasswordPage.jsx';
import ResetPasswordPage from './screens/ResetPasswordPage.jsx';
import ChangePasswordPage from './screens/ChangePasswordPage.jsx';
import HomePage from './screens/HomePage.jsx';
import PostPage from './screens/PostPage.jsx';
import SharePage from './screens/SharePage.jsx';
import CommunityPage from './screens/CommunityPage.jsx';
import BookmarksPage from './screens/BookmarksPage.jsx';
import ProfilePage from './screens/ProfilePage.jsx';
import AgentPage from './screens/AgentPage.jsx';
import LeaderboardPage from './screens/LeaderboardPage.jsx';
import RequireAuth from './screens/RequireAuth.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ApolloProvider client={client}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/home" element={<HomePage />} />
            <Route path="/share" element={<SharePage />} />
            <Route path="/post" element={<PostPage />} />
            <Route path="/community" element={<CommunityPage />} />
            <Route path="/bookmarks" element={<BookmarksPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/agent" element={<AgentPage />} />
            <Route path="/assistant" element={<AgentPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/logout" element={<LogoutPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ApolloProvider>
  </StrictMode>
);
