import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Chart from 'chart.js/auto';
import { useGhlData } from '../hooks/useGhlData';
import { useAuth } from '../context/AuthContext';
import { DateRangePicker } from '../components/DatePicker';
import { maskName, maskPhone, maskEmail } from '../utils/hipaa';

const fI = (n) => Math.round(Number(n || 0)).toLocaleString('en-US');

const LEAD_TYPE_COLORS = {
  google_ads: { bg: '#FEF2F2', border: '#E12627', badge: 'badge-red', label: 'Google Ads' },
  organic: { bg: '#F0FDF4', border: '#34A853', badge: 'badge-green', label: 'Organic' },
  direct: { bg: '#F9FAFB', border: '#6B7280', badge: 'badge-gray', label: 'Direct' },
  referral: { bg: '#FFFBEB', border: '#F59E0B', badge: 'badge-yellow', label: 'Referral' },
  facebook_ads: { bg: '#EFF6FF', border: '#1877F2', badge: 'badge-blue', label: 'Facebook Ads' },
  unknown: { bg: '#F3F4F6', border: '#9CA3AF', badge: 'badge-gray', label: 'Other' },
};

const DONUT_COLORS = {
  google_ads: '#E12627',
  organic: '#34A853',
  direct: '#6B7280',
  referral: '#F59E0B',
  facebook_ads: '#1877F2',
  unknown: '#94A3B8',
};

function leadMeta(lt) {
  return LEAD_TYPE_COLORS[lt] || LEAD_TYPE_COLORS.unknown;
}

function fmtDateTime(d) {
  if (!d) return '—';
  const s = String(d);
  const datePart = s.slice(0, 10);
  try {
    const t = s.includes('T') ? new Date(s) : new Date(`${datePart}T12:00:00`);
    return t.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return datePart;
  }
}

function formatDurationMmSs(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const mm = Math.floor(s / 60);
  const r = s % 60;
  return `${mm}:${String(r).padStart(2, '0')}`;
}

