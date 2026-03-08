import React, { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useApp } from './context/AppContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { OAuthCallback } from './pages/OAuthCallback';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { NotificationContainer } from './components/Notification';
import { CombinedDashboardPage } from './pages/CombinedDashboardPage';
import { GoogleAdsPage } from './pages/GoogleAdsPage';
import { SettingsPage } from './pages/SettingsPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { Admin } from './pages/Admin';

const PLACEHOLDER_PAGES = {
  'meta-ads':     { title: 'Meta Ads Performance', subtitle: 'Coming soon - Full Meta Ads analytics' },
  'bing-ads':     { title: 'Bing Ads', subtitle: 'Microsoft Advertising Performance' },
  'tiktok-ads':   { title: 'TikTok Ads', subtitle: 'TikTok Campaign Performance' },
  'reddit-ads':   { title: 'Reddit Ads', subtitle: 'Reddit Campaign Performance' },
  'amazon-ads':   { title: 'Amazon Ads', subtitle: 'Amazon Advertising Performance' },
  'dsp':          { title: 'DSP / Programmatic', subtitle: 'The Trade Desk & DV360 Performance' },
  'dating-apps':  { title: 'Dating Apps', subtitle: 'Direct Buy Performance' },
  'ctv':          { title: 'CTV Campaigns', subtitle: 'Connected TV Performance' },
  'ga4':          { title: 'GA4 / Web Analytics', subtitle: 'Website Performance Data' },
  'email':        { title: 'Email Marketing', subtitle: 'Email Campaign Performance' },
  'ghl':          { title: 'GoHighLevel', subtitle: 'CRM Performance Metrics' },
  'ott':          { title: 'OTT / Vimeo', subtitle: 'Video Streaming Performance' },
  'seo':          { title: 'SEO Performance', subtitle: 'Organic Search Rankings' },
  'geo':          { title: 'Geographic View', subtitle: 'Performance by Location' },
  'creatives':    { title: 'Creative Analysis', subtitle: 'Ad Creative Performance' },
  'events':       { title: 'Events / Special', subtitle: 'Special Campaign Performance' },
};

function CurrentPage() {
  const { currentPage } = useApp();

  if (currentPage === 'dashboard') return <CombinedDashboardPage />;
  if (currentPage === 'google-ads') return <GoogleAdsPage />;
  if (currentPage === 'settings') return <SettingsPage />;

  const config = PLACEHOLDER_PAGES[currentPage];
  if (config) {
    return <PlaceholderPage title={config.title} subtitle={config.subtitle} />;
  }

  return <CombinedDashboardPage />;
}

const DashboardLayoutContent = React.memo(function DashboardLayoutContent({ currentPage, pathname }) {
  const { hasPermission } = useAuth();

  if (pathname === '/admin') {
    if (!hasPermission('action.manage_users')) {
      return (
        <div className="page-content">
          <div className="card" style={{ padding: 48, textAlign: 'center' }}>
            <h2>Access Denied</h2>
            <p>You do not have permission to access the Admin panel.</p>
          </div>
        </div>
      );
    }
    return <Admin />;
  }

  return <CurrentPage />;
});

function DashboardLayout() {
  const { showNotification, currentPage } = useApp();
  const { userName } = useAuth();
  const location = useLocation();
  const welcomeShown = useRef(false);

  useEffect(() => {
    if (userName && !welcomeShown.current) {
      welcomeShown.current = true;
      showNotification(`Welcome back, ${userName}!`);
    }
  }, [userName, showNotification]);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Header />
        <DashboardLayoutContent currentPage={currentPage} pathname={location.pathname} />
      </main>
      <NotificationContainer />
    </div>
  );
}

function LoginRedirect({ children }) {
  const { isAuthenticated, loading } = useAuth();
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
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={
          <LoginRedirect>
            <Login />
          </LoginRedirect>
        } />
        <Route path="/signup" element={
          <LoginRedirect>
            <Signup />
          </LoginRedirect>
        } />
        <Route path="/oauth/callback" element={<OAuthCallback />} />
        <Route path="/" element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        } />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/admin" element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
