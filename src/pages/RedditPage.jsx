import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRedditData } from '../hooks/useRedditData';
import { useAuth } from '../context/AuthContext';
import { formatCurrency2, formatNumber, formatPercent } from '../utils/format';
import { DateRangePicker } from '../components/DatePicker';
import Chart from 'chart.js/auto';

const fU = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fI = (n) => Math.round(Number(n || 0)).toLocaleString('en-US');
const fP = (n) => Number(n || 0).toFixed(2) + '%';
const fR = (n) => Number(n || 0).toFixed(2) + 'x';

const PG = 25;

const TABS = [
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'adgroups', label: 'Ad Groups' },
  { id: 'communities', label: 'Communities' },
  { id: 'placements', label: 'Placements' },
  { id: 'daily', label: 'Daily Breakdown' },
];

function sortRows(rows, col, dir) {
  return [...rows].sort((a, b) => {
    const va = a[col], vb = b[col], d = dir === 'asc' ? 1 : -1;
    if (typeof va === 'string' && typeof vb === 'string') return d * va.localeCompare(vb);
    return d * ((+(va || 0)) - (+(vb || 0)));
  });
}

function paginate(rows, page) {
  const start = (page - 1) * PG, end = start + PG;
  return { rows: rows.slice(start, end), total: rows.length, page, pages: Math.ceil(rows.length / PG) || 1 };
}

