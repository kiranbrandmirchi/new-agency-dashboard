import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';

const DAYS = 14;
const AGENCIES = [
  { key: 'wheeler', title: 'Wheeler', match: /wheeler/i },
  { key: 'redcastle', title: 'Red Castle', match: /red\s*castle/i },
];

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const num = (v, digits = 0) =>
  Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

function AgencyTable({ title, agency, accounts, connection, rows, busy, onSync }) {
  const daily = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      const key = `${r.date}|${r.customer_id}`;
      const d = map.get(key) || { date: r.date, name: r.customer_name, impressions: 0, clicks: 0, cost: 0, conversions: 0 };
      d.impressions += Number(r.impressions || 0);
      d.clicks += Number(r.clicks || 0);
      d.cost += Number(r.cost || 0);
      d.conversions += Number(r.conversions || 0);
      map.set(key, d);
    });
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
  }, [rows]);

  const lastSync = accounts.reduce((max, a) => (a.last_synced_at && a.last_synced_at > max ? a.last_synced_at : max), '');
  const failed = accounts.filter((a) => a.last_error);
  const tokenOk = connection?.token_status === 'ok';

  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <button type="button" className="btn btn-outline btn-sm" disabled={!agency || busy} onClick={() => onSync(agency.id)}>
          {busy ? 'Syncing…' : 'Sync now'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13, margin: '10px 0 14px' }}>
        <span>
          Token:{' '}
          {connection?.token_status ? (
            <span className={`badge ${tokenOk ? 'badge-green' : 'badge-red'}`}>{tokenOk ? 'Valid' : 'Expired / revoked'}</span>
          ) : 'Not checked'}
        </span>
        <span>Token checked: {connection?.last_checked_at ? new Date(connection.last_checked_at).toLocaleString() : '—'}</span>
        <span>Last sync: {lastSync ? new Date(lastSync).toLocaleString() : 'Never'}</span>
        <span>Accounts: {accounts.length}{failed.length ? ` (${failed.length} with errors)` : ''}</span>
      </div>

      {failed.map((a) => (
        <div key={a.customer_id} style={{ color: 'var(--danger, #c00)', fontSize: 12 }}>{a.descriptive_name}: {a.last_error}</div>
      ))}

      {daily.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No data yet.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>Date</th><th>Account</th><th>Impr.</th><th>Clicks</th><th>Cost</th><th>Conv.</th></tr>
          </thead>
          <tbody>
            {daily.map((d) => (
              <tr key={`${d.date}|${d.name}`}>
                <td>{d.date}</td>
                <td>{d.name}</td>
                <td>{num(d.impressions)}</td>
                <td>{num(d.clicks)}</td>
                <td>{num(d.cost, 2)}</td>
                <td>{num(d.conversions, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function GadsDailyTestTables({ allAgencies, accounts, connections, onSync, busyKey }) {
  const [rows, setRows] = useState([]);

  const mapped = useMemo(() => accounts.filter((a) => a.agency_id && !a.is_manager), [accounts]);

  const load = useCallback(async () => {
    const ids = mapped.map((a) => a.customer_id);
    if (!ids.length) { setRows([]); return; }
    const { data } = await supabase
      .from('google_ads_temp')
      .select('agency_id, customer_id, customer_name, date, impressions, clicks, cost, conversions')
      .in('customer_id', ids)
      .gte('date', isoDaysAgo(DAYS))
      .limit(10000);
    setRows(data || []);
  }, [mapped]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      {AGENCIES.map(({ key, title, match }) => {
        const agency = allAgencies.find((a) => match.test(a.agency_name));
        const agencyAccounts = mapped.filter((a) => a.agency_id === agency?.id);
        const connection = connections.find((c) => c.is_active && agencyAccounts.some((a) => a.connection_id === c.id));
        return (
          <AgencyTable
            key={key}
            title={`${title} – daily test (last ${DAYS} days)`}
            agency={agency}
            accounts={agencyAccounts}
            connection={connection}
            rows={rows.filter((r) => r.agency_id === agency?.id)}
            busy={busyKey === `daily-${agency?.id}`}
            onSync={async (agencyId) => { await onSync(agencyId); load(); }}
          />
        );
      })}
    </>
  );
}
