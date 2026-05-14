import { Navigate, Outlet, useLocation } from 'react-router-dom';

export default function RequireAuth() {
  const location = useLocation();
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  if (!token) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