function formatTotalDurationHhMm(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function displayName(row) {
  const raw = row.contact_name || '';
  return maskName(raw || null);
}

function kpiDeltaPct(current, previous) {
  if (previous == null || previous === undefined) return null;
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function Pagination({ page, pages, total, pageSize, onPage }) {
  if (pages <= 1) return null;
  const s = Math.max(1, page - 2);
  const e = Math.min(pages, page + 2);
  const nums = [];
  for (let i = s; i <= e; i += 1) nums.push(i);
  return (
    <div className="gads-pagination" style={{ marginTop: 12 }}>
      <span className="gads-pg-info">
        Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {fI(total)}
      </span>
      <div className="gads-pg-btns">
        <button type="button" className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Prev</button>
        {nums.map((p) => (
          <button key={p} type="button" className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-outline'}`} onClick={() => onPage(p)}>{p}</button>
        ))}
        <button type="button" className="btn btn-outline btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next →</button>
      </div>
    </div>
  );
}

/** Pull chat/message-style fields from a full Supabase row (column names vary by sync). */
function messagePreviewFromRaw(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const keys = ['message', 'body', 'chat_message', 'transcript', 'notes', 'summary'];
  for (const k of keys) {
    const val = raw[k];
    if (val != null && String(val).trim()) return { label: k.replace(/_/g, ' '), text: String(val).trim() };
  }
  if (raw.form_data != null) {
    try {
      const s = typeof raw.form_data === 'string' ? raw.form_data : JSON.stringify(raw.form_data);
      if (s && s !== '{}' && s !== 'null') return { label: 'Form data', text: s.length > 480 ? `${s.slice(0, 480)}…` : s };
    } catch {
      /* ignore */
    }
  }
  return null;
}

function isAnsweredStatus(status) {
  return String(status || '').toLowerCase().includes('answer');
}

export function GhlLeadsPage() {
  const { hasPermission } = useAuth();
  const {
    filters,
    updateFilter,
    locations,
    hasLocations,
    loading,
    error,
    kpis,
    compareKpis,
    dailyChart,
    donutSegments,
    calls,
    formSubmissions,
    chatWidgets,
    leadSourceAttributionRows,
    dailyLeadBreakdown,
    callsPagination,
    formSubmissionsPagination,
    chatWidgetsPagination,
    setCallsPage,
    setFormSubmissionsPage,
    setChatWidgetsPage,
    fetchData,
    handleApply,
    handleDateApply,
    loadAttributionDrillForLeadType,
    drillRows,
    drillLoading,
    clearAttributionDrill,
    fetchInteractionDetail,
  } = useGhlData();

  const [chartsCollapsed, setChartsCollapsed] = useState(false);
  const barRef = useRef(null);
  const donutRef = useRef(null);
  const barInstance = useRef(null);
  const donutInstance = useRef(null);

  const [activeGhlTab, setActiveGhlTab] = useState('leads');
  const [expandedLeadSourceType, setExpandedLeadSourceType] = useState(null);
  const [expandedDetailKey, setExpandedDetailKey] = useState(null);
  const [detailExtraByKey, setDetailExtraByKey] = useState({});
  const [detailLoadingKey, setDetailLoadingKey] = useState(null);
  const [expandedDailyDates, setExpandedDailyDates] = useState(() => new Set());

  const dailyBreakdownByDate = useMemo(() => {
    const map = new Map();
    (dailyLeadBreakdown || []).forEach((row) => {
      const d = String(row.report_date || '');
      if (!d) return;
      if (!map.has(d)) {
        map.set(d, { report_date: d, calls: 0, forms: 0, rows: [] });
      }
      const g = map.get(d);
      g.calls += Number(row.calls) || 0;
      g.forms += Number(row.forms) || 0;
      g.rows.push(row);
    });
    return [...map.values()].sort((a, b) => a.report_date.localeCompare(b.report_date));
  }, [dailyLeadBreakdown]);

  const toggleDailyDateExpand = useCallback((dateStr) => {
    setExpandedDailyDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  }, []);

  const selectGhlTab = useCallback(
    (id) => {
      if (activeGhlTab === 'attribution' && id !== 'attribution') {
        clearAttributionDrill();
        setExpandedLeadSourceType(null);
        setExpandedDetailKey(null);
        setDetailExtraByKey({});
        setDetailLoadingKey(null);
      }
      if (activeGhlTab === 'daily' && id !== 'daily') {
        setExpandedDailyDates(new Set());
      }
      setActiveGhlTab(id);
    },
    [activeGhlTab, clearAttributionDrill],
  );

  const toggleLeadSourceRow = useCallback((cleanLeadType) => {
    setExpandedDetailKey(null);
    setDetailExtraByKey({});
    setDetailLoadingKey(null);
    setExpandedLeadSourceType((cur) => (cur === cleanLeadType ? null : cleanLeadType));
  }, []);

  const toggleRowDetail = useCallback(
    async (row) => {
      const rk = `${row._interaction}-${row.id}`;
      if (expandedDetailKey === rk) {
        setExpandedDetailKey(null);
        return;
      }
      setExpandedDetailKey(rk);
      setDetailLoadingKey(rk);
      const kind = row._interaction === 'call' ? 'call' : 'form';
      const full = await fetchInteractionDetail(kind, row.id);
      setDetailExtraByKey((p) => ({ ...p, [rk]: full }));
      setDetailLoadingKey(null);
    },
    [expandedDetailKey, fetchInteractionDetail],
  );

  const handleDatePickerApply = useCallback(
    (payload) => {
      handleDateApply({
        preset: payload.preset,
        dateFrom: payload.dateFrom,
        dateTo: payload.dateTo,
        compareOn: payload.compareOn,
        compareFrom: payload.compareFrom,
        compareTo: payload.compareTo,
      });
    },
    [handleDateApply],
  );

  useEffect(() => {
    if (activeGhlTab !== 'attribution' || expandedLeadSourceType == null) return;
    loadAttributionDrillForLeadType(expandedLeadSourceType);
  }, [activeGhlTab, expandedLeadSourceType, loadAttributionDrillForLeadType]);

  useEffect(() => {
    if (chartsCollapsed || !barRef.current || !dailyChart.labels.length) {
      if (barInstance.current) {
        barInstance.current.destroy();
        barInstance.current = null;
      }
      return;
    }
    if (barInstance.current) {
      barInstance.current.destroy();
      barInstance.current = null;
    }
    const labels = dailyChart.labels.map((d) => {
      const p = d.split('-');
      return `${parseInt(p[1], 10)}/${parseInt(p[2], 10)}`;
    });
    barInstance.current = new Chart(barRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Calls', data: dailyChart.calls, backgroundColor: '#17a2b8', borderRadius: 6, stack: 'a' },
          { label: 'Forms', data: dailyChart.forms, backgroundColor: '#6f42c1', borderRadius: 6, stack: 'a' },
          { label: 'Chat widget', data: dailyChart.chat, backgroundColor: '#fd7e14', borderRadius: 6, stack: 'a' },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 14, font: { size: 11 } } },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { stacked: true, beginAtZero: true, ticks: { font: { size: 11 } } },
        },
      },
    });
    return () => {
      if (barInstance.current) {
        barInstance.current.destroy();
        barInstance.current = null;
      }
    };
  }, [dailyChart, chartsCollapsed]);

  useEffect(() => {
    if (chartsCollapsed || !donutRef.current) {
      if (donutInstance.current) {
        donutInstance.current.destroy();
        donutInstance.current = null;
      }
      return;
    }
    const total = donutSegments.reduce((a, s) => a + s.value, 0);
    if (!total) {
      if (donutInstance.current) {
        donutInstance.current.destroy();
        donutInstance.current = null;
      }
      return;
    }
    if (donutInstance.current) {
      donutInstance.current.destroy();
      donutInstance.current = null;
    }
    const labels = donutSegments.map((s) => leadMeta(s.key).label);
    const data = donutSegments.map((s) => s.value);
    const colors = donutSegments.map((s) => DONUT_COLORS[s.key] || DONUT_COLORS.unknown);
    const centerPlugin = {
      id: 'ghlDonutCenter',
      afterDraw(chart) {
        const { ctx } = chart;
        const meta = chart.getDatasetMeta(0);
        if (!meta?.data?.[0]) return;
        const { x, y } = meta.data[0];
        const sum = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '600 13px system-ui, sans-serif';
        ctx.fillStyle = 'var(--text-primary, #111)';
        ctx.fillText(fI(sum), x, y - 6);
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = 'var(--text-muted, #666)';
        ctx.fillText('leads', x, y + 10);
        ctx.restore();
      },
    };
    donutInstance.current = new Chart(donutRef.current, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label(ctx) {
                const v = ctx.raw || 0;
                const pct = total ? ((v / total) * 100).toFixed(1) : '0';
                return ` ${ctx.label}: ${fI(v)} (${pct}%)`;
              },
            },
          },
        },
      },
      plugins: [centerPlugin],
    });
    return () => {
      if (donutInstance.current) {
        donutInstance.current.destroy();
        donutInstance.current = null;
      }
    };
  }, [donutSegments, chartsCollapsed]);

  if (!hasPermission('sidebar.ghl')) {
    return (
      <div className="page-section active" id="page-ghl">
        <div className="page-content">
          <div className="panel"><div className="panel-body" style={{ padding: 48, textAlign: 'center' }}>
            <h2>Access Denied</h2>
            <p>You do not have permission to view GHL Leads.</p>
          </div></div>
        </div>
      </div>
    );
  }

  const showCompare = filters.compareOn && compareKpis;
  const showAttrCompare = filters.compareOn;
  const attrTableColSpan = showAttrCompare ? 5 : 3;

  const kpiDefs = [
    { key: 'totalCalls', label: 'Total Calls', get: (k) => k.totalCalls, fmt: fI, border: '#17a2b8', inverse: false },
    { key: 'totalForms', label: 'Total Forms', get: (k) => k.totalForms, fmt: fI, border: '#6f42c1', inverse: false },
    { key: 'totalChatWidget', label: 'Chat Widget', get: (k) => k.totalChatWidget, fmt: fI, border: '#fd7e14', inverse: false },
    { key: 'firstTimeCallers', label: 'First-Time Callers', get: (k) => k.firstTimeCallers, fmt: fI, border: '#20c997', inverse: false },
    {
      key: 'totalDuration',
      label: 'Total Duration',
      get: (k) => k.totalDurationSeconds,
      fmt: (v) => formatTotalDurationHhMm(v),
      border: '#6610f2',
      inverse: false,
      compareFmt: true,
    },
    {
      key: 'avgCall',
      label: 'Avg Call Duration',
      get: (k) => k.avgCallDurationSeconds,
      fmt: (v) => `${fI(v)}s`,
      border: '#3b82f6',
      inverse: false,
      compareFmt: true,
    },
    { key: 'totalLeads', label: 'Total Leads', get: (k) => k.totalLeads, fmt: fI, border: '#28A745', inverse: false },
  ];

  const leadVolumeItems = [
    { key: 'calls', label: 'Calls', border: '#17a2b8', cur: kpis.totalCalls, prev: compareKpis?.totalCalls },
    { key: 'forms', label: 'Form submissions', border: '#6f42c1', cur: kpis.totalForms, prev: compareKpis?.totalForms },
    { key: 'chat', label: 'Chat widget', border: '#fd7e14', cur: kpis.totalChatWidget, prev: compareKpis?.totalChatWidget },
  ];

  return (
    <div className="page-section active" id="page-ghl">
      <div className="page-content">
        <div className="page-title-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  background: 'var(--ghl, #28A745)',
                  color: 'white',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                }}
                aria-hidden
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
                </svg>
              </span>
              GHL Leads
            </h2>
            <p>Attribution from normalized views (<code>clean_source</code> / <code>clean_lead_type</code>).</p>
          </div>
          <div style={{ marginLeft: 'auto', flexShrink: 0, width: 'min(440px, 100%)' }}>
            <DateRangePicker
              blockLayout
              preset={filters.datePreset}
              dateFrom={filters.dateFrom}
              dateTo={filters.dateTo}
              compareOn={filters.compareOn}
              compareFrom={filters.compareFrom}
              compareTo={filters.compareTo}
              onApply={handleDatePickerApply}
            />
          </div>
        </div>

        {error && (
          <div style={{ padding: '16px 20px', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 'var(--radius-md)', margin: '0 0 16px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ flex: 1 }}>{error}</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => fetchData()}>Retry</button>
          </div>
        )}

        <div className="gads-filter-bar" id="ghl-filter-bar" style={{ marginBottom: 16 }}>
          <div className="gads-filter-row" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div className="gads-filter-group gads-fg-sm">
              <label>Client / Location</label>
              <select
                value={filters.locationId}
                onChange={(e) => updateFilter('locationId', e.target.value)}
                disabled={!hasLocations}
              >
                <option value="ALL">All GHL locations</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}{loc.client_name ? ` · ${loc.client_name}` : ''}</option>
                ))}
              </select>
            </div>
            <div className="gads-filter-group gads-filter-actions" style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-navy btn-sm" onClick={handleApply} disabled={loading} style={{ padding: '6px 20px' }}>
                {loading ? 'Loading…' : 'Apply'}
              </button>
              <span style={{ color: loading ? 'var(--warning)' : error ? 'var(--danger)' : 'var(--accent)', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>
                {loading ? 'Loading…' : error ? 'Error' : 'Live'}
              </span>
            </div>
          </div>
        </div>

        {loading && !hasLocations ? (
          <div className="panel"><div className="panel-body" style={{ padding: 48, textAlign: 'center' }}>
            <div className="auth-loading-spinner" />
            <p style={{ marginTop: 12 }}>Loading GHL data…</p>
          </div></div>
        ) : !hasLocations ? (
          <div className="panel"><div className="panel-body">
            <p className="admin-empty-hint">No GoHighLevel locations found in <strong>client_platform_accounts</strong> for this agency. Add accounts with <code>platform = ghl</code> in Settings → Platforms.</p>
          </div></div>
        ) : (
          <>
            <div className="gads-kpi-section" style={{ marginBottom: 24 }}>
              <div
                className="ghl-kpi-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                  gap: 12,
                }}
              >
                {kpiDefs.map((def) => {
                  const cur = def.get(kpis);
                  const prev = compareKpis ? def.get(compareKpis) : null;
                  const pct = showCompare ? kpiDeltaPct(
                    typeof cur === 'number' ? cur : Number(cur) || 0,
                    typeof prev === 'number' ? prev : Number(prev) || 0,
                  ) : null;
                  const val = def.fmt(cur);
                  const prevVal = prev != null ? def.fmt(prev) : null;
                  const isGood = pct == null ? null : (def.inverse ? pct <= 0 : pct >= 0);
                  return (
                    <div key={def.key} className="kpi-card" style={{ borderTop: `3px solid ${def.border}` }}>
                      <div className="kpi-header"><span className="kpi-label">{def.label}</span></div>
                      <div className="kpi-value">{val}</div>
                      {showCompare && pct != null && prevVal != null && (
                        <div className={`kpi-compare ${isGood ? 'kpi-compare-good' : 'kpi-compare-bad'}`}>
                          <span className="kpi-prev">vs {prevVal}</span>
                          <span className="kpi-compare-arrow">{pct >= 0 ? '▲' : '▼'}</span>
                          <span className="kpi-compare-pct">{Math.abs(pct).toFixed(1)}%</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="gads-chart-section" style={{ marginBottom: 8 }}>
              <div className="gads-chart-toolbar">
                <span className="gads-chart-title">Charts</span>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setChartsCollapsed(!chartsCollapsed)}>
                  {chartsCollapsed ? 'Show charts ▼' : 'Hide charts ▲'}
                </button>
              </div>
            </div>

            {!chartsCollapsed && (
              <div
                className="ghl-charts-two-col"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 16,
                  marginBottom: 24,
                }}
              >
                <div className="panel" style={{ marginBottom: 0 }}>
                  <div className="panel-body">
                    <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Daily leads trend</div>
                    <div style={{ height: 300, position: 'relative' }}>
                      {dailyChart.labels.length ? <canvas ref={barRef} /> : (
                        <p style={{ padding: 24, color: 'var(--text-muted)' }}>No daily activity in range.</p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="panel" style={{ marginBottom: 0 }}>
                  <div className="panel-body">
                    <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Lead source breakdown</div>
                    <div style={{ height: 300, position: 'relative' }}>
                      {donutSegments.some((s) => s.value > 0) ? <canvas ref={donutRef} /> : (
                        <p style={{ padding: 24, color: 'var(--text-muted)' }}>No attributed leads in range.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <style>
              {`
                @media (max-width: 768px) {
                  .ghl-charts-two-col { grid-template-columns: 1fr !important; }
                }
              `}
            </style>

            <div className="gads-tabs-container" style={{ marginBottom: 16 }}>
              <div className="gads-tabs-row">
                <div className="gads-tabs">
                  <button type="button" className={`gads-tab ${activeGhlTab === 'leads' ? 'active' : ''}`} onClick={() => selectGhlTab('leads')}>Leads details</button>
                  <button type="button" className={`gads-tab ${activeGhlTab === 'calls' ? 'active' : ''}`} onClick={() => selectGhlTab('calls')}>
                    Call details{!loading ? ` (${fI(callsPagination.total)})` : ''}
                  </button>
                  <button type="button" className={`gads-tab ${activeGhlTab === 'forms' ? 'active' : ''}`} onClick={() => selectGhlTab('forms')}>
                    Form submissions{!loading ? ` (${fI(formSubmissionsPagination.total)})` : ''}
                  </button>
                  <button type="button" className={`gads-tab ${activeGhlTab === 'chat' ? 'active' : ''}`} onClick={() => selectGhlTab('chat')}>
                    Chat widgets{!loading ? ` (${fI(chatWidgetsPagination.total)})` : ''}
                  </button>
                  <button type="button" className={`gads-tab ${activeGhlTab === 'attribution' ? 'active' : ''}`} onClick={() => selectGhlTab('attribution')}>Attribution</button>
                  <button type="button" className={`gads-tab ${activeGhlTab === 'daily' ? 'active' : ''}`} onClick={() => selectGhlTab('daily')}>
                    Daily{!loading && dailyBreakdownByDate.length ? ` (${fI(dailyBreakdownByDate.length)}d)` : ''}
                  </button>
                </div>
              </div>
            </div>

            <div id="ghl-leads-tab-content">
              {activeGhlTab === 'leads' && (
                <div className="panel" style={{ marginBottom: 16 }}>
                  <div className="panel-body no-padding">
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Leads details</div>
                    <div className="table-wrapper">
                      <table className="data-table gads-table ghl-table-zebra ghl-leads-summary-table">
                        <thead className="ghl-drill-thead">
                          <tr>
                            <th>Metric</th>
                            <th className="text-right">Current period</th>
                            <th className="text-right">Previous period</th>
                            <th className="text-right">Change</th>
                          </tr>
                        </thead>
                        <tbody>
                          {leadVolumeItems.map((item) => {
                            const curN = Number(item.cur) || 0;
                            const prevN = item.prev != null ? Number(item.prev) || 0 : null;
                            const pct = showCompare ? kpiDeltaPct(curN, prevN) : null;
                            const isGood = pct == null ? null : pct >= 0;
                            return (
                              <tr key={item.key} style={{ borderLeft: `4px solid ${item.border}` }}>
                                <td>
                                  <span className={`badge ${item.key === 'calls' ? 'badge-blue' : item.key === 'forms' ? 'badge-purple' : 'badge-yellow'}`} style={{ marginRight: 8 }}>
                                    {item.label}
                                  </span>
                                </td>
                                <td className="text-right" style={{ fontWeight: 700 }}>{fI(curN)}</td>
                                <td className="text-right">{showCompare && prevN != null ? fI(prevN) : '—'}</td>
                                <td className="text-right">
                                  {showCompare && pct != null ? (
                                    <span className={isGood ? 'kpi-compare-good' : 'kpi-compare-bad'} style={{ fontWeight: 600 }}>
                                      {pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
                                    </span>
                                  ) : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {!showCompare && (
                      <p style={{ margin: 0, padding: '10px 16px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
                        Turn on <strong>Compare to period</strong> in the date picker to show the previous range and percent change.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {activeGhlTab === 'daily' && (
                <div className="panel" style={{ marginBottom: 16 }}>
                  <div className="panel-body no-padding">
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
                      Daily
                    </div>
                    <p style={{ margin: 0, padding: '10px 16px 0', fontSize: 12, color: 'var(--text-muted)' }}>
                      Totals by day. Click <strong>+</strong> for <strong>by lead source</strong> (calls and forms per source bucket that day). Same data for HIPAA and non-HIPAA locations.
                    </p>
                    <div className="table-wrapper ghl-tab-table-scroll">
                      <table className="data-table gads-table ghl-table-zebra" style={{ fontSize: 12 }}>
                        <thead className="ghl-drill-thead">
                          <tr>
                            <th style={{ width: 44 }} aria-label="By lead source" />
                            <th>Date</th>
                            <th className="text-right">Calls</th>
                            <th className="text-right">Forms</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loading ? (
                            <tr><td colSpan={4} className="gads-empty-cell">Loading…</td></tr>
                          ) : dailyBreakdownByDate.length === 0 ? (
                            <tr><td colSpan={4} className="gads-empty-cell">No activity in this range.</td></tr>
                          ) : (
                            dailyBreakdownByDate.flatMap((group) => {
                              const open = expandedDailyDates.has(group.report_date);
                              const rows = [
                                <tr key={`d-${group.report_date}`}>
                                  <td>
                                    <button
                                      type="button"
                                      className="btn btn-outline btn-sm"
                                      onClick={() => toggleDailyDateExpand(group.report_date)}
                                      aria-expanded={open}
                                      aria-label={open ? 'Hide by lead source' : 'Show by lead source'}
                                      title="By lead source"
                                      style={{ minWidth: 36, padding: '2px 8px', fontWeight: 700 }}
                                    >
                                      {open ? '−' : '+'}
                                    </button>
                                  </td>
                                  <td style={{ fontWeight: 600 }}>{group.report_date}</td>
                                  <td className="text-right">{fI(group.calls)}</td>
                                  <td className="text-right">{fI(group.forms)}</td>
                                </tr>,
                              ];
                              if (open) {
                                rows.push(
                                  <tr key={`d-${group.report_date}-subhdr`} style={{ background: 'var(--panel-alt, rgba(0,0,0,0.03))' }}>
                                    <td />
                                    <td colSpan={1} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', paddingLeft: 12 }}>
                                      By lead source
                                    </td>
                                    <td className="text-right" style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Calls</td>
                                    <td className="text-right" style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Forms</td>
                                  </tr>,
                                );
                                group.rows.forEach((row, idx) => {
                                  rows.push(
                                    <tr key={`d-${group.report_date}-${row.lead_type}-${row.source}-${idx}`} style={{ background: 'var(--panel-alt, rgba(0,0,0,0.02))' }}>
                                      <td />
                                      <td style={{ paddingLeft: 12 }}>
                                        <span className={`badge ${leadMeta(row.lead_type).badge}`}>{leadMeta(row.lead_type).label}</span>
                                      </td>
                                      <td className="text-right">{fI(row.calls)}</td>
                                      <td className="text-right">{fI(row.forms)}</td>
                                    </tr>,
                                  );
                                });
                              }
                              return rows;
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeGhlTab === 'calls' && (
                <div className="panel" style={{ marginBottom: 16 }}>
                  <div className="panel-body no-padding">
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Call details</div>
                    <div className="table-wrapper ghl-tab-table-scroll">
                      <table className="data-table gads-table ghl-table-zebra">
                        <thead className="ghl-drill-thead">
                          <tr>
                            <th>Date</th>
                            <th>Name</th>
                            <th>Phone</th>
                            <th>Lead type</th>
                            <th>Direction</th>
                            <th>Status</th>
                            <th className="text-right">Duration</th>
                            <th>Source</th>
                            <th>Medium</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loading ? (
                            <tr><td colSpan={9} className="gads-empty-cell">Loading…</td></tr>
                          ) : calls.length === 0 ? (
                            <tr><td colSpan={9} className="gads-empty-cell">No calls in this range.</td></tr>
                          ) : (
                            calls.map((row) => (
                              <tr key={row.id}>
                                <td>{fmtDateTime(row.date_added)}</td>
                                <td>{displayName(row)}</td>
                                <td>{maskPhone(row.contact_phone)}</td>
                                <td><span className={`badge ${leadMeta(row.clean_lead_type).badge}`}>{leadMeta(row.clean_lead_type).label}</span></td>
                              <td>{row.direction || '—'}</td>
                              <td>
                                {isAnsweredStatus(row.status) ? (
                                  <span className="ghl-badge-answered">{row.status || '—'}</span>
                                ) : (
                                  <span className="badge badge-gray">{row.status || '—'}</span>
                                )}
                              </td>
                              <td className="text-right">{formatDurationMmSs(row.duration)}</td>
                                <td style={{ fontSize: 12 }}>{row.clean_source || '—'}</td>
                                <td style={{ fontSize: 12 }}>{row.clean_medium || '—'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ padding: '0 16px 16px' }}>
                      <Pagination
                        page={callsPagination.page}
                        pages={callsPagination.pages}
                        total={callsPagination.total}
                        pageSize={callsPagination.pageSize}
                        onPage={setCallsPage}
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeGhlTab === 'forms' && (
                <div className="panel" style={{ marginBottom: 16 }}>
                  <div className="panel-body no-padding">
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Form submissions</div>
                    <div className="table-wrapper ghl-tab-table-scroll">
                      <table className="data-table gads-table ghl-table-zebra">
                        <thead className="ghl-drill-thead">
                          <tr>
                            <th>Date</th>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Phone</th>
                            <th>Lead type</th>
                            <th>Form name</th>
                            <th>Source</th>
                            <th>Medium</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loading ? (
                            <tr><td colSpan={8} className="gads-empty-cell">Loading…</td></tr>
                          ) : formSubmissions.length === 0 ? (
                            <tr><td colSpan={8} className="gads-empty-cell">No form submissions in this range.</td></tr>
                          ) : (
                            formSubmissions.map((row) => (
                              <tr key={row.id}>
                                <td>{fmtDateTime(row.date_added)}</td>
                                <td>{displayName(row)}</td>
                                <td>{maskEmail()}</td>
                                <td>{maskPhone(row.contact_phone)}</td>
                                <td><span className={`badge ${leadMeta(row.clean_lead_type).badge}`}>{leadMeta(row.clean_lead_type).label}</span></td>
                                <td>{row.form_name || '—'}</td>
                                <td style={{ fontSize: 12 }}>{row.clean_source || '—'}</td>
                                <td style={{ fontSize: 12 }}>{row.clean_medium || '—'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ padding: '0 16px 16px' }}>
                      <Pagination
                        page={formSubmissionsPagination.page}
                        pages={formSubmissionsPagination.pages}
                        total={formSubmissionsPagination.total}
                        pageSize={formSubmissionsPagination.pageSize}
                        onPage={setFormSubmissionsPage}
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeGhlTab === 'chat' && (
                <div className="panel" style={{ marginBottom: 16 }}>
                  <div className="panel-body no-padding">
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Chat widget details</div>
                    <div className="table-wrapper ghl-tab-table-scroll">
                      <table className="data-table gads-table ghl-table-zebra">
                        <thead className="ghl-drill-thead">
                          <tr>
                            <th>Date</th>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Phone</th>
                            <th>Lead type</th>
                            <th>Widget / form name</th>
                            <th>Source</th>
                            <th>Medium</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loading ? (
                            <tr><td colSpan={8} className="gads-empty-cell">Loading…</td></tr>
                          ) : chatWidgets.length === 0 ? (
                            <tr><td colSpan={8} className="gads-empty-cell">No chat widget events in this range.</td></tr>
                          ) : (
                            chatWidgets.map((row) => (
                              <tr key={row.id}>
                                <td>{fmtDateTime(row.date_added)}</td>
                                <td>{displayName(row)}</td>
                                <td>{maskEmail()}</td>
                                <td>{maskPhone(row.contact_phone)}</td>
                                <td><span className={`badge ${leadMeta(row.clean_lead_type).badge}`}>{leadMeta(row.clean_lead_type).label}</span></td>
                                <td>{row.form_name || '—'}</td>
                                <td style={{ fontSize: 12 }}>{row.clean_source || '—'}</td>
                                <td style={{ fontSize: 12 }}>{row.clean_medium || '—'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ padding: '0 16px 16px' }}>
                      <Pagination
                        page={chatWidgetsPagination.page}
                        pages={chatWidgetsPagination.pages}
                        total={chatWidgetsPagination.total}
                        pageSize={chatWidgetsPagination.pageSize}
                        onPage={setChatWidgetsPage}
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeGhlTab === 'attribution' && (
                <div className="panel" style={{ marginBottom: 16 }}>
                  <div className="panel-body no-padding">
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
                      Lead source attribution
                    </div>
                    <p style={{ margin: 0, padding: '10px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                      Same buckets as <strong>Lead source breakdown</strong> (Google Ads, Organic, Direct, etc.). <strong>Leads</strong> counts calls plus form submissions and chat widgets. Turn on compare in the date picker to see the prior period in this table. Expanded rows show <strong>current period only</strong>.
                    </p>
                    <div className="table-wrapper ghl-tab-table-scroll">
                      <table className="data-table gads-table ghl-lead-source-attrib-table">
                        <thead className="ghl-drill-thead">
                          <tr>
                            <th style={{ width: 40 }} />
                            <th>Lead source</th>
                            <th className="text-right">Leads</th>
                            {showAttrCompare && (
                              <>
                                <th className="text-right">Prior period</th>
                                <th className="text-right">Change</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {loading ? (
                            <tr><td colSpan={attrTableColSpan} className="gads-empty-cell">Loading…</td></tr>
                          ) : leadSourceAttributionRows.length === 0 ? (
                            <tr><td colSpan={attrTableColSpan} className="gads-empty-cell">No attributed leads in this range.</td></tr>
                          ) : (
                            leadSourceAttributionRows.map((srcRow) => {
                              const meta = leadMeta(srcRow.clean_lead_type);
                              const open = expandedLeadSourceType === srcRow.clean_lead_type;
                              const prevN = srcRow.leadsPrev != null ? Number(srcRow.leadsPrev) || 0 : null;
                              const curN = Number(srcRow.leads) || 0;
                              const deltaPct = showAttrCompare && prevN != null ? kpiDeltaPct(curN, prevN) : null;
                              const deltaGood = deltaPct == null ? null : deltaPct >= 0;
                              return (
                                <React.Fragment key={srcRow.clean_lead_type}>
                                  <tr
                                    className={open ? 'ghl-lead-source-row-open' : ''}
                                    style={{
                                      borderLeft: `4px solid ${meta.border}`,
                                      background: open ? meta.bg : `${meta.bg}b3`,
                                      boxShadow: open ? `inset 0 0 0 1px ${meta.border}40` : undefined,
                                    }}
                                  >
                                    <td>
                                      <button
                                        type="button"
                                        className="btn btn-outline btn-sm ghl-ls-expand-btn"
                                        style={{ padding: '2px 8px', minWidth: 28 }}
                                        aria-expanded={open}
                                        onClick={() => toggleLeadSourceRow(srcRow.clean_lead_type)}
                                      >
                                        {open ? '−' : '+'}
                                      </button>
                                    </td>
                                    <td>
                                      <span className={`badge ${meta.badge} ghl-ls-source-badge`}>{meta.label}</span>
                                    </td>
                                    <td className="text-right ghl-ls-num">{fI(curN)}</td>
                                    {showAttrCompare && (
                                      <>
                                        <td className="text-right ghl-ls-num">{prevN != null ? fI(prevN) : '—'}</td>
                                        <td className="text-right ghl-ls-num">
                                          {deltaPct != null ? (
                                            <span className={deltaGood ? 'kpi-compare-good' : 'kpi-compare-bad'}>
                                              {deltaPct >= 0 ? '▲' : '▼'} {Math.abs(deltaPct).toFixed(1)}%
                                            </span>
                                          ) : '—'}
                                        </td>
                                      </>
                                    )}
                                  </tr>
                                  {open && (
                                    <tr className="ghl-channel-expand-row">
                                      <td colSpan={attrTableColSpan} style={{ padding: 0, borderBottom: '1px solid var(--border)', background: '#f8fafc' }}>
                                        <div style={{ padding: '12px 16px' }}>
                                          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                            <span>Lead details</span>
                                            <span className={`badge ${meta.badge} ghl-ls-source-badge`}>{meta.label}</span>
                                            {showAttrCompare && (
                                              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>Current period only</span>
                                            )}
                                          </div>
                                          {drillLoading && !drillRows.length ? (
                                            <div style={{ padding: 24, textAlign: 'center' }}><div className="auth-loading-spinner" style={{ margin: '0 auto' }} /></div>
                                          ) : (
                                            <div className="table-wrapper" style={{ maxHeight: 440, overflow: 'auto', borderRadius: 8, border: `1px solid ${meta.border}66` }}>
                                              <table className="data-table gads-table">
                                                <thead className="ghl-drill-thead">
                                                  <tr>
                                                    <th style={{ width: 44 }} />
                                                    <th>Date</th>
                                                    <th>Name</th>
                                                    <th>Phone</th>
                                                    <th>Type</th>
                                                    <th>Status</th>
                                                    <th className="text-right">Duration</th>
                                                    <th>Source / medium</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {!drillLoading && drillRows.length === 0 ? (
                                                    <tr>
                                                      <td colSpan={8} className="gads-empty-cell">
                                                        No rows loaded (query capped per request—narrow the date range if you expect more).
                                                      </td>
                                                    </tr>
                                                  ) : (
                                                    drillRows.map((row) => {
                                                      const isCall = row._interaction === 'call';
                                                      const isChat = row._interaction === 'chat';
                                                      const rk = `${row._interaction}-${row.id}`;
                                                      const detailOpen = expandedDetailKey === rk;
                                                      const extra = detailExtraByKey[rk];
                                                      const msg = messagePreviewFromRaw(extra);
                                                      return (
                                                        <React.Fragment key={rk}>
                                                          <tr>
                                                            <td>
                                                              <button
                                                                type="button"
                                                                className="btn btn-outline btn-sm"
                                                                style={{ padding: '2px 8px' }}
                                                                aria-expanded={detailOpen}
                                                                onClick={() => toggleRowDetail(row)}
                                                              >
                                                                {detailOpen ? '−' : '+'}
                                                              </button>
                                                            </td>
                                                            <td>{fmtDateTime(row.date_added)}</td>
                                                            <td>{displayName(row)}</td>
                                                            <td>{maskPhone(row.contact_phone)}</td>
                                                            <td>
                                                              {isCall ? <span className="badge badge-blue">Call</span> : isChat ? <span className="badge badge-yellow">Chat</span> : <span className="badge badge-green">Form</span>}
                                                            </td>
                                                            <td>
                                                              {isCall ? (
                                                                isAnsweredStatus(row.status) ? (
                                                                  <span className="ghl-badge-answered">{row.status || '—'}</span>
                                                                ) : (
                                                                  <span className="badge badge-gray">{row.status || '—'}</span>
                                                                )
                                                              ) : (
                                                                <span className="ghl-badge-submitted">Submitted</span>
                                                              )}
                                                            </td>
                                                            <td className="text-right">{isCall ? formatDurationMmSs(row.duration) : '—'}</td>
                                                            <td style={{ fontSize: 12 }}>{row.clean_source || '—'} / {row.clean_medium || '—'}</td>
                                                          </tr>
                                                          {detailOpen && (
                                                            <tr className="ghl-drill-detail-row">
                                                              <td colSpan={8} style={{ background: '#f1f5f9', padding: '12px 16px', fontSize: 12 }}>
                                                                {detailLoadingKey === rk && !extra ? (
                                                                  <div style={{ padding: 8 }}>Loading full record…</div>
                                                                ) : (
                                                                  <>
                                                                    {isCall ? (
                                                                      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '160px 1fr', gap: '6px 16px' }}>
                                                                        <dt style={{ color: 'var(--text-muted)' }}>Record ID</dt><dd style={{ margin: 0 }}>{row.id}</dd>
                                                                        <dt style={{ color: 'var(--text-muted)' }}>Email</dt><dd style={{ margin: 0 }}>{maskEmail()}</dd>
                                                                        <dt style={{ color: 'var(--text-muted)' }}>Direction</dt><dd style={{ margin: 0 }}>{row.direction || '—'}</dd>
                                                                        <dt style={{ color: 'var(--text-muted)' }}>Duration (sec)</dt><dd style={{ margin: 0 }}>{fI(row.duration)}</dd>
                                                                        <dt style={{ color: 'var(--text-muted)' }}>First time</dt><dd style={{ margin: 0 }}>{row.first_time ? 'Yes' : 'No'}</dd>
                                                                        <dt style={{ color: 'var(--text-muted)' }}>Lead type</dt><dd style={{ margin: 0 }}>{leadMeta(row.clean_lead_type).label}</dd>
                                                                        {msg && (
                                                                          <>
                                                                            <dt style={{ color: 'var(--text-muted)' }}>{msg.label}</dt>
                                                                            <dd style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.text.length > 800 ? `${msg.text.slice(0, 800)}…` : msg.text}</dd>
                                                                          </>
                                                                        )}
                                                                      </dl>
                                                                    ) : (
                                                                      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '160px 1fr', gap: '6px 16px' }}>
                                                                        <dt style={{ color: 'var(--text-muted)' }}>Record ID</dt><dd style={{ margin: 0 }}>{row.id}</dd>
                                                                        <dt style={{ color: 'var(--text-muted)' }}>Email</dt><dd style={{ margin: 0 }}>{maskEmail()}</dd>
                                                                        <dt style={{ color: 'var(--text-muted)' }}>Form name</dt><dd style={{ margin: 0 }}>{row.form_name || '—'}</dd>
                                                                        <dt style={{ color: 'var(--text-muted)' }}>Form type</dt><dd style={{ margin: 0 }}>{row.form_type || '—'}</dd>
                                                                        <dt style={{ color: 'var(--text-muted)' }}>First time</dt><dd style={{ margin: 0 }}>{row.first_time ? 'Yes' : 'No'}</dd>
                                                                        <dt style={{ color: 'var(--text-muted)' }}>Lead type</dt><dd style={{ margin: 0 }}>{leadMeta(row.clean_lead_type).label}</dd>
                                                                        {msg && (
                                                                          <>
                                                                            <dt style={{ color: 'var(--text-muted)' }}>{msg.label}</dt>
                                                                            <dd style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.text.length > 800 ? `${msg.text.slice(0, 800)}…` : msg.text}</dd>
                                                                          </>
                                                                        )}
                                                                      </dl>
                                                                    )}
                                                                  </>
                                                                )}
                                                              </td>
                                                            </tr>
                                                          )}
                                                        </React.Fragment>
                                                      );
                                                    })
                                                  )}
                                                </tbody>
                                              </table>
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <style>
              {`
                .ghl-tab-table-scroll { max-height: 480px; overflow: auto; }
                .ghl-table-zebra tbody tr:nth-child(even) { background: #f9fafb; }
                .ghl-drill-thead th {
                  background: #111827 !important;
                  color: #fff !important;
                  font-weight: 600;
                  font-size: 11px;
                  text-transform: uppercase;
                  letter-spacing: 0.03em;
                }
                .ghl-badge-answered {
                  display: inline-block;
                  padding: 2px 10px;
                  border-radius: 6px;
                  font-size: 11px;
                  font-weight: 600;
                  background: #e0f2fe;
                  color: #075985;
                  border: 1px solid #7dd3fc;
                }
                .ghl-badge-submitted {
                  display: inline-block;
                  padding: 2px 10px;
                  border-radius: 6px;
                  font-size: 11px;
                  font-weight: 600;
                  background: #dbeafe;
                  color: #1e40af;
                  border: 1px solid #93c5fd;
                }
                .ghl-lead-source-attrib-table tbody td {
                  font-size: 13px;
                  vertical-align: middle;
                }
                .ghl-lead-source-attrib-table .ghl-ls-num {
                  font-size: 13px;
                  font-weight: 600;
                }
                .ghl-lead-source-attrib-table .ghl-ls-source-badge {
                  font-size: 11px;
                  padding: 2px 8px;
                  font-weight: 600;
                }
              `}
            </style>
          </>
        )}
      </div>
    </div>
  );
}
