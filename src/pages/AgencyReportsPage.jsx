import React, { useState, useCallback } from 'react';
import { useAgencyReportData } from '../hooks/useAgencyReportData';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabaseClient';
import { syncGeo, resolveGeo, syncSearchTermsOnly } from '../utils/syncHelper';
import { DateRangePicker } from '../components/DatePicker';

const fU = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fI = (n) => Math.round(Number(n || 0)).toLocaleString('en-US');
const fP = (n) => Number(n || 0).toFixed(2) + '%';
const PG = 50;


function paginate(rows, page) {
  const start = (page - 1) * PG;
  return { rows: rows.slice(start, start + PG), total: rows.length, page, pages: Math.ceil(rows.length / PG) || 1 };
}

export function AgencyReportsPage() {
  const [activeTab, setActiveTab] = useState('geo');
  const [syncing, setSyncing] = useState(false);
  const [pg, setPg] = useState(1);

  const geoHook = useAgencyReportData('geo');
  const searchHook = useAgencyReportData('searchterms');

  const hook = activeTab === 'geo' ? geoHook : searchHook;
  const { data, loading, loadingPhase, error, fetchData, filters, updateFilter, clientOptions, computeDateRange } = hook;

  const { showNotification } = useApp();
  const getDateRange = useCallback(() => {
    const { from, to } = computeDateRange(filters.datePreset, filters.dateFrom, filters.dateTo);
    const today = new Date();
    const fmt = (d) => d.toISOString().slice(0, 10);
    const fallback = { dateFrom: fmt(new Date(today.getTime() - 7 * 86400000)), dateTo: fmt(today) };
    return from && to ? { dateFrom: from, dateTo: to } : fallback;
  }, [filters, computeDateRange]);

  const handleSync = async () => {
    const cid = filters.customerId;
    if (cid === '__NONE__' || !cid) {
      showNotification('No account selected');
      return;
    }
    const { dateFrom, dateTo } = getDateRange();
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { showNotification('Please sign in first'); return; }
      const token = session.access_token;

      const customerIds = cid === 'ALL' ? (clientOptions.filter((o) => o.id !== 'ALL' && o.id !== '__NONE__').map((o) => o.id)) : [cid];

      if (activeTab === 'geo') {
        for (const customerId of customerIds) {
          const geoRes = await syncGeo({ customerId, dateFrom, dateTo, accessToken: token });
          if (geoRes.success) showNotification('Geo synced');
          await resolveGeo({ accessToken: token });
        }
      } else {
        for (const customerId of customerIds) {
          const stRes = await syncSearchTermsOnly({ customerId, dateFrom, dateTo, accessToken: token });
          if (stRes.success) showNotification(`Search terms synced: ${stRes.rows ?? 0} rows`);
        }
      }
      fetchData();
    } catch (err) {
      showNotification(err?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleApply = () => {
    setPg(1);
    fetchData();
  };

  const geoCols = [
    { col: 'location', label: 'Location', dim: true },
    { col: 'geo_type', label: 'Type', dim: true, cell: (r) => r.geo_type ? <span className="badge badge-blue">{r.geo_type}</span> : '' },
    { col: 'country', label: 'Country', dim: true },
    { col: 'cost', label: 'Spend', align: 'r', cell: (r) => fU(r.cost) },
    { col: 'impressions', label: 'Impr.', align: 'r', cell: (r) => fI(r.impressions) },
    { col: 'clicks', label: 'Clicks', align: 'r', cell: (r) => fI(r.clicks) },
    { col: 'ctr', label: 'CTR', align: 'r', cell: (r) => fP(r.ctr) },
    { col: 'cpc', label: 'CPC', align: 'r', cell: (r) => fU(r.cpc) },
    { col: 'conversions', label: 'Conv.', align: 'r', cell: (r) => fI(r.conversions) },
    { col: 'cpa', label: 'CPA', align: 'r', cell: (r) => fU(r.cpa) },
  ];

  const searchTermCols = [
    { col: 'search_term', label: 'Search Term', dim: true, cell: (r) => r.search_term, clamp: true },
    { col: 'keyword_text', label: 'Top Keyword', dim: true, cell: (r) => r.keyword_text || '—' },
    { col: 'campaign_name', label: 'Campaign', dim: true, cell: (r) => r.campaign_name || '—' },
    { col: 'cost', label: 'Spend', align: 'r', cell: (r) => fU(r.cost) },
    { col: 'impressions', label: 'Impr.', align: 'r', cell: (r) => fI(r.impressions) },
    { col: 'clicks', label: 'Clicks', align: 'r', cell: (r) => fI(r.clicks) },
    { col: 'ctr', label: 'CTR', align: 'r', cell: (r) => fP(r.ctr) },
    { col: 'cpc', label: 'CPC', align: 'r', cell: (r) => fU(r.cpc) },
    { col: 'conversions', label: 'Conv.', align: 'r', cell: (r) => fI(r.conversions) },
    { col: 'cpa', label: 'CPA', align: 'r', cell: (r) => fU(r.cpa) },
  ];

  const cols = activeTab === 'geo' ? geoCols : searchTermCols;
  const { rows: pageRows, total, page, pages } = paginate(data, pg);

  return (
    <div className="page-section active" id="page-agency-reports">
      <div className="page-content">
        <div className="page-title-bar">
          <h2>Agency Reports</h2>
          <p>Detailed reports for geo and search terms—beneficial for agency and client analysis</p>
        </div>

        <div className="gads-tabs-container" style={{ marginBottom: 16 }}>
          <div className="gads-tabs">
            <button type="button" className={`gads-tab ${activeTab === 'geo' ? 'active' : ''}`} onClick={() => { setActiveTab('geo'); setPg(1); }}>Geo / Locations</button>
            <button type="button" className={`gads-tab ${activeTab === 'searchterms' ? 'active' : ''}`} onClick={() => { setActiveTab('searchterms'); setPg(1); }}>Search Terms</button>
          </div>
        </div>

        <div className="gads-filters-row" style={{ flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <DateRangePicker
            preset={filters.datePreset}
            dateFrom={filters.dateFrom}
            dateTo={filters.dateTo}
            compareOn={false}
            compareFrom=""
            compareTo=""
            onApply={({ preset, dateFrom: df, dateTo: dt }) => {
              updateFilter('datePreset', preset);
              updateFilter('dateFrom', df || '');
              updateFilter('dateTo', dt || '');
              setPg(1);
              setTimeout(() => fetchData(), 30);
            }}
          />
          <select
            value={filters.customerId}
            onChange={(e) => updateFilter('customerId', e.target.value)}
            style={{ minWidth: 180, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)' }}
          >
            {clientOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={handleApply}>Apply</button>
          <button type="button" className="btn btn-outline" onClick={handleSync} disabled={syncing || filters.customerId === '__NONE__'}>
            {syncing ? 'Syncing…' : `Sync ${activeTab === 'geo' ? 'Geo' : 'Search Terms'}`}
          </button>
        </div>

        {error && <div className="admin-message error" style={{ marginBottom: 16 }}>{error}</div>}

        {loading && <div className="gads-loading"><div className="gads-spinner" /> {loadingPhase || 'Loading…'}</div>}

        {!loading && (
          <div className="table-wrapper">
            <table className="data-table gads-table">
              <thead>
                <tr>
                  {cols.map((c) => (
                    <th key={c.col} className={c.align === 'r' ? 'text-right' : ''}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr><td colSpan={cols.length} className="gads-empty-cell">No data. Sync from Settings or use the Sync button above.</td></tr>
                ) : (
                  pageRows.map((r, i) => (
                    <tr key={r.location || r._key || i}>
                      {cols.map((c) => (
                        <td key={c.col} className={c.align === 'r' ? 'text-right' : ''} style={c.clamp ? { maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : undefined}>
                          {c.cell ? c.cell(r) : r[c.col]}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {pages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <span className="text-muted">Showing {(pg - 1) * PG + 1}–{Math.min(pg * PG, total)} of {total}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setPg((p) => Math.max(1, p - 1))} disabled={pg <= 1}>← Prev</button>
                  <span style={{ padding: '4px 12px', fontSize: 13 }}>Page {pg} of {pages}</span>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setPg((p) => Math.min(pages, p + 1))} disabled={pg >= pages}>Next →</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
