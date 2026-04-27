import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { getEffectiveAgencyScopeId } from '../lib/agencyScope';
import { syncWithChunking, syncStatusAndGeo } from '../utils/syncHelper';
import { PlatformManagementSection } from '../components/PlatformManagementSection';
import { DATE_PRESETS, getDateRangeFromPreset } from '../lib/datePresets';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const BASE_SETTINGS_SECTIONS = [
  { id: 'google_ads', label: 'Google Ads' },
  { id: 'reddit_ads', label: 'Reddit Ads' },
  { id: 'facebook_ads', label: 'Facebook / Meta Ads' },
  { id: 'ga4', label: 'GA4 / Web Analytics' },
  { id: 'platforms', label: 'GHL' },
  { id: 'white_label', label: 'White Label & Branding' },
];

function formatRelativeTime(dateStr) {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function statusBadge(status) {
  if (status === 'success' || status === 'synced') return 'badge-green';
  if (status === 'error' || status === 'failed') return 'badge-red';
  return 'badge-gray';
}

export function SettingsPage() {
  const { showNotification } = useApp();
  const { signOut, activeAgencyId, agencyId, activeAgency, userProfile, userRole } = useAuth();
  const isSuperAdmin = !!(userProfile?.is_super_admin || userRole?.toLowerCase() === 'super_admin');
  const effectiveAgencyId = getEffectiveAgencyScopeId(isSuperAdmin, activeAgencyId, agencyId);

  const [activeSettingsSection, setActiveSettingsSection] = useState('google_ads');

  const [credentials, setCredentials] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loadingCreds, setLoadingCreds] = useState(true);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [disconnecting, setDisconnecting] = useState(null);
  const [togglingAccount, setTogglingAccount] = useState(null);
  const [syncingAccount, setSyncingAccount] = useState(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const [syncLogs, setSyncLogs] = useState({});
  const [lastDayByAccount, setLastDayByAccount] = useState({});
  const [expandedSyncHistory, setExpandedSyncHistory] = useState(null);

  const [datePreset, setDatePreset] = useState('last7');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [redditDatePreset, setRedditDatePreset] = useState('last7');
  const [redditCustomFrom, setRedditCustomFrom] = useState('');
  const [redditCustomTo, setRedditCustomTo] = useState('');
  const [facebookDatePreset, setFacebookDatePreset] = useState('last7');
  const [facebookCustomFrom, setFacebookCustomFrom] = useState('');
  const [facebookCustomTo, setFacebookCustomTo] = useState('');
  const [ga4DatePreset, setGa4DatePreset] = useState('last7');
  const [ga4CustomFrom, setGa4CustomFrom] = useState('');
  const [ga4CustomTo, setGa4CustomTo] = useState('');

  const [agencyForm, setAgencyForm] = useState({
    agency_name: '', primary_color: '', secondary_color: '', accent_color: '',
    sidebar_bg: '', sidebar_text: '', font_family: '', logo_url: '',
  });
  const [savingAgency, setSavingAgency] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [connectingReddit, setConnectingReddit] = useState(false);
  const [connectingFacebook, setConnectingFacebook] = useState(false);
  const [connectingGA4, setConnectingGA4] = useState(false);
  const [disconnectingGa4CredId, setDisconnectingGa4CredId] = useState(null);
  const [reassigningGa4PropertyId, setReassigningGa4PropertyId] = useState(null);

  const isAdmin = ['super_admin', 'admin'].includes(userRole?.toLowerCase());
  const settingsNavSections = useMemo(
    () => (isAdmin ? BASE_SETTINGS_SECTIONS : BASE_SETTINGS_SECTIONS.filter((s) => s.id !== 'platforms')),
    [isAdmin],
  );
  const redirectUri = typeof window !== 'undefined' ? `${window.location.origin}/oauth/callback` : 'http://localhost:5173/oauth/callback';

  const getEffectiveDateRange = useCallback(() => {
    if (datePreset === 'custom') {
      if (customDateFrom && customDateTo) return { dateFrom: customDateFrom, dateTo: customDateTo };
      return getDateRangeFromPreset('last7');
    }
    return getDateRangeFromPreset(datePreset) || getDateRangeFromPreset('last7');
  }, [datePreset, customDateFrom, customDateTo]);

  const getRedditDateRange = useCallback(() => {
    if (redditDatePreset === 'custom') {
      if (redditCustomFrom && redditCustomTo) return { dateFrom: redditCustomFrom, dateTo: redditCustomTo };
      return getDateRangeFromPreset('last7');
    }
    return getDateRangeFromPreset(redditDatePreset) || getDateRangeFromPreset('last7');
  }, [redditDatePreset, redditCustomFrom, redditCustomTo]);

  const getFacebookDateRange = useCallback(() => {
    if (facebookDatePreset === 'custom') {
      if (facebookCustomFrom && facebookCustomTo) return { dateFrom: facebookCustomFrom, dateTo: facebookCustomTo };
      return getDateRangeFromPreset('last7');
    }
    return getDateRangeFromPreset(facebookDatePreset) || getDateRangeFromPreset('last7');
  }, [facebookDatePreset, facebookCustomFrom, facebookCustomTo]);

  const getGA4DateRange = useCallback(() => {
    if (ga4DatePreset === 'custom') {
      if (ga4CustomFrom && ga4CustomTo) return { dateFrom: ga4CustomFrom, dateTo: ga4CustomTo };
      return getDateRangeFromPreset('last7');
    }
    return getDateRangeFromPreset(ga4DatePreset) || getDateRangeFromPreset('last7');
  }, [ga4DatePreset, ga4CustomFrom, ga4CustomTo]);

  const fetchCredentials = useCallback(async () => {
    if (!effectiveAgencyId) {
      setLoadingCreds(false);
      setCredentials([]);
      return;
    }
    setLoadingCreds(true);
    try {
      const { data, error } = await supabase.from('agency_platform_credentials').select('*').eq('agency_id', effectiveAgencyId);
      if (error) throw error;
      setCredentials(data || []);
    } catch (err) {
      console.warn('[Settings] credentials error:', err);
      setCredentials([]);
    } finally { setLoadingCreds(false); }
  }, [effectiveAgencyId]);

  const fetchAccounts = useCallback(async () => {
    if (!effectiveAgencyId) {
      setLoadingAccounts(false);
      setAccounts([]);
      return;
    }
    setLoadingAccounts(true);
    try {
      const { data, error } = await supabase.from('client_platform_accounts').select('*').eq('agency_id', effectiveAgencyId).order('account_name');
      if (error) throw error;
      setAccounts(data || []);
    } catch (err) {
      console.warn('[Settings] accounts error:', err);
      setAccounts([]);
    } finally { setLoadingAccounts(false); }
  }, [effectiveAgencyId]);

  const fetchSyncLogs = useCallback(async (customerId, platform = 'google_ads') => {
    if (!effectiveAgencyId) return;
    try {
      const { data, error } = await supabase
        .from('sync_log')
        .select('*')
        .eq('agency_id', effectiveAgencyId)
        .eq('customer_id', customerId)
        .eq('platform', platform)
        .order('started_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      setSyncLogs((prev) => ({ ...prev, [`${platform}:${customerId}`]: data || [] }));
    } catch (err) {
      console.warn('[Settings] sync_log error:', err);
    }
  }, [effectiveAgencyId]);

  const getLastDayOfData = useCallback((customerId, platform) => {
    const key = `${platform}:${customerId}`;
    if (lastDayByAccount[key]) return lastDayByAccount[key];
    const logs = syncLogs[key] || [];
    const successLogs = logs.filter((l) => l.status === 'success' || l.status === 'synced');
    if (!successLogs.length) return null;
    return successLogs.reduce((max, l) => (l.date_to && (!max || l.date_to > max)) ? l.date_to : max, null);
  }, [syncLogs, lastDayByAccount]);

  useEffect(() => { fetchCredentials(); }, [fetchCredentials]);
  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const fetchLastDayPerAccount = useCallback(async (platform, customerIds) => {
    if (!effectiveAgencyId || !customerIds?.length) return;
    try {
      const { data, error } = await supabase
        .from('sync_log')
        .select('customer_id, date_to')
        .eq('agency_id', effectiveAgencyId)
        .eq('platform', platform)
        .in('customer_id', customerIds)
        .in('status', ['success', 'synced']);
      if (error) throw error;
      const byCustomer = {};
      (data || []).forEach((r) => {
        if (r.date_to && (!byCustomer[r.customer_id] || r.date_to > byCustomer[r.customer_id])) {
          byCustomer[r.customer_id] = r.date_to;
        }
      });
      setLastDayByAccount((prev) => ({ ...prev, ...Object.fromEntries(Object.entries(byCustomer).map(([k, v]) => [`${platform}:${k}`, v])) }));
    } catch (err) {
      console.warn('[Settings] lastDay fetch error:', err);
    }
  }, [effectiveAgencyId]);

  useEffect(() => {
    const gads = accounts.filter((a) => a.is_active && a.platform === 'google_ads').map((a) => a.platform_customer_id);
    const reddit = accounts.filter((a) => a.is_active && a.platform === 'reddit').map((a) => a.platform_customer_id);
    const facebook = accounts.filter((a) => a.is_active && a.platform === 'facebook').map((a) => a.platform_customer_id);
    const ga4 = accounts.filter((a) => a.is_active && a.platform === 'ga4').map((a) => a.platform_customer_id);
    if (gads.length) fetchLastDayPerAccount('google_ads', gads);
    if (reddit.length) fetchLastDayPerAccount('reddit', reddit);
    if (facebook.length) fetchLastDayPerAccount('facebook', facebook);
    if (ga4.length) fetchLastDayPerAccount('ga4', ga4);
  }, [accounts, effectiveAgencyId, fetchLastDayPerAccount]);

  useEffect(() => {
    if (activeAgency) {
      setAgencyForm({
        agency_name: activeAgency.agency_name || '',
        primary_color: activeAgency.primary_color || '#E12627',
        secondary_color: activeAgency.secondary_color || '',
        accent_color: activeAgency.accent_color || '#0083CB',
        sidebar_bg: activeAgency.sidebar_bg || '',
        sidebar_text: activeAgency.sidebar_text || '',
        font_family: activeAgency.font_family || '',
        logo_url: activeAgency.logo_url || '',
      });
    }
  }, [activeAgency]);

  const insertSyncLog = useCallback(async (customerId, chunk, platform = 'google_ads') => {
    if (!effectiveAgencyId) return;
    try {
      await supabase.from('sync_log').insert({
        agency_id: effectiveAgencyId,
        platform,
        customer_id: customerId,
        sync_type: 'chunk',
        date_from: chunk.dateFrom,
        date_to: chunk.dateTo,
        status: chunk.status,
        rows_synced: chunk.rowsSynced || 0,
        error_message: chunk.errorMessage || null,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('[Settings] sync_log insert error:', err);
    }
  }, [effectiveAgencyId]);

  const syncRedditWithChunking = useCallback(async (customerId, dateFrom, dateTo, onProgress) => {
    const chunks = [];
    const start = new Date(dateFrom);
    const end = new Date(dateTo);
    const cur = new Date(start);
    while (cur <= end) {
      const chunkEnd = new Date(cur);
      chunkEnd.setDate(chunkEnd.getDate() + 2);
      if (chunkEnd > end) chunkEnd.setTime(end.getTime());
      chunks.push({ start: cur.toISOString().split('T')[0], end: chunkEnd.toISOString().split('T')[0] });
      cur.setDate(chunkEnd.getDate() + 1);
    }
    let totalRows = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (onProgress) onProgress({ current: i + 1, total: chunks.length, dateFrom: chunk.start, dateTo: chunk.end, status: `Syncing ${chunk.start} → ${chunk.end} (${i + 1}/${chunks.length})`, rows: totalRows });
      const { data, error } = await supabase.functions.invoke('reddit-full-sync', {
        body: {
          customer_id: customerId,
          mode: 'backfill',
          date_from: chunk.start,
          date_to: chunk.end,
        },
      });
      if (error) {
        await insertSyncLog(customerId, { dateFrom: chunk.start, dateTo: chunk.end, status: 'error', rowsSynced: 0, errorMessage: error.message }, 'reddit');
        continue;
      }
      const chunkRows = data?.total_rows ?? 0;
      totalRows += chunkRows;
      await insertSyncLog(customerId, { dateFrom: chunk.start, dateTo: chunk.end, status: 'success', rowsSynced: chunkRows }, 'reddit');
    }
    return { success: true, totalRows };
  }, [insertSyncLog]);

  const handleSyncAccount = async (account) => {
    setSyncingAccount(account.id);
    setSyncProgress({ accountId: account.id, current: 0, total: 0, dateFrom: '', dateTo: '', status: '', rows: 0 });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { showNotification('Please sign in first.'); return; }

      const { dateFrom, dateTo } = getEffectiveDateRange();
      const result = await syncWithChunking({
        customerId: account.platform_customer_id,
        agencyId: effectiveAgencyId,
        dateFrom,
        dateTo,
        accessToken: session.access_token,
        chunkDays: 5,
        onProgress: (p) => setSyncProgress({ accountId: account.id, current: p.current, total: p.total, dateFrom: p.dateFrom, dateTo: p.dateTo, status: p.status, rows: p.rows }),
        onChunkComplete: (chunk) => insertSyncLog(account.platform_customer_id, chunk, 'google_ads'),
      });

      if (result.success) {
        showNotification(`Synced ${account.account_name || account.platform_customer_id}: ${result.totalRows} rows`);
      } else {
        showNotification(`Sync completed with errors: ${result.totalRows} rows.`);
      }

      const token = session.access_token;
      try {
        const statusResult = await syncStatusAndGeo({ customerId: account.platform_customer_id, accessToken: token });
        if (statusResult.campaigns || statusResult.adgroups || statusResult.keywords) showNotification('Status synced');
      } catch (e) { console.warn('[Settings] syncStatusAndGeo:', e); }

      await fetchAccounts();
      await fetchSyncLogs(account.platform_customer_id, 'google_ads');
    } catch (err) {
      showNotification(err.message || 'Sync failed');
    } finally {
      setSyncingAccount(null);
      setSyncProgress(null);
    }
  };

  const handleSyncAll = async () => {
    const activeAccounts = accounts.filter((a) => a.is_active && a.platform === 'google_ads');
    if (activeAccounts.length === 0) {
      showNotification('No active Google Ads accounts to sync.');
      return;
    }
    setSyncingAll(true);
    const { dateFrom, dateTo } = getEffectiveDateRange();
    let totalRowsAll = 0;
    for (const account of activeAccounts) {
      setSyncProgress({ accountId: account.id, accountName: account.account_name || account.platform_customer_id, current: 0, total: 0, dateFrom: '', dateTo: '', status: '', rows: 0 });
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) break;
        const result = await syncWithChunking({
          customerId: account.platform_customer_id,
          agencyId: effectiveAgencyId,
          dateFrom,
          dateTo,
          accessToken: session.access_token,
          chunkDays: 5,
          onProgress: (p) => setSyncProgress({ accountId: account.id, accountName: account.account_name || account.platform_customer_id, current: p.current, total: p.total, dateFrom: p.dateFrom, dateTo: p.dateTo, status: p.status, rows: p.rows }),
          onChunkComplete: (chunk) => insertSyncLog(account.platform_customer_id, chunk, 'google_ads'),
        });
        totalRowsAll += result.totalRows;
        const token = session.access_token;
        try { await syncStatusAndGeo({ customerId: account.platform_customer_id, accessToken: token }); } catch (e) {}
        await fetchSyncLogs(account.platform_customer_id, 'google_ads');
      } catch {}
    }
    showNotification(`Sync complete: ${totalRowsAll} total rows.`);
    await fetchAccounts();
    setSyncingAll(false);
    setSyncProgress(null);
  };

  const handleConnectGoogleAds = async () => {
    if (!effectiveAgencyId) { showNotification('Select an agency first.'); return; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { showNotification('Please sign in first.'); return; }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/oauth-connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'get_auth_url', platform: 'google_ads', redirect_uri: redirectUri, agency_id: effectiveAgencyId }),
      });
      const data = await res.json();
      if (!res.ok || !data.auth_url) throw new Error(data.error || data.message || 'Failed to get auth URL');
      window.location.href = data.auth_url;
    } catch (err) {
      showNotification(err.message || 'Failed to connect');
    }
  };

  const handleConnectGA4 = async (cred = null) => {
    if (!effectiveAgencyId) {
      showNotification(isSuperAdmin ? 'Select an agency first.' : 'No agency assigned. Contact your admin.');
      return;
    }
    setConnectingGA4(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showNotification('Please sign in first.');
        return;
      }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ga4-oauth-connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({
          action: 'get_auth_url',
          redirect_uri: redirectUri,
          agency_id: effectiveAgencyId,
          state: JSON.stringify({
            agency_id: effectiveAgencyId,
            platform: 'ga4',
            credential_id: cred?.id ?? null,
          }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.message || 'Failed to get auth URL');
      const url = data?.auth_url;
      if (url) {
        window.location.href = url;
      } else {
        throw new Error(data?.error || 'No auth URL returned');
      }
    } catch (err) {
      showNotification(err?.message || 'Failed to connect GA4');
    } finally {
      setConnectingGA4(false);
    }
  };

  const handleConnectFacebook = async () => {
    if (!effectiveAgencyId) {
      showNotification(isSuperAdmin ? 'Select an agency first.' : 'No agency assigned. Contact your admin.');
      return;
    }
    setConnectingFacebook(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showNotification('Please sign in first.');
        return;
      }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/fb-oauth-connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          action: 'get_auth_url',
          redirect_uri: redirectUri,
          agency_id: effectiveAgencyId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || data?.message || `Failed to start Meta login (${res.status})`);
      }
      const url = data?.auth_url || data?.url;
      if (url) {
        window.location.href = url;
      } else {
        throw new Error(data?.error || 'No auth URL returned');
      }
    } catch (err) {
      showNotification(err?.message || 'Failed to connect Facebook / Meta');
    } finally {
      setConnectingFacebook(false);
    }
  };

  const handleConnectReddit = async () => {
    if (!effectiveAgencyId) {
      showNotification(isSuperAdmin ? 'Select an agency first.' : 'No agency assigned. Contact your admin.');
      return;
    }
    setConnectingReddit(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showNotification('Please sign in first.');
        return;
      }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/reddit-oauth-connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'get_auth_url', redirect_uri: redirectUri, agency_id: effectiveAgencyId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || data?.message || `Failed to connect Reddit (${res.status})`);
      }
      const url = data?.url || data?.auth_url;
      if (url) {
        window.location.href = url;
      } else {
        throw new Error(data?.error || 'No auth URL returned');
      }
    } catch (err) {
      showNotification(err?.message || 'Failed to connect Reddit');
    } finally {
      setConnectingReddit(false);
    }
  };

  const handleDisconnect = async (platform) => {
      setDisconnecting(platform);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const fn = platform === 'reddit'
        ? 'reddit-oauth-connect'
        : platform === 'ga4'
          ? 'ga4-oauth-connect'
          : platform === 'facebook'
            ? 'fb-oauth-connect'
            : 'oauth-connect';
      const body = (platform === 'reddit' || platform === 'ga4' || platform === 'facebook')
        ? { action: 'disconnect', agency_id: effectiveAgencyId }
        : { action: 'disconnect', platform, agency_id: effectiveAgencyId };
      const { data, error } = await supabase.functions.invoke(fn, {
        body,
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      if (platform === 'google_ads' && !data?.success && data?.error) throw new Error(data.error);
      await fetchCredentials();
      showNotification('Disconnected');
    } catch (err) {
      showNotification(err?.message || 'Failed to disconnect');
    } finally { setDisconnecting(null); }
  };

  /** GA4: deactivate one credential row (frontend → Supabase; no edge function). */
  const handleDisconnectGa4Credential = async (credentialId) => {
    if (!effectiveAgencyId || !credentialId) return;
    setDisconnectingGa4CredId(credentialId);
    try {
      const { error } = await supabase
        .from('agency_platform_credentials')
        .update({ is_active: false })
        .eq('id', credentialId)
        .eq('agency_id', effectiveAgencyId)
        .eq('platform', 'ga4');
      if (error) throw error;
      await fetchCredentials();
      showNotification('Google account disconnected');
    } catch (err) {
      showNotification(err?.message || 'Failed to disconnect this account');
    } finally {
      setDisconnectingGa4CredId(null);
    }
  };

  /** GA4: assign which OAuth credential syncs a property. */
  const handleGa4PropertyCredentialChange = async (account, credentialId) => {
    if (!account?.id) return;
    const nextId = credentialId || null;
    setReassigningGa4PropertyId(account.id);
    try {
      const { error } = await supabase
        .from('client_platform_accounts')
        .update({ credential_id: nextId })
        .eq('id', account.id)
        .eq('agency_id', effectiveAgencyId)
        .eq('platform', 'ga4');
      if (error) throw error;
      await fetchAccounts();
      showNotification('Credential updated for this property');
    } catch (err) {
      showNotification(err?.message || 'Failed to update credential');
    } finally {
      setReassigningGa4PropertyId(null);
    }
  };

  const handleToggleAccount = async (account) => {
    setTogglingAccount(account.id);
    try {
      const { error } = await supabase.from('client_platform_accounts').update({ is_active: !account.is_active }).eq('id', account.id);
      if (error) throw error;
      await fetchAccounts();
      showNotification(account.is_active ? 'Account deactivated' : 'Account activated');
    } catch (err) {
      showNotification(err?.message || 'Failed to update');
    } finally { setTogglingAccount(null); }
  };

  const handleToggleAutoSync = async (account) => {
    setTogglingAccount(account.id);
    try {
      const { error } = await supabase.from('client_platform_accounts').update({ auto_sync_enabled: !account.auto_sync_enabled }).eq('id', account.id);
      if (error) throw error;
      await fetchAccounts();
      showNotification(account.auto_sync_enabled ? 'Auto-sync disabled' : 'Auto-sync enabled');
    } catch (err) {
      showNotification(err?.message || 'Failed to update');
    } finally { setTogglingAccount(null); }
  };

  const handleToggleHipaaCompliance = async (account) => {
    setTogglingAccount(account.id);
    try {
      const next = !(account.hipaa_compliant === true);
      const { error } = await supabase
        .from('client_platform_accounts')
        .update({ hipaa_compliant: next })
        .eq('id', account.id);
      if (error) throw error;
      await fetchAccounts();
      showNotification(next ? 'HIPAA mode on — use CSV upload for this location' : 'HIPAA mode off — API sync available');
    } catch (err) {
      showNotification(err?.message || 'Failed to update HIPAA setting');
    } finally {
      setTogglingAccount(null);
    }
  };

  const handleSyncRedditAccount = async (account) => {
    setSyncingAccount(account.id);
    setSyncProgress({ accountId: account.id, status: 'Starting...' });
    try {
      const { dateFrom, dateTo } = getRedditDateRange();
      const result = await syncRedditWithChunking(
        account.platform_customer_id, dateFrom, dateTo,
        (p) => setSyncProgress({ accountId: account.id, accountName: account.account_name, ...p })
      );
      showNotification(`Synced ${account.account_name}: ${result.totalRows} rows`);
      await supabase.from('client_platform_accounts').update({ last_sync_at: new Date().toISOString(), sync_status: 'success' }).eq('id', account.id);
      await fetchAccounts();
      await fetchSyncLogs(account.platform_customer_id, 'reddit');
    } catch (err) {
      showNotification(err?.message || 'Reddit sync failed');
    } finally {
      setSyncingAccount(null);
      setSyncProgress(null);
    }
  };

  const syncFacebookWithChunking = useCallback(async (customerId, dateFrom, dateTo, onProgress) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { success: false, totalRows: 0, errorMessage: 'Please sign in first.' };
    }
    const chunks = [];
    const start = new Date(dateFrom);
    const end = new Date(dateTo);
    const cur = new Date(start);
    while (cur <= end) {
      const chunkEnd = new Date(cur);
      chunkEnd.setDate(chunkEnd.getDate() + 2);
      if (chunkEnd > end) chunkEnd.setTime(end.getTime());
      chunks.push({ start: cur.toISOString().split('T')[0], end: chunkEnd.toISOString().split('T')[0] });
      cur.setDate(chunkEnd.getDate() + 1);
    }
    let totalRows = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (onProgress) onProgress({ current: i + 1, total: chunks.length, dateFrom: chunk.start, dateTo: chunk.end, status: `Syncing ${chunk.start} → ${chunk.end} (${i + 1}/${chunks.length})`, rows: totalRows });
      const res = await fetch(`${SUPABASE_URL}/functions/v1/fb-full-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          customer_id: customerId,
          mode: 'backfill',
          date_from: chunk.start,
          date_to: chunk.end,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        const errSnippet = text.length > 1200 ? `${text.slice(0, 1200)}…` : text;
        await insertSyncLog(customerId, { dateFrom: chunk.start, dateTo: chunk.end, status: 'error', rowsSynced: 0, errorMessage: errSnippet }, 'facebook');
        return { success: false, totalRows, errorMessage: errSnippet };
      }
      const chunkRows = parseInt((text.match(/Total:\s*(\d+)/) || [])[1], 10) || 0;
      totalRows += chunkRows;
      await insertSyncLog(customerId, { dateFrom: chunk.start, dateTo: chunk.end, status: 'success', rowsSynced: chunkRows }, 'facebook');
    }
    return { success: true, totalRows };
  }, [insertSyncLog]);

  const syncGA4WithChunking = useCallback(async (customerId, dateFrom, dateTo, onProgress) => {
    const chunks = [];
    const start = new Date(dateFrom);
    const end = new Date(dateTo);
    const cur = new Date(start);
    while (cur <= end) {
      const chunkEnd = new Date(cur);
      chunkEnd.setDate(chunkEnd.getDate() + 4);
      if (chunkEnd > end) chunkEnd.setTime(end.getTime());
      chunks.push({ start: cur.toISOString().split('T')[0], end: chunkEnd.toISOString().split('T')[0] });
      cur.setDate(chunkEnd.getDate() + 1);
    }
    let totalRows = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (onProgress) onProgress({ current: i + 1, total: chunks.length, dateFrom: chunk.start, dateTo: chunk.end, status: `Syncing ${chunk.start} → ${chunk.end} (${i + 1}/${chunks.length})`, rows: totalRows });
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(SUPABASE_URL + '/functions/v1/ga4-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
        body: JSON.stringify({ customer_id: customerId, mode: 'backfill', date_from: chunk.start, date_to: chunk.end }),
      });
      if (!res.ok) {
        const errMsg = await res.text().catch(() => res.statusText);
        console.error('[ga4-sync] chunk error:', errMsg);
        await insertSyncLog(customerId, { dateFrom: chunk.start, dateTo: chunk.end, status: 'error', rowsSynced: 0, errorMessage: errMsg }, 'ga4');
        continue;
      }
      const text = await res.text();
      const chunkRows = parseInt((text.match(/Total:\s*(\d+)/) || [])[1]) || 0;
      totalRows += chunkRows;
      await insertSyncLog(customerId, { dateFrom: chunk.start, dateTo: chunk.end, status: 'success', rowsSynced: chunkRows }, 'ga4');
    }
    return { success: true, totalRows };
  }, [insertSyncLog]);

  const handleSyncFacebookAccount = async (account) => {
    setSyncingAccount(account.id);
    setSyncProgress({ accountId: account.id, status: 'Starting...' });
    try {
      const { dateFrom, dateTo } = getFacebookDateRange();
      const result = await syncFacebookWithChunking(
        account.platform_customer_id, dateFrom, dateTo,
        (p) => setSyncProgress({ accountId: account.id, accountName: account.account_name, ...p })
      );
      if (!result.success) {
        showNotification(result.errorMessage || 'Facebook sync failed');
        await supabase.from('client_platform_accounts').update({ last_sync_at: new Date().toISOString(), sync_status: 'error' }).eq('id', account.id);
      } else {
        showNotification(`Synced ${account.account_name}: ${result.totalRows} rows`);
        await supabase.from('client_platform_accounts').update({ last_sync_at: new Date().toISOString(), sync_status: 'success' }).eq('id', account.id);
      }
      await fetchAccounts();
      await fetchSyncLogs(account.platform_customer_id, 'facebook');
    } catch (err) {
      showNotification(err?.message || 'Facebook sync failed');
    } finally {
      setSyncingAccount(null);
      setSyncProgress(null);
    }
  };

  const handleSyncGa4Account = async (account) => {
    setSyncingAccount(account.id);
    setSyncProgress({ accountId: account.id, status: 'Starting...' });
    try {
      const { dateFrom, dateTo } = getGA4DateRange();
      const result = await syncGA4WithChunking(
        account.platform_customer_id, dateFrom, dateTo,
        (p) => setSyncProgress({ accountId: account.id, accountName: account.account_name, ...p })
      );
      showNotification(`Synced ${account.account_name}: ${result.totalRows} rows`);
      await supabase.from('client_platform_accounts').update({ last_sync_at: new Date().toISOString(), sync_status: 'success' }).eq('id', account.id);
      await fetchAccounts();
      await fetchSyncLogs(account.platform_customer_id, 'ga4');
    } catch (err) {
      showNotification(err?.message || 'GA4 sync failed');
    } finally {
      setSyncingAccount(null);
      setSyncProgress(null);
    }
  };

  const handleSyncAllGa4 = async () => {
    const ga4Accounts = accounts.filter((a) => a.is_active && a.platform === 'ga4');
    if (!ga4Accounts.length) { showNotification('No active GA4 accounts.'); return; }
    setSyncingAll(true);
    const { dateFrom, dateTo } = getGA4DateRange();
    let totalAll = 0;
    try {
      for (const account of ga4Accounts) {
        setSyncProgress({ accountId: account.id, accountName: account.account_name, status: 'Starting...' });
        const result = await syncGA4WithChunking(
          account.platform_customer_id, dateFrom, dateTo,
          (p) => setSyncProgress({ accountId: account.id, accountName: account.account_name, ...p })
        );
        totalAll += result.totalRows;
        await supabase.from('client_platform_accounts').update({ last_sync_at: new Date().toISOString(), sync_status: 'success' }).eq('id', account.id);
        await fetchSyncLogs(account.platform_customer_id, 'ga4');
      }
      showNotification(`GA4 sync complete: ${totalAll} total rows`);
      await fetchAccounts();
    } catch (err) {
      showNotification(err?.message || 'Sync failed');
    } finally {
      setSyncingAll(false);
      setSyncProgress(null);
    }
  };

  const handleSyncAllFacebook = async () => {
    const facebookAccounts = accounts.filter((a) => a.is_active && a.platform === 'facebook');
    if (!facebookAccounts.length) { showNotification('No active Facebook accounts.'); return; }
    setSyncingAll(true);
    const { dateFrom, dateTo } = getFacebookDateRange();
    let totalAll = 0;
    try {
      for (const account of facebookAccounts) {
        setSyncProgress({ accountId: account.id, accountName: account.account_name, status: 'Starting...' });
        const result = await syncFacebookWithChunking(
          account.platform_customer_id, dateFrom, dateTo,
          (p) => setSyncProgress({ accountId: account.id, accountName: account.account_name, ...p })
        );
        if (!result.success) {
          showNotification(`${account.account_name || account.platform_customer_id}: ${result.errorMessage || 'sync failed'}`);
          await supabase.from('client_platform_accounts').update({ last_sync_at: new Date().toISOString(), sync_status: 'error' }).eq('id', account.id);
          await fetchSyncLogs(account.platform_customer_id, 'facebook');
          continue;
        }
        totalAll += result.totalRows;
        await supabase.from('client_platform_accounts').update({ last_sync_at: new Date().toISOString(), sync_status: 'success' }).eq('id', account.id);
        await fetchSyncLogs(account.platform_customer_id, 'facebook');
      }
      showNotification(`Facebook sync complete: ${totalAll} total rows`);
      await fetchAccounts();
    } catch (err) {
      showNotification(err?.message || 'Sync failed');
    } finally {
      setSyncingAll(false);
      setSyncProgress(null);
    }
  };

  const handleSyncAllReddit = async () => {
    const redditAccounts = accounts.filter((a) => a.is_active && a.platform === 'reddit');
    if (!redditAccounts.length) { showNotification('No active Reddit accounts.'); return; }
    setSyncingAll(true);
    const { dateFrom, dateTo } = getRedditDateRange();
    let totalAll = 0;
    try {
      for (const account of redditAccounts) {
        setSyncProgress({ accountId: account.id, accountName: account.account_name, status: 'Starting...' });
        const result = await syncRedditWithChunking(
          account.platform_customer_id, dateFrom, dateTo,
          (p) => setSyncProgress({ accountId: account.id, accountName: account.account_name, ...p })
        );
        totalAll += result.totalRows;
        await supabase.from('client_platform_accounts').update({ last_sync_at: new Date().toISOString(), sync_status: 'success' }).eq('id', account.id);
        await fetchSyncLogs(account.platform_customer_id, 'reddit');
      }
      showNotification(`Reddit sync complete: ${totalAll} total rows`);
      await fetchAccounts();
    } catch (err) {
      showNotification(err?.message || 'Sync failed');
    } finally {
      setSyncingAll(false);
      setSyncProgress(null);
    }
  };

  const handleSaveAgency = async () => {
    if (!activeAgency?.id) return;
    setSavingAgency(true);
    try {
      const { error } = await supabase.from('agencies').update({
        agency_name: agencyForm.agency_name,
        primary_color: agencyForm.primary_color || null,
        secondary_color: agencyForm.secondary_color || null,
        accent_color: agencyForm.accent_color || null,
        sidebar_bg: agencyForm.sidebar_bg || null,
        sidebar_text: agencyForm.sidebar_text || null,
        font_family: agencyForm.font_family || null,
        logo_url: agencyForm.logo_url || null,
      }).eq('id', activeAgency.id);
      if (error) throw error;
      const root = document.documentElement;
      if (agencyForm.primary_color) { root.style.setProperty('--primary-color', agencyForm.primary_color); root.style.setProperty('--primary', agencyForm.primary_color); }
      if (agencyForm.secondary_color) root.style.setProperty('--secondary-color', agencyForm.secondary_color);
      if (agencyForm.accent_color) { root.style.setProperty('--accent-color', agencyForm.accent_color); root.style.setProperty('--accent', agencyForm.accent_color); }
      if (agencyForm.sidebar_bg) root.style.setProperty('--sidebar-bg', agencyForm.sidebar_bg);
      if (agencyForm.sidebar_text) root.style.setProperty('--sidebar-text', agencyForm.sidebar_text);
      if (agencyForm.font_family) root.style.setProperty('--font-family', agencyForm.font_family);
      showNotification('Branding saved');
    } catch (err) {
      showNotification(err?.message || 'Failed to save');
    } finally { setSavingAgency(false); }
  };

  const handleLogoUpload = async (e) => {
    const file = e?.target?.files?.[0];
    if (!file || !effectiveAgencyId) return;
    setUploadingLogo(true);
    try {
      const path = `${effectiveAgencyId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const { error } = await supabase.storage.from('agency-logos').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('agency-logos').getPublicUrl(path);
      setAgencyForm((f) => ({ ...f, logo_url: publicUrl }));
      showNotification('Logo uploaded');
    } catch (err) {
      showNotification(err?.message || 'Logo upload failed');
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  const handleSignOut = async () => { await signOut(); window.location.href = '/login'; };

  const gadsCred = credentials.find((c) => c.platform === 'google_ads' && c.is_active);
  const redditCred = credentials.find((c) => c.platform === 'reddit' && c.is_active);
  const facebookCred = credentials.find((c) => c.platform === 'facebook' && c.is_active);
  const facebookNeedsReconnect = !!(
    facebookCred &&
    (facebookCred.last_sync_status === 'error' ||
      (facebookCred.last_error && /session|expired|access token|oauth|190/i.test(String(facebookCred.last_error))))
  );
  const ga4Credentials = credentials.filter((c) => c.platform === 'ga4');
  const ga4ActiveCredentials = ga4Credentials.filter((c) => c.is_active);
  const hasGa4Connected = ga4ActiveCredentials.length > 0;
  const activeGadsAccounts = accounts.filter((a) => a.is_active && a.platform === 'google_ads');
  const activeRedditAccounts = accounts.filter((a) => a.is_active && a.platform === 'reddit');
  const activeFacebookAccounts = accounts.filter((a) => a.is_active && a.platform === 'facebook');
  const activeGa4Accounts = accounts.filter((a) => a.is_active && a.platform === 'ga4');

  const platformLabels = { google_ads: 'Google Ads', reddit: 'Reddit', facebook: 'Facebook / Meta', ga4: 'GA4 / Web Analytics' };
  const ga4CredentialSelectOptions = ga4ActiveCredentials.map((c) => ({
    id: c.id,
    label: c.credential_label || c.google_email || 'Google account',
  }));

  const AccountsTable = ({
    platform,
    accountsList,
    onSync,
    onSyncAll,
    datePresetKey,
    setDatePresetKey,
    customFrom,
    customTo,
    setCustomFrom,
    setCustomTo,
    ga4CredentialOptions,
    onGa4CredentialChange,
    ga4CredentialSavingAccountId,
  }) => {
    const presets = DATE_PRESETS;
    const getRange = platform === 'reddit' ? getRedditDateRange : platform === 'facebook' ? getFacebookDateRange : platform === 'ga4' ? getGA4DateRange : getEffectiveDateRange;
    const label = platformLabels[platform] || platform;
    const colCount = platform === 'google_ads' ? 9 : platform === 'ga4' ? 9 : 8;
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
          <div>
            <h4 style={{ margin: 0 }}>{label} Accounts</h4>
            <p className="help-text" style={{ margin: '4px 0 0' }}>
              {label} accounts linked to your agency.
            </p>
          </div>
          {accountsList.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {presets.map((p) => (
                <button key={p.key} type="button" className={`btn btn-sm ${datePresetKey === p.key ? 'btn-primary' : 'btn-outline'}`} onClick={() => setDatePresetKey(p.key)}>{p.label}</button>
              ))}
              {datePresetKey === 'custom' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ padding: '6px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6 }} />
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>to</span>
                  <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ padding: '6px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6 }} />
                </div>
              )}
              <button type="button" className="btn btn-primary btn-sm" onClick={onSyncAll} disabled={syncingAll}>
                {syncingAll ? 'Syncing…' : `Sync All (${accountsList.length})`}
              </button>
            </div>
          )}
        </div>

        {syncProgress && (
          <div className="insight-banner info" style={{ marginBottom: 12 }}>
            <span className="icon">⏳</span>
            <div>{syncProgress.accountName && <strong>{syncProgress.accountName}: </strong>}{syncProgress.status || 'Syncing…'}</div>
          </div>
        )}

        {loadingAccounts ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading</p>
        ) : accountsList.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No {label} accounts yet.</p>
        ) : (
          <div className="panel">
            <div className="panel-body no-padding">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 28 }} />
                    <th>Account Name</th>
                    <th>{platform === 'google_ads' ? 'Customer ID' : platform === 'ga4' ? 'Property ID' : 'Account ID'}</th>
                    {platform === 'google_ads' && <th>Auto-Sync</th>}
                    {platform === 'ga4' && <th>OAuth credential</th>}
                    <th>Last Synced</th>
                    <th>Last Day of Data</th>
                    <th>Last Status</th>
                    <th>Active</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accountsList.map((acc) => {
                    const syncKey = `${platform}:${acc.platform_customer_id}`;
                    const isExpanded = expandedSyncHistory === syncKey;
                    const logs = syncLogs[syncKey] || [];
                    const lastDay = getLastDayOfData(acc.platform_customer_id, platform);
                    return (
                      <React.Fragment key={acc.id}>
                        <tr>
                          <td>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              style={{ padding: '2px 6px', minWidth: 24 }}
                              onClick={() => {
                                setExpandedSyncHistory(isExpanded ? null : syncKey);
                                if (!isExpanded) fetchSyncLogs(acc.platform_customer_id, platform);
                              }}
                              title="Sync History"
                            >
                              {isExpanded ? '▼' : '▶'}
                            </button>
                          </td>
                          <td>{acc.account_name || ''}</td>
                          <td>{acc.platform_customer_id}</td>
                          {platform === 'google_ads' && (
                            <td>
                              <label className="admin-toggle">
                                <input type="checkbox" checked={!!acc.auto_sync_enabled} onChange={() => handleToggleAutoSync(acc)} disabled={togglingAccount === acc.id} />
                                <span />
                              </label>
                            </td>
                          )}
                          {platform === 'ga4' && (
                            <td style={{ minWidth: 200 }}>
                              <select
                                className="client-selector"
                                style={{ width: '100%', maxWidth: 260, fontSize: 12, padding: '6px 8px' }}
                                value={acc.credential_id || ''}
                                onChange={(e) => onGa4CredentialChange?.(acc, e.target.value || null)}
                                disabled={ga4CredentialSavingAccountId === acc.id || !ga4CredentialOptions?.length}
                              >
                                <option value="">{ga4CredentialOptions?.length ? 'Select credential…' : 'No active credentials'}</option>
                                {(ga4CredentialOptions || []).map((opt) => (
                                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                                ))}
                              </select>
                            </td>
                          )}
                          <td>{formatRelativeTime(acc.last_sync_at)}</td>
                          <td>{lastDay || '—'}</td>
                          <td><span className={`badge ${statusBadge(acc.sync_status || acc.last_sync_status)}`}>{acc.sync_status || acc.last_sync_status || 'never'}</span></td>
                          <td>
                            <button type="button" className={`btn btn-sm ${acc.is_active ? 'btn-outline' : 'btn-primary'}`} onClick={() => handleToggleAccount(acc)} disabled={togglingAccount === acc.id}>
                              {togglingAccount === acc.id ? '…' : acc.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          </td>
                          <td>
                            <button type="button" className="btn btn-accent btn-sm" onClick={() => onSync(acc)} disabled={syncingAccount === acc.id || syncingAll}>
                              {syncingAccount === acc.id ? 'Syncing…' : 'Sync Now'}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={colCount} style={{ padding: 0, verticalAlign: 'top', borderTop: 'none' }}>
                              <div style={{ padding: 12, background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-muted)' }}>Sync History</div>
                                {logs.length === 0 ? (
                                  <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: 0 }}>No sync history yet.</p>
                                ) : (
                                  <table className="data-table" style={{ fontSize: 12 }}>
                                    <thead><tr><th>Date Range</th><th>Status</th><th>Rows</th><th>Time</th></tr></thead>
                                    <tbody>
                                      {logs.map((log) => (
                                        <tr key={log.id}>
                                          <td>{log.date_from} – {log.date_to}</td>
                                          <td><span className={`badge ${statusBadge(log.status)}`}>{log.status}</span></td>
                                          <td>{log.rows_synced ?? 0}</td>
                                          <td>{log.started_at ? new Date(log.started_at).toLocaleString() : '—'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="page-section active" id="page-settings">
      <div className="page-content" style={{ display: 'flex', gap: 0, padding: 0, minHeight: 'calc(100vh - 120px)' }}>
        <aside className="settings-sidebar" style={{ width: 220, minWidth: 220, borderRight: '1px solid var(--border)', padding: '16px 0', background: 'var(--bg-secondary)' }}>
          <div className="sidebar-section-label" style={{ padding: '0 16px 8px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Settings</div>
          {settingsNavSections.map((s) => (
            <a
              key={s.id}
              href="#"
              className={`sidebar-nav-item ${activeSettingsSection === s.id ? 'active' : ''}`}
              style={{ display: 'block', padding: '10px 16px', color: activeSettingsSection === s.id ? 'var(--primary)' : 'inherit', fontSize: 14, textDecoration: 'none', borderLeft: activeSettingsSection === s.id ? '3px solid var(--primary)' : '3px solid transparent' }}
              onClick={(e) => { e.preventDefault(); setActiveSettingsSection(s.id); }}
            >
              {s.label}
            </a>
          ))}
        </aside>

        <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
          {isSuperAdmin && !activeAgencyId && (
            <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>Select an agency from the sidebar dropdown to manage connections.</p>
          )}

          {activeSettingsSection === 'google_ads' && (
            <div className="settings-section">
              <h3>Google Ads</h3>
              <div className="settings-form-group" style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600 }}>Google Ads</span>
                    <span className={`badge ${gadsCred ? 'badge-green' : 'badge-gray'}`}>{gadsCred ? 'Connected' : 'Not connected'}</span>
                  </div>
                  {gadsCred ? (
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => handleDisconnect('google_ads')} disabled={disconnecting === 'google_ads'}>
                      {disconnecting === 'google_ads' ? 'Disconnecting…' : 'Disconnect'}
                    </button>
                  ) : (
                    <button type="button" className="btn btn-primary" onClick={handleConnectGoogleAds}>Connect Google Ads</button>
                  )}
                </div>
              </div>
              <AccountsTable
                platform="google_ads"
                accountsList={activeGadsAccounts}
                onSync={handleSyncAccount}
                onSyncAll={handleSyncAll}
                datePresetKey={datePreset}
                setDatePresetKey={setDatePreset}
                customFrom={customDateFrom}
                customTo={customDateTo}
                setCustomFrom={setCustomDateFrom}
                setCustomTo={setCustomDateTo}
              />
            </div>
          )}

          {activeSettingsSection === 'reddit_ads' && (
            <div className="settings-section">
              <h3>Reddit Ads</h3>
              <div className="settings-form-group" style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600 }}>Reddit Ads</span>
                    <span className={`badge ${redditCred ? 'badge-green' : 'badge-gray'}`}>{redditCred ? 'Connected' : 'Not connected'}</span>
                  </div>
                  {redditCred ? (
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => handleDisconnect('reddit')} disabled={disconnecting === 'reddit'}>
                      {disconnecting === 'reddit' ? 'Disconnecting…' : 'Disconnect'}
                    </button>
                  ) : (
                    <button type="button" className="btn btn-primary" onClick={handleConnectReddit} disabled={connectingReddit}>
                      {connectingReddit ? 'Connecting…' : 'Connect Reddit Ads'}
                    </button>
                  )}
                </div>
              </div>
              <AccountsTable
                platform="reddit"
                accountsList={activeRedditAccounts}
                onSync={handleSyncRedditAccount}
                onSyncAll={handleSyncAllReddit}
                datePresetKey={redditDatePreset}
                setDatePresetKey={setRedditDatePreset}
                customFrom={redditCustomFrom}
                customTo={redditCustomTo}
                setCustomFrom={setRedditCustomFrom}
                setCustomTo={setRedditCustomTo}
              />
            </div>
          )}

          {activeSettingsSection === 'facebook_ads' && (
            <div className="settings-section">
              <h3>Facebook / Meta Ads</h3>
              <div className="settings-form-group" style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600 }}>Facebook / Meta Ads</span>
                    {facebookNeedsReconnect ? (
                      <span className="badge badge-yellow" title={facebookCred?.last_error || 'Token or session issue'}>Reconnect required</span>
                    ) : (
                      <span className={`badge ${facebookCred ? 'badge-green' : 'badge-gray'}`}>{facebookCred ? 'Connected' : 'Not connected'}</span>
                    )}
                  </div>
                  {facebookCred ? (
                    <>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => handleDisconnect('facebook')} disabled={disconnecting === 'facebook'}>
                        {disconnecting === 'facebook' ? 'Disconnecting…' : 'Disconnect'}
                      </button>
                      <button type="button" className="btn btn-primary btn-sm" onClick={handleConnectFacebook} disabled={connectingFacebook}>
                        {connectingFacebook ? 'Opening Meta…' : facebookNeedsReconnect ? 'Reconnect with Meta' : 'Refresh Meta login'}
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-primary" onClick={handleConnectFacebook} disabled={connectingFacebook}>
                      {connectingFacebook ? 'Opening Meta…' : 'Connect Facebook / Meta'}
                    </button>
                  )}
                </div>
                <p className="help-text" style={{ margin: '8px 0 0', maxWidth: 720 }}>
                  After Meta login, sync uses a long-lived token. If login fails with a redirect error, add this exact URL under Meta app → Facebook Login → Settings → Valid OAuth Redirect URIs:
                  {' '}
                  <code style={{ fontSize: 12, wordBreak: 'break-all' }}>{redirectUri}</code>
                </p>
              </div>
              <AccountsTable
                platform="facebook"
                accountsList={activeFacebookAccounts}
                onSync={handleSyncFacebookAccount}
                onSyncAll={handleSyncAllFacebook}
                datePresetKey={facebookDatePreset}
                setDatePresetKey={setFacebookDatePreset}
                customFrom={facebookCustomFrom}
                customTo={facebookCustomTo}
                setCustomFrom={setFacebookCustomFrom}
                setCustomTo={setFacebookCustomTo}
              />
            </div>
          )}

          {activeSettingsSection === 'platforms' && isAdmin && (
            <PlatformManagementSection
              effectiveAgencyId={effectiveAgencyId}
              accounts={accounts}
              loadingAccounts={loadingAccounts}
              fetchAccounts={fetchAccounts}
              showNotification={showNotification}
              syncingAccountId={syncingAccount}
              togglingAccountId={togglingAccount}
              onToggleActive={handleToggleAccount}
              onToggleAutoSync={handleToggleAutoSync}
              onToggleHipaaCompliance={handleToggleHipaaCompliance}
              setSyncingAccount={setSyncingAccount}
            />
          )}

          {activeSettingsSection === 'ga4' && (
            <div className="settings-section">
              <h3>GA4 / Web Analytics</h3>
              <div className="settings-form-group" style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600 }}>GA4</span>
                    <span className={`badge ${hasGa4Connected ? 'badge-green' : 'badge-gray'}`}>
                      {hasGa4Connected ? `${ga4ActiveCredentials.length} Google account${ga4ActiveCredentials.length === 1 ? '' : 's'} connected` : 'Not connected'}
                    </span>
                  </div>
                  <button type="button" className="btn btn-primary btn-sm" onClick={handleConnectGA4} disabled={connectingGA4 || !effectiveAgencyId}>
                    {connectingGA4 ? 'Opening Google…' : (hasGa4Connected ? 'Connect another Google account' : 'Connect GA4')}
                  </button>
                  {hasGa4Connected && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => handleDisconnect('ga4')}
                      disabled={disconnecting === 'ga4'}
                      title="Disconnects all GA4 OAuth connections for this agency (edge function)"
                    >
                      {disconnecting === 'ga4' ? 'Disconnecting all…' : 'Disconnect all GA4'}
                    </button>
                  )}
                </div>
                <p className="help-text" style={{ marginTop: 8 }}>
                  Uses Google OAuth with Analytics Read scope. Reconnect with the same Google account to refresh tokens. Add GA4 properties in Admin → Clients (Property ID). Assign each property to the OAuth account that has access to it.
                </p>
              </div>

              {loadingCreds ? (
                <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>Loading credentials…</p>
              ) : ga4Credentials.length > 0 ? (
                <div className="panel" style={{ marginBottom: 24 }}>
                  <div className="panel-body no-padding">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Google account</th>
                          <th>Email</th>
                          <th>Status</th>
                          <th>Last sync</th>
                          <th style={{ width: 220 }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ga4Credentials.map((cred) => (
                          <tr key={cred.id}>
                            <td>{cred.credential_label || '—'}</td>
                            <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{cred.google_email || '—'}</td>
                            <td>
                              <span className={`badge ${cred.is_active ? 'badge-green' : 'badge-gray'}`}>{cred.is_active ? 'Active' : 'Inactive'}</span>
                            </td>
                            <td>{formatRelativeTime(cred.last_sync_at)}</td>
                            <td style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => handleConnectGA4(cred)}
                                disabled={connectingGA4 || !effectiveAgencyId}
                              >
                                Reconnect
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => handleDisconnectGa4Credential(cred.id)}
                                disabled={disconnectingGa4CredId === cred.id || !cred.is_active}
                              >
                                {disconnectingGa4CredId === cred.id ? 'Disconnecting…' : 'Disconnect'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              <AccountsTable
                platform="ga4"
                accountsList={activeGa4Accounts}
                onSync={handleSyncGa4Account}
                onSyncAll={handleSyncAllGa4}
                datePresetKey={ga4DatePreset}
                setDatePresetKey={setGa4DatePreset}
                customFrom={ga4CustomFrom}
                customTo={ga4CustomTo}
                setCustomFrom={setGa4CustomFrom}
                setCustomTo={setGa4CustomTo}
                ga4CredentialOptions={ga4CredentialSelectOptions}
                onGa4CredentialChange={handleGa4PropertyCredentialChange}
                ga4CredentialSavingAccountId={reassigningGa4PropertyId}
              />
            </div>
          )}

          {activeSettingsSection === 'white_label' && isAdmin && activeAgency && (
            <div className="settings-section">
              <h3>White Label & Branding — {activeAgency?.agency_name || ''}</h3>
              <div className="settings-form-group">
                <label>Agency Name</label>
                <input type="text" value={agencyForm.agency_name} onChange={(e) => setAgencyForm((f) => ({ ...f, agency_name: e.target.value }))} />
              </div>
              <div className="color-swatches" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
                {[['primary_color', 'Primary', '#E12627'], ['secondary_color', 'Secondary', '#666'], ['accent_color', 'Accent', '#0083CB'], ['sidebar_bg', 'Sidebar BG', '#1a1a2e'], ['sidebar_text', 'Sidebar Text', '#fff']].map(([key, label, fallback]) => (
                  <div className="color-swatch" key={key}>
                    <input type="color" value={agencyForm[key] || fallback} onChange={(e) => setAgencyForm((f) => ({ ...f, [key]: e.target.value }))} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <div className="settings-form-group">
                <label>Font Family</label>
                <input type="text" value={agencyForm.font_family} onChange={(e) => setAgencyForm((f) => ({ ...f, font_family: e.target.value }))} placeholder="e.g. Inter, sans-serif" />
              </div>
              <div className="settings-form-group">
                <label>Logo URL</label>
                <input type="text" value={agencyForm.logo_url} onChange={(e) => setAgencyForm((f) => ({ ...f, logo_url: e.target.value }))} placeholder="https://..." style={{ width: '100%', maxWidth: 400 }} />
                <label className="btn btn-outline btn-sm" style={{ marginTop: 8, cursor: 'pointer', display: 'inline-block' }}>
                  <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={uploadingLogo || !effectiveAgencyId} style={{ display: 'none' }} />
                  {uploadingLogo ? 'Uploading…' : 'Or upload a logo'}
                </label>
                {agencyForm.logo_url && (
                  <div style={{ marginTop: 8 }}>
                    <img src={agencyForm.logo_url} alt="Logo preview" style={{ maxWidth: 120, maxHeight: 60, objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 4 }} />
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button type="button" className="btn btn-primary" onClick={handleSaveAgency} disabled={savingAgency}>{savingAgency ? 'Saving…' : 'Save Branding'}</button>
                <button type="button" className="btn btn-outline" onClick={() => setAgencyForm({ agency_name: activeAgency.agency_name || '', primary_color: '#E12627', secondary_color: '', accent_color: '#0083CB', sidebar_bg: '', sidebar_text: '', font_family: '', logo_url: '' })}>Reset to Defaults</button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 32 }}>
            <button type="button" className="btn btn-outline" onClick={handleSignOut}>Sign out</button>
          </div>
        </div>
      </div>
    </div>
  );
}
