import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { syncWithChunking, syncStatusAndGeo, syncGeo, resolveGeo } from '../utils/syncHelper';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const DATE_PRESETS = [
  { key: 'last7', label: 'Last 7 days', days: 7 },
  { key: 'last30', label: 'Last 30 days', days: 30 },
  { key: 'last90', label: 'Last 90 days', days: 90 },
  { key: 'custom', label: 'Custom range', days: null },
];

const SETTINGS_SECTIONS = [
  { id: 'google_ads', label: 'Google Ads' },
  { id: 'reddit_ads', label: 'Reddit Ads' },
  { id: 'white_label', label: 'White Label & Branding' },
];

function getDateRangeFromPreset(presetKey) {
  const preset = DATE_PRESETS.find((p) => p.key === presetKey);
  if (!preset || preset.key === 'custom') return null;
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (preset.days || 7));
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  };
}

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
  const { signOut, activeAgencyId, activeAgency, userProfile, userRole } = useAuth();

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
  const [expandedSyncHistory, setExpandedSyncHistory] = useState(null);

  const [datePreset, setDatePreset] = useState('last7');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [redditDatePreset, setRedditDatePreset] = useState('last7');
  const [redditCustomFrom, setRedditCustomFrom] = useState('');
  const [redditCustomTo, setRedditCustomTo] = useState('');

  const [agencyForm, setAgencyForm] = useState({
    agency_name: '', primary_color: '', secondary_color: '', accent_color: '',
    sidebar_bg: '', sidebar_text: '', font_family: '', logo_url: '',
  });
  const [savingAgency, setSavingAgency] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [connectingReddit, setConnectingReddit] = useState(false);

  const isAdmin = ['super_admin', 'admin'].includes(userRole?.toLowerCase());
  const isSuperAdmin = userProfile?.is_super_admin || userRole?.toLowerCase() === 'super_admin';
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

  const fetchCredentials = useCallback(async () => {
    if (!activeAgencyId) {
      setLoadingCreds(false);
      setCredentials([]);
      return;
    }
    setLoadingCreds(true);
    try {
      const { data, error } = await supabase.from('agency_platform_credentials').select('*').eq('agency_id', activeAgencyId);
      if (error) throw error;
      setCredentials(data || []);
    } catch (err) {
      console.warn('[Settings] credentials error:', err);
      setCredentials([]);
    } finally { setLoadingCreds(false); }
  }, [activeAgencyId]);

  const fetchAccounts = useCallback(async () => {
    if (!activeAgencyId) {
      setLoadingAccounts(false);
      setAccounts([]);
      return;
    }
    setLoadingAccounts(true);
    try {
      const { data, error } = await supabase.from('client_platform_accounts').select('*').eq('agency_id', activeAgencyId).order('account_name');
      if (error) throw error;
      setAccounts(data || []);
    } catch (err) {
      console.warn('[Settings] accounts error:', err);
      setAccounts([]);
    } finally { setLoadingAccounts(false); }
  }, [activeAgencyId]);

  const fetchSyncLogs = useCallback(async (customerId, platform = 'google_ads') => {
    if (!activeAgencyId) return;
    try {
      const { data, error } = await supabase
        .from('sync_log')
        .select('*')
        .eq('agency_id', activeAgencyId)
        .eq('customer_id', customerId)
        .eq('platform', platform)
        .order('started_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      setSyncLogs((prev) => ({ ...prev, [`${platform}:${customerId}`]: data || [] }));
    } catch (err) {
      console.warn('[Settings] sync_log error:', err);
    }
  }, [activeAgencyId]);

  useEffect(() => { fetchCredentials(); }, [fetchCredentials]);
  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

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
    if (!activeAgencyId) return;
    try {
      await supabase.from('sync_log').insert({
        agency_id: activeAgencyId,
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
  }, [activeAgencyId]);

  const handleSyncAccount = async (account) => {
    setSyncingAccount(account.id);
    setSyncProgress({ accountId: account.id, current: 0, total: 0, dateFrom: '', dateTo: '', status: '', rows: 0 });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { showNotification('Please sign in first.'); return; }

      const { dateFrom, dateTo } = getEffectiveDateRange();
      const result = await syncWithChunking({
        customerId: account.platform_customer_id,
        agencyId: activeAgencyId,
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
      try {
        const geoResult = await syncGeo({ customerId: account.platform_customer_id, dateFrom, dateTo, accessToken: token });
        if (geoResult.success) showNotification('Geo synced');
      } catch (e) { console.warn('[Settings] syncGeo:', e); }
      try {
        const resolveResult = await resolveGeo({ accessToken: token });
        if (resolveResult.success) showNotification('Geo names resolved');
      } catch (e) { console.warn('[Settings] resolveGeo:', e); }

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
          agencyId: activeAgencyId,
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
        try { await syncGeo({ customerId: account.platform_customer_id, dateFrom, dateTo, accessToken: token }); } catch (e) {}
        try { await resolveGeo({ accessToken: token }); } catch (e) {}
        await fetchSyncLogs(account.platform_customer_id, 'google_ads');
      } catch {}
    }
    showNotification(`Sync complete: ${totalRowsAll} total rows.`);
    await fetchAccounts();
    setSyncingAll(false);
    setSyncProgress(null);
  };

  const handleConnectGoogleAds = async () => {
    if (!activeAgencyId) { showNotification('Select an agency first.'); return; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { showNotification('Please sign in first.'); return; }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/oauth-connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'get_auth_url', platform: 'google_ads', redirect_uri: redirectUri, agency_id: activeAgencyId }),
      });
      const data = await res.json();
      if (!res.ok || !data.auth_url) throw new Error(data.error || data.message || 'Failed to get auth URL');
      window.location.href = data.auth_url;
    } catch (err) {
      showNotification(err.message || 'Failed to connect');
    }
  };

  const handleConnectReddit = async () => {
    if (!activeAgencyId) {
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
        body: JSON.stringify({ action: 'get_auth_url', redirect_uri: redirectUri, agency_id: activeAgencyId }),
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
      const fn = platform === 'reddit' ? 'reddit-oauth-connect' : 'oauth-connect';
      const body = platform === 'reddit'
        ? { action: 'disconnect', agency_id: activeAgencyId }
        : { action: 'disconnect', platform, agency_id: activeAgencyId };
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

  const handleSyncRedditAccount = async (account) => {
    setSyncingAccount(account.id);
    setSyncProgress({ accountId: account.id, status: 'Starting…' });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { showNotification('Please sign in first.'); return; }
      const { dateFrom, dateTo } = getRedditDateRange();
      const { data, error } = await supabase.functions.invoke('reddit-full-sync', {
        body: { account_ids: [account.platform_customer_id], start_date: dateFrom, end_date: dateTo },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      showNotification(data?.message || 'Reddit sync initiated');
      await fetchAccounts();
    } catch (err) {
      showNotification(err?.message || 'Reddit sync failed');
    } finally {
      setSyncingAccount(null);
      setSyncProgress(null);
    }
  };

  const handleSyncAllReddit = async () => {
    const redditAccounts = accounts.filter((a) => a.is_active && a.platform === 'reddit');
    if (redditAccounts.length === 0) {
      showNotification('No active Reddit accounts to sync.');
      return;
    }
    setSyncingAll(true);
    const { dateFrom, dateTo } = getRedditDateRange();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await supabase.functions.invoke('reddit-full-sync', {
        body: { account_ids: redditAccounts.map((a) => a.platform_customer_id), start_date: dateFrom, end_date: dateTo },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      showNotification(data?.message || 'Reddit sync initiated');
      await fetchAccounts();
    } catch (err) {
      showNotification(err?.message || 'Reddit sync failed');
    } finally {
      setSyncingAll(false);
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
    if (!file || !activeAgencyId) return;
    setUploadingLogo(true);
    try {
      const path = `${activeAgencyId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
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
  const activeGadsAccounts = accounts.filter((a) => a.is_active && a.platform === 'google_ads');
  const activeRedditAccounts = accounts.filter((a) => a.is_active && a.platform === 'reddit');

  const AccountsTable = ({ platform, accountsList, onSync, onSyncAll, datePresetKey, setDatePresetKey, customFrom, customTo, setCustomFrom, setCustomTo }) => {
    const presets = platform === 'reddit' ? DATE_PRESETS : DATE_PRESETS;
    const getRange = platform === 'reddit' ? getRedditDateRange : getEffectiveDateRange;
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
          <div>
            <h4 style={{ margin: 0 }}>{platform === 'google_ads' ? 'Google Ads' : 'Reddit'} Accounts</h4>
            <p className="help-text" style={{ margin: '4px 0 0' }}>
              {platform === 'google_ads' ? 'Google Ads' : 'Reddit'} accounts linked to your agency.
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
                {syncingAll ? 'Syncing…' : platform === 'google_ads' ? `Sync All (${accountsList.length})` : `Sync All Reddit (${accountsList.length})`}
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
          <p style={{ color: 'var(--text-muted)' }}>No {platform === 'google_ads' ? 'Google Ads' : 'Reddit'} accounts yet.</p>
        ) : (
          <div className="panel">
            <div className="panel-body no-padding">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Account Name</th>
                    <th>{platform === 'google_ads' ? 'Customer ID' : 'Account ID'}</th>
                    {platform === 'google_ads' && <th>Auto-Sync</th>}
                    <th>Last Synced</th>
                    <th>Last Status</th>
                    <th>Active</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accountsList.map((acc) => (
                    <tr key={acc.id}>
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
                      <td>{formatRelativeTime(acc.last_sync_at)}</td>
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {accountsList.length > 0 && (
          <div style={{ marginTop: 16 }}>
            {accountsList.map((acc) => (
              <div key={acc.id} style={{ marginBottom: 8 }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => { setExpandedSyncHistory(expandedSyncHistory === `${platform}:${acc.platform_customer_id}` ? null : `${platform}:${acc.platform_customer_id}`); if (expandedSyncHistory !== `${platform}:${acc.platform_customer_id}`) fetchSyncLogs(acc.platform_customer_id, platform); }}>
                  {expandedSyncHistory === `${platform}:${acc.platform_customer_id}` ? '▼' : '▶'} Sync History: {acc.account_name || acc.platform_customer_id}
                </button>
                {expandedSyncHistory === `${platform}:${acc.platform_customer_id}` && (
                  <div style={{ marginTop: 8, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)', maxHeight: 200, overflowY: 'auto' }}>
                    {(syncLogs[`${platform}:${acc.platform_customer_id}`] || []).length === 0 ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>No sync history yet.</p>
                    ) : (
                      <table className="data-table" style={{ fontSize: 12 }}>
                        <thead><tr><th>Date Range</th><th>Status</th><th>Rows</th><th>Time</th></tr></thead>
                        <tbody>
                          {(syncLogs[`${platform}:${acc.platform_customer_id}`] || []).map((log) => (
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
                )}
              </div>
            ))}
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
          {SETTINGS_SECTIONS.map((s) => (
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
                  <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={uploadingLogo || !activeAgencyId} style={{ display: 'none' }} />
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