function exportCSV(columns, rows, filename) {
  const header = columns.map((c) => `"${c.label}"`).join(',');
  const body = rows.map((r) => columns.map((c) => {
    const v = c.value(r); return typeof v === 'number' ? v : `"${String(v || '').replace(/"/g, '""')}"`;
  }).join(',')).join('\n');
  const blob = new Blob([header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function Pagination({ info, onPage }) {
  if (info.pages <= 1) return null;
  const s = Math.max(1, info.page - 2), e = Math.min(info.pages, info.page + 2);
  const pages = [];
  for (let i = s; i <= e; i++) pages.push(i);
  return (
    <div className="gads-pagination">
      <span className="gads-pg-info">Showing {(info.page - 1) * PG + 1}–{Math.min(info.page * PG, info.total)} of {fI(info.total)}</span>
      <div className="gads-pg-btns">
        <button className="btn btn-outline btn-sm" disabled={info.page <= 1} onClick={() => onPage(info.page - 1)}>← Prev</button>
        {pages.map((p) => <button key={p} className={`btn btn-sm ${p === info.page ? 'btn-primary' : 'btn-outline'}`} onClick={() => onPage(p)}>{p}</button>)}
        <button className="btn btn-outline btn-sm" disabled={info.page >= info.pages} onClick={() => onPage(info.page + 1)}>Next →</button>
      </div>
    </div>
  );
}

function SortTh({ label, col, sort, onSort, align }) {
  const arrow = sort.col === col ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '';
  return <th className={`${align === 'r' ? 'text-right' : ''} gads-sortable`} onClick={() => onSort(col)}>{label}{arrow}</th>;
}

export function RedditPage() {
  const { hasPermission } = useAuth();
  const { filters, updateFilter, batchUpdateFilters, fetchData, loading, loadingPhase, error, kpis, campaigns, adGroups, communities, placements, dailyTrend, redditAccounts } = useRedditData();

  const [activeTab, setActiveTab] = useState('campaigns');
  const [sort, setSort] = useState({ campaigns: { col: 'spend', dir: 'desc' }, adgroups: { col: 'spend', dir: 'desc' }, communities: { col: 'spend', dir: 'desc' }, placements: { col: 'spend', dir: 'desc' }, daily: { col: 'report_date', dir: 'desc' } });
  const [pg, setPg] = useState({ campaigns: 1, adgroups: 1, communities: 1, placements: 1, daily: 1 });
  const [chartCollapsed, setChartCollapsed] = useState(false);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  const handleSort = useCallback((tab, col) => {
    setSort((prev) => {
      const s = prev[tab]; const dir = s.col === col ? (s.dir === 'asc' ? 'desc' : 'asc') : 'desc';
      return { ...prev, [tab]: { col, dir } };
    });
    setPg((prev) => ({ ...prev, [tab]: 1 }));
  }, []);

  const handlePage = useCallback((tab, page) => setPg((prev) => ({ ...prev, [tab]: page })), []);

  const handleApply = () => { setPg({ campaigns: 1, adgroups: 1, communities: 1, placements: 1, daily: 1 }); fetchData(); };

  const handleDatePickerApply = useCallback(({ preset, dateFrom, dateTo }) => {
    batchUpdateFilters({ datePreset: preset, dateFrom: dateFrom || '', dateTo: dateTo || '' });
    setTimeout(() => fetchData(), 30);
  }, [batchUpdateFilters, fetchData]);

  const handleAccountChange = (e) => {
    updateFilter('customerId', e.target.value);
  };

  useEffect(() => {
    if (chartCollapsed || !chartRef.current || !dailyTrend.length) return;
    if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; }
    const labels = dailyTrend.map((d) => { const p = (d.report_date || d.date || '').split('-'); return p.length >= 3 ? `${parseInt(p[1])}/${parseInt(p[2])}` : d.report_date || d.date; });
    const datasets = [
      { label: 'Spend', data: dailyTrend.map((d) => +(d.spend || d.cost || 0)), borderColor: '#E12627', backgroundColor: '#E1262718', tension: 0.35, fill: false, borderWidth: 2.5, yAxisID: 'y' },
      { label: 'Impressions', data: dailyTrend.map((d) => +(d.impressions || 0)), borderColor: '#0083CB', backgroundColor: '#0083CB18', tension: 0.35, fill: false, borderWidth: 2.5, yAxisID: 'y' },
      { label: 'Clicks', data: dailyTrend.map((d) => +(d.clicks || 0)), borderColor: '#F5A623', backgroundColor: '#F5A62318', tension: 0.35, fill: false, borderWidth: 2.5, yAxisID: 'y' },
    ];
    chartInstance.current = new Chart(chartRef.current, {
      type: 'line', data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: true, position: 'bottom' } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { type: 'linear', position: 'left', beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, callback: (v) => Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : v } },
        },
      },
    });
    return () => { if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; } };
  }, [dailyTrend, chartCollapsed]);

  const campaignCols = [
    { col: 'campaign_name', label: 'Campaign', cell: (r) => r.campaign_name, value: (r) => r.campaign_name },
    { col: 'impressions', label: 'Impressions', align: 'r', cell: (r) => fI(r.impressions), value: (r) => r.impressions },
    { col: 'clicks', label: 'Clicks', align: 'r', cell: (r) => fI(r.clicks), value: (r) => r.clicks },
    { col: 'ctr', label: 'CTR%', align: 'r', cell: (r) => fP(r.ctr), value: (r) => r.ctr },
    { col: 'spend', label: 'Spend', align: 'r', cell: (r) => fU(r.spend), value: (r) => r.spend },
    { col: 'cpc', label: 'CPC', align: 'r', cell: (r) => fU(r.cpc), value: (r) => r.cpc },
    { col: 'totalPurchases', label: 'Purchases', align: 'r', cell: (r) => fI(r.totalPurchases || 0), value: (r) => r.totalPurchases || 0 },
    { col: 'purchase_total_value', label: 'Purchase Value', align: 'r', cell: (r) => fU(r.purchase_total_value), value: (r) => r.purchase_total_value },
    { col: 'roas', label: 'ROAS', align: 'r', cell: (r) => fR(r.roas), value: (r) => r.roas },
    { col: 'cpa', label: 'CPA', align: 'r', cell: (r) => fU(r.cpa), value: (r) => r.cpa },
  ];

  const adGroupCols = [
    { col: 'campaign_name', label: 'Campaign', cell: (r) => r.campaign_name, value: (r) => r.campaign_name },
    { col: 'ad_group_name', label: 'Ad Group', cell: (r) => r.ad_group_name, value: (r) => r.ad_group_name },
    { col: 'impressions', label: 'Impressions', align: 'r', cell: (r) => fI(r.impressions), value: (r) => r.impressions },
    { col: 'clicks', label: 'Clicks', align: 'r', cell: (r) => fI(r.clicks), value: (r) => r.clicks },
    { col: 'ctr', label: 'CTR%', align: 'r', cell: (r) => fP(r.ctr), value: (r) => r.ctr },
    { col: 'spend', label: 'Spend', align: 'r', cell: (r) => fU(r.spend), value: (r) => r.spend },
    { col: 'cpc', label: 'CPC', align: 'r', cell: (r) => fU(r.cpc), value: (r) => r.cpc },
    { col: 'totalPurchases', label: 'Purchases', align: 'r', cell: (r) => fI(r.totalPurchases || 0), value: (r) => r.totalPurchases || 0 },
    { col: 'purchase_total_value', label: 'Purchase Value', align: 'r', cell: (r) => fU(r.purchase_total_value), value: (r) => r.purchase_total_value },
    { col: 'roas', label: 'ROAS', align: 'r', cell: (r) => fR(r.roas), value: (r) => r.roas },
    { col: 'cpa', label: 'CPA', align: 'r', cell: (r) => fU(r.cpa), value: (r) => r.cpa },
  ];

  const communityCols = [
    { col: 'community', label: 'Community', cell: (r) => r.community, value: (r) => r.community },
    { col: 'impressions', label: 'Impressions', align: 'r', cell: (r) => fI(r.impressions), value: (r) => r.impressions },
    { col: 'clicks', label: 'Clicks', align: 'r', cell: (r) => fI(r.clicks), value: (r) => r.clicks },
    { col: 'ctr', label: 'CTR%', align: 'r', cell: (r) => fP(r.ctr), value: (r) => r.ctr },
    { col: 'spend', label: 'Spend', align: 'r', cell: (r) => fU(r.spend), value: (r) => r.spend },
    { col: 'cpc', label: 'CPC', align: 'r', cell: (r) => fU(r.cpc), value: (r) => r.cpc },
    { col: 'totalPurchases', label: 'Purchases', align: 'r', cell: (r) => fI(r.totalPurchases || 0), value: (r) => r.totalPurchases || 0 },
    { col: 'purchase_total_value', label: 'Purchase Value', align: 'r', cell: (r) => fU(r.purchase_total_value), value: (r) => r.purchase_total_value },
    { col: 'roas', label: 'ROAS', align: 'r', cell: (r) => fR(r.roas), value: (r) => r.roas },
    { col: 'cpa', label: 'CPA', align: 'r', cell: (r) => fU(r.cpa), value: (r) => r.cpa },
  ];

  const placementCols = [
    { col: 'placement', label: 'Placement', cell: (r) => r.placement, value: (r) => r.placement },
    { col: 'impressions', label: 'Impressions', align: 'r', cell: (r) => fI(r.impressions), value: (r) => r.impressions },
    { col: 'clicks', label: 'Clicks', align: 'r', cell: (r) => fI(r.clicks), value: (r) => r.clicks },
    { col: 'ctr', label: 'CTR%', align: 'r', cell: (r) => fP(r.ctr), value: (r) => r.ctr },
    { col: 'spend', label: 'Spend', align: 'r', cell: (r) => fU(r.spend), value: (r) => r.spend },
    { col: 'cpc', label: 'CPC', align: 'r', cell: (r) => fU(r.cpc), value: (r) => r.cpc },
    { col: 'totalPurchases', label: 'Purchases', align: 'r', cell: (r) => fI(r.totalPurchases || 0), value: (r) => r.totalPurchases || 0 },
    { col: 'purchase_total_value', label: 'Purchase Value', align: 'r', cell: (r) => fU(r.purchase_total_value), value: (r) => r.purchase_total_value },
    { col: 'roas', label: 'ROAS', align: 'r', cell: (r) => fR(r.roas), value: (r) => r.roas },
    { col: 'cpa', label: 'CPA', align: 'r', cell: (r) => fU(r.cpa), value: (r) => r.cpa },
  ];

  const dailyCols = [
    { col: 'report_date', label: 'Date', cell: (r) => r.report_date || r.date, value: (r) => r.report_date || r.date },
    { col: 'impressions', label: 'Impressions', align: 'r', cell: (r) => fI(r.impressions), value: (r) => r.impressions },
    { col: 'clicks', label: 'Clicks', align: 'r', cell: (r) => fI(r.clicks), value: (r) => r.clicks },
    { col: 'ctr', label: 'CTR%', align: 'r', cell: (r) => fP(r.ctr), value: (r) => r.ctr },
    { col: 'spend', label: 'Spend', align: 'r', cell: (r) => fU(r.spend), value: (r) => r.spend },
    { col: 'cpc', label: 'CPC', align: 'r', cell: (r) => fU(r.cpc), value: (r) => r.cpc },
    { col: 'totalPurchases', label: 'Purchases', align: 'r', cell: (r) => fI(r.totalPurchases || 0), value: (r) => r.totalPurchases || 0 },
    { col: 'purchase_total_value', label: 'Purchase Value', align: 'r', cell: (r) => fU(r.purchase_total_value), value: (r) => r.purchase_total_value },
    { col: 'roas', label: 'ROAS', align: 'r', cell: (r) => fR(r.roas), value: (r) => r.roas },
    { col: 'cpa', label: 'CPA', align: 'r', cell: (r) => fU(r.cpa), value: (r) => r.cpa },
  ];

  const colMap = { campaigns: campaignCols, adgroups: adGroupCols, communities: communityCols, placements: placementCols, daily: dailyCols };
  const dataMap = { campaigns, adgroups: adGroups, communities, placements, daily: dailyTrend };

  const renderTable = (tab, data, columns) => {
    const s = sort[tab] || { col: 'spend', dir: 'desc' };
    const sorted = sortRows(data || [], s.col, s.dir);
    const info = paginate(sorted, pg[tab] || 1);
    return (
      <>
        <div className="panel"><div className="panel-body no-padding"><div className="table-wrapper">
          <table className="data-table gads-table">
            <thead><tr>{columns.map((c) => <SortTh key={c.col} label={c.label} col={c.col} sort={s} onSort={(col) => handleSort(tab, col)} align={c.align} />)}</tr></thead>
            <tbody>
              {info.rows.length === 0 && <tr><td colSpan={columns.length} className="gads-empty-cell">No data found for the selected filters.</td></tr>}
              {info.rows.map((r, i) => (
                <tr key={i}>
                  {columns.map((c) => <td key={c.col} className={c.align === 'r' ? 'text-right' : ''}>{c.cell(r)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div></div></div>
        <Pagination info={info} onPage={(p) => handlePage(tab, p)} />
      </>
    );
  };

  const handleCSV = () => {
    const data = dataMap[activeTab] || [];
    const cols = colMap[activeTab] || [];
    if (!data.length || !cols.length) return;
    exportCSV(cols.map((c) => ({ label: c.label, value: (r) => r[c.col] })), data, `reddit-${activeTab}.csv`);
  };

  const KPI_ITEMS = [
    { key: 'totalImpressions', label: 'Impressions', fmt: fI },
    { key: 'totalClicks', label: 'Clicks', fmt: fI },
    { key: 'totalSpend', label: 'Spend', fmt: fU },
    { key: 'ctr', label: 'CTR', fmt: fP },
    { key: 'cpc', label: 'CPC', fmt: fU },
    { key: 'totalPurchases', label: 'Purchases', fmt: fI },
    { key: 'roas', label: 'ROAS', fmt: fR },
    { key: 'cpa', label: 'CPA', fmt: fU },
  ];

  return (
    <div className="page-section active" id="page-reddit">
      <div className="page-content">
        {/* ── Page Title Bar with Date Picker (same as Google Ads) ── */}
        <div className="page-title-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: '#FF4500', color: 'white', borderRadius: 8, fontSize: 16, fontWeight: 700 }}>R</span>
              Reddit Ads
            </h2>
            <p>Campaign performance across Reddit Ads</p>
          </div>
          <DateRangePicker preset={filters.datePreset} dateFrom={filters.dateFrom} dateTo={filters.dateTo} compareOn={false} compareFrom="" compareTo="" onApply={handleDatePickerApply} />
        </div>

        {/* ── Filter Bar (same structure as Google Ads) ── */}
        <div className="gads-filter-bar" id="gads-filter-bar">
          <div className="gads-filter-row">
            <div className="gads-filter-group gads-fg-sm">
              <label>Account</label>
              <select value={filters.customerId || 'ALL'} onChange={handleAccountChange}>
                <option value="ALL">All Accounts</option>
                {redditAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div className="gads-filter-group gads-filter-actions" style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-navy btn-sm" onClick={handleApply} disabled={loading} style={{ padding: '6px 20px' }}>{loading ? 'Loading…' : 'Apply'}</button>
              <span style={{ color: loading ? 'var(--warning)' : error ? 'var(--danger)' : 'var(--accent)', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{loading ? 'Loading…' : error ? 'Error' : 'Live'}</span>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ padding: '16px 20px', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 'var(--radius-md)', margin: '0 0 16px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ flex: 1 }}>{error}</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleApply}>Retry</button>
          </div>
        )}

        {/* ── KPI Section (same structure as Google Ads / Dashboard) ── */}
        <div className="gads-kpi-section">
          <div className="kpi-grid" id="gads-kpi-grid">
            {KPI_ITEMS.map((item) => (
              <div key={item.key} className="kpi-card">
                <div className="kpi-header">
                  <span className="kpi-label">{item.label}</span>
                </div>
                <div className="kpi-value">{kpis ? item.fmt(kpis[item.key] || 0) : '—'}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Chart Section ── */}
        <div className="gads-chart-section">
          <div className="gads-chart-toolbar">
            <span className="gads-chart-title">Daily Trends</span>
            <button className="btn btn-outline btn-sm" onClick={() => setChartCollapsed(!chartCollapsed)}>{chartCollapsed ? 'Show Chart ▼' : 'Hide Chart ▲'}</button>
          </div>
          {!chartCollapsed && <div className="gads-chart-wrap"><canvas ref={chartRef} style={{ height: 300 }} /></div>}
        </div>

        {/* ── Tabs (same as Google Ads) ── */}
        <div className="gads-tabs-container">
          <div className="gads-tabs-row">
            <div className="gads-tabs">
              {TABS.map((tab) => (
                <button key={tab.id} type="button" className={`gads-tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>
              ))}
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={handleCSV}>↓ CSV</button>
          </div>
        </div>

        <div id="gads-tab-content">
          {loading && <div className="gads-loading"><div className="gads-spinner" /> {loadingPhase || 'Loading data…'}</div>}
          {!loading && activeTab === 'campaigns' && renderTable('campaigns', campaigns, campaignCols)}
          {!loading && activeTab === 'adgroups' && renderTable('adgroups', adGroups, adGroupCols)}
          {!loading && activeTab === 'communities' && renderTable('communities', communities, communityCols)}
          {!loading && activeTab === 'placements' && renderTable('placements', placements, placementCols)}
          {!loading && activeTab === 'daily' && renderTable('daily', dailyTrend, dailyCols)}
        </div>
      </div>
    </div>
  );
}
