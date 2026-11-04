import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

const FN = 'gads-temp-sync';
const OAUTH_STATE_KEY = 'gads_temp_oauth';
const PAGE_PATH = '/google-ads-test';

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function fmtNum(v, digits = 0) {
  return Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtCid(cid) {
  const s = String(cid || '');
  return s.length === 10 ? `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}` : s;
}

async function callFn(body) {
  const { data, error } = await supabase.functions.invoke(FN, { body });
  if (error) {
    let msg = error.message;
    try {
      const j = await error.context?.json();
      if (j?.error) msg = j.error;
    } catch { /* non-JSON error body */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function GoogleAdsTestPage() {
  const { showNotification } = useApp();
  const { userProfile, userRole, allAgencies, loading: authLoading } = useAuth();
  const isSuperAdmin = !!userProfile?.is_super_admin || userRole?.toLowerCase() === 'super_admin';

  const [status, setStatus] = useState({ config: null, connections: [], accounts: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [mccInput, setMccInput] = useState('');
  const [dateFrom, setDateFrom] = useState(isoDaysAgo(7));
  const [dateTo, setDateTo] = useState(isoDaysAgo(1));
  const [syncAgencyId, setSyncAgencyId] = useState('');
  const [lastResult, setLastResult] = useState(null);
  const [tokenCheck, setTokenCheck] = useState(null);
  const [viewAgencyId, setViewAgencyId] = useState('');
  const [dataRows, setDataRows] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const oauthHandled = useRef(false);

  const redirectUri = `${window.location.origin}${PAGE_PATH}`;

  const agencyName = useCallback(
    (id) => allAgencies.find((a) => a.id === id)?.agency_name || '—',
    [allAgencies],
  );

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await callFn({ action: 'status' }));
    } catch (err) {
      showNotification(err.message);
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const oauthError = params.get('error');
    if ((code || oauthError) && !oauthHandled.current) {
      oauthHandled.current = true;
      window.history.replaceState({}, '', PAGE_PATH);
      const saved = JSON.parse(sessionStorage.getItem(OAUTH_STATE_KEY) || '{}');
      sessionStorage.removeItem(OAUTH_STATE_KEY);
      if (oauthError) {
        showNotification(`Google sign-in cancelled: ${oauthError}`);
        loadStatus();
        return;
      }
      if (!saved.state || saved.state !== params.get('state')) {
        showNotification('Sign-in state mismatch. Please try connecting again.');
        loadStatus();
        return;
      }
      setBusy('connect');
      callFn({ action: 'exchange_code', code, redirect_uri: redirectUri, mcc_id: saved.mcc })
        .then((r) => {
          showNotification(
            r.discover_error
              ? `Connected ${r.connection.google_email}, but listing accounts failed: ${r.discover_error}`
              : `Connected ${r.connection.google_email}: ${r.accounts_found} accounts found`,
          );
        })
        .catch((err) => showNotification(err.message))
        .finally(() => { setBusy(null); loadStatus(); });
      return;
    }
    loadStatus();
  }, [isSuperAdmin, loadStatus, redirectUri, showNotification]);

  const handleConnect = async () => {
    setBusy('connect');
    try {
      const state = crypto.randomUUID();
      sessionStorage.setItem(OAUTH_STATE_KEY, JSON.stringify({ state, mcc: mccInput.replace(/\D/g, '') }));
      const { url } = await callFn({ action: 'get_auth_url', redirect_uri: redirectUri, state });
      window.location.href = url;
    } catch (err) {
      showNotification(err.message);
      setBusy(null);
    }
  };

  const runAction = async (key, body, successMsg) => {
    setBusy(key);
    try {
      const r = await callFn(body);
      if (successMsg) showNotification(typeof successMsg === 'function' ? successMsg(r) : successMsg);
      await loadStatus();
      return r;
    } catch (err) {
      showNotification(err.message);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const handleSync = async (target) => {
    if (!dateFrom || !dateTo || dateFrom > dateTo) {
      showNotification('Pick a valid date range.');
      return;
    }
    const key = target.customer_id ? `sync-${target.customer_id}` : 'sync-agency';
    const r = await runAction(key, { action: 'sync', date_from: dateFrom, date_to: dateTo, ...target },
      (res) => `Sync finished: ${res.total_rows} rows`);
    if (r) setLastResult(r);
  };

  const handleCheckTokens = async () => {
    const r = await runAction('check-tokens', { action: 'check_tokens' }, (res) => (res.all_ok
      ? 'All tokens valid and every account reachable'
      : 'Some tokens or accounts have problems. See details below.'));
    if (r) setTokenCheck(r);
  };

  const loadData = useCallback(async () => {
    setDataLoading(true);
    try {
      let q = supabase
        .from('google_ads_temp')
        .select('agency_id, customer_id, customer_name, campaign_id, campaign_name, campaign_status, channel_type, impressions, clicks, cost, conversions, conversions_value')
        .gte('date', dateFrom)
        .lte('date', dateTo)
        .limit(5000);
      if (viewAgencyId) q = q.eq('agency_id', viewAgencyId);
      const { data, error } = await q;
      if (error) throw error;
      setDataRows(data || []);
    } catch (err) {
      showNotification(err.message || 'Failed to load data');
    } finally {
      setDataLoading(false);
    }
  }, [dateFrom, dateTo, viewAgencyId, showNotification]);

  useEffect(() => {
    if (isSuperAdmin) loadData();
  }, [isSuperAdmin, loadData]);

  const campaigns = useMemo(() => {
    const map = new Map();
    dataRows.forEach((r) => {
      const key = `${r.customer_id}|${r.campaign_id}`;
      const c = map.get(key) || { ...r, impressions: 0, clicks: 0, cost: 0, conversions: 0, conversions_value: 0 };
      c.impressions += Number(r.impressions || 0);
      c.clicks += Number(r.clicks || 0);
      c.cost += Number(r.cost || 0);
      c.conversions += Number(r.conversions || 0);
      c.conversions_value += Number(r.conversions_value || 0);
      map.set(key, c);
    });
    return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
  }, [dataRows]);

  const totals = useMemo(() => campaigns.reduce((t, c) => ({
    impressions: t.impressions + c.impressions,
    clicks: t.clicks + c.clicks,
    cost: t.cost + c.cost,
    conversions: t.conversions + c.conversions,
  }), { impressions: 0, clicks: 0, cost: 0, conversions: 0 }), [campaigns]);

  if (authLoading || (!userProfile && !userRole)) {
    return (
      <div className="page-section active">
        <div className="page-content"><p>Loading…</p></div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="page-section active">
        <div className="page-content">
          <div className="card" style={{ padding: 48, textAlign: 'center' }}>
            <h2>Access Denied</h2>
            <p>This test page is available to super admins only.</p>
          </div>
        </div>
      </div>
    );
  }

  const { config, connections, accounts } = status;
  const missingSecrets = config && (!config.client_id_set || !config.client_secret_set);
  const activeConnections = connections.filter((c) => c.is_active);

  return (
    <div className="page-section active">
      <div className="page-content">
        <div className="page-title-bar">
          <h2>Google Ads (Test)</h2>
          <p>Fetch campaign data through the verified Google app into <code>google_ads_temp</code></p>
        </div>
        {missingSecrets && (
          <div className="insight-banner info" style={{ marginBottom: 16 }}>
            <span className="icon">⚠️</span>
            <div>
              Missing Edge Function secrets:{' '}
              {[
                !config.client_id_set && 'GADS_TEST_CLIENT_ID',
                !config.client_secret_set && 'GADS_TEST_CLIENT_SECRET',
              ].filter(Boolean).join(', ')}
            </div>
          </div>
        )}

        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>1. Connect the verified app</h3>
          <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
            Sign in with the Google account that has access to the ad accounts. Add <code>{redirectUri}</code> as an
            Authorized redirect URI on the verified app&apos;s OAuth client.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              className="form-input"
              placeholder="MCC ID (optional, e.g. 123-456-7890)"
              value={mccInput}
              onChange={(e) => setMccInput(e.target.value)}
              style={{ padding: '8px 12px', minWidth: 280 }}
            />
            <button type="button" className="btn btn-primary" onClick={handleConnect} disabled={busy === 'connect' || missingSecrets}>
              {busy === 'connect' ? 'Connecting…' : 'Connect Google account'}
            </button>
            {activeConnections.length > 0 && (
              <button type="button" className="btn btn-outline" onClick={handleCheckTokens} disabled={!!busy}>
                {busy === 'check-tokens' ? 'Checking…' : 'Check tokens & account access'}
              </button>
            )}
          </div>

          {tokenCheck && (
            <div style={{ marginTop: 12, fontSize: 13 }}>
              <strong>Token check ({new Date(tokenCheck.checked_at).toLocaleString()}):</strong>
              <ul style={{ margin: '4px 0 0' }}>
                {tokenCheck.results.map((r) => (
                  <li key={r.connection_id}>
                    {r.google_email}:{' '}
                    {r.token_status === 'ok'
                      ? `token OK, ${r.accounts_ok} accounts reachable${r.accounts_failed ? `, ${r.accounts_failed} failed` : ''}`
                      : <span style={{ color: 'var(--danger, #c00)' }}>{r.token_status}: {r.error} (reconnect this account)</span>}
                    {r.failed?.map((f) => (
                      <div key={f.customer_id} style={{ color: 'var(--danger, #c00)', marginLeft: 12 }}>
                        {fmtCid(f.customer_id)}: {f.error}
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {connections.length > 0 && (
            <table className="data-table" style={{ marginTop: 16 }}>
              <thead>
                <tr><th>Google account</th><th>MCC</th><th>Status</th><th>Token</th><th>Connected</th><th>Last error</th><th /></tr>
              </thead>
              <tbody>
                {connections.map((c) => (
                  <tr key={c.id}>
                    <td>{c.google_email}</td>
                    <td>{c.mcc_id ? fmtCid(c.mcc_id) : '—'}</td>
                    <td><span className={`badge ${c.is_active ? 'badge-green' : 'badge-gray'}`}>{c.is_active ? 'Active' : 'Disconnected'}</span></td>
                    <td style={{ fontSize: 12 }}>
                      {c.token_status ? (
                        <span className={`badge ${c.token_status === 'ok' ? 'badge-green' : 'badge-red'}`}>
                          {c.token_status === 'ok' ? 'Valid' : c.token_status === 'expired_or_revoked' ? 'Expired / revoked' : 'Error'}
                        </span>
                      ) : 'Not checked'}
                      {c.last_checked_at && <div style={{ color: 'var(--text-muted)' }}>{new Date(c.last_checked_at).toLocaleString()}</div>}
                    </td>
                    <td>{new Date(c.connected_at).toLocaleString()}</td>
                    <td style={{ maxWidth: 280, fontSize: 12, color: 'var(--danger, #c00)' }}>{c.last_error || ''}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {c.is_active && (
                        <>
                          <button type="button" className="btn btn-outline btn-sm" disabled={!!busy}
                            onClick={() => runAction(`refresh-${c.id}`, { action: 'refresh_accounts', connection_id: c.id }, (r) => `${r.accounts_found} accounts found`)}>
                            {busy === `refresh-${c.id}` ? 'Loading…' : 'Refresh accounts'}
                          </button>{' '}
                          <button type="button" className="btn btn-outline btn-sm" disabled={!!busy}
                            onClick={() => runAction(`disc-${c.id}`, { action: 'disconnect', connection_id: c.id }, 'Disconnected')}>
                            Disconnect
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>2. Map accounts to agencies &amp; sync</h3>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <label>From <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
            <label>To <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
            <select value={syncAgencyId} onChange={(e) => setSyncAgencyId(e.target.value)} style={{ padding: '6px 10px' }}>
              <option value="">Select agency…</option>
              {allAgencies.map((a) => <option key={a.id} value={a.id}>{a.agency_name}</option>)}
            </select>
            <button type="button" className="btn btn-primary btn-sm" disabled={!syncAgencyId || !!busy}
              onClick={() => handleSync({ agency_id: syncAgencyId })}>
              {busy === 'sync-agency' ? 'Syncing…' : 'Sync all accounts of agency'}
            </button>
          </div>

          {loading ? (
            <p>Loading…</p>
          ) : accounts.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>
              {activeConnections.length ? 'No accounts yet. Click "Refresh accounts" above.' : 'Connect a Google account to list its ad accounts.'}
            </p>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Account</th><th>Customer ID</th><th>Currency</th><th>Agency</th><th>Access</th><th>Last sync</th><th /></tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.customer_id}>
                    <td>
                      {a.descriptive_name || '(no name)'}
                      {a.is_manager && <span className="badge badge-gray" style={{ marginLeft: 6 }}>MCC</span>}
                    </td>
                    <td>{fmtCid(a.customer_id)}</td>
                    <td>{a.currency_code || '—'}</td>
                    <td>
                      <select
                        value={a.agency_id || ''}
                        disabled={!!busy}
                        onChange={(e) => runAction(`assign-${a.customer_id}`,
                          { action: 'assign_agency', customer_id: a.customer_id, agency_id: e.target.value || null },
                          'Agency updated')}
                        style={{ padding: '4px 8px' }}
                      >
                        <option value="">— Unassigned —</option>
                        {allAgencies.map((ag) => <option key={ag.id} value={ag.id}>{ag.agency_name}</option>)}
                      </select>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {a.is_manager ? '—' : a.access_ok == null ? 'Not checked' : (
                        <span className={`badge ${a.access_ok ? 'badge-green' : 'badge-red'}`}>{a.access_ok ? 'OK' : 'Failed'}</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {a.last_synced_at ? `${new Date(a.last_synced_at).toLocaleString()} (${a.last_sync_rows} rows)` : 'Never'}
                      {a.last_error && <div style={{ color: 'var(--danger, #c00)', maxWidth: 320 }}>{a.last_error}</div>}
                    </td>
                    <td>
                      {!a.is_manager && (
                        <button type="button" className="btn btn-outline btn-sm" disabled={!!busy}
                          onClick={() => handleSync({ customer_id: a.customer_id })}>
                          {busy === `sync-${a.customer_id}` ? 'Syncing…' : 'Sync'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {lastResult && (
            <div style={{ marginTop: 12, fontSize: 13 }}>
              <strong>Last sync:</strong> {lastResult.total_rows} rows
              <ul style={{ margin: '4px 0 0' }}>
                {lastResult.results.map((r) => (
                  <li key={r.customer_id}>
                    {fmtCid(r.customer_id)}: {r.error ? <span style={{ color: 'var(--danger, #c00)' }}>{r.error}</span> : `${r.rows} rows`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ margin: 0 }}>3. Data in google_ads_temp ({dateFrom} → {dateTo})</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={viewAgencyId} onChange={(e) => setViewAgencyId(e.target.value)} style={{ padding: '6px 10px' }}>
                <option value="">All agencies</option>
                {allAgencies.map((a) => <option key={a.id} value={a.id}>{a.agency_name}</option>)}
              </select>
              <button type="button" className="btn btn-outline btn-sm" onClick={loadData} disabled={dataLoading}>
                {dataLoading ? 'Loading…' : 'Reload'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 24, margin: '16px 0', flexWrap: 'wrap' }}>
            <div><div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Impressions</div><strong>{fmtNum(totals.impressions)}</strong></div>
            <div><div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Clicks</div><strong>{fmtNum(totals.clicks)}</strong></div>
            <div><div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Cost</div><strong>{fmtNum(totals.cost, 2)}</strong></div>
            <div><div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Conversions</div><strong>{fmtNum(totals.conversions, 2)}</strong></div>
            <div><div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Campaigns</div><strong>{campaigns.length}</strong></div>
          </div>

          {campaigns.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No rows for this range yet.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Agency</th><th>Account</th><th>Campaign</th><th>Type</th><th>Status</th><th>Impr.</th><th>Clicks</th><th>Cost</th><th>Conv.</th></tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={`${c.customer_id}|${c.campaign_id}`}>
                    <td>{agencyName(c.agency_id)}</td>
                    <td>{c.customer_name || fmtCid(c.customer_id)}</td>
                    <td>{c.campaign_name}</td>
                    <td>{c.channel_type}</td>
                    <td>{c.campaign_status}</td>
                    <td>{fmtNum(c.impressions)}</td>
                    <td>{fmtNum(c.clicks)}</td>
                    <td>{fmtNum(c.cost, 2)}</td>
                    <td>{fmtNum(c.conversions, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
