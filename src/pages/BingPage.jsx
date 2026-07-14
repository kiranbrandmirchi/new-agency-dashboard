import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useBingData } from '../hooks/useBingData';
import { useAuth } from '../context/AuthContext';
import { DateRangePicker } from '../components/DatePicker';
import { MicrosoftAdsLogo } from '../components/PlatformLogos';
import Chart from 'chart.js/auto';

const fU = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fI = (n) => Math.round(Number(n || 0)).toLocaleString('en-US');
const fP = (n) => Number(n || 0).toFixed(2) + '%';
const fR = (n) => Number(n || 0).toFixed(2) + 'x';
const fN = (n) => Number(n || 0).toFixed(2);

const PG = 25;

const ALL_TABS = [
  { id: 'overview', label: 'Overview', permission: 'tab.bing_ads.overview' },
  { id: 'campaigns', label: 'Campaigns', permission: 'tab.bing_ads.campaigns' },
  { id: 'adgroups', label: 'Ad Groups', permission: 'tab.bing_ads.adgroups' },
  { id: 'ads', label: 'Ads', permission: 'tab.bing_ads.ads' },
  { id: 'keywords', label: 'Keywords', permission: 'tab.bing_ads.keywords' },
  { id: 'searchterms', label: 'Search Terms', permission: 'tab.bing_ads.searchterms' },
  { id: 'geo', label: 'Locations', permission: 'tab.bing_ads.geo' },
  { id: 'conversions', label: 'Conversions', permission: 'tab.bing_ads.conversions' },
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

export function BingPage() {
  const { hasPermission } = useAuth();
  const {
    filters, updateFilter, batchUpdateFilters, fetchData, loading, loadingPhase, error,
    kpis, campaigns, adGroups, ads, keywords, searchTerms, geo, conversions, dailyTrend, bingAccounts,
  } = useBingData();

  const TABS = React.useMemo(() => ALL_TABS.filter((t) => hasPermission(t.permission)), [hasPermission]);
  const defaultTab = TABS[0]?.id || 'overview';
  const [activeTab, setActiveTab] = useState(defaultTab);
  useEffect(() => {
    if (TABS.length && !TABS.some((t) => t.id === activeTab)) setActiveTab(defaultTab);
  }, [TABS, activeTab, defaultTab]);

  const [sort, setSort] = useState({
    overview: { col: 'report_date', dir: 'desc' },
    campaigns: { col: 'spend', dir: 'desc' },
    adgroups: { col: 'spend', dir: 'desc' },
    ads: { col: 'spend', dir: 'desc' },
    keywords: { col: 'spend', dir: 'desc' },
    searchterms: { col: 'spend', dir: 'desc' },
    geo: { col: 'spend', dir: 'desc' },
    conversions: { col: 'conversions', dir: 'desc' },
  });
  const [pg, setPg] = useState({
    overview: 1, campaigns: 1, adgroups: 1, ads: 1, keywords: 1, searchterms: 1, geo: 1, conversions: 1,
  });
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

  const handleApply = () => {
    setPg({ overview: 1, campaigns: 1, adgroups: 1, ads: 1, keywords: 1, searchterms: 1, geo: 1, conversions: 1 });
    fetchData();
  };

  const handleDatePickerApply = useCallback(({ preset, dateFrom, dateTo }) => {
    batchUpdateFilters({ datePreset: preset, dateFrom: dateFrom || '', dateTo: dateTo || '' });
    fetchData(dateFrom && dateTo ? { dateFrom, dateTo } : undefined);
  }, [batchUpdateFilters, fetchData]);

  const handleAccountChange = (e) => {
    updateFilter('customerId', e.target.value);
  };

  useEffect(() => {
    if (chartCollapsed || !chartRef.current || !dailyTrend.length) return;
    if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; }
    const labels = dailyTrend.map((d) => {
      const p = (d.report_date || '').split('-');
      return p.length >= 3 ? `${parseInt(p[1])}/${parseInt(p[2])}` : d.report_date;
    });
    const datasets = [
      { label: 'Spend', data: dailyTrend.map((d) => +(d.spend || 0)), borderColor: '#00809D', backgroundColor: '#00809D18', tension: 0.35, fill: false, borderWidth: 2.5, yAxisID: 'y' },
      { label: 'Impressions', data: dailyTrend.map((d) => +(d.impressions || 0)), borderColor: '#00B294', backgroundColor: '#00B29418', tension: 0.35, fill: false, borderWidth: 2.5, yAxisID: 'y' },
      { label: 'Clicks', data: dailyTrend.map((d) => +(d.clicks || 0)), borderColor: '#737373', backgroundColor: '#73737318', tension: 0.35, fill: false, borderWidth: 2.5, yAxisID: 'y' },
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

  const overviewCols = [
    { col: 'report_date', label: 'Date', cell: (r) => r.report_date, value: (r) => r.report_date },
    { col: 'impressions', label: 'Impressions', align: 'r', cell: (r) => fI(r.impressions), value: (r) => r.impressions },
    { col: 'clicks', label: 'Clicks', align: 'r', cell: (r) => fI(r.clicks), value: (r) => r.clicks },
    { col: 'ctr', label: 'CTR%', align: 'r', cell: (r) => fP(r.ctr), value: (r) => r.ctr },
    { col: 'spend', label: 'Spend', align: 'r', cell: (r) => fU(r.spend), value: (r) => r.spend },
    { col: 'cpc', label: 'CPC', align: 'r', cell: (r) => fU(r.cpc), value: (r) => r.cpc },
    { col: 'conversions', label: 'Conv.', align: 'r', cell: (r) => fI(r.conversions), value: (r) => r.conversions },
    { col: 'cpa', label: 'CPA', align: 'r', cell: (r) => fU(r.cpa), value: (r) => r.cpa },
    { col: 'conversions_value', label: 'Conv. Value', align: 'r', cell: (r) => fU(r.conversions_value), value: (r) => r.conversions_value },
    { col: 'roas', label: 'ROAS', align: 'r', cell: (r) => fR(r.roas), value: (r) => r.roas },
  ];

  const campaignCols = [
    { col: 'campaign_name', label: 'Campaign', cell: (r) => r.campaign_name, value: (r) => r.campaign_name },
    { col: 'impressions', label: 'Impressions', align: 'r', cell: (r) => fI(r.impressions), value: (r) => r.impressions },
    { col: 'clicks', label: 'Clicks', align: 'r', cell: (r) => fI(r.clicks), value: (r) => r.clicks },
    { col: 'ctr', label: 'CTR%', align: 'r', cell: (r) => fP(r.ctr), value: (r) => r.ctr },
    { col: 'spend', label: 'Spend', align: 'r', cell: (r) => fU(r.spend), value: (r) => r.spend },
    { col: 'cpc', label: 'CPC', align: 'r', cell: (r) => fU(r.cpc), value: (r) => r.cpc },
    { col: 'conversions', label: 'Conv.', align: 'r', cell: (r) => fI(r.conversions), value: (r) => r.conversions },
    { col: 'cpa', label: 'CPA', align: 'r', cell: (r) => fU(r.cpa), value: (r) => r.cpa },
    { col: 'conversions_value', label: 'Conv. Value', align: 'r', cell: (r) => fU(r.conversions_value), value: (r) => r.conversions_value },
    { col: 'roas', label: 'ROAS', align: 'r', cell: (r) => fR(r.roas), value: (r) => r.roas },
  ];

  const adGroupCols = [
    { col: 'campaign_name', label: 'Campaign', cell: (r) => r.campaign_name, value: (r) => r.campaign_name },
    { col: 'ad_group_name', label: 'Ad Group', cell: (r) => r.ad_group_name, value: (r) => r.ad_group_name },
    ...campaignCols.slice(1),
  ];

  const adCols = [
    { col: 'campaign_name', label: 'Campaign', cell: (r) => r.campaign_name, value: (r) => r.campaign_name },
    { col: 'ad_group_name', label: 'Ad Group', cell: (r) => r.ad_group_name, value: (r) => r.ad_group_name },
    { col: 'ad_title', label: 'Ad', cell: (r) => r.ad_title, value: (r) => r.ad_title },
    ...campaignCols.slice(1),
  ];

  const keywordCols = [
    { col: 'campaign_name', label: 'Campaign', cell: (r) => r.campaign_name, value: (r) => r.campaign_name },
    { col: 'ad_group_name', label: 'Ad Group', cell: (r) => r.ad_group_name, value: (r) => r.ad_group_name },
    { col: 'keyword_text', label: 'Keyword', cell: (r) => r.keyword_text, value: (r) => r.keyword_text },
    { col: 'match_type', label: 'Match', cell: (r) => r.match_type, value: (r) => r.match_type },
    { col: 'impressions', label: 'Impressions', align: 'r', cell: (r) => fI(r.impressions), value: (r) => r.impressions },
    { col: 'clicks', label: 'Clicks', align: 'r', cell: (r) => fI(r.clicks), value: (r) => r.clicks },
    { col: 'ctr', label: 'CTR%', align: 'r', cell: (r) => fP(r.ctr), value: (r) => r.ctr },
    { col: 'spend', label: 'Spend', align: 'r', cell: (r) => fU(r.spend), value: (r) => r.spend },
    { col: 'cpc', label: 'CPC', align: 'r', cell: (r) => fU(r.cpc), value: (r) => r.cpc },
    { col: 'avg_position', label: 'Avg Pos', align: 'r', cell: (r) => fN(r.avg_position), value: (r) => r.avg_position },
    { col: 'conversions', label: 'Conv.', align: 'r', cell: (r) => fI(r.conversions), value: (r) => r.conversions },
    { col: 'cpa', label: 'CPA', align: 'r', cell: (r) => fU(r.cpa), value: (r) => r.cpa },
  ];

  const searchTermCols = [
    { col: 'campaign_name', label: 'Campaign', cell: (r) => r.campaign_name, value: (r) => r.campaign_name },
    { col: 'ad_group_name', label: 'Ad Group', cell: (r) => r.ad_group_name, value: (r) => r.ad_group_name },
    { col: 'search_term', label: 'Search Term', cell: (r) => r.search_term, value: (r) => r.search_term },
    { col: 'match_type', label: 'Match', cell: (r) => r.match_type, value: (r) => r.match_type },
    { col: 'impressions', label: 'Impressions', align: 'r', cell: (r) => fI(r.impressions), value: (r) => r.impressions },
    { col: 'clicks', label: 'Clicks', align: 'r', cell: (r) => fI(r.clicks), value: (r) => r.clicks },
    { col: 'ctr', label: 'CTR%', align: 'r', cell: (r) => fP(r.ctr), value: (r) => r.ctr },
    { col: 'spend', label: 'Spend', align: 'r', cell: (r) => fU(r.spend), value: (r) => r.spend },
    { col: 'cpc', label: 'CPC', align: 'r', cell: (r) => fU(r.cpc), value: (r) => r.cpc },
    { col: 'conversions', label: 'Conv.', align: 'r', cell: (r) => fI(r.conversions), value: (r) => r.conversions },
  ];

  const geoCols = [
    { col: 'location_name', label: 'Location', cell: (r) => r.location_name, value: (r) => r.location_name },
    { col: 'impressions', label: 'Impressions', align: 'r', cell: (r) => fI(r.impressions), value: (r) => r.impressions },
    { col: 'clicks', label: 'Clicks', align: 'r', cell: (r) => fI(r.clicks), value: (r) => r.clicks },
    { col: 'ctr', label: 'CTR%', align: 'r', cell: (r) => fP(r.ctr), value: (r) => r.ctr },
    { col: 'spend', label: 'Spend', align: 'r', cell: (r) => fU(r.spend), value: (r) => r.spend },
    { col: 'cpc', label: 'CPC', align: 'r', cell: (r) => fU(r.cpc), value: (r) => r.cpc },
    { col: 'conversions', label: 'Conv.', align: 'r', cell: (r) => fI(r.conversions), value: (r) => r.conversions },
  ];

  const conversionCols = [
    { col: 'campaign_name', label: 'Campaign', cell: (r) => r.campaign_name, value: (r) => r.campaign_name },
    { col: 'conversions', label: 'Conversions', align: 'r', cell: (r) => fI(r.conversions), value: (r) => r.conversions },
    { col: 'conversions_value', label: 'Conv. Value', align: 'r', cell: (r) => fU(r.conversions_value), value: (r) => r.conversions_value },
    { col: 'spend', label: 'Spend', align: 'r', cell: (r) => fU(r.spend), value: (r) => r.spend },
    { col: 'cpa', label: 'CPA', align: 'r', cell: (r) => fU(r.cpa), value: (r) => r.cpa },
    { col: 'roas', label: 'ROAS', align: 'r', cell: (r) => fR(r.roas), value: (r) => r.roas },
  ];

  const colMap = {
    overview: overviewCols,
    campaigns: campaignCols,
    adgroups: adGroupCols,
    ads: adCols,
    keywords: keywordCols,
    searchterms: searchTermCols,
    geo: geoCols,
    conversions: conversionCols,
  };
  const dataMap = {
    overview: dailyTrend,
    campaigns,
    adgroups: adGroups,
    ads,
    keywords,
    searchterms: searchTerms,
    geo,
    conversions,
  };

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
    exportCSV(cols.map((c) => ({ label: c.label, value: (r) => r[c.col] })), data, `bing-${activeTab}.csv`);
  };

  const KPI_ITEMS = [
    { key: 'totalImpressions', label: 'Impressions', fmt: fI },
    { key: 'totalClicks', label: 'Clicks', fmt: fI },
    { key: 'totalSpend', label: 'Spend', fmt: fU },
    { key: 'ctr', label: 'CTR', fmt: fP },
    { key: 'cpc', label: 'CPC', fmt: fU },
    { key: 'totalConversions', label: 'Conversions', fmt: fI },
    { key: 'cpa', label: 'CPA', fmt: fU },
    { key: 'roas', label: 'ROAS', fmt: fR },
  ];

  return (
    <div className="page-section active" id="page-bing">
      <div className="page-content">
        <div className="page-title-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <MicrosoftAdsLogo size={28} />
              Bing / Microsoft Ads
            </h2>
            <p>Search & audience performance across Microsoft Advertising</p>
          </div>
          <div style={{ marginLeft: 'auto', flexShrink: 0, width: 'min(440px, 100%)' }}>
            <DateRangePicker blockLayout preset={filters.datePreset} dateFrom={filters.dateFrom} dateTo={filters.dateTo} compareOn={false} compareFrom="" compareTo="" onApply={handleDatePickerApply} />
          </div>
        </div>

        <div className="gads-filter-bar" id="gads-filter-bar-bing">
          <div className="gads-filter-row">
            <div className="gads-filter-group gads-fg-sm">
              <label>Account</label>
              <select value={filters.customerId || 'ALL'} onChange={handleAccountChange}>
                <option value="ALL">All Accounts</option>
                {bingAccounts.map((a) => (
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

        <div className="gads-kpi-section">
          <div className="kpi-grid" id="gads-kpi-grid-bing">
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

        <div className="gads-chart-section">
          <div className="gads-chart-toolbar">
            <span className="gads-chart-title">Daily Trends</span>
            <button className="btn btn-outline btn-sm" onClick={() => setChartCollapsed(!chartCollapsed)}>{chartCollapsed ? 'Show Chart ▼' : 'Hide Chart ▲'}</button>
          </div>
          {!chartCollapsed && <div className="gads-chart-wrap"><canvas ref={chartRef} style={{ height: 300 }} /></div>}
        </div>

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

        <div id="gads-tab-content-bing">
          {loading && <div className="gads-loading"><div className="gads-spinner" /> {loadingPhase || 'Loading data…'}</div>}
          {!loading && renderTable(activeTab, dataMap[activeTab], colMap[activeTab])}
        </div>
      </div>
    </div>
  );
}
