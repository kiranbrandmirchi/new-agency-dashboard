import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children }) {
  const { isAuthenticated, loading, authError } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-loading-spinner" />
          <p className="auth-subtitle">Loading…</p>
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <img src="/rc-logo-full.png" alt="Red Castle Services" className="auth-logo" />
          <h1 className="auth-title">Account Issue</h1>
          <p className="auth-subtitle auth-error-msg">{authError}</p>
          <button
            type="button"
            className="btn btn-outline auth-submit"
            onClick={() => window.location.href = '/login'}
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
