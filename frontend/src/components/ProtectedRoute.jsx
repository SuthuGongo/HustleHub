import { Navigate, useLocation } from 'react-router-dom';
import AccessDenied from './AccessDenied';
import { useAuth } from '../context/AuthContext';

// Guards a route: must be logged in and, optionally, hold one of the allowed roles.
// This improves the experience only - the API enforces the same rules on every request.
export default function ProtectedRoute({ roles, children }) {
  const { user, initialising, sessionEnded } = useAuth();
  const location = useLocation();

  if (initialising) {
    return (
      <div className="page-status" role="status">
        Checking your session…
      </div>
    );
  }

  if (!user) {
    // Tell the login page why the person is there, and where to send them back afterwards.
    const notice = sessionEnded ? 'expired' : 'login-required';
    return <Navigate to="/login" replace state={{ from: location.pathname, notice }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return <AccessDenied roles={roles} user={user} />;
  }

  return children;
}
