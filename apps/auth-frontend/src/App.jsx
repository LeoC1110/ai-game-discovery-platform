import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary.jsx';
// RequireAuth stays static — it is a layout/redirect component, must load synchronously.
import RequireAuth from './screens/RequireAuth.jsx';

// ── Route-level code splitting ────────────────────────────────────────────────
// Each page is loaded on demand; the initial bundle only contains the shell.
const LoginPage          = lazy(() => import('./screens/LoginPage.jsx'));
const RegisterPage       = lazy(() => import('./screens/RegisterPage.jsx'));
const VerifyEmailPage    = lazy(() => import('./screens/VerifyEmailPage.jsx'));
const LogoutPage         = lazy(() => import('./screens/LogoutPage.jsx'));
const ForgotPasswordPage = lazy(() => import('./screens/ForgotPasswordPage.jsx'));
const ChangePasswordPage = lazy(() => import('./screens/ChangePasswordPage.jsx'));
const HomePage           = lazy(() => import('./screens/HomePage.jsx'));
const PostPage           = lazy(() => import('./screens/PostPage.jsx'));
const SharePage          = lazy(() => import('./screens/SharePage.jsx'));
const CommunityPage      = lazy(() => import('./screens/CommunityPage.jsx'));
const BookmarksPage      = lazy(() => import('./screens/BookmarksPage.jsx'));
const ProfilePage        = lazy(() => import('./screens/ProfilePage.jsx'));
const AgentPage          = lazy(() => import('./screens/AgentPage.jsx'));
const LeaderboardPage    = lazy(() => import('./screens/LeaderboardPage.jsx'));
const UsersPage          = lazy(() => import('./screens/UsersPage.jsx'));
const UserProfilePage    = lazy(() => import('./screens/UserProfilePage.jsx'));

function PageLoader() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f7' }}>
      <span style={{ color: '#6e6e73', fontSize: 14 }}>Loading…</span>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
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
            <Route path="/users" element={<UsersPage />} />
            <Route path="/users/:id" element={<UserProfilePage />} />
            <Route path="/logout" element={<LogoutPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}