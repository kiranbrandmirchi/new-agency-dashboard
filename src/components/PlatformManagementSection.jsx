import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getDateRangeFromPreset } from '../lib/datePresets';
import { syncGhlWithChunking } from '../utils/syncHelper';
import { GhlHipaaCsvUpload } from './GhlHipaaCsvUpload';

const GHL_SYNC_PRESETS = [
  { key: 'last7', label: 'Last 7 days' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'last90', label: 'Last 90 days' },
  { key: 'all_time', label: 'All time' },
  { key: 'custom', label: 'Custom range' },
];

function maskApiKeyLast4(key) {
  if (key == null || key === '') return '—';
  const s = String(key);
  if (s.length <= 4) return '••••';
  const maskLen = Math.min(12, s.length - 4);
  return `${'•'.repeat(maskLen)}${s.slice(-4)}`;
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

export function PlatformManagementSection({
  effectiveAgencyId,
  accounts,
  loadingAccounts,
  fetchAccounts,
  showNotification,
  syncingAccountId,
  togglingAccountId,
  onToggleActive,
  onToggleAutoSync,
  onToggleHipaaCompliance,
  setSyncingAccount,
}) {
  const [clients, setClients] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    client_id: '',
    account_name: '',
    platform_customer_id: '',
    platform_api_key: '',
  });
  /** Default all time so backfills match expectations; presets use chunked ranges like Google Ads. */
  const [ghlDatePreset, setGhlDatePreset] = useState('all_time');
  const [ghlCustomFrom, setGhlCustomFrom] = useState('');
  const [ghlCustomTo, setGhlCustomTo] = useState('');
  const [ghlSyncingAll, setGhlSyncingAll] = useState(false);
  const [ghlSyncProgress, setGhlSyncProgress] = useState(null);
  const [hipaaCsvOpenId, setHipaaCsvOpenId] = useState(null);

  const ghlAccounts = useMemo(() => accounts.filter((a) => a.platform === 'ghl'), [accounts]);

  const buildGhlSyncPayload = useCallback(() => {
    if (ghlDatePreset === 'all_time') return { mode: 'full', all_time: true };
    if (ghlDatePreset === 'custom') {
      if (!ghlCustomFrom || !ghlCustomTo) return null;
      return { mode: 'full', date_from: ghlCustomFrom, date_to: ghlCustomTo };
    }
    const r = getDateRangeFromPreset(ghlDatePreset);
    if (!r) return null;
    return { mode: 'full', date_from: r.dateFrom, date_to: r.dateTo };
  }, [ghlDatePreset, ghlCustomFrom, ghlCustomTo]);

  const loadClients = useCallback(async () => {
    if (!effectiveAgencyId) {
      setClients([]);
      return;
    }
    const { data, error } = await supabase.from('clients').select('id, name').eq('agency_id', effectiveAgencyId).order('name');
    if (error) {
      setClients([]);
      return;
    }
    setClients(data || []);
  }, [effectiveAgencyId]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const runGhlSyncForAccount = async (account, syncPayload) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { ok: false, noSession: true, message: 'Please sign in first.' };

    const allTime = !!syncPayload.all_time;
    const dateFrom = syncPayload.date_from;
    const dateTo = syncPayload.date_to;

    let result;
    try {
      result = await syncGhlWithChunking({
        customerId: account.platform_customer_id,
        accessToken: session.access_token,
        allTime,
        dateFrom,
        dateTo,
        chunkDays: 7,
        onProgress: (p) => {
          setGhlSyncProgress({
            accountName: account.account_name || account.platform_customer_id,
            current: p.current,
            total: p.total,
            dateFrom: p.dateFrom,
            dateTo: p.dateTo,
            status: p.status,
          });
        },
      });
    } catch (e) {
      setGhlSyncProgress(null);
      return { ok: false, message: e?.message || 'GHL sync failed' };
    }

    setGhlSyncProgress(null);
    const ok = result.success;
    const now = new Date().toISOString();
    await supabase
      .from('client_platform_accounts')
      .update({
        last_sync_at: now,
        last_synced_at: now,
        sync_status: ok ? 'success' : 'error',
        last_sync_status: ok ? 'success' : 'error',
      })
      .eq('id', account.id);

    const message = ok ? '' : (result.errors?.join('; ') || 'GHL sync failed');
    return { ok, message, totalRows: result.totalRows };
  };

  const handleSyncGhl = async (account) => {
    if (account.hipaa_compliant) {
      showNotification('HIPAA locations use CSV upload instead of API sync.');
      return;
    }
    const syncPayload = buildGhlSyncPayload();
    if (!syncPayload) {
      showNotification('Choose a valid range (for custom, set both dates).');
      return;
    }
    setSyncingAccount?.(account.id);
    try {
      const r = await runGhlSyncForAccount(account, syncPayload);
      if (r.noSession) showNotification(r.message);
      else if (r.ok) {
        showNotification(
          r.totalRows != null && r.totalRows > 0
            ? `GHL sync completed (~${r.totalRows} rows).`
            : 'GHL sync completed.',
        );
      } else showNotification(r.message || 'GHL sync failed');
      await fetchAccounts();
    } catch (e) {
      showNotification(e?.message || 'GHL sync failed');
    } finally {
      setSyncingAccount?.(null);
    }
  };

  const handleSyncAllGhl = async () => {
    const active = ghlAccounts.filter((a) => a.is_active && !a.hipaa_compliant);
    const hipaaActive = ghlAccounts.filter((a) => a.is_active && a.hipaa_compliant).length;
    if (!active.length) {
      showNotification(
        hipaaActive
          ? 'No non-HIPAA GHL accounts to sync. HIPAA locations use CSV upload.'
          : 'No active GHL accounts to sync.',
      );
      return;
    }
    const syncPayload = buildGhlSyncPayload();
    if (!syncPayload) {
      showNotification('Choose a valid range (for custom, set both dates).');
      return;
    }
    setGhlSyncingAll(true);
    let failures = 0;
    let totalRowsAll = 0;
    let aborted = false;
    try {
      for (const account of active) {
        setSyncingAccount?.(account.id);
        const r = await runGhlSyncForAccount(account, syncPayload);
        if (r.noSession) {
          showNotification(r.message);
          aborted = true;
          break;
        }
        if (!r.ok) failures += 1;
        else totalRowsAll += r.totalRows ?? 0;
      }
      if (!aborted) {
        if (failures > 0) {
          showNotification(`GHL sync finished with ${failures} error(s).`);
        } else {
          showNotification(
            totalRowsAll > 0
              ? `GHL sync all completed (~${totalRowsAll} rows total).`
              : 'GHL sync all completed.',
          );
        }
      }
      await fetchAccounts();
    } catch (e) {
      showNotification(e?.message || 'GHL sync failed');
    } finally {
      setGhlSyncingAll(false);
      setSyncingAccount?.(null);
      setGhlSyncProgress(null);
    }
  };

  const handleSubmitAdd = async (e) => {
    e.preventDefault();
    if (!effectiveAgencyId) {
      showNotification('Select an agency first.');
      return;
    }
    const name = form.account_name.trim() || form.platform_customer_id.trim();
    if (!name || !form.platform_customer_id.trim()) {
      showNotification('Display name and location ID are required.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('client_platform_accounts').insert({
        agency_id: effectiveAgencyId,
        client_id: form.client_id || null,
        platform: 'ghl',
        platform_customer_id: form.platform_customer_id.trim(),
        account_name: name,
        platform_api_key: form.platform_api_key.trim() || null,
        is_active: true,
      });
      if (error) throw error;
      showNotification('GHL location added.');
      setModalOpen(false);
      setForm({
        client_id: '',
        account_name: '',
        platform_customer_id: '',
        platform_api_key: '',
      });
      await fetchAccounts();
    } catch (err) {
      showNotification(err?.message || 'Failed to add location');
    } finally {
      setSaving(false);
    }
  };

  const progressLabel = ghlSyncProgress
    ? ghlSyncProgress.total > 1
      ? `Chunk ${ghlSyncProgress.current}/${ghlSyncProgress.total}${ghlSyncProgress.dateFrom ? ` (${ghlSyncProgress.dateFrom} → ${ghlSyncProgress.dateTo})` : ' (all time)'}`
      : ghlSyncProgress.dateFrom
        ? `${ghlSyncProgress.dateFrom} → ${ghlSyncProgress.dateTo}`
        : 'All time'
    : '';

  return (
    <div className="settings-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0 }}>GHL</h3>
          <p className="help-text" style={{ margin: '4px 0 0' }}>
            GoHighLevel only. Other ad platforms are synced from their own settings tabs. Date presets work like Google Ads: ranges run in 7-day chunks; All time runs one full sync.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)} disabled={!effectiveAgencyId}>
          Add GHL location
        </button>
      </div>

      {ghlSyncProgress && (
        <div className="insight-banner info" style={{ marginBottom: 12 }}>
          <span className="icon">⏳</span>
          <div>
            {ghlSyncProgress.accountName && <strong>{ghlSyncProgress.accountName}: </strong>}
            {progressLabel}
            {ghlSyncProgress.status === 'failed' && ' — error'}
            {ghlSyncProgress.status === 'syncing' && ' — syncing…'}
          </div>
        </div>
      )}

      {loadingAccounts ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : (
        <>
          {ghlAccounts.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                <div>
                  <h4 style={{ margin: 0 }}>Locations</h4>
                  <p className="help-text" style={{ margin: '4px 0 0' }}>
                    Pick a range, then Sync now or Sync all (same flow as Google Ads chunking for dated ranges).
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {GHL_SYNC_PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      className={`btn btn-sm ${ghlDatePreset === p.key ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setGhlDatePreset(p.key)}
                    >
                      {p.label}
                    </button>
                  ))}
                  {ghlDatePreset === 'custom' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="date"
                        value={ghlCustomFrom}
                        onChange={(e) => setGhlCustomFrom(e.target.value)}
                        style={{ padding: '6px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6 }}
                      />
                      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>to</span>
                      <input
                        type="date"
                        value={ghlCustomTo}
                        onChange={(e) => setGhlCustomTo(e.target.value)}
                        style={{ padding: '6px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6 }}
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleSyncAllGhl}
                    disabled={ghlSyncingAll || !!syncingAccountId}
                  >
                    {ghlSyncingAll ? 'Syncing…' : `Sync all (${ghlAccounts.filter((a) => a.is_active && !a.hipaa_compliant).length})`}
                  </button>
                </div>
              </div>
              <div className="panel">
                <div className="panel-body no-padding">
                  <div className="table-wrapper" style={{ overflowX: 'auto' }}>
                    <table className="data-table gads-table">
                      <thead>
                        <tr>
                          <th>Client name</th>
                          <th>Location ID</th>
                          <th>API key</th>
                          <th>Active</th>
                          <th>Last sync</th>
                          <th>Sync status</th>
                          <th>Auto-sync</th>
                          <th>HIPAA</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ghlAccounts.map((acc) => (
                          <React.Fragment key={acc.id}>
                            <tr>
                              <td>
                                <span style={{ marginRight: 8 }}>{acc.account_name || '—'}</span>
                                {acc.hipaa_compliant ? (
                                  <span className="badge badge-yellow" title="HIPAA: API sync disabled; use CSV upload">HIPAA</span>
                                ) : null}
                              </td>
                              <td style={{ fontSize: 12 }}>{acc.platform_customer_id || '—'}</td>
                              <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{maskApiKeyLast4(acc.platform_api_key)}</td>
                              <td>
                                <span className={`badge ${acc.is_active ? 'badge-green' : 'badge-gray'}`}>{acc.is_active ? 'Yes' : 'No'}</span>
                              </td>
                              <td>{formatRelativeTime(acc.last_sync_at || acc.last_synced_at)}</td>
                              <td>
                                <span className={`badge ${statusBadge(acc.sync_status || acc.last_sync_status)}`}>
                                  {acc.sync_status || acc.last_sync_status || '—'}
                                </span>
                              </td>
                              <td>
                                <label className="admin-toggle">
                                  <input
                                    type="checkbox"
                                    checked={!!acc.auto_sync_enabled}
                                    onChange={() => onToggleAutoSync(acc)}
                                    disabled={togglingAccountId === acc.id}
                                  />
                                  <span />
                                </label>
                              </td>
                              <td>
                                <label className="admin-toggle" title="HIPAA: skip API sync; use CSV uploads for calls/forms">
                                  <input
                                    type="checkbox"
                                    checked={!!acc.hipaa_compliant}
                                    onChange={() => onToggleHipaaCompliance?.(acc)}
                                    disabled={!onToggleHipaaCompliance || togglingAccountId === acc.id}
                                  />
                                  <span />
                                </label>
                              </td>
                              <td style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {acc.hipaa_compliant ? (
                                  <button
                                    type="button"
                                    className="btn btn-accent btn-sm"
                                    onClick={() => setHipaaCsvOpenId((id) => (id === acc.id ? null : acc.id))}
                                    disabled={!acc.is_active}
                                  >
                                    {hipaaCsvOpenId === acc.id ? 'Hide CSV' : 'Upload CSV'}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn btn-accent btn-sm"
                                    onClick={() => handleSyncGhl(acc)}
                                    disabled={syncingAccountId === acc.id || !acc.is_active || ghlSyncingAll}
                                  >
                                    {syncingAccountId === acc.id ? 'Syncing…' : 'Sync now'}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className={`btn btn-sm ${acc.is_active ? 'btn-outline' : 'btn-primary'}`}
                                  onClick={() => onToggleActive(acc)}
                                  disabled={togglingAccountId === acc.id}
                                >
                                  {togglingAccountId === acc.id ? '…' : acc.is_active ? 'Deactivate' : 'Activate'}
                                </button>
                              </td>
                            </tr>
                            {hipaaCsvOpenId === acc.id && acc.hipaa_compliant && acc.platform_customer_id ? (
                              <tr>
                                <td colSpan={9} style={{ background: 'var(--panel-alt, #f8f9fa)', padding: '0 16px 16px' }}>
                                  <GhlHipaaCsvUpload
                                    locationId={String(acc.platform_customer_id)}
                                    accountLabel={acc.account_name || acc.platform_customer_id}
                                    showNotification={showNotification}
                                    onUploaded={fetchAccounts}
                                  />
                                </td>
                              </tr>
                            ) : null}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}

          {ghlAccounts.length === 0 && (
            <p style={{ color: 'var(--text-muted)' }}>No GHL locations yet. Add a location ID and private integration token to sync.</p>
          )}
        </>
      )}

      {modalOpen && (
        <div
          className="admin-modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ghl-modal-title"
          onClick={() => !saving && setModalOpen(false)}
        >
          <div
            className="panel"
            style={{ maxWidth: 440, width: '100%', maxHeight: '90vh', overflow: 'auto' }}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="panel-body">
              <h3 id="ghl-modal-title" style={{ marginTop: 0 }}>Add GHL location</h3>
              <form onSubmit={handleSubmitAdd}>
                <div className="settings-form-group">
                  <label>Client (optional)</label>
                  <select
                    className="form-control"
                    value={form.client_id}
                    onChange={(e) => {
                      const id = e.target.value;
                      const c = clients.find((x) => x.id === id);
                      setForm((f) => ({
                        ...f,
                        client_id: id,
                        account_name: f.account_name || c?.name || '',
                      }));
                    }}
                  >
                    <option value="">— Custom name below —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="settings-form-group">
                  <label>Display name</label>
                  <input
                    type="text"
                    value={form.account_name}
                    onChange={(e) => setForm((f) => ({ ...f, account_name: e.target.value }))}
                    placeholder="Shown in dashboards"
                  />
                </div>
                <div className="settings-form-group">
                  <label>GHL location ID</label>
                  <input
                    type="text"
                    value={form.platform_customer_id}
                    onChange={(e) => setForm((f) => ({ ...f, platform_customer_id: e.target.value }))}
                    placeholder="Location ID from GHL"
                    required
                  />
                </div>
                <div className="settings-form-group">
                  <label>Private integration token</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={form.platform_api_key}
                    onChange={(e) => setForm((f) => ({ ...f, platform_api_key: e.target.value }))}
                    placeholder="pit-… (required for sync)"
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                  <button type="button" className="btn btn-outline" disabled={saving} onClick={() => setModalOpen(false)}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
