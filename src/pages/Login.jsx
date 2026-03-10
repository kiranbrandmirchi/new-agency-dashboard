import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const APP_NAME = import.meta.env.VITE_APP_NAME || 'Agency Dashboard';

export function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await signIn(email, password);
      if (result.success) {
        navigate('/', { replace: true });
        return;
      }
      setError(result.error || 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">{APP_NAME}</h1>
        <p className="auth-subtitle">Sign in to your reporting dashboard</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-form-group">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="auth-form-group">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
            />
          </div>
          <button type="submit" className="btn btn-primary auth-submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
          {error && (
            <div className="auth-error" role="alert" style={{ marginTop: 12 }}>
              {error}
              {error.toLowerCase().includes('invalid') && (
                <p style={{ marginTop: 8, fontSize: 13, opacity: 0.9 }}>
                  Check your email and password, or <Link to="/signup">sign up</Link> if you don&apos;t have an account.
                </p>
              )}
            </div>
          )}
          <p className="auth-switch">
            Don&apos;t have an account? <Link to="/signup">Sign Up</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
