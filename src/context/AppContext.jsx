import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { PAGE_TITLES } from '../data/staticData';
import { useAuth } from './AuthContext';

const STORAGE_KEYS = {
  agencyName: 'agencyName',
  agencyLogo: 'agencyLogo',
  primaryColor: 'primaryColor',
  accentColor: 'accentColor',
  warningColor: 'warningColor',
  dangerColor: 'dangerColor',
};

const BRAND_VERSION = 'redcastle-v1';

const DEFAULTS = {
  agencyName: 'Red Castle',
  agencyLogo: 'SERVICES',
  primary: '#E12627',
  accent: '#0083CB',
  warning: '#F5A623',
  danger: '#E12627',
};

function migrateBrand() {
  if (localStorage.getItem('brandVersion') !== BRAND_VERSION) {
    Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
    localStorage.setItem('brandVersion', BRAND_VERSION);
  }
}

const AppContext = createContext(null);

export function AppProvider({ children }) {
  migrateBrand();
  const { allowedClientAccounts } = useAuth();

  const [currentPage, setCurrentPage] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentClient, setCurrentClient] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [branding, setBranding] = useState(() => ({
    agencyName: localStorage.getItem(STORAGE_KEYS.agencyName) || DEFAULTS.agencyName,
    agencyLogo: localStorage.getItem(STORAGE_KEYS.agencyLogo) || DEFAULTS.agencyLogo,
  }));
  const [colors, setColors] = useState(() => {
    const root = typeof document !== 'undefined' ? document.documentElement : null;
    const primary = localStorage.getItem(STORAGE_KEYS.primaryColor) || DEFAULTS.primary;
    const accent = localStorage.getItem(STORAGE_KEYS.accentColor) || DEFAULTS.accent;
    const warning = localStorage.getItem(STORAGE_KEYS.warningColor) || DEFAULTS.warning;
    const danger = localStorage.getItem(STORAGE_KEYS.dangerColor) || DEFAULTS.danger;
    if (root) {
      root.style.setProperty('--primary', primary);
      root.style.setProperty('--accent', accent);
      root.style.setProperty('--warning', warning);
      root.style.setProperty('--danger', danger);
    }
    return { primary, accent, warning, danger };
  });

  const headerTitle = PAGE_TITLES[currentPage] || 'Executive Dashboard';

  const showPage = useCallback((pageId) => {
    setCurrentPage(pageId);
    if (window.innerWidth <= 768) setSidebarOpen(false);
    window.scrollTo(0, 0);
  }, []);

  const toggleSidebar = useCallback(() => setSidebarOpen((o) => !o), []);
  const collapseSidebar = useCallback(() => setSidebarCollapsed((c) => !c), []);

  const showNotification = useCallback((message, duration = 3000) => {
    const id = Date.now();
    setNotifications((prev) => [...prev, { id, message, duration }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, duration);
  }, []);

  const handleClientChange = useCallback((value) => {
    const v = value === '' || value === 'Select Client...' ? null : value;
    setCurrentClient(v);
    if (v) {
      const acc = (allowedClientAccounts || []).find((a) => String(a.platform_customer_id) === String(v));
      showNotification('Account switched to: ' + (acc?.account_name || acc?.client_name || v));
    }
  }, [showNotification, allowedClientAccounts]);

  const updateBranding = useCallback((agencyName, agencyLogo) => {
    setBranding({ agencyName: agencyName || branding.agencyName, agencyLogo: agencyLogo ?? branding.agencyLogo });
    localStorage.setItem(STORAGE_KEYS.agencyName, agencyName || branding.agencyName);
    localStorage.setItem(STORAGE_KEYS.agencyLogo, agencyLogo ?? branding.agencyLogo);
    showNotification('Branding updated!');
  }, [branding.agencyName, branding.agencyLogo, showNotification]);

  const updateColors = useCallback((primary, accent, warning, danger) => {
    const root = document.documentElement;
    if (primary) {
      root.style.setProperty('--primary', primary);
      localStorage.setItem(STORAGE_KEYS.primaryColor, primary);
    }
    if (accent) {
      root.style.setProperty('--accent', accent);
      localStorage.setItem(STORAGE_KEYS.accentColor, accent);
    }
    if (warning) {
      root.style.setProperty('--warning', warning);
      localStorage.setItem(STORAGE_KEYS.warningColor, warning);
    }
    if (danger) {
      root.style.setProperty('--danger', danger);
      localStorage.setItem(STORAGE_KEYS.dangerColor, danger);
    }
    setColors((c) => ({
      primary: primary || c.primary,
      accent: accent || c.accent,
      warning: warning || c.warning,
      danger: danger || c.danger,
    }));
    showNotification('Colors updated!');
  }, [showNotification]);

  const resetSettings = useCallback(() => {
    Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
    setBranding({ agencyName: DEFAULTS.agencyName, agencyLogo: DEFAULTS.agencyLogo });
    setColors({
      primary: DEFAULTS.primary,
      accent: DEFAULTS.accent,
      warning: DEFAULTS.warning,
      danger: DEFAULTS.danger,
    });
    document.documentElement.style.setProperty('--primary', DEFAULTS.primary);
    document.documentElement.style.setProperty('--accent', DEFAULTS.accent);
    document.documentElement.style.setProperty('--warning', DEFAULTS.warning);
    document.documentElement.style.setProperty('--danger', DEFAULTS.danger);
    showNotification('Settings reset.');
    setTimeout(() => window.location.reload(), 500);
  }, [showNotification]);

  useEffect(() => {
    const name = localStorage.getItem(STORAGE_KEYS.agencyName);
    const logo = localStorage.getItem(STORAGE_KEYS.agencyLogo);
    if (name) setBranding((b) => ({ ...b, agencyName: name }));
    if (logo) setBranding((b) => ({ ...b, agencyLogo: logo }));
  }, []);

  const clients = useMemo(() => [
    { id: null, name: 'Select Client...' },
    ...(allowedClientAccounts || []).map((a) => ({
      id: a.platform_customer_id,
      name: a.account_name || a.client_name || a.platform_customer_id,
    })),
  ], [allowedClientAccounts]);

  const value = useMemo(() => ({
    currentPage,
    setCurrentPage,
    showPage,
    headerTitle,
    sidebarOpen,
    setSidebarOpen,
    toggleSidebar,
    sidebarCollapsed,
    collapseSidebar,
    currentClient,
    selectedClientId: currentClient,
    handleClientChange,
    showNotification,
    branding,
    updateBranding,
    colors,
    updateColors,
    resetSettings,
    clients,
  }), [
    currentPage,
    showPage,
    headerTitle,
    sidebarOpen,
    sidebarCollapsed,
    currentClient,
    handleClientChange,
    showNotification,
    branding,
    colors,
    updateBranding,
    updateColors,
    resetSettings,
    clients,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
