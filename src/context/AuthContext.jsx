import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

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
  const [permissions, setPermissions] = useState(new Set());
  const [allowedClients, setAllowedClients] = useState([]);
  const [allowedPlatformAccounts, setAllowedPlatformAccounts] = useState({});
  const [allowedClientAccounts, setAllowedClientAccounts] = useState([]);
  const [canViewAllCustomers, setCanViewAllCustomers] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const isAuthenticated = !!session && !authError;
  const isActive = !authError || authError === 'pending';

  const hasPermission = useCallback((key) => {
    if (AUTH_DISABLED) return true;
    return permissions.has(key);
  }, [permissions]);

  const isCustomerAllowed = useCallback((platform, customerId) => {
    if (AUTH_DISABLED) return true;
    if (canViewAllCustomers) return true;
    const ids = allowedPlatformAccounts[platform];
    if (!ids) return false;
    return ids.includes(String(customerId));
  }, [canViewAllCustomers, allowedPlatformAccounts]);

  const loadUserProfile = useCallback(async (userId, authUser = null) => {
    if (!userId) return;
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
          setPermissions(new Set(['sidebar.settings', 'tab.combined_dashboard', 'sidebar.google_ads']));
          setAllowedClients([]);
          setAllowedPlatformAccounts({});
          setAllowedClientAccounts([]);
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
      setAgency(profile.agencies || null);

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
      setPermissions(permSet);
      setAuthError(null);

      const { data: cpaData, error: cpaErr } = await withTimeout(
        supabase.from('client_platform_accounts').select('id,platform_customer_id,account_name,platform').eq('is_active', true),
        SUPABASE_TIMEOUT_MS
      );
      if (cpaErr) console.warn('[Auth] client_platform_accounts error:', cpaErr);

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

      setAllowedClients(clients);
      setAllowedPlatformAccounts(platformMap);
      setAllowedClientAccounts(clientAccounts);
      setProfileLoaded(true);

      if (profile.agencies) {
        const a = profile.agencies;
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

  useEffect(() => {
    if (AUTH_DISABLED) {
      setLoading(false);
      setUser({ email: 'public', user_metadata: { full_name: 'Public' } });
      setUserRole('admin');
      setUserName('Public');
      setUserEmail('public');
      setPermissions(new Set(['sidebar.google_ads', 'tab.campaigns', 'tab.geo', 'customer.view_all']));
      setCanViewAllCustomers(true);
      setAllowedClients([]);
      setAllowedPlatformAccounts({});
      setAllowedClientAccounts([]);
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
        loadUserProfile(s.user?.id, s.user);
      } else {
        setUserProfile(null);
        setAgency(null);
        setAgencyId(null);
        setProfileLoaded(false);
        setUserRole('');
        setUserName('');
        setUserEmail('');
        setPermissions(new Set());
        setAllowedClients([]);
        setAllowedPlatformAccounts({});
        setAllowedClientAccounts([]);
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
    setUserRole('');
    setUserName('');
    setUserEmail('');
    setPermissions(new Set());
    setAllowedClients([]);
    setAllowedPlatformAccounts({});
    setAllowedClientAccounts([]);
    setCanViewAllCustomers(false);
    setProfileLoaded(false);
    setAuthError(null);
  }, []);

  const value = {
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
