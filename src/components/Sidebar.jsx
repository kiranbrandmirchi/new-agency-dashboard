import React, { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { PermissionGate } from './PermissionGate';
import { NAV_ITEMS } from '../config/navConfig.jsx';
import { GA4_WHEELER_AGENCY_ID } from '../hooks/useGA4Data';

function groupBySection(items) {
  const map = new Map();
  items.forEach((item) => {
    if (!map.has(item.section)) map.set(item.section, []);
    map.get(item.section).push(item);
  });
  return map;
}

export const Sidebar = React.memo(function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentPage, showPage, sidebarOpen, sidebarCollapsed } = useApp();
  const { hasPermission, displayAgency, activeAgencyId, agencyId, activeAgency, setActiveAgencyId, isImpersonating, allAgencies, userProfile, userRole } = useAuth();

  const isWheelerGa4Agency = useMemo(
    () => activeAgencyId === GA4_WHEELER_AGENCY_ID || agencyId === GA4_WHEELER_AGENCY_ID,
    [activeAgencyId, agencyId],
  );

  const sections = useMemo(() => {
    const allowed = NAV_ITEMS.filter((item) => {
      if (!hasPermission(item.permission)) return false;
      if (item.wheelerOnlyGa4 && !isWheelerGa4Agency) return false;
      return true;
    });
    return groupBySection(allowed);
  }, [hasPermission, isWheelerGa4Agency]);
  const isSuperAdmin = userProfile?.is_super_admin || userRole?.toLowerCase() === 'super_admin';
  const isAdmin = location.pathname === '/admin';

  const sidebarClass = ['sidebar', sidebarOpen && 'open', sidebarCollapsed && 'collapsed'].filter(Boolean).join(' ');

  return (
    <aside className={sidebarClass} id="sidebar">
      <div className="sidebar-brand">
        <div className="brand-logo-text" id="brandLogo">
          {displayAgency?.logo_url ? (
            <img src={displayAgency.logo_url} alt={displayAgency.agency_name || 'Agency'} className="brand-logo-img" />
          ) : (
            <span className="brand-logo-text">{displayAgency?.agency_name || 'Agency'}</span>
          )}
        </div>
      </div>

      {isSuperAdmin && allAgencies.length > 0 && !sidebarCollapsed && (
        <div className="sidebar-agency-selector" style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <select
            className="client-selector"
            value={activeAgencyId ?? ''}
            onChange={(e) => setActiveAgencyId(e.target.value || null)}
            title="Select agency"
            style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: 13 }}
          >
            <option value="">All accounts</option>
            {allAgencies.map((a) => (
              <option key={a.id} value={a.id}>{a.agency_name || a.id}</option>
            ))}
          </select>
          {isImpersonating && (
            <span style={{ display: 'block', marginTop: 6, fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
              (viewing as {activeAgency?.agency_name || 'agency'})
            </span>
          )}
        </div>
      )}

      {Array.from(sections.entries()).map(([sectionLabel, items]) => (
        <div key={sectionLabel} className="sidebar-section">
          <div className="sidebar-section-label">{sectionLabel}</div>
          <ul className="sidebar-nav">
            {items.map((item) => (
              <PermissionGate key={item.id} permission={item.permission}>
                <li>
                  <a
                    href="#"
                    className={currentPage === item.id ? 'active' : ''}
                    data-tooltip={item.label}
                    onClick={(e) => {
                      e.preventDefault();
                      if (location.pathname === '/admin') navigate('/');
                      showPage(item.id);
                    }}
                  >
                    {item.logo ? (
                      <span className="platform-logo" style={item.logoStyle}>{item.logo}</span>
                    ) : item.icon ? (
                      <span className="nav-icon">{item.icon}</span>
                    ) : null}
                    {item.label}
                  </a>
                </li>
              </PermissionGate>
            ))}
          </ul>
        </div>
      ))}

      {hasPermission('action.manage_users') && (
        <div className="sidebar-section">
          <ul className="sidebar-nav">
            <li>
              <a
                href="#"
                className={isAdmin ? 'active' : ''}
                data-tooltip="Admin Panel"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/admin');
                }}
              >
                <span className="nav-icon">🔐</span>
                Admin
              </a>
            </li>
          </ul>
        </div>
      )}
    </aside>
  );
});
