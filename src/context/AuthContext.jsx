import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

function stableSetKey(s) {
  if (!s || !(s instanceof Set)) return '';
  return [...s].sort().join(',');
}
function stableArrayKey(arr) {
  if (!arr || !Array.isArray(arr)) return '';
  return JSON.stringify(arr);
}
function stableObjKey(obj) {
  if (!obj || typeof obj !== 'object') return '';
  return JSON.stringify(obj);
}

const AUTH_DISABLED =
  ['true', '1', 'yes'].includes(String(import.meta.env.VITE_AUTH_DISABLED || '').toLowerCase()) ||
  (typeof window !== 'undefined' && sessionStorage.getItem('auth_skip') === '1');

const SUPABASE_TIMEOUT_MS = 8000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Supabase connection timed out')), ms)),
  ]);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const [userProfile, setUserProfile] = useState(null);
  const [userRole, setUserRole] = useState('');
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [agencyId, setAgencyId] = useState(null);
  const [agency, setAgency] = useState(null);
  const [activeAgencyId, setActiveAgencyIdState] = useState(null);
  const [activeAgency, setActiveAgency] = useState(null);
  const [allAgencies, setAllAgencies] = useState([]);
  const [permissions, setPermissions] = useState(new Set());
  const [allowedClients, setAllowedClients] = useState([]);
  const [allowedPlatformAccounts, setAllowedPlatformAccounts] = useState({});
  const [allowedClientAccounts, setAllowedClientAccounts] = useState([]);
  const [canViewAllCustomers, setCanViewAllCustomers] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const lastProfileLoad = useRef({ userId: null, at: 0 });
  const activeAgencyIdRef = useRef(null);
  const PROFILE_LOAD_DEBOUNCE_MS = 2000;

  const prevAllowedClientAccounts = useRef('');
  const prevAllowedClients = useRef('');
  const prevAllowedPlatformAccounts = useRef('');
  const prevPermissions = useRef('');

  const setAllowedClientAccountsStable = useCallback((val) => {
    const key = stableArrayKey(val);
    if (prevAllowedClientAccounts.current === key) return;
    prevAllowedClientAccounts.current = key;
    setAllowedClientAccounts(val);
  }, []);
  const setAllowedClientsStable = useCallback((val) => {
    const key = stableArrayKey(val);
    if (prevAllowedClients.current === key) return;
    prevAllowedClients.current = key;
    setAllowedClients(val);
  }, []);
  const setAllowedPlatformAccountsStable = useCallback((val) => {
    const key = stableObjKey(val);
    if (prevAllowedPlatformAccounts.current === key) return;
    prevAllowedPlatformAccounts.current = key;
    setAllowedPlatformAccounts(val);
  }, []);
  const setPermissionsStable = useCallback((val) => {
    const key = stableSetKey(val);
    if (prevPermissions.current === key) return;
    prevPermissions.current = key;
    setPermissions(val);
  }, []);

  const isAuthenticated = !!session && !authError;
  const isActive = !authError || authError === 'pending';

  const hasPermission = useCallback((key) => {
    if (AUTH_DISABLED) return true;
    if (userProfile?.is_super_admin) return true;
    if (['super_admin', 'admin'].includes(userRole?.toLowerCase())) return true;
    return permissions.has(key);
  }, [permissions, userProfile?.is_super_admin, userRole]);

  const isCustomerAllowed = useCallback((platform, customerId) => {
    if (AUTH_DISABLED) return true;
    if (canViewAllCustomers) return true;
    const ids = allowedPlatformAccounts[platform];
    if (!ids) return false;
    return ids.includes(String(customerId));
  }, [canViewAllCustomers, allowedPlatformAccounts]);

  const loadUserProfile = useCallback(async (userId, authUser = null) => {
    if (!userId) {
      setProfileLoaded(true);
      return;
    }
    const now = Date.now();
    if (lastProfileLoad.current.userId === userId && now - lastProfileLoad.current.at < PROFILE_LOAD_DEBOUNCE_MS) {
      setProfileLoaded(true);
      return;
    }
    lastProfileLoad.current = { userId, at: now };
    try {
      const { data: profile, error: profileErr } = await withTimeout(
        supabase.from('user_profiles').select('*, agencies(*), roles(*)').eq('id', userId).single(),
        SUPABASE_TIMEOUT_MS
      );
      if (profileErr || !profile) {
        console.warn('[Auth] user_profiles error:', profileErr);
        if (authUser) {
          setUserProfile(null);
          setUserName(authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'User');
          setUserEmail(authUser.email || '');
          setUserRole('');
          setAgencyId(null);
          setAgency(null);
          setActiveAgencyIdState(null);
          setActiveAgency(null);
          setPermissionsStable(new Set(['sidebar.settings', 'tab.combined_dashboard', 'sidebar.google_ads']));
          setAllowedClientsStable([]);
          setAllowedPlatformAccountsStable({});
          setAllowedClientAccountsStable([]);
          setCanViewAllCustomers(false);
          setAuthError(null);
        } else {
          setAuthError('Account pending setup. Contact admin to add your profile.');
        }
        setProfileLoaded(true);
        return;
      }

      const roleName = profile.roles?.role_name || '';
      const isSuperAdmin = !!profile.is_super_admin;

      setUserProfile(profile);
      setUserRole(roleName);
      setUserName(profile.full_name || '');
      setUserEmail(profile.email || '');
      setAgencyId(profile.agency_id);
      const agencyData = profile.agencies || null;
      setAgency(agencyData);
      setActiveAgencyIdState((prev) => (isSuperAdmin && prev != null ? prev : profile.agency_id));
      setActiveAgency((prevA) => (isSuperAdmin && prevA != null ? prevA : agencyData));

      const viewAll = isSuperAdmin || ['super_admin', 'admin', 'manager'].includes(roleName?.toLowerCase());
      setCanViewAllCustomers(viewAll);

      const { data: rolePerms, error: rpErr } = await withTimeout(
        supabase.from('role_permissions').select('permissions(permission_key)').eq('role_id', profile.role_id),
        SUPABASE_TIMEOUT_MS
      );
      if (rpErr) console.warn('[Auth] role_permissions error:', rpErr);
      const permSet = new Set();
      (rolePerms || []).forEach((r) => {
        if (r.permissions?.permission_key) permSet.add(r.permissions.permission_key);
      });
      setPermissionsStable(permSet);
      setAuthError(null);

      let cpaQuery = supabase.from('client_platform_accounts').select('id,platform_customer_id,account_name,platform,agency_id').eq('is_active', true);
      const filterAgencyId = (isSuperAdmin && activeAgencyIdRef.current) ? activeAgencyIdRef.current : (profile.agency_id || '00000000-0000-0000-0000-000000000000');
      cpaQuery = cpaQuery.eq('agency_id', filterAgencyId);
      const { data: cpaData, error: cpaErr } = await withTimeout(cpaQuery, SUPABASE_TIMEOUT_MS);
      if (cpaErr) console.warn('[Auth] client_platform_accounts error:', cpaErr);

      let cpaFiltered = cpaData || [];
      if (!isSuperAdmin && !viewAll) {
        const { data: ucData } = await supabase.from('user_clients').select('client_id').eq('user_id', userId);
        const assignedClientIds = new Set((ucData || []).map((r) => r.client_id));
        if (assignedClientIds.size > 0) {
          cpaFiltered = (cpaData || []).filter((r) => assignedClientIds.has(r.id));
        }
      }

      const clients = [];
      const platformMap = {};
      const clientAccounts = [];
      cpaFiltered.forEach((r) => {
        const platform = r.platform || 'google_ads';
        if (!platformMap[platform]) platformMap[platform] = [];
        if (r.platform_customer_id && !platformMap[platform].includes(String(r.platform_customer_id))) {
          platformMap[platform].push(String(r.platform_customer_id));
        }
        const accName = r.account_name || r.platform_customer_id;
        clients.push({ client_id: r.id, client_name: accName, platform_customer_id: String(r.platform_customer_id) });
        if (platform === 'google_ads') {
          clientAccounts.push({
            client_id: r.id,
            client_name: accName,
            platform: 'google_ads',
            platform_customer_id: String(r.platform_customer_id),
            account_name: r.account_name,
          });
        }
      });

      setAllowedClientsStable(clients);
      setAllowedPlatformAccountsStable(platformMap);
      setAllowedClientAccountsStable(clientAccounts);
      setProfileLoaded(true);

      if (isSuperAdmin) {
        const { data: agenciesData } = await withTimeout(
          supabase.from('agencies').select('*').order('agency_name'),
          SUPABASE_TIMEOUT_MS
        );
        setAllAgencies(agenciesData || []);
      } else {
        setAllAgencies([]);
      }

      if (agencyData) {
        const a = agencyData;
        const root = typeof document !== 'undefined' ? document.documentElement : null;
        if (root) {
          if (a.primary_color) root.style.setProperty('--primary-color', a.primary_color);
          if (a.secondary_color) root.style.setProperty('--secondary-color', a.secondary_color);
          if (a.accent_color) root.style.setProperty('--accent-color', a.accent_color);
          if (a.sidebar_bg) root.style.setProperty('--sidebar-bg', a.sidebar_bg);
          if (a.sidebar_text) root.style.setProperty('--sidebar-text', a.sidebar_text);
          if (a.font_family) root.style.setProperty('--font-family', a.font_family);
          if (a.primary_color) root.style.setProperty('--primary', a.primary_color);
          if (a.accent_color) root.style.setProperty('--accent', a.accent_color);
        }
      }
    } catch (err) {
      console.warn('[Auth] loadUserProfile error:', err);
      setAuthError('Failed to load profile. Try refreshing.');
      setProfileLoaded(true);
    }
  }, []);

  const setActiveAgencyId = useCallback(async (newAgencyId) => {
    const isSuperAdmin = userProfile?.is_super_admin || userRole?.toLowerCase() === 'super_admin';
    if (!isSuperAdmin) return;
    if (!newAgencyId) {
      setActiveAgencyIdState(null);
      setActiveAgency(null);
      setAllowedClientsStable([]);
      setAllowedPlatformAccountsStable({});
      setAllowedClientAccountsStable([]);
      const root = typeof document !== 'undefined' ? document.documentElement : null;
      const a = agency;
      if (root && a) {
        if (a.primary_color) root.style.setProperty('--primary-color', a.primary_color);
        if (a.secondary_color) root.style.setProperty('--secondary-color', a.secondary_color);
        if (a.accent_color) root.style.setProperty('--accent-color', a.accent_color);
        if (a.sidebar_bg) root.style.setProperty('--sidebar-bg', a.sidebar_bg);
        if (a.sidebar_text) root.style.setProperty('--sidebar-text', a.sidebar_text);
        if (a.font_family) root.style.setProperty('--font-family', a.font_family);
        if (a.primary_color) root.style.setProperty('--primary', a.primary_color);
        if (a.accent_color) root.style.setProperty('--accent', a.accent_color);
      }
      return;
    }
    setActiveAgencyIdState(newAgencyId);
    try {
      const { data: agencyRow, error: agencyErr } = await withTimeout(
        supabase.from('agencies').select('*').eq('id', newAgencyId).single(),
        SUPABASE_TIMEOUT_MS
      );
      if (agencyErr || !agencyRow) {
        console.warn('[Auth] setActiveAgencyId agency fetch:', agencyErr);
        return;
      }
      setActiveAgency(agencyRow);
      setAllowedClientsStable([]);
      setAllowedPlatformAccountsStable({});
      setAllowedClientAccountsStable([]);

      const { data: cpaData, error: cpaErr } = await withTimeout(
        supabase.from('client_platform_accounts').select('id,platform_customer_id,account_name,platform,agency_id').eq('agency_id', newAgencyId).eq('is_active', true),
        SUPABASE_TIMEOUT_MS
      );
      if (cpaErr) console.warn('[Auth] setActiveAgencyId cpa fetch:', cpaErr);

      const clients = [];
      const platformMap = {};
      const clientAccounts = [];
      (cpaData || []).forEach((r) => {
        const platform = r.platform || 'google_ads';
        if (!platformMap[platform]) platformMap[platform] = [];
        if (r.platform_customer_id && !platformMap[platform].includes(String(r.platform_customer_id))) {
          platformMap[platform].push(String(r.platform_customer_id));
        }
        const accName = r.account_name || r.platform_customer_id;
        clients.push({ client_id: r.id, client_name: accName, platform_customer_id: String(r.platform_customer_id) });
        if (platform === 'google_ads') {
          clientAccounts.push({
            client_id: r.id,
            client_name: accName,
            platform: 'google_ads',
            platform_customer_id: String(r.platform_customer_id),
            account_name: r.account_name,
          });
        }
      });

      setAllowedClientsStable(clients);
      setAllowedPlatformAccountsStable(platformMap);
      setAllowedClientAccountsStable(clientAccounts);

      const root = typeof document !== 'undefined' ? document.documentElement : null;
      if (root && agencyRow) {
        if (agencyRow.primary_color) root.style.setProperty('--primary-color', agencyRow.primary_color);
        if (agencyRow.secondary_color) root.style.setProperty('--secondary-color', agencyRow.secondary_color);
        if (agencyRow.accent_color) root.style.setProperty('--accent-color', agencyRow.accent_color);
        if (agencyRow.sidebar_bg) root.style.setProperty('--sidebar-bg', agencyRow.sidebar_bg);
        if (agencyRow.sidebar_text) root.style.setProperty('--sidebar-text', agencyRow.sidebar_text);
        if (agencyRow.font_family) root.style.setProperty('--font-family', agencyRow.font_family);
        if (agencyRow.primary_color) root.style.setProperty('--primary', agencyRow.primary_color);
        if (agencyRow.accent_color) root.style.setProperty('--accent', agencyRow.accent_color);
      }
    } catch (err) {
      console.warn('[Auth] setActiveAgencyId error:', err);
    }
  }, [userProfile?.is_super_admin, userRole, agency]);

  useEffect(() => { activeAgencyIdRef.current = activeAgencyId; }, [activeAgencyId]);

  const refreshAllAgencies = useCallback(async () => {
    const isSuperAdmin = userProfile?.is_super_admin || userRole?.toLowerCase() === 'super_admin';
    if (!isSuperAdmin) return;
    try {
      const { data } = await withTimeout(
        supabase.from('agencies').select('*').order('agency_name'),
        SUPABASE_TIMEOUT_MS
      );
      setAllAgencies(data || []);
    } catch (err) {
      console.warn('[Auth] refreshAllAgencies error:', err);
    }
  }, [userProfile?.is_super_admin, userRole]);

  const agencyFromSelection = activeAgencyId && allAgencies.length > 0 ? allAgencies.find((a) => a.id === activeAgencyId) : null;
  const displayAgencyForBranding = activeAgency ?? agencyFromSelection ?? (userProfile?.is_super_admin || userRole?.toLowerCase() === 'super_admin' ? agency : null);
  const BRAND_DEFAULTS = { primary: '#E12627', accent: '#0083CB' };
  useEffect(() => {
    const a = displayAgencyForBranding;
    const root = typeof document !== 'undefined' ? document.documentElement : null;
    if (root && a) {
      const primary = a.primary_color || BRAND_DEFAULTS.primary;
      const accent = a.accent_color || BRAND_DEFAULTS.accent;
      root.style.setProperty('--primary-color', primary);
      root.style.setProperty('--primary', primary);
      root.style.setProperty('--accent-color', accent);
      root.style.setProperty('--accent', accent);
      if (a.secondary_color) root.style.setProperty('--secondary-color', a.secondary_color);
      else root.style.removeProperty('--secondary-color');
      if (a.sidebar_bg) root.style.setProperty('--sidebar-bg', a.sidebar_bg);
      else root.style.removeProperty('--sidebar-bg');
      if (a.sidebar_text) root.style.setProperty('--sidebar-text', a.sidebar_text);
      else root.style.removeProperty('--sidebar-text');
      if (a.font_family) root.style.setProperty('--font-family', a.font_family);
      else root.style.removeProperty('--font-family');
    }
  }, [displayAgencyForBranding]);

  useEffect(() => {
    if (AUTH_DISABLED) {
      setLoading(false);
      setUser({ email: 'public', user_metadata: { full_name: 'Public' } });
      setUserRole('admin');
      setUserName('Public');
      setUserEmail('public');
      setPermissionsStable(new Set(['sidebar.google_ads', 'tab.campaigns', 'tab.geo', 'customer.view_all']));
      setCanViewAllCustomers(true);
      setAllowedClientsStable([]);
      setAllowedPlatformAccountsStable({});
      setAllowedClientAccountsStable([]);
      setProfileLoaded(true);
      return;
    }

    let mounted = true;

    withTimeout(supabase.auth.getSession(), SUPABASE_TIMEOUT_MS)
      .then(({ data: { session: s } }) => {
        if (!mounted) return;
        if (s) {
          setSession(s);
          setUser(s?.user ?? null);
          setAuthError(null);
          loadUserProfile(s.user?.id, s.user);
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!mounted) return;
        console.warn('Supabase unavailable:', err.message);
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s) {
        setAuthError(null);
        if (event !== 'TOKEN_REFRESHED') {
          loadUserProfile(s.user?.id, s.user);
        }
      } else {
        lastProfileLoad.current = { userId: null, at: 0 };
        setUserProfile(null);
        setAgency(null);
        setAgencyId(null);
        setActiveAgencyIdState(null);
        setActiveAgency(null);
        setAllAgencies([]);
        setProfileLoaded(false);
        setUserRole('');
        setUserName('');
        setUserEmail('');
        setPermissionsStable(new Set());
        setAllowedClientsStable([]);
        setAllowedPlatformAccountsStable({});
        setAllowedClientAccountsStable([]);
        setCanViewAllCustomers(false);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [AUTH_DISABLED, loadUserProfile]);

  useEffect(() => {
    if (session && user && profileLoaded && !authError) {
      setLoading(false);
    } else if (!session || authError) {
      setLoading(false);
    } else if (session && !user) {
      setLoading(false);
    }
  }, [session, user, profileLoaded, authError]);

  const signIn = useCallback(async (email, password) => {
    setAuthError(null);
    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: String(email).trim(),
          password: String(password),
        }),
        SUPABASE_TIMEOUT_MS
      );
      if (error) return { success: false, error: error.message };
      setSession(data.session);
      setUser(data.user);
      setLoading(true);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || 'Cannot reach authentication server.' };
    }
  }, []);

  const signUp = useCallback(async (email, password, fullName = '') => {
    setAuthError(null);
    try {
      const { data, error } = await withTimeout(
        supabase.auth.signUp({
          email: String(email).trim(),
          password: String(password),
          options: {
            data: { full_name: fullName ? String(fullName).trim() : null },
          },
        }),
        SUPABASE_TIMEOUT_MS
      );
      if (error) return { success: false, error: error.message };
      setSession(data.session);
      setUser(data.user);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || 'Cannot reach authentication server.' };
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setUserProfile(null);
    setAgency(null);
    setAgencyId(null);
    setActiveAgencyIdState(null);
    setActiveAgency(null);
    setAllAgencies([]);
    setUserRole('');
    setUserName('');
    setUserEmail('');
    prevPermissions.current = '';
    prevAllowedClients.current = '';
    prevAllowedPlatformAccounts.current = '';
    prevAllowedClientAccounts.current = '';
    setPermissions(new Set());
    setAllowedClients([]);
    setAllowedPlatformAccounts({});
    setAllowedClientAccounts([]);
    setCanViewAllCustomers(false);
    setProfileLoaded(false);
    setAuthError(null);
  }, []);

  const isImpersonating = activeAgencyId !== null && agencyId !== null && activeAgencyId !== agencyId;
  const isSuperAdmin = userProfile?.is_super_admin || userRole?.toLowerCase() === 'super_admin';
  const displayAgency = activeAgency ?? agencyFromSelection ?? (isSuperAdmin ? agency : null);

  const value = useMemo(() => ({
    user,
    session,
    loading,
    authError,
    isAuthenticated,
    userProfile,
    userRole,
    userName,
    userEmail,
    agencyId,
    agency,
    activeAgencyId,
    activeAgency,
    displayAgency,
    setActiveAgencyId,
    refreshAllAgencies,
    isImpersonating,
    allAgencies,
    permissions,
    allowedClients,
    allowedPlatformAccounts,
    allowedClientAccounts,
    canViewAllCustomers,
    hasPermission,
    isCustomerAllowed,
    signIn,
    signUp,
    signOut,
  }), [
    user,
    session,
    loading,
    authError,
    isAuthenticated,
    userProfile,
    userRole,
    userName,
    userEmail,
    agencyId,
    agency,
    activeAgencyId,
    activeAgency,
    displayAgency,
    setActiveAgencyId,
    refreshAllAgencies,
    isImpersonating,
    allAgencies,
    permissions,
    allowedClients,
    allowedPlatformAccounts,
    allowedClientAccounts,
    canViewAllCustomers,
    hasPermission,
    isCustomerAllowed,
    signIn,
    signUp,
    signOut,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
