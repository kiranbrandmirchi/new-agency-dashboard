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

export function SettingsPage() {
  const { showNotification } = useApp();
  const { signOut, agencyId, agency, userProfile, userRole } = useAuth();

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

  const [agencyForm, setAgencyForm] = useState({
    agency_name: '', primary_color: '', secondary_color: '', accent_color: '',
    sidebar_bg: '', sidebar_text: '', font_family: '', logo_url: '',
  });
  const [savingAgency, setSavingAgency] = useState(false);

  const isAdmin = ['super_admin', 'admin'].includes(userRole?.toLowerCase());
  const redirectUri = typeof window !== 'undefined'
    ? `${window.location.origin}/oauth/callback`
    : 'http://localhost:5173/oauth/callback';

  const getEffectiveDateRange = useCallback(() => {
    if (datePreset === 'custom') {
      if (customDateFrom && customDateTo) return { dateFrom: customDateFrom, dateTo: customDateTo };
      return getDateRangeFromPreset('last7');
    }
    return getDateRangeFromPreset(datePreset) || getDateRangeFromPreset('last7');
  }, [datePreset, customDateFrom, customDateTo]);

  const fetchCredentials = useCallback(async () => {
    if (!agencyId) return;
    setLoadingCreds(true);
    try {
      const { data, error } = await supabase
        .from('agency_platform_credentials').select('*').eq('agency_id', agencyId);
      if (error) throw error;
      setCredentials(data || []);
    } catch (err) {
      console.warn('[Settings] credentials error:', err);
      setCredentials([]);
    } finally { setLoadingCreds(false); }
  }, [agencyId]);

  const fetchAccounts = useCallback(async () => {
    if (!agencyId) return;
    setLoadingAccounts(true);
    try {
      const { data, error } = await supabase
        .from('client_platform_accounts').select('*').eq('agency_id', agencyId).order('account_name');
      if (error) throw error;
      setAccounts(data || []);
    } catch (err) {
      console.warn('[Settings] accounts error:', err);
      setAccounts([]);
    } finally { setLoadingAccounts(false); }
  }, [agencyId]);

  const fetchSyncLogs = useCallback(async (customerId) => {
    if (!agencyId) return;
    try {
      const { data, error } = await supabase
        .from('sync_log')
        .select('*')
        .eq('agency_id', agencyId)
        .eq('customer_id', customerId)
        .order('started_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      setSyncLogs((prev) => ({ ...prev, [customerId]: data || [] }));
    } catch (err) {
      console.warn('[Settings] sync_log error:', err);
    }
  }, [agencyId]);

  useEffect(() => { fetchCredentials(); }, [fetchCredentials]);
  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  useEffect(() => {
    if (agency) {
      setAgencyForm({
        agency_name: agency.agency_name || '',
        primary_color: agency.primary_color || '#E12627',
        secondary_color: agency.secondary_color || '',
        accent_color: agency.accent_color || '#0083CB',
        sidebar_bg: agency.sidebar_bg || '',
        sidebar_text: agency.sidebar_text || '',
        font_family: agency.font_family || '',
        logo_url: agency.logo_url || '',
      });
    }
  }, [agency]);

  const insertSyncLog = useCallback(async (customerId, chunk) => {
    if (!agencyId) return;
    try {
      await supabase.from('sync_log').insert({
        agency_id: agencyId,
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
  }, [agencyId]);

  const handleSyncAccount = async (account) => {
    setSyncingAccount(account.id);
    setSyncProgress({ accountId: account.id, current: 0, total: 0, dateFrom: '', dateTo: '', status: '', rows: 0 });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { showNotification('Please sign in first.'); return; }

      const { dateFrom, dateTo } = getEffectiveDateRange();
      const result = await syncWithChunking({
        customerId: account.platform_customer_id,
        agencyId,
        dateFrom,
        dateTo,
        accessToken: session.access_token,
        chunkDays: 5,
        onProgress: (p) => setSyncProgress({
          accountId: account.id,
          current: p.current,
          total: p.total,
          dateFrom: p.dateFrom,
          dateTo: p.dateTo,
          status: p.status,
          rows: p.rows,
        }),
        onChunkComplete: (chunk) => insertSyncLog(account.platform_customer_id, chunk),
      });

      if (result.success) {
        showNotification(`Synced ${account.account_name || account.platform_customer_id}: ${result.totalRows} rows`);
      } else {
        showNotification(`Sync completed with errors: ${result.totalRows} rows. ${result.errors.length} chunk(s) failed.`);
      }

      const token = session.access_token;

      try {
        const statusResult = await syncStatusAndGeo({ customerId: account.platform_customer_id, accessToken: token });
        if (statusResult.campaigns || statusResult.adgroups || statusResult.keywords) {
          showNotification('Status synced');
        }
      } catch (e) {
        console.warn('[Settings] syncStatusAndGeo:', e);
      }

      try {
        const geoResult = await syncGeo({ customerId: account.platform_customer_id, dateFrom, dateTo, accessToken: token });
        if (geoResult.success) showNotification('Geo synced');
      } catch (e) {
        console.warn('[Settings] syncGeo:', e);
      }

      try {
        const resolveResult = await resolveGeo({ accessToken: token });
        if (resolveResult.success) showNotification('Geo names resolved');
      } catch (e) {
        console.warn('[Settings] resolveGeo:', e);
      }

      await fetchAccounts();
      await fetchSyncLogs(account.platform_customer_id);
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
    let successCount = 0;
    let failCount = 0;

    for (const account of activeAccounts) {
      setSyncProgress({ accountId: account.id, accountName: account.account_name || account.platform_customer_id, current: 0, total: 0, dateFrom: '', dateTo: '', status: '', rows: 0 });
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) break;

        const result = await syncWithChunking({
          customerId: account.platform_customer_id,
          agencyId,
          dateFrom,
          dateTo,
          accessToken: session.access_token,
          chunkDays: 5,
          onProgress: (p) => setSyncProgress({
            accountId: account.id,
            accountName: account.account_name || account.platform_customer_id,
            current: p.current,
            total: p.total,
            dateFrom: p.dateFrom,
            dateTo: p.dateTo,
            status: p.status,
            rows: p.rows,
          }),
          onChunkComplete: (chunk) => insertSyncLog(account.platform_customer_id, chunk),
        });

        totalRowsAll += result.totalRows;
        if (result.success) successCount++;
        else failCount++;

        const token = session.access_token;
        try {
          const statusResult = await syncStatusAndGeo({ customerId: account.platform_customer_id, accessToken: token });
          if (statusResult.campaigns || statusResult.adgroups || statusResult.keywords) {
            showNotification('Status synced');
          }
        } catch (e) {
          console.warn('[Settings] syncStatusAndGeo:', e);
        }
        try {
          const geoResult = await syncGeo({ customerId: account.platform_customer_id, dateFrom, dateTo, accessToken: token });
          if (geoResult.success) showNotification('Geo synced');
        } catch (e) {
          console.warn('[Settings] syncGeo:', e);
        }
        try {
          const resolveResult = await resolveGeo({ accessToken: token });
          if (resolveResult.success) showNotification('Geo names resolved');
        } catch (e) {
          console.warn('[Settings] resolveGeo:', e);
        }

        await fetchSyncLogs(account.platform_customer_id);
      } catch {
        failCount++;
      }
    }

    showNotification(`Sync complete: ${successCount} succeeded, ${failCount} failed. ${totalRowsAll} total rows.`);
    await fetchAccounts();
    setSyncingAll(false);
    setSyncProgress(null);
  };

  const handleConnectGoogleAds = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { showNotification('Please sign in first.'); return; }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/oauth-connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: 'get_auth_url', platform: 'google_ads', redirect_uri: redirectUri }),
      });
      const data = await res.json();
      if (!res.ok || !data.auth_url) throw new Error(data.error || data.message || 'Failed to get auth URL');
      window.location.href = data.auth_url;
    } catch (err) {
      showNotification(err.message || 'Failed to connect');
    }
  };

  const handleDisconnect = async (platform) => {
    setDisconnecting(platform);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/oauth-connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: 'disconnect', platform }),
      });
      const data = await res.json();
      if (!res.ok && !data.success) throw new Error(data.error || 'Disconnect failed');
      await fetchCredentials();
      showNotification('Disconnected');
    } catch (err) {
      showNotification(err.message || 'Failed to disconnect');
    } finally { setDisconnecting(null); }
  };

  const handleToggleAccount = async (account) => {
    setTogglingAccount(account.id);
    try {
      const { error } = await supabase
        .from('client_platform_accounts').update({ is_active: !account.is_active }).eq('id', account.id);
      if (error) throw error;
      await fetchAccounts();
      showNotification(account.is_active ? 'Account deactivated' : 'Account activated');
    } catch (err) {
      showNotification(err.message || 'Failed to update');
    } finally { setTogglingAccount(null); }
  };

  const handleToggleAutoSync = async (account) => {
    setTogglingAccount(account.id);
    try {
      const { error } = await supabase
        .from('client_platform_accounts')
        .update({ auto_sync_enabled: !account.auto_sync_enabled })
        .eq('id', account.id);
      if (error) throw error;
      await fetchAccounts();
      showNotification(account.auto_sync_enabled ? 'Auto-sync disabled' : 'Auto-sync enabled');
    } catch (err) {
      showNotification(err.message || 'Failed to update');
    } finally { setTogglingAccount(null); }
  };

  const handleSaveAgency = async () => {
    if (!agency?.id) return;
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
      }).eq('id', agency.id);
      if (error) throw error;
      applyAgencyBranding(agencyForm);
      showNotification('Branding saved');
    } catch (err) {
      showNotification(err.message || 'Failed to save');
    } finally { setSavingAgency(false); }
  };

  const applyAgencyBranding = (form) => {
    const root = document.documentElement;
    if (form.primary_color) { root.style.setProperty('--primary-color', form.primary_color); root.style.setProperty('--primary', form.primary_color); }
    if (form.secondary_color) root.style.setProperty('--secondary-color', form.secondary_color);
    if (form.accent_color) { root.style.setProperty('--accent-color', form.accent_color); root.style.setProperty('--accent', form.accent_color); }
    if (form.sidebar_bg) root.style.setProperty('--sidebar-bg', form.sidebar_bg);
    if (form.sidebar_text) root.style.setProperty('--sidebar-text', form.sidebar_text);
    if (form.font_family) root.style.setProperty('--font-family', form.font_family);
  };

  const handleSignOut = async () => { await signOut(); window.location.href = '/login'; };

  const gadsCred = credentials.find((c) => c.platform === 'google_ads');
  const activeGadsAccounts = accounts.filter((a) => a.is_active && a.platform === 'google_ads');

  return (
    <div className="page-section active" id="page-settings">
      <div className="page-content">
        <div className="page-title-bar">
          <h2>Settings</h2>
          <p>Manage platform connections, accounts, and agency branding</p>
        </div>

        {/* Platform Connections */}
        <div className="settings-section">
          <h3>Platform Connections</h3>
          {loadingCreds ? (
            <p style={{ color: 'var(--text-muted)' }}>Loading</p>
          ) : (
            <div className="settings-form-group">
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>Google Ads</span>
                  <span className={`badge ${gadsCred ? 'badge-green' : 'badge-gray'}`}>
                    {gadsCred ? 'Connected' : 'Not connected'}
                  </span>
                </div>
                {gadsCred ? (
                  <button type="button" className="btn btn-outline btn-sm"
                    onClick={() => handleDisconnect('google_ads')}
                    disabled={disconnecting === 'google_ads'}>
                    {disconnecting === 'google_ads' ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={handleConnectGoogleAds}>
                    Connect Google Ads
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Account Management */}
        <div className="settings-section">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ margin: 0 }}>Account Management</h3>
              <p className="help-text" style={{ margin: '4px 0 0' }}>
                Google Ads accounts linked to your agency. Toggle to enable or disable reporting.
              </p>
            </div>
            {activeGadsAccounts.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {DATE_PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      className={`btn btn-sm ${datePreset === p.key ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setDatePreset(p.key)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {datePreset === 'custom' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="date"
                      value={customDateFrom}
                      onChange={(e) => setCustomDateFrom(e.target.value)}
                      style={{ padding: '6px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6 }}
                    />
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>to</span>
                    <input
                      type="date"
                      value={customDateTo}
                      onChange={(e) => setCustomDateTo(e.target.value)}
                      style={{ padding: '6px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6 }}
                    />
                  </div>
                )}
                <button type="button" className="btn btn-primary btn-sm" onClick={handleSyncAll}
                  disabled={syncingAll}>
                  {syncingAll ? 'Syncing All…' : `Sync All Accounts (${activeGadsAccounts.length})`}
                </button>
              </div>
            )}
          </div>

          {syncProgress && (
            <div className="insight-banner info" style={{ marginTop: 12 }}>
              <span className="icon">⏳</span>
              <div>
                {syncProgress.accountName && <strong>{syncProgress.accountName}: </strong>}
                {syncProgress.total > 0
                  ? `Syncing ${syncProgress.dateFrom}–${syncProgress.dateTo} (chunk ${syncProgress.current}/${syncProgress.total})` + (syncProgress.rows > 0 ? ` — ${syncProgress.rows} rows` : '')
                  : 'Starting…'}
              </div>
            </div>
          )}

          {loadingAccounts ? (
            <p style={{ color: 'var(--text-muted)' }}>Loading</p>
          ) : accounts.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>
              No accounts yet. Connect Google Ads above and complete the OAuth flow to add accounts.
            </p>
          ) : (
            <div className="panel" style={{ marginTop: 12 }}>
              <div className="panel-body no-padding">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Account Name</th>
                      <th>Customer ID</th>
                      <th>Last Sync</th>
                      <th>Status</th>
                      <th>Auto-Sync</th>
                      <th>Active</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((acc) => (
                      <tr key={acc.id}>
                        <td>{acc.account_name || ''}</td>
                        <td>{acc.platform_customer_id}</td>
                        <td>{acc.last_sync_at ? new Date(acc.last_sync_at).toLocaleString() : 'Never'}</td>
                        <td>
                          <span className={`badge ${acc.sync_status === 'synced' ? 'badge-green' : 'badge-gray'}`}>
                            {acc.sync_status || 'pending'}
                          </span>
                        </td>
                        <td>
                          {acc.is_active && acc.platform === 'google_ads' && (
                            <label className="admin-toggle">
                              <input
                                type="checkbox"
                                checked={!!acc.auto_sync_enabled}
                                onChange={() => handleToggleAutoSync(acc)}
                                disabled={togglingAccount === acc.id}
                              />
                              <span />
                            </label>
                          )}
                        </td>
                        <td>
                          <button type="button"
                            className={`btn btn-sm ${acc.is_active ? 'btn-outline' : 'btn-primary'}`}
                            onClick={() => handleToggleAccount(acc)}
                            disabled={togglingAccount === acc.id}>
                            {togglingAccount === acc.id ? '…' : acc.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                        <td>
                          {acc.is_active && acc.platform === 'google_ads' && (
                            <button type="button" className="btn btn-accent btn-sm"
                              onClick={() => handleSyncAccount(acc)}
                              disabled={syncingAccount === acc.id || syncingAll}>
                              {syncingAccount === acc.id ? 'Syncing…' : 'Sync Now'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sync Schedule section */}
          {activeGadsAccounts.length > 0 && (
            <div style={{ marginTop: 16, padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <h4 style={{ fontSize: 14, marginBottom: 8 }}>Sync Schedule</h4>
              <p className="help-text" style={{ marginBottom: 8 }}>
                Daily Auto-Sync runs for accounts with Auto-Sync enabled. Set up pg_cron or an external scheduler to call the gads-full-sync edge function for accounts where auto_sync_enabled = true. See migration 002 for SQL comments.
              </p>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Last sync: {credentials.find((c) => c.platform === 'google_ads')?.last_sync_at
                  ? new Date(credentials.find((c) => c.platform === 'google_ads').last_sync_at).toLocaleString()
                  : 'Never'}
              </div>
            </div>
          )}

          {/* Sync History expandable */}
          {accounts.length > 0 && !loadingAccounts && (
            <div style={{ marginTop: 16 }}>
              {accounts.filter((a) => a.platform === 'google_ads').map((acc) => (
                <div key={acc.id} style={{ marginBottom: 8 }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      const next = expandedSyncHistory === acc.platform_customer_id ? null : acc.platform_customer_id;
                      setExpandedSyncHistory(next);
                      if (next) fetchSyncLogs(next);
                    }}
                  >
                    {expandedSyncHistory === acc.platform_customer_id ? '▼' : '▶'} Sync History: {acc.account_name || acc.platform_customer_id}
                  </button>
                  {expandedSyncHistory === acc.platform_customer_id && (
                    <div style={{ marginTop: 8, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)', maxHeight: 200, overflowY: 'auto' }}>
                      {(syncLogs[acc.platform_customer_id] || []).length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>No sync history yet.</p>
                      ) : (
                        <table className="data-table" style={{ fontSize: 12 }}>
                          <thead>
                            <tr>
                              <th>Date Range</th>
                              <th>Status</th>
                              <th>Rows</th>
                              <th>Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(syncLogs[acc.platform_customer_id] || []).map((log) => (
                              <tr key={log.id}>
                                <td>{log.date_from} – {log.date_to}</td>
                                <td><span className={`badge ${log.status === 'success' ? 'badge-green' : 'badge-gray'}`}>{log.status}</span></td>
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
        </div>

        {/* Agency Branding */}
        {isAdmin && agency && (
          <div className="settings-section">
            <h3>Agency Branding</h3>
            <div className="settings-form-group">
              <label>Agency Name</label>
              <input type="text" value={agencyForm.agency_name}
                onChange={(e) => setAgencyForm((f) => ({ ...f, agency_name: e.target.value }))} />
            </div>
            <div className="color-swatches" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
              {[
                ['primary_color', 'Primary', '#E12627'],
                ['secondary_color', 'Secondary', '#666'],
                ['accent_color', 'Accent', '#0083CB'],
                ['sidebar_bg', 'Sidebar BG', '#1a1a2e'],
                ['sidebar_text', 'Sidebar Text', '#fff'],
              ].map(([key, label, fallback]) => (
                <div className="color-swatch" key={key}>
                  <input type="color" value={agencyForm[key] || fallback}
                    onChange={(e) => setAgencyForm((f) => ({ ...f, [key]: e.target.value }))} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <div className="settings-form-group">
              <label>Font Family</label>
              <input type="text" value={agencyForm.font_family}
                onChange={(e) => setAgencyForm((f) => ({ ...f, font_family: e.target.value }))}
                placeholder="e.g. Inter, sans-serif" />
            </div>
            <div className="settings-form-group">
              <label>Logo URL</label>
              <input type="text" value={agencyForm.logo_url}
                onChange={(e) => setAgencyForm((f) => ({ ...f, logo_url: e.target.value }))}
                placeholder="https://..." />
            </div>
            <button type="button" className="btn btn-primary" onClick={handleSaveAgency} disabled={savingAgency}>
              {savingAgency ? 'Saving…' : 'Save Branding'}
            </button>
          </div>
        )}

        <div style={{ marginTop: 32 }}>
          <button type="button" className="btn btn-outline" onClick={handleSignOut}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
