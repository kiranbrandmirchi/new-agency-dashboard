import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

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

  const [agencyForm, setAgencyForm] = useState({
    agency_name: '', primary_color: '', secondary_color: '', accent_color: '',
    sidebar_bg: '', sidebar_text: '', font_family: '', logo_url: '',
  });
  const [savingAgency, setSavingAgency] = useState(false);

  const isAdmin = ['super_admin', 'admin'].includes(userRole?.toLowerCase());
  const redirectUri = typeof window !== 'undefined'
    ? `${window.location.origin}/oauth/callback`
    : 'http://localhost:5173/oauth/callback';

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

  // ── Sync a single account ──
  const handleSyncAccount = async (account) => {
    setSyncingAccount(account.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { showNotification('Please sign in first.'); return; }

      const now = new Date();
      const from = new Date(now);
      from.setDate(from.getDate() - 5);

      const res = await fetch(`${SUPABASE_URL}/functions/v1/gads-full-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          customer_id: account.platform_customer_id,
          agency_id: agencyId,
          date_from: from.toISOString().slice(0, 10),
          date_to: now.toISOString().slice(0, 10),
          mode: 'backfill',
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const errText = data?.error || await res.text().catch(() => 'Sync failed');
        throw new Error(typeof errText === 'string' ? errText : 'Sync failed');
      }
      showNotification(`Synced ${account.account_name || account.platform_customer_id} successfully`);
      await fetchAccounts();
    } catch (err) {
      showNotification(err.message || 'Sync failed');
    } finally {
      setSyncingAccount(null);
    }
  };

  // ── Sync ALL active accounts ──
  const handleSyncAll = async () => {
    const activeAccounts = accounts.filter((a) => a.is_active && a.platform === 'google_ads');
    if (activeAccounts.length === 0) {
      showNotification('No active Google Ads accounts to sync.');
      return;
    }
    setSyncingAll(true);
    let successCount = 0;
    let failCount = 0;

    for (const account of activeAccounts) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) break;

        const now = new Date();
        const from = new Date(now);
        from.setDate(from.getDate() - 5);

        const res = await fetch(`${SUPABASE_URL}/functions/v1/gads-full-sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            customer_id: account.platform_customer_id,
            agency_id: agencyId,
            date_from: from.toISOString().slice(0, 10),
            date_to: now.toISOString().slice(0, 10),
            mode: 'backfill',
          }),
        });
        if (res.ok) successCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }
    showNotification(`Sync complete: ${successCount} succeeded, ${failCount} failed`);
    await fetchAccounts();
    setSyncingAll(false);
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
      const root = document.documentElement;
      if (agencyForm.primary_color) { root.style.setProperty('--primary-color', agencyForm.primary_color); root.style.setProperty('--primary', agencyForm.primary_color); }
      if (agencyForm.accent_color) { root.style.setProperty('--accent-color', agencyForm.accent_color); root.style.setProperty('--accent', agencyForm.accent_color); }
      if (agencyForm.sidebar_bg) root.style.setProperty('--sidebar-bg', agencyForm.sidebar_bg);
      if (agencyForm.sidebar_text) root.style.setProperty('--sidebar-text', agencyForm.sidebar_text);
      if (agencyForm.font_family) root.style.setProperty('--font-family', agencyForm.font_family);
      showNotification('Branding saved');
    } catch (err) {
      showNotification(err.message || 'Failed to save');
    } finally { setSavingAgency(false); }
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
              <button type="button" className="btn btn-primary btn-sm" onClick={handleSyncAll}
                disabled={syncingAll}>
                {syncingAll ? 'Syncing All…' : `Sync All Accounts (${activeGadsAccounts.length})`}
              </button>
            )}
          </div>

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
