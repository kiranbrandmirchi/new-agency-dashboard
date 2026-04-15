import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

export const Header = React.memo(function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { headerTitle, toggleSidebar, sidebarCollapsed, collapseSidebar } = useApp();
  const displayTitle = location.pathname === '/admin' ? 'Admin Panel' : headerTitle;
  const { signOut, userName, userEmail } = useAuth();

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
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
