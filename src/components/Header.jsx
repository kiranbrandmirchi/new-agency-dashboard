import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { PermissionGate } from './PermissionGate';

export const Header = React.memo(function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { headerTitle, toggleSidebar, sidebarCollapsed, collapseSidebar, showNotification, clients, currentClient, handleClientChange } = useApp();
  const displayTitle = location.pathname === '/admin' ? 'Admin Panel' : headerTitle;
  const { signOut, userName, userEmail } = useAuth();

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const handleExportPDF = () => {
    showNotification('PDF export would be generated here. This feature requires server-side processing or a PDF library like jsPDF.');
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Red Castle Services — Dashboard Report',
        text: 'Check out this marketing performance report!',
        url: window.location.href,
      }).catch(() => fallbackShare());
    } else {
      fallbackShare();
    }
  };

  const fallbackShare = () => {
    navigator.clipboard?.writeText(window.location.href).then(() => {
      showNotification('Report link copied to clipboard!');
    }).catch(() => {
      showNotification('Share URL: ' + window.location.href);
    });
  };

  return (
    <header className="header">
      <div className="header-left">
        <button type="button" className="hamburger" onClick={toggleSidebar} aria-label="Toggle menu">☰</button>
        <button
          type="button"
          className={`sidebar-collapse-btn ${sidebarCollapsed ? 'collapsed' : ''}`}
          id="sidebarCollapseBtn"
          onClick={collapseSidebar}
          title="Toggle sidebar"
        >
          <svg className="collapse-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 id="headerTitle">{displayTitle}</h1>
      </div>
      <div className="header-right">
        <div className="header-filters" id="headerFilters">
          {clients?.length > 2 && (
            <select
              className="client-selector"
              value={currentClient ?? ''}
              onChange={(e) => handleClientChange(e.target.value)}
              title="Select account"
            >
              {clients.map((c) => (
                <option key={c.id ?? 'all'} value={c.id ?? ''}>{c.name}</option>
              ))}
            </select>
          )}
          <span id="sb-sync-badge" style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 600 }}>Live</span>
        </div>
        <PermissionGate permission="action.export_pdf">
          <button type="button" className="btn btn-outline" onClick={handleExportPDF}>↓ Export PDF</button>
        </PermissionGate>
        <PermissionGate permission="action.share_report">
          <button type="button" className="btn btn-accent" onClick={handleShare}>Share Report</button>
        </PermissionGate>
        {/* User info */}
        {(userName || userEmail) && (
          <span className="header-user-info" title={userEmail}>
            {userName || userEmail}
          </span>
        )}
        <button type="button" className="btn btn-outline" onClick={handleLogout} title="Sign out">Log out</button>
      </div>
    </header>
  );
});
