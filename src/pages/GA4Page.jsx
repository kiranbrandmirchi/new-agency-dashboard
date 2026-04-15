import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useGA4Data, GA4_WHEELER_AGENCY_ID } from '../hooks/useGA4Data';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { DateRangePicker } from '../components/DatePicker';
import Chart from 'chart.js/auto';

const fI = (n) => Math.round(Number(n || 0)).toLocaleString('en-US');
const fP = (n) => Number(n || 0).toFixed(2) + '%';
const fDec = (n) => Number(n || 0).toFixed(2);
const fDur = (s) => {
  const sec = Number(s || 0);
  const m = Math.floor(sec / 60);
  const ss = Math.round(sec % 60);
  return `${m}m ${String(ss).padStart(2, '0')}s`;
};
const fRate = (n) => `${(Number(n || 0) * 100).toFixed(2)}%`;

/** Advanced sub-report Δ / % cell (same pattern as Basic Overview table). */
function advancedOverviewDeltaCell(r, field, deltaKind) {
  const c = r._cmp?.[field];
  if (!c || c.prev === null) return '—';
  const cur = num(r[field]);
  const prev = c.prev;
  const mom = c.pct;
  const item = { deltaKind: deltaKind || 'count', key: field };
  const deltaStr = formatOverviewDelta(item, cur, prev);
  const pctStr = mom != null ? `${mom >= 0 ? '+' : ''}${mom.toFixed(1)}%` : '';
  const isGood = c.good;
  const color =
    mom == null ? undefined : Math.abs(mom) < 1e-6 ? 'var(--text-muted)' : isGood ? 'var(--success)' : 'var(--danger)';
  return (
    <span style={{ color, fontWeight: 600 }}>
      {deltaStr}
      {mom != null && <span style={{ fontWeight: 500, opacity: 0.9 }}>{` (${pctStr})`}</span>}
    </span>
  );
}

function advancedOverviewDeltaFooter(footerCur, footerPrior, field, deltaKind) {
  if (!footerPrior) return '—';
  const cur = footerCur[field];
  const prev = footerPrior[field];
  if (prev == null || cur == null || Number.isNaN(Number(cur)) || Number.isNaN(Number(prev))) return '—';
  const p = num(prev);
  const cc = num(cur);
  let mom;
  if (p === 0) mom = cc === 0 ? 0 : 100;
  else mom = ((cc - p) / Math.abs(p)) * 100;
  const good = Math.abs(mom) < 1e-6 ? null : mom >= 0;
  const item = { deltaKind: deltaKind || 'count', key: field };
  const deltaStr = formatOverviewDelta(item, cc, p);
  const pctStr = `${mom >= 0 ? '+' : ''}${mom.toFixed(1)}%`;
  const color =
    mom == null ? undefined : Math.abs(mom) < 1e-6 ? 'var(--text-muted)' : good ? 'var(--success)' : 'var(--danger)';
  return (
    <span style={{ color, fontWeight: 600 }}>
      {deltaStr}
      <span style={{ fontWeight: 500, opacity: 0.9 }}>{` (${pctStr})`}</span>
    </span>
  );
}

/** Absolute change for Overview Δ column (current − previous). */
function formatOverviewDelta(item, cur, prev) {
  if (prev == null || cur == null || Number.isNaN(Number(cur)) || Number.isNaN(Number(prev))) return '—';
  const d = Number(cur) - Number(prev);
  const kind = item.deltaKind || 'count';
  if (kind === 'rate') {
    const pp = d * 100;
    return `${pp >= 0 ? '+' : ''}${pp.toFixed(2)} pp`;
  }
  if (kind === 'duration') {
    if (d === 0) return '0';
    const abs = fDur(Math.abs(d));
    return d > 0 ? `+${abs}` : `−${abs}`;
  }
  if (kind === 'decimal') {
    return `${d >= 0 ? '+' : ''}${fDec(d)}`;
  }
  return `${d >= 0 ? '+' : ''}${fI(d)}`;
}

function num(n) {
  return Number(n) || 0;
}

function normalizeGa4GeoKeyPart(s) {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Merge geography rows to match visible dimension columns (same filter as the table uses).
 * Hiding City in the Columns menu removes `city` from the visible column list — we group by Region only.
 */
function aggregateGa4GeoRowsForVisibleDims(rows, visibleColumns) {
  if (!Array.isArray(rows) || rows.length === 0) return Array.isArray(rows) ? rows : [];
  const regionShown = visibleColumns.some((c) => c.col === 'region');
  const cityShown = visibleColumns.some((c) => c.col === 'city');
  if (regionShown && cityShown) return rows;

  const hideRegion = !regionShown;
  const hideCity = !cityShown;

  const map = new Map();
  for (const r of rows) {
    let key;
    if (hideRegion && hideCity) {
      key = '__all__';
    } else if (hideCity) {
      key = `r:${normalizeGa4GeoKeyPart(r.region)}`;
    } else {
      key = `c:${normalizeGa4GeoKeyPart(r.city)}`;
    }

    const sess = num(r.sessions);
    if (!map.has(key)) {
      map.set(key, {
        region: hideRegion ? '' : r.region,
        city: hideCity ? '' : r.city,
        page_views: 0,
        total_users: 0,
        sessions: 0,
        engaged_sessions: 0,
        event_count: 0,
        key_events: 0,
        _bounce_ws: 0,
        _dur_ws: 0,
        _er_ws: 0,
      });
    }
    const a = map.get(key);
    if (!hideRegion) a.region = r.region;
    if (!hideCity) a.city = r.city;
    a.page_views += num(r.page_views);
    a.total_users += num(r.total_users);
    a.sessions += sess;
    a.engaged_sessions += num(r.engaged_sessions);
    a.event_count += num(r.event_count);
    a.key_events += num(r.key_events);
    a._bounce_ws += num(r.bounce_rate) * sess;
    a._dur_ws += num(r.avg_session_duration) * sess;
    a._er_ws += num(r.engagement_rate) * sess;
  }

  const totalSessions = [...map.values()].reduce((s, o) => s + o.sessions, 0);

  return [...map.values()]
    .map((o) => {
      const s = o.sessions;
      return {
        region: hideRegion ? '—' : o.region,
        city: hideCity ? '—' : o.city,
        page_views: o.page_views,
        total_users: o.total_users,
        sessions: s,
        engaged_sessions: o.engaged_sessions,
        bounce_rate: s ? o._bounce_ws / s : 0,
        avg_session_duration: s ? o._dur_ws / s : 0,
        engagement_rate: s ? o._er_ws / s : 0,
        event_count: o.event_count,
        key_events: o.key_events,
        pct_sessions: totalSessions ? (s / totalSessions) * 100 : 0,
      };
    })
    .sort((a, b) => b.page_views - a.page_views);
}

function evEventUsers(r) {
  return num(r.total_users != null ? r.total_users : r.users);
}

/** Basic-style compare strip under advanced KPI values (vs prior + %). */
function advKpiMomStrip(momEntry, fmtPrev) {
  if (!momEntry || momEntry.prev === null || momEntry.pct == null) return null;
  const mom = momEntry.pct;
  const isGood = mom >= 0;
  return (
    <div className={`kpi-compare ${isGood ? 'kpi-compare-good' : 'kpi-compare-bad'}`}>
      <span className="kpi-prev">vs {fmtPrev(momEntry.prev)}</span>
      <span className="kpi-compare-arrow">{isGood ? '▲' : '▼'}</span>
      <span className="kpi-compare-pct">{Math.abs(mom).toFixed(1)}%</span>
    </div>
  );
}

/**
 * Wheeler Advanced VDP-style columns: either single period or Overview-style triplets
 * (report month | compare month | Δ / %).
 */
function buildWheelerTableColumns(dimensions, metrics, compareActive, currentHdr, compareHdr) {
  if (!compareActive) {
    return [
      ...dimensions.map((d) => ({
        ...d,
        sortKey: d.sortKey ?? d.col,
        sortable: d.sortable !== false,
        footerCell: null,
      })),
      ...metrics.map((m) => ({
        col: m.field,
        label: m.label,
        align: 'r',
        sortKey: m.field,
        sortable: true,
        headerSub: null,
        thTitle: null,
        cell: (r) => (m.cell ? m.cell(r) : m.fmt(r[m.field])),
        value: (r) => r[m.field],
        footerCell: null,
      })),
    ];
  }
  const out = [
    ...dimensions.map((d) => ({
      ...d,
      sortKey: d.sortKey ?? d.col,
      sortable: d.sortable !== false,
      footerCell: null,
    })),
  ];
  metrics.forEach((m) => {
    const field = m.field;
    out.push({
      col: `${field}_cur`,
      label: m.label,
      thTitle: m.label,
      headerSub: currentHdr,
      align: 'r',
      sortKey: field,
      sortable: true,
      cell: (r) => (m.cell ? m.cell(r) : m.fmt(r[field])),
      value: (r) => r[field],
      footerCell: null,
    });
    out.push({
      col: `${field}_prev`,
      label: m.label,
      thTitle: m.label,
      headerSub: compareHdr,
      align: 'r',
      sortKey: field,
      sortable: false,
      cell: (r) => {
        const p = r._cmp?.[field]?.prev;
        if (p == null) return '—';
        return m.prevFmt ? m.prevFmt(p) : m.fmt(p);
      },
      value: (r) => r._cmp?.[field]?.prev,
      footerCell: (fc, fp) => {
        if (!fp) return '—';
        const p = fp[field];
        if (p == null || p === '—') return '—';
        return m.prevFmt ? m.prevFmt(p) : m.fmt(p);
      },
    });
    out.push({
      col: `${field}_dlt`,
      label: 'Δ / % change',
      thTitle: 'Δ / % change',
      headerSub: 'vs comparison',
      align: 'r',
      sortKey: field,
      sortable: false,
      cell: (r) => advancedOverviewDeltaCell(r, field, m.deltaKind || 'count'),
      value: (r) => r[field],
      footerCell: (fc, fp) => advancedOverviewDeltaFooter(fc, fp, field, m.deltaKind || 'count'),
    });
  });
  return out;
}

/** Footer totals from full sorted dataset (not current page). */
function buildGa4FooterRow(tab, rows) {
  if (!rows?.length) return null;
  switch (tab) {
    case 'daily': {
      let pv = 0;
      let tu = 0;
      let nu = 0;
      let sess = 0;
      let es = 0;
      let ev = 0;
      let ke = 0;
      let bw = 0;
      let dw = 0;
      let ew = 0;
      rows.forEach((r) => {
        const s = num(r.sessions);
        pv += num(r.page_views);
        tu += num(r.total_users);
        nu += num(r.new_users);
        sess += s;
        es += num(r.engaged_sessions);
        ev += num(r.event_count);
        ke += num(r.key_events);
        bw += num(r.bounce_rate) * s;
        dw += num(r.avg_session_duration) * s;
        ew += num(r.engagement_rate) * s;
      });
      return {
        report_date: 'Total',
        page_views: pv,
        total_users: tu,
        new_users: nu,
        sessions: sess,
        engaged_sessions: es,
        bounce_rate: sess ? bw / sess : 0,
        engagement_rate: sess ? ew / sess : 0,
        avg_session_duration: sess ? dw / sess : 0,
        event_count: ev,
        key_events: ke,
      };
    }
    case 'channels':
    case 'sourcemedium': {
      let pv = 0;
      let tu = 0;
      let sess = 0;
      let es = 0;
      let ev = 0;
      let ke = 0;
      let bw = 0;
      let dw = 0;
      let ew = 0;
      rows.forEach((r) => {
        const s = num(r.sessions);
        pv += num(r.page_views);
        tu += num(r.total_users);
        sess += s;
        es += num(r.engaged_sessions);
        ev += num(r.event_count);
        ke += num(r.key_events);
        bw += num(r.bounce_rate) * s;
        dw += num(r.avg_session_duration) * s;
        ew += num(r.engagement_rate) * s;
      });
      const o = {
        page_views: pv,
        total_users: tu,
        sessions: sess,
        engaged_sessions: es,
        bounce_rate: sess ? bw / sess : 0,
        engagement_rate: sess ? ew / sess : 0,
        avg_session_duration: sess ? dw / sess : 0,
        event_count: ev,
        key_events: ke,
      };
      if (tab === 'channels') {
        return { channel_group: 'Total', ...o, pct_sessions: 100 };
      }
      return { source_medium: 'Total', source: '', medium: '', ...o, pct_sessions: 100 };
    }
    case 'campaigns': {
      let pv = 0;
      let tu = 0;
      let sess = 0;
      let es = 0;
      let ev = 0;
      let ke = 0;
      let bw = 0;
      let dw = 0;
      let ew = 0;
      rows.forEach((r) => {
        const s = num(r.sessions);
        pv += num(r.page_views);
        tu += num(r.total_users);
        sess += s;
        es += num(r.engaged_sessions);
        ev += num(r.event_count);
        ke += num(r.key_events);
        bw += num(r.bounce_rate) * s;
        dw += num(r.avg_session_duration) * s;
        ew += num(r.engagement_rate) * s;
      });
      return {
        channel_group: 'Total',
        page_views: pv,
        total_users: tu,
        sessions: sess,
        engaged_sessions: es,
        bounce_rate: sess ? bw / sess : 0,
        avg_session_duration: sess ? dw / sess : 0,
        engagement_rate: sess ? ew / sess : 0,
        event_count: ev,
        key_events: ke,
        pct_sessions: 100,
      };
    }
    case 'devices': {
      let pv = 0;
      let tu = 0;
      let sess = 0;
      let es = 0;
      let ev = 0;
      let ke = 0;
      let bw = 0;
      let dw = 0;
      let ew = 0;
      rows.forEach((r) => {
        const s = num(r.sessions);
        pv += num(r.page_views);
        tu += num(r.total_users);
        sess += s;
        es += num(r.engaged_sessions);
        ev += num(r.event_count);
        ke += num(r.key_events);
        bw += num(r.bounce_rate) * s;
        dw += num(r.avg_session_duration) * s;
        ew += num(r.engagement_rate) * s;
      });
      return {
        device_category: 'Total',
        page_views: pv,
        total_users: tu,
        sessions: sess,
        engaged_sessions: es,
        bounce_rate: sess ? bw / sess : 0,
        avg_session_duration: sess ? dw / sess : 0,
        engagement_rate: sess ? ew / sess : 0,
        event_count: ev,
        key_events: ke,
        pct_sessions: 100,
      };
    }
    case 'geo': {
      let pv = 0;
      let tu = 0;
      let sess = 0;
      let es = 0;
      let ev = 0;
      let ke = 0;
      let bw = 0;
      let dw = 0;
      let ew = 0;
      rows.forEach((r) => {
        const s = num(r.sessions);
        pv += num(r.page_views);
        tu += num(r.total_users);
        sess += s;
        es += num(r.engaged_sessions);
        ev += num(r.event_count);
        ke += num(r.key_events);
        bw += num(r.bounce_rate) * s;
        dw += num(r.avg_session_duration) * s;
        ew += num(r.engagement_rate) * s;
      });
      return {
        region: 'Total',
        city: '',
        page_views: pv,
        total_users: tu,
        sessions: sess,
        engaged_sessions: es,
        bounce_rate: sess ? bw / sess : 0,
        avg_session_duration: sess ? dw / sess : 0,
        engagement_rate: sess ? ew / sess : 0,
        event_count: ev,
        key_events: ke,
        pct_sessions: 100,
      };
    }
    case 'pagetypes': {
      let tv = 0;
      let tu = 0;
      let sess = 0;
      rows.forEach((r) => {
        tv += num(r.page_views);
        tu += num(r.total_users);
        sess += num(r.sessions);
      });
      return { page_type: 'Total', page_views: tv, total_users: tu, sessions: sess, pct_views: 100 };
    }
    case 'vdp_channel': {
      let pv = 0;
      rows.forEach((r) => {
        pv += num(r.page_views);
      });
      return { channel_group: 'Total', page_views: pv, unique_vdps: '—', avg_views: '—' };
    }
    case 'vdp_campaign_google': {
      let pv = 0;
      let uv = 0;
      rows.forEach((r) => {
        pv += num(r.page_views);
        uv += num(r.unique_vdps);
      });
      return {
        campaign_name: 'Total',
        channel_group: '',
        source_medium: '',
        page_views: pv,
        unique_vdps: uv,
        avg_views: uv ? pv / uv : 0,
      };
    }
    case 'vdp_make': {
      let pv = 0;
      let uv = 0;
      rows.forEach((r) => {
        pv += num(r.page_views);
        uv += num(r.unique_vdps);
      });
      return { item_make: 'Total', page_views: pv, unique_vdps: uv, avg_views: uv ? pv / uv : 0 };
    }
    case 'vdp_model': {
      let pv = 0;
      let uv = 0;
      rows.forEach((r) => {
        pv += num(r.page_views);
        uv += num(r.unique_vdps);
      });
      return { item_make: 'Total', item_model: '', page_views: pv, unique_vdps: uv };
    }
    case 'vdp_rvtype': {
      let pv = 0;
      let uv = 0;
      rows.forEach((r) => {
        pv += num(r.page_views);
        uv += num(r.unique_vdps);
      });
      return { rv_type: 'Total', page_views: pv, unique_vdps: uv };
    }
    case 'vdp_condition': {
      let pv = 0;
      rows.forEach((r) => {
        pv += num(r.page_views);
      });
      return { item_condition: 'Total', page_views: pv };
    }
    case 'pagetypes_drilldown': {
      let tv = 0;
      rows.forEach((r) => {
        tv += num(r.page_views);
      });
      return { page_type: 'Total', page_views: tv };
    }
    case 'vdp_daily': {
      let pv = 0;
      let uv = 0;
      let nv = 0;
      let uvd = 0;
      rows.forEach((r) => {
        pv += num(r.page_views);
        uv += num(r.unique_vdps);
        nv += num(r.new_vdps);
        uvd += num(r.used_vdps);
      });
      return {
        report_date: 'Total',
        page_views: pv,
        unique_vdps: uv,
        avg_views: uv ? pv / uv : 0,
        new_vdps: nv,
        used_vdps: uvd,
      };
    }
    default:
      return null;
  }
}

const PG = 25;

/** Session-level tabs (`ga4_summary_report`) — all agencies */
const CORE_TABS = [
  { id: 'overview', label: 'Overview', permission: 'tab.ga4.overview' },
  { id: 'daily', label: 'Daily', permission: 'tab.ga4.daily' },
  { id: 'channels', label: 'Channels', permission: 'tab.ga4.channels' },
  { id: 'sourcemedium', label: 'Source / Medium', permission: 'tab.ga4.sourcemedium' },
  { id: 'campaigns', label: 'Campaigns', permission: 'tab.ga4.campaigns' },
  { id: 'devices', label: 'Devices', permission: 'tab.ga4.devices' },
  { id: 'geo', label: 'Geography', permission: 'tab.ga4.geo' },
  { id: 'events', label: 'Events', permission: 'tab.ga4.events' },
];

const WHEELER_TABS = [
  { id: 'pagetypes_drilldown', label: 'Page details', permission: 'tab.ga4.daily' },
  { id: 'vdp_daily', label: 'VDP Daily', permission: 'tab.ga4.vdp_daily' },
  { id: 'vdp_channel', label: 'VDP×Channel', permission: 'tab.ga4.vdp_make' },
  { id: 'vdp_campaign_google', label: 'VDP×Google', permission: 'tab.ga4.campaigns' },
  { id: 'vdp_make', label: 'By make', permission: 'tab.ga4.vdp_make' },
  { id: 'vdp_model', label: 'By model', permission: 'tab.ga4.vdp_model' },
  { id: 'vdp_rvtype', label: 'By RV type', permission: 'tab.ga4.vdp_rvtype' },
  { id: 'vdp_condition', label: 'By condition', permission: 'tab.ga4.vdp_condition' },
];

const GA4_SEARCH_INPUT_STYLE = {
  width: '100%',
  minWidth: 160,
  maxWidth: 280,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  fontSize: 13,
};

function filterGa4RowsByQuery(rows, query, haystacks) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q || !rows?.length) return rows || [];
  return rows.filter((r) => haystacks(r).some((s) => String(s ?? '').toLowerCase().includes(q)));
}

/** Row-level search: tab id → placeholder + fields to match (substring, case-insensitive). */
const GA4_TAB_ROW_SEARCH = {
  daily: {
    placeholder: 'Search by date or channel…',
    haystacks: (r) => [r.report_date, ...((r.channels || []).map((c) => c.channel_group))],
  },
  channels: { placeholder: 'Search channels…', haystacks: (r) => [r.channel_group] },
  sourcemedium: { placeholder: 'Search source / medium…', haystacks: (r) => [r.source_medium] },
  campaigns: {
    placeholder: 'Search channel or campaign…',
    haystacks: (r) => [r.channel_group, ...((r.campaigns || []).map((c) => c.campaign_name))],
  },
  devices: { placeholder: 'Search devices…', haystacks: (r) => [r.device_category] },
  geo: { placeholder: 'Search region or city…', haystacks: (r) => [r.region, r.city] },
  events: { placeholder: 'Search event names…', haystacks: (r) => [r.event_name] },
  pagetypes_drilldown: {
    placeholder: 'Search page type or path…',
    haystacks: (r) => [
      r.page_type,
      ...((r.pages || []).flatMap((p) => [p.page_path, p.page_title])),
    ],
  },
  vdp_daily: { placeholder: 'Search by date…', haystacks: (r) => [r.report_date] },
  vdp_channel: { placeholder: 'Search channels…', haystacks: (r) => [r.channel_group] },
  vdp_campaign_google: {
    placeholder: 'Search campaign, channel, or source…',
    haystacks: (r) => [r.campaign_name, r.channel_group, r.source_medium],
  },
  vdp_make: { placeholder: 'Search make…', haystacks: (r) => [r.item_make] },
  vdp_model: { placeholder: 'Search make or model…', haystacks: (r) => [r.item_make, r.item_model] },
  vdp_rvtype: { placeholder: 'Search RV type…', haystacks: (r) => [r.rv_type] },
  vdp_condition: { placeholder: 'Search condition…', haystacks: (r) => [r.item_condition] },
};

const GA4_EVENTS_BREAKDOWN_SEARCH = {
  placeholder: 'Search breakdown…',
  haystacks: (r) => [r.event_name, r.channel_group, r.source_medium],
};

const GA4_OVERVIEW_SEARCH_PLACEHOLDER = 'Search metrics…';

function sortRows(rows, col, dir) {
  return [...rows].sort((a, b) => {
    const va = a[col], vb = b[col], d = dir === 'asc' ? 1 : -1;
    if (typeof va === 'string' && typeof vb === 'string') return d * va.localeCompare(vb);
    return d * ((+(va || 0)) - (+(vb || 0)));
  });
}

function paginate(rows, page, pg = PG) {
  const start = (page - 1) * pg, end = start + pg;
  return { rows: rows.slice(start, end), total: rows.length, page, pages: Math.ceil(rows.length / pg) || 1 };
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

function SortTh({ label, col, sortKey, sortable = true, headerSub, thTitle, sort, onSort, align }) {
  const key = sortKey !== undefined ? sortKey : col;
  const clickable = sortable !== false && key != null;
  const arrow = clickable && sort.col === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '';
  const num = align === 'r';
  return (
    <th
      className={`${clickable ? 'gads-sortable' : ''} ${num ? 'text-right gads-th-num ga4-overview-period-th' : ''}`}
      onClick={clickable ? () => onSort(key) : undefined}
    >
      {headerSub ? (
        <>
          <div className="ga4-overview-th-title">
            {(thTitle || label)}
            {arrow}
          </div>
          <div className="ga4-overview-th-dates">{headerSub}</div>
        </>
      ) : (
        <span className={num ? 'gads-th-inner' : undefined}>{label}{arrow}</span>
      )}
    </th>
  );
}

export function GA4Page() {
  const { hasPermission, activeAgencyId, agencyId } = useAuth();
  const { currentPage, showPage } = useApp();
  const isWheelerAgency =
    activeAgencyId === GA4_WHEELER_AGENCY_ID || agencyId === GA4_WHEELER_AGENCY_ID;
  /** Basic = same as other agencies (summary only). Advanced = separate app page + raw/VDP tabs. */
  const wheelerAnalyticsMode =
    isWheelerAgency && currentPage === 'ga4-advanced' ? 'advanced' : 'basic';
  const setWheelerAnalyticsMode = useCallback(
    (mode) => {
      showPage(mode === 'advanced' ? 'ga4-advanced' : 'ga4');
    },
    [showPage],
  );
  const enableWheelerRaw = !isWheelerAgency || wheelerAnalyticsMode === 'advanced';

  useEffect(() => {
    if (!isWheelerAgency && currentPage === 'ga4-advanced') showPage('ga4');
  }, [isWheelerAgency, currentPage, showPage]);

  const {
    filters,
    updateFilter,
    batchUpdateFilters,
    fetchData,
    loading,
    loadingPhase,
    error,
    ga4Accounts,
    effectivePropertyId,
    kpis,
    compareKpis,
    momChanges,
    overviewPeriodLabels,
    dailyTrend,
    compareDailyTrends,
    channelData,
    sourceMediumData,
    campaignData,
    deviceData,
    geoData,
    dailyBreakdown,
    channelDayBreakdown,
    vdpByChannelData,
    vdpByGoogleCampaignData,
    isWheeler,
    vdpByMakeData,
    vdpByModelData,
    vdpByRvTypeData,
    vdpByConditionData,
    ga4SummaryReady,
    advancedWheelerKpis,
    advancedWheelerKpisPrior,
    advancedWheelerKpiMom,
    advancedComparisonActive,
    advancedVdpDailyChartSeries,
    pagetypesDrilldownParentRows,
    vdpDailyData,
    wheelerReportsCompare,
    advancedMonthlyLoading,
    advancedMonthlyError,
    eventsData,
    eventsLoading,
    eventsError,
    toggleReportingEvent,
  } = useGA4Data({ enableWheelerRaw });

  /** Per-tab table search query (toolbar); keys match tab ids + `events_breakdown` for Events tab section B. */
  const [ga4TabSearch, setGa4TabSearch] = useState({});
  const [eventsRptFilter, setEventsRptFilter] = useState('');
  const [evBreakPg, setEvBreakPg] = useState(1);

  const advancedTableHdrCurrent = overviewPeriodLabels?.currentRange || 'Current period';
  const advancedTableHdrCompare =
    filters.compareOn && overviewPeriodLabels?.previousRange
      ? overviewPeriodLabels.previousRange
      : 'Comparison period';

  const vdpChannelCols = useMemo(
    () =>
      buildWheelerTableColumns(
        [
          {
            col: 'channel_group',
            label: 'Channel',
            align: 'l',
            sortKey: 'channel_group',
            cell: (r) => r.channel_group,
            value: (r) => r.channel_group,
          },
        ],
        [
          { field: 'page_views', label: 'VDP views', fmt: fI, deltaKind: 'count' },
          {
            field: 'unique_vdps',
            label: 'Unique VDPs',
            fmt: fI,
            deltaKind: 'count',
            cell: (r) => (r.unique_vdps === '—' || r.unique_vdps == null ? '—' : fI(r.unique_vdps)),
            prevFmt: (v) => (v == null || v === '—' ? '—' : fI(v)),
          },
          {
            field: 'avg_views',
            label: 'Avg views / VDP',
            fmt: fDec,
            deltaKind: 'decimal',
            cell: (r) => (r.avg_views === '—' || r.avg_views == null ? '—' : fDec(r.avg_views)),
            prevFmt: (v) => (v == null || v === '—' ? '—' : fDec(v)),
          },
        ],
        advancedComparisonActive,
        advancedTableHdrCurrent,
        advancedTableHdrCompare,
      ),
    [advancedComparisonActive, advancedTableHdrCurrent, advancedTableHdrCompare],
  );

  const vdpGoogleCampCols = useMemo(
    () =>
      buildWheelerTableColumns(
        [
          {
            col: 'campaign_name',
            label: 'Campaign',
            align: 'l',
            sortKey: 'campaign_name',
            cell: (r) => r.campaign_name,
            value: (r) => r.campaign_name,
          },
          {
            col: 'channel_group',
            label: 'Channel',
            align: 'l',
            sortKey: 'channel_group',
            cell: (r) => r.channel_group,
            value: (r) => r.channel_group,
          },
          {
            col: 'source_medium',
            label: 'Source / Medium',
            align: 'l',
            sortKey: 'source_medium',
            cell: (r) => r.source_medium || '—',
            value: (r) => r.source_medium,
          },
        ],
        [
          { field: 'page_views', label: 'VDP views', fmt: fI, deltaKind: 'count' },
          { field: 'unique_vdps', label: 'Unique VDPs', fmt: fI, deltaKind: 'count' },
          { field: 'avg_views', label: 'Avg views / VDP', fmt: fDec, deltaKind: 'decimal' },
        ],
        advancedComparisonActive,
        advancedTableHdrCurrent,
        advancedTableHdrCompare,
      ),
    [advancedComparisonActive, advancedTableHdrCurrent, advancedTableHdrCompare],
  );

  const vdpMakeCols = useMemo(
    () =>
      buildWheelerTableColumns(
        [
          {
            col: 'item_make',
            label: 'Make',
            align: 'l',
            sortKey: 'item_make',
            cell: (r) => r.item_make,
            value: (r) => r.item_make,
          },
        ],
        [
          { field: 'page_views', label: 'Views', fmt: fI, deltaKind: 'count' },
          { field: 'unique_vdps', label: 'Unique VDPs', fmt: fI, deltaKind: 'count' },
          { field: 'avg_views', label: 'Avg views / VDP', fmt: fDec, deltaKind: 'decimal' },
        ],
        advancedComparisonActive,
        advancedTableHdrCurrent,
        advancedTableHdrCompare,
      ),
    [advancedComparisonActive, advancedTableHdrCurrent, advancedTableHdrCompare],
  );

  const vdpModelCols = useMemo(
    () =>
      buildWheelerTableColumns(
        [
          {
            col: 'item_make',
            label: 'Make',
            align: 'l',
            sortKey: 'item_make',
            cell: (r) => r.item_make,
            value: (r) => r.item_make,
          },
          {
            col: 'item_model',
            label: 'Model',
            align: 'l',
            sortKey: 'item_model',
            cell: (r) => r.item_model,
            value: (r) => r.item_model,
          },
        ],
        [
          { field: 'page_views', label: 'Views', fmt: fI, deltaKind: 'count' },
          { field: 'unique_vdps', label: 'Unique VDPs', fmt: fI, deltaKind: 'count' },
        ],
        advancedComparisonActive,
        advancedTableHdrCurrent,
        advancedTableHdrCompare,
      ),
    [advancedComparisonActive, advancedTableHdrCurrent, advancedTableHdrCompare],
  );

  const vdpRvCols = useMemo(
    () =>
      buildWheelerTableColumns(
        [
          {
            col: 'rv_type',
            label: 'RV type',
            align: 'l',
            sortKey: 'rv_type',
            cell: (r) => r.rv_type,
            value: (r) => r.rv_type,
          },
        ],
        [
          { field: 'page_views', label: 'Views', fmt: fI, deltaKind: 'count' },
          { field: 'unique_vdps', label: 'Unique VDPs', fmt: fI, deltaKind: 'count' },
        ],
        advancedComparisonActive,
        advancedTableHdrCurrent,
        advancedTableHdrCompare,
      ),
    [advancedComparisonActive, advancedTableHdrCurrent, advancedTableHdrCompare],
  );

  const vdpCondCols = useMemo(
    () =>
      buildWheelerTableColumns(
        [
          {
            col: 'item_condition',
            label: 'Condition',
            align: 'l',
            sortKey: 'item_condition',
            cell: (r) => r.item_condition,
            value: (r) => r.item_condition,
          },
        ],
        [{ field: 'page_views', label: 'Page views', fmt: fI, deltaKind: 'count' }],
        advancedComparisonActive,
        advancedTableHdrCurrent,
        advancedTableHdrCompare,
      ),
    [advancedComparisonActive, advancedTableHdrCurrent, advancedTableHdrCompare],
  );

  const pageTypeDrillCols = useMemo(
    () =>
      buildWheelerTableColumns(
        [
          {
            col: 'page_type',
            label: 'Page type / path',
            align: 'l',
            sortKey: 'page_type',
            cell: (r) => r.page_type,
            value: (r) => r.page_type,
          },
        ],
        [{ field: 'page_views', label: 'Page views', fmt: fI, deltaKind: 'count' }],
        advancedComparisonActive,
        advancedTableHdrCurrent,
        advancedTableHdrCompare,
      ),
    [advancedComparisonActive, advancedTableHdrCurrent, advancedTableHdrCompare],
  );

  const vdpDailyCols = useMemo(
    () =>
      buildWheelerTableColumns(
        [
          {
            col: 'report_date',
            label: 'Date',
            align: 'l',
            sortKey: 'report_date',
            cell: (r) => r.report_date,
            value: (r) => r.report_date,
          },
        ],
        [
          { field: 'page_views', label: 'VDP views', fmt: fI, deltaKind: 'count' },
          { field: 'unique_vdps', label: 'Unique VDPs', fmt: fI, deltaKind: 'count' },
          { field: 'avg_views', label: 'Avg views / VDP', fmt: fDec, deltaKind: 'decimal' },
          { field: 'new_vdps', label: 'New VDPs', fmt: fI, deltaKind: 'count' },
          { field: 'used_vdps', label: 'Used VDPs', fmt: fI, deltaKind: 'count' },
        ],
        advancedComparisonActive,
        advancedTableHdrCurrent,
        advancedTableHdrCompare,
      ),
    [advancedComparisonActive, advancedTableHdrCurrent, advancedTableHdrCompare],
  );

  const pageTypeDrillSubRows = useCallback((parentRow, visibleCols) => {
    const subs = parentRow.pages || [];
    if (!subs.length) return null;
    return subs.map((p) => (
      <tr key={`${parentRow.page_type}|${p.page_path}`} className="gads-sub-row">
        {visibleCols.map((c, ci) => (
          <td key={c.col} className={c.align === 'r' ? 'text-right' : ''} style={ci === 0 ? { paddingLeft: 32 } : undefined}>
            {ci === 0 ? <><span className="gads-sub-indicator">↳</span> {p.page_path || p.page_title || '—'}</> : c.cell(p)}
          </td>
        ))}
      </tr>
    ));
  }, []);

  const TABS = useMemo(() => {
    const core = CORE_TABS.filter((t) => !t.permission || hasPermission(t.permission));
    const wheelerVdp = isWheeler ? WHEELER_TABS.filter((t) => !t.permission || hasPermission(t.permission)) : [];
    if (!isWheeler) return [...core];
    if (wheelerAnalyticsMode === 'basic') return [...core];
    return [...wheelerVdp];
  }, [hasPermission, isWheeler, wheelerAnalyticsMode]);

  const defaultTab = TABS[0]?.id || 'overview';
  const [activeTab, setActiveTab] = useState(defaultTab);
  useEffect(() => {
    if (TABS.length && !TABS.some((t) => t.id === activeTab)) setActiveTab(defaultTab);
  }, [TABS, activeTab, defaultTab]);

  const tabIds = useMemo(() => TABS.map((t) => t.id), [TABS]);
  const [sort, setSort] = useState({});
  const [pg, setPg] = useState({});

  useEffect(() => {
    setSort((prev) => {
      const next = { ...prev };
      tabIds.forEach((id) => {
        if (!next[id]) {
          if (id === 'daily' || id === 'vdp_daily') next[id] = { col: 'report_date', dir: 'desc' };
          else if (id === 'channels') next[id] = { col: 'sessions', dir: 'desc' };
          else if (id === 'campaigns') next[id] = { col: 'sessions', dir: 'desc' };
          else if (id === 'events') next[id] = { col: 'event_count', dir: 'desc' };
          else if (id === 'vdp_channel') next[id] = { col: 'page_views', dir: 'desc' };
          else if (id === 'vdp_campaign_google') next[id] = { col: 'page_views', dir: 'desc' };
          else next[id] = { col: 'page_views', dir: 'desc' };
        }
      });
      return next;
    });
    setPg((prev) => {
      const next = { ...prev };
      tabIds.forEach((id) => {
        if (next[id] == null) next[id] = 1;
      });
      return next;
    });
  }, [tabIds]);

  useEffect(() => {
    setEvBreakPg(1);
  }, [eventsRptFilter, ga4TabSearch.events_breakdown, eventsData?.events_summary, eventsData?.events_by_channel]);

  const [expanded, setExpanded] = useState({});
  const [hiddenCols, setHiddenCols] = useState({});
  const [colEditorOpen, setColEditorOpen] = useState(false);
  const colEditorRef = useRef(null);

  useEffect(() => {
    const handleClickOutsideColEditor = (e) => {
      if (colEditorOpen && colEditorRef.current && !colEditorRef.current.contains(e.target)) setColEditorOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutsideColEditor);
    return () => document.removeEventListener('mousedown', handleClickOutsideColEditor);
  }, [colEditorOpen]);

  useEffect(() => {
    setExpanded({});
  }, [activeTab]);

  const toggleColVisibility = useCallback((tabId, colKey) => {
    setHiddenCols((prev) => {
      const key = `${tabId}:${colKey}`;
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = true;
      return next;
    });
  }, []);

  const toggleExpand = useCallback((key) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const [chartCollapsed, setChartCollapsed] = useState(false);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const advancedChartRef = useRef(null);
  const advancedChartInstance = useRef(null);

  const handleSort = useCallback((tab, col) => {
    setSort((prev) => {
      const s = prev[tab] || { col, dir: 'desc' };
      const dir = s.col === col ? (s.dir === 'asc' ? 'desc' : 'asc') : 'desc';
      return { ...prev, [tab]: { col, dir } };
    });
    setPg((prev) => ({ ...prev, [tab]: 1 }));
  }, []);

  const handlePage = useCallback((tab, page) => setPg((prev) => ({ ...prev, [tab]: page })), []);

  const handleGa4TabSearchChange = useCallback((tab, value) => {
    setGa4TabSearch((prev) => ({ ...prev, [tab]: value }));
    if (tab === 'events_breakdown') {
      setEvBreakPg(1);
    } else {
      setPg((prev) => ({ ...prev, [tab]: 1 }));
    }
  }, []);

  const handleAccountChange = (e) => updateFilter('customerId', e.target.value);

  const resetPages = useCallback(() => {
    const o = {};
    tabIds.forEach((id) => { o[id] = 1; });
    setPg(o);
  }, [tabIds]);

  const handleApply = () => { resetPages(); fetchData(); };

  const handleDatePickerApply = useCallback(({ preset, dateFrom, dateTo, compareOn, compareFrom, compareTo }) => {
    batchUpdateFilters({
      datePreset: preset,
      dateFrom: dateFrom || '',
      dateTo: dateTo || '',
      compareOn: compareOn || false,
      compareFrom: compareFrom || '',
      compareTo: compareTo || '',
    });
    setTimeout(() => fetchData(), 30);
  }, [batchUpdateFilters, fetchData]);

  useEffect(() => {
    if (wheelerAnalyticsMode !== 'basic') {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
      return;
    }
    if (chartCollapsed || !chartRef.current || !dailyTrend.length) return;
    if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; }
    const labels = dailyTrend.map((d) => { const p = (d.report_date || '').split('-'); return p.length >= 3 ? `${parseInt(p[1], 10)}/${parseInt(p[2], 10)}` : d.report_date; });
    const hasCompare = filters.compareOn && compareDailyTrends?.length > 0;
    const datasets = [
      { label: 'Sessions', data: dailyTrend.map((d) => +(d.sessions || 0)), borderColor: '#22c55e', backgroundColor: '#22c5518', tension: 0.35, fill: false, borderWidth: 2.5, yAxisID: 'y' },
      { label: 'Users', data: dailyTrend.map((d) => +(d.total_users || 0)), borderColor: '#E37400', backgroundColor: '#E3740018', tension: 0.35, fill: false, borderWidth: 2.5, yAxisID: 'y' },
      { label: 'Page views', data: dailyTrend.map((d) => +(d.page_views || 0)), borderColor: '#3b82f6', backgroundColor: '#3b82f618', tension: 0.35, fill: false, borderWidth: 2, yAxisID: 'y' },
    ];
    if (hasCompare) {
      const comp = compareDailyTrends;
      datasets.push(
        { label: 'Sessions (prev)', data: comp.map((d) => +(d.sessions || 0)), borderColor: '#22c55e80', borderDash: [6, 4], tension: 0.35, fill: false, borderWidth: 1.5, yAxisID: 'y' },
        { label: 'Users (prev)', data: comp.map((d) => +(d.total_users || 0)), borderColor: '#E3740080', borderDash: [6, 4], tension: 0.35, fill: false, borderWidth: 1.5, yAxisID: 'y' },
      );
    }
    chartInstance.current = new Chart(chartRef.current, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: true, position: 'bottom' } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { type: 'linear', position: 'left', beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 } } },
        },
      },
    });
    return () => { if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; } };
  }, [wheelerAnalyticsMode, dailyTrend, compareDailyTrends, chartCollapsed, filters.compareOn]);

  useEffect(() => {
    if (wheelerAnalyticsMode !== 'advanced' || !isWheelerAgency) {
      if (advancedChartInstance.current) {
        advancedChartInstance.current.destroy();
        advancedChartInstance.current = null;
      }
      return;
    }
    const cur = advancedVdpDailyChartSeries?.current || [];
    if (chartCollapsed || !advancedChartRef.current || !cur.length) {
      if (advancedChartInstance.current) {
        advancedChartInstance.current.destroy();
        advancedChartInstance.current = null;
      }
      return;
    }
    if (advancedChartInstance.current) {
      advancedChartInstance.current.destroy();
      advancedChartInstance.current = null;
    }
    const cmp = advancedVdpDailyChartSeries?.compare || [];
    const hasCompare = filters.compareOn && cmp.length > 0;
    const labels = cur.map((d) => {
      const p = (d.report_date || '').split('-');
      return p.length >= 3 ? `${parseInt(p[1], 10)}/${parseInt(p[2], 10)}` : d.report_date;
    });
    const datasets = [
      {
        label: 'VDP views',
        data: cur.map((d) => +(d.page_views || 0)),
        borderColor: '#3b82f6',
        backgroundColor: '#3b82f618',
        tension: 0.35,
        fill: false,
        borderWidth: 2.5,
        yAxisID: 'y',
      },
    ];
    if (hasCompare) {
      datasets.push({
        label: 'VDP views (comparison)',
        data: cur.map((_, i) => (i < cmp.length ? +(cmp[i].page_views || 0) : null)),
        borderColor: '#94a3b8',
        borderDash: [6, 4],
        tension: 0.35,
        fill: false,
        borderWidth: 2,
        yAxisID: 'y',
      });
    }
    advancedChartInstance.current = new Chart(advancedChartRef.current, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: true, position: 'bottom' } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: {
            type: 'linear',
            position: 'left',
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: { font: { size: 11 } },
          },
        },
      },
    });
    return () => {
      if (advancedChartInstance.current) {
        advancedChartInstance.current.destroy();
        advancedChartInstance.current = null;
      }
    };
  }, [wheelerAnalyticsMode, isWheelerAgency, advancedVdpDailyChartSeries, chartCollapsed, filters.compareOn]);

  const KPI_ITEMS = useMemo(() => [
    { key: 'total_users', label: 'Total Users', fmt: fI, mom: 'total_users', deltaKind: 'count' },
    { key: 'new_users', label: 'New Users', fmt: fI, mom: 'new_users', deltaKind: 'count' },
    { key: 'sessions', label: 'Sessions', fmt: fI, mom: 'sessions', deltaKind: 'count' },
    { key: 'screen_page_views', label: 'Page Views', fmt: fI, mom: 'screen_page_views', deltaKind: 'count' },
    { key: 'bounce_rate', label: 'Bounce Rate', fmt: fRate, mom: 'bounce_rate', deltaKind: 'rate', lowerIsBetter: true },
    { key: 'avg_session_duration', label: 'Avg Session Duration', fmt: fDur, mom: 'avg_session_duration', deltaKind: 'duration' },
    { key: 'engagement_rate', label: 'Engagement Rate', fmt: fRate, mom: 'engagement_rate', deltaKind: 'rate' },
    { key: 'key_events', label: 'Key Events', fmt: fI, mom: 'key_events', deltaKind: 'count' },
  ], []);

  const overviewKpiItemsFiltered = useMemo(() => {
    const q = String(ga4TabSearch.overview ?? '').trim().toLowerCase();
    if (!q) return KPI_ITEMS;
    return KPI_ITEMS.filter((item) => item.label.toLowerCase().includes(q));
  }, [KPI_ITEMS, ga4TabSearch.overview]);

  const channelCols = [
    { col: 'channel_group', label: 'Channel', cell: (r) => r.channel_group, value: (r) => r.channel_group },
    { col: 'page_views', label: 'Page Views', align: 'r', cell: (r) => fI(r.page_views), value: (r) => r.page_views },
    { col: 'total_users', label: 'Total Users', align: 'r', cell: (r) => fI(r.total_users), value: (r) => r.total_users },
    { col: 'sessions', label: 'Sessions', align: 'r', cell: (r) => fI(r.sessions), value: (r) => r.sessions },
    { col: 'engaged_sessions', label: 'Engaged Sessions', align: 'r', cell: (r) => fI(r.engaged_sessions), value: (r) => r.engaged_sessions },
    { col: 'bounce_rate', label: 'Bounce Rate', align: 'r', cell: (r) => fRate(r.bounce_rate), value: (r) => r.bounce_rate },
    { col: 'engagement_rate', label: 'Engagement Rate', align: 'r', cell: (r) => fRate(r.engagement_rate), value: (r) => r.engagement_rate },
    { col: 'avg_session_duration', label: 'Avg Duration', align: 'r', cell: (r) => fDur(r.avg_session_duration), value: (r) => r.avg_session_duration },
    { col: 'event_count', label: 'Events', align: 'r', cell: (r) => fI(r.event_count), value: (r) => r.event_count },
    { col: 'key_events', label: 'Key Events', align: 'r', cell: (r) => fI(r.key_events), value: (r) => r.key_events },
    { col: 'pct_sessions', label: '% Sessions', align: 'r', cell: (r) => fP(r.pct_sessions), value: (r) => r.pct_sessions },
  ];

  const sourceCols = [
    { col: 'source_medium', label: 'Source / Medium', cell: (r) => r.source_medium, value: (r) => r.source_medium },
    { col: 'page_views', label: 'Page Views', align: 'r', cell: (r) => fI(r.page_views), value: (r) => r.page_views },
    { col: 'total_users', label: 'Total Users', align: 'r', cell: (r) => fI(r.total_users), value: (r) => r.total_users },
    { col: 'sessions', label: 'Sessions', align: 'r', cell: (r) => fI(r.sessions), value: (r) => r.sessions },
    { col: 'engaged_sessions', label: 'Engaged Sessions', align: 'r', cell: (r) => fI(r.engaged_sessions), value: (r) => r.engaged_sessions },
    { col: 'bounce_rate', label: 'Bounce Rate', align: 'r', cell: (r) => fRate(r.bounce_rate), value: (r) => r.bounce_rate },
    { col: 'engagement_rate', label: 'Engagement Rate', align: 'r', cell: (r) => fRate(r.engagement_rate), value: (r) => r.engagement_rate },
    { col: 'avg_session_duration', label: 'Avg Duration', align: 'r', cell: (r) => fDur(r.avg_session_duration), value: (r) => r.avg_session_duration },
    { col: 'event_count', label: 'Events', align: 'r', cell: (r) => fI(r.event_count), value: (r) => r.event_count },
    { col: 'key_events', label: 'Key Events', align: 'r', cell: (r) => fI(r.key_events), value: (r) => r.key_events },
    { col: 'pct_sessions', label: '% Sessions', align: 'r', cell: (r) => fP(r.pct_sessions), value: (r) => r.pct_sessions },
  ];

  const campaignCols = [
    { col: 'channel_group', label: 'Channel / Campaign', cell: (r) => r.channel_group, value: (r) => r.channel_group },
    { col: 'page_views', label: 'Page Views', align: 'r', cell: (r) => fI(r.page_views), value: (r) => r.page_views },
    { col: 'total_users', label: 'Total Users', align: 'r', cell: (r) => fI(r.total_users), value: (r) => r.total_users },
    { col: 'sessions', label: 'Sessions', align: 'r', cell: (r) => fI(r.sessions), value: (r) => r.sessions },
    { col: 'engaged_sessions', label: 'Engaged Sessions', align: 'r', cell: (r) => fI(r.engaged_sessions), value: (r) => r.engaged_sessions },
    { col: 'bounce_rate', label: 'Bounce Rate', align: 'r', cell: (r) => fRate(r.bounce_rate), value: (r) => r.bounce_rate },
    { col: 'engagement_rate', label: 'Engagement Rate', align: 'r', cell: (r) => fRate(r.engagement_rate), value: (r) => r.engagement_rate },
    { col: 'avg_session_duration', label: 'Avg Duration', align: 'r', cell: (r) => fDur(r.avg_session_duration), value: (r) => r.avg_session_duration },
    { col: 'event_count', label: 'Events', align: 'r', cell: (r) => fI(r.event_count), value: (r) => r.event_count },
    { col: 'key_events', label: 'Key Events', align: 'r', cell: (r) => fI(r.key_events), value: (r) => r.key_events },
    { col: 'pct_sessions', label: '% Sessions', align: 'r', cell: (r) => fP(r.pct_sessions), value: (r) => r.pct_sessions },
  ];

  const deviceCols = [
    { col: 'device_category', label: 'Device', cell: (r) => r.device_category, value: (r) => r.device_category },
    { col: 'page_views', label: 'Page Views', align: 'r', cell: (r) => fI(r.page_views), value: (r) => r.page_views },
    { col: 'total_users', label: 'Total Users', align: 'r', cell: (r) => fI(r.total_users), value: (r) => r.total_users },
    { col: 'sessions', label: 'Sessions', align: 'r', cell: (r) => fI(r.sessions), value: (r) => r.sessions },
    { col: 'engaged_sessions', label: 'Engaged Sessions', align: 'r', cell: (r) => fI(r.engaged_sessions), value: (r) => r.engaged_sessions },
    { col: 'bounce_rate', label: 'Bounce Rate', align: 'r', cell: (r) => fRate(r.bounce_rate), value: (r) => r.bounce_rate },
    { col: 'engagement_rate', label: 'Engagement Rate', align: 'r', cell: (r) => fRate(r.engagement_rate), value: (r) => r.engagement_rate },
    { col: 'avg_session_duration', label: 'Avg Duration', align: 'r', cell: (r) => fDur(r.avg_session_duration), value: (r) => r.avg_session_duration },
    { col: 'event_count', label: 'Events', align: 'r', cell: (r) => fI(r.event_count), value: (r) => r.event_count },
    { col: 'key_events', label: 'Key Events', align: 'r', cell: (r) => fI(r.key_events), value: (r) => r.key_events },
    { col: 'pct_sessions', label: '% Sessions', align: 'r', cell: (r) => fP(r.pct_sessions), value: (r) => r.pct_sessions },
  ];

  const geoCols = [
    { col: 'region', label: 'Region', cell: (r) => r.region, value: (r) => r.region },
    { col: 'city', label: 'City', cell: (r) => r.city, value: (r) => r.city },
    { col: 'page_views', label: 'Page Views', align: 'r', cell: (r) => fI(r.page_views), value: (r) => r.page_views },
    { col: 'total_users', label: 'Total Users', align: 'r', cell: (r) => fI(r.total_users), value: (r) => r.total_users },
    { col: 'sessions', label: 'Sessions', align: 'r', cell: (r) => fI(r.sessions), value: (r) => r.sessions },
    { col: 'engaged_sessions', label: 'Engaged Sessions', align: 'r', cell: (r) => fI(r.engaged_sessions), value: (r) => r.engaged_sessions },
    { col: 'bounce_rate', label: 'Bounce Rate', align: 'r', cell: (r) => fRate(r.bounce_rate), value: (r) => r.bounce_rate },
    { col: 'engagement_rate', label: 'Engagement Rate', align: 'r', cell: (r) => fRate(r.engagement_rate), value: (r) => r.engagement_rate },
    { col: 'avg_session_duration', label: 'Avg Duration', align: 'r', cell: (r) => fDur(r.avg_session_duration), value: (r) => r.avg_session_duration },
    { col: 'event_count', label: 'Events', align: 'r', cell: (r) => fI(r.event_count), value: (r) => r.event_count },
    { col: 'key_events', label: 'Key Events', align: 'r', cell: (r) => fI(r.key_events), value: (r) => r.key_events },
    { col: 'pct_sessions', label: '% Sessions', align: 'r', cell: (r) => fP(r.pct_sessions), value: (r) => r.pct_sessions },
  ];

  const pageTypeCols = [
    { col: 'page_type', label: 'Page type', cell: (r) => r.page_type, value: (r) => r.page_type },
    { col: 'page_views', label: 'Page Views', align: 'r', cell: (r) => fI(r.page_views), value: (r) => r.page_views },
    { col: 'total_users', label: 'Total Users', align: 'r', cell: (r) => fI(r.total_users), value: (r) => r.total_users },
    { col: 'sessions', label: 'Sessions', align: 'r', cell: (r) => fI(r.sessions), value: (r) => r.sessions },
    { col: 'pct_views', label: '% views', align: 'r', cell: (r) => fP(r.pct_views), value: (r) => r.pct_views },
  ];

  const dailyCols = [
    { col: 'report_date', label: 'Date', cell: (r) => r.report_date, value: (r) => r.report_date },
    { col: 'page_views', label: 'Page Views', align: 'r', cell: (r) => fI(r.page_views), value: (r) => r.page_views },
    { col: 'total_users', label: 'Total Users', align: 'r', cell: (r) => fI(r.total_users), value: (r) => r.total_users },
    { col: 'new_users', label: 'New Users', align: 'r', cell: (r) => fI(r.new_users), value: (r) => r.new_users },
    { col: 'sessions', label: 'Sessions', align: 'r', cell: (r) => fI(r.sessions), value: (r) => r.sessions },
    { col: 'engaged_sessions', label: 'Engaged Sessions', align: 'r', cell: (r) => fI(r.engaged_sessions), value: (r) => r.engaged_sessions },
    { col: 'bounce_rate', label: 'Bounce Rate', align: 'r', cell: (r) => fRate(r.bounce_rate), value: (r) => r.bounce_rate },
    { col: 'engagement_rate', label: 'Engagement Rate', align: 'r', cell: (r) => fRate(r.engagement_rate), value: (r) => r.engagement_rate },
    { col: 'avg_session_duration', label: 'Avg Duration', align: 'r', cell: (r) => fDur(r.avg_session_duration), value: (r) => r.avg_session_duration },
    { col: 'event_count', label: 'Events', align: 'r', cell: (r) => fI(r.event_count), value: (r) => r.event_count },
    { col: 'key_events', label: 'Key Events', align: 'r', cell: (r) => fI(r.key_events), value: (r) => r.key_events },
  ];

  const dailyChannelSubRows = useCallback((dayRow, visibleCols) => {
    const subs = dayRow.channels || [];
    if (!subs.length) {
      return (
        <tr key="empty" className="gads-sub-wrap">
          <td colSpan={visibleCols.length} className="gads-empty-cell">No channel breakdown for this day.</td>
        </tr>
      );
    }
    return subs.map((ch) => (
      <tr key={ch.channel_group} className="gads-sub-row">
        {visibleCols.map((c, ci) => (
          <td key={c.col} className={c.align === 'r' ? 'text-right' : ''} style={ci === 0 ? { paddingLeft: 32 } : undefined}>
            {ci === 0 ? <><span className="gads-sub-indicator">↳</span> {ch.channel_group}</> : c.cell(ch)}
          </td>
        ))}
      </tr>
    ));
  }, []);

  const channelDaySubRows = useCallback((chRow, visibleCols) => {
    const days = channelDayBreakdown?.get(chRow.channel_group) || [];
    if (!days.length) {
      return (
        <tr key="empty" className="gads-sub-wrap">
          <td colSpan={visibleCols.length} className="gads-empty-cell">No daily breakdown for this channel.</td>
        </tr>
      );
    }
    return days.map((day) => (
      <tr key={String(day.report_date)} className="gads-sub-row">
        {visibleCols.map((c, ci) => (
          <td key={c.col} className={c.align === 'r' ? 'text-right' : ''} style={ci === 0 ? { paddingLeft: 32 } : undefined}>
            {ci === 0 ? <><span className="gads-sub-indicator">↳</span> {day.report_date}</> : c.cell(day)}
          </td>
        ))}
      </tr>
    ));
  }, [channelDayBreakdown]);

  const campaignChannelSubRows = useCallback((channelRow, visibleCols) => {
    const subs = channelRow.campaigns || [];
    if (!subs.length) {
      return (
        <tr key="empty" className="gads-sub-wrap">
          <td colSpan={visibleCols.length} className="gads-empty-cell">No campaigns for this channel.</td>
        </tr>
      );
    }
    return subs.map((camp) => (
      <tr key={`${channelRow.channel_group}|${camp.campaign_name}`} className="gads-sub-row">
        {visibleCols.map((c, ci) => (
          <td key={c.col} className={c.align === 'r' ? 'text-right' : ''} style={ci === 0 ? { paddingLeft: 32 } : undefined}>
            {ci === 0 ? <><span className="gads-sub-indicator">↳</span> {camp.campaign_name}</> : c.cell(camp)}
          </td>
        ))}
      </tr>
    ));
  }, []);

  const tabDataMap = {
    daily: dailyBreakdown,
    channels: channelData,
    sourcemedium: sourceMediumData,
    campaigns: campaignData,
    devices: deviceData,
    geo: geoData,
    vdp_channel: vdpByChannelData,
    vdp_campaign_google: vdpByGoogleCampaignData,
    vdp_make: vdpByMakeData,
    vdp_model: vdpByModelData,
    vdp_rvtype: vdpByRvTypeData,
    vdp_condition: vdpByConditionData,
    pagetypes_drilldown: pagetypesDrilldownParentRows,
    vdp_daily: vdpDailyData,
  };

  const tabColMap = {
    daily: dailyCols,
    channels: channelCols,
    sourcemedium: sourceCols,
    campaigns: campaignCols,
    devices: deviceCols,
    geo: geoCols,
    vdp_channel: vdpChannelCols,
    vdp_campaign_google: vdpGoogleCampCols,
    vdp_make: vdpMakeCols,
    vdp_model: vdpModelCols,
    vdp_rvtype: vdpRvCols,
    vdp_condition: vdpCondCols,
    pagetypes_drilldown: pageTypeDrillCols,
    vdp_daily: vdpDailyCols,
    events: [],
  };

  const reportingEventNames = useMemo(() => {
    const s = new Set();
    (eventsData?.events_summary || []).forEach((r) => {
      if (r.is_reporting) s.add(String(r.event_name ?? ''));
    });
    return s;
  }, [eventsData?.events_summary]);

  const hasReportingEvents = reportingEventNames.size > 0;

  const reportingOptions = useMemo(() => {
    const names = (eventsData?.events_summary || [])
      .filter((r) => r.is_reporting)
      .map((r) => String(r.event_name ?? ''))
      .filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }, [eventsData?.events_summary]);

  const eventsSummaryFiltered = useMemo(() => {
    let rows = (eventsData?.events_summary || []).map((r) => ({
      ...r,
      total_users: evEventUsers(r),
    }));
    rows = filterGa4RowsByQuery(rows, ga4TabSearch.events ?? '', GA4_TAB_ROW_SEARCH.events.haystacks);
    const s = sort.events || { col: 'event_count', dir: 'desc' };
    return sortRows(rows, s.col, s.dir);
  }, [eventsData?.events_summary, ga4TabSearch.events, sort.events]);

  const eventsSummaryPage = useMemo(
    () => paginate(eventsSummaryFiltered, pg.events || 1),
    [eventsSummaryFiltered, pg.events],
  );

  const eventsSummaryFooter = useMemo(() => {
    if (!eventsSummaryFiltered.length) return null;
    return eventsSummaryFiltered.reduce(
      (acc, r) => ({
        event_count: acc.event_count + num(r.event_count),
        total_users: acc.total_users + evEventUsers(r),
        sessions: acc.sessions + num(r.sessions),
      }),
      { event_count: 0, total_users: 0, sessions: 0 },
    );
  }, [eventsSummaryFiltered]);

  const eventsBreakdownFlat = useMemo(() => {
    if (reportingEventNames.size === 0) return [];
    let rows = (eventsData?.events_by_channel || []).filter((r) =>
      reportingEventNames.has(String(r.event_name ?? '')),
    );
    if (eventsRptFilter) rows = rows.filter((r) => String(r.event_name ?? '') === eventsRptFilter);
    const byEvent = new Map();
    rows.forEach((r) => {
      const k = String(r.event_name ?? '');
      if (!byEvent.has(k)) byEvent.set(k, []);
      byEvent.get(k).push(r);
    });
    const groupTotals = [...byEvent.entries()].map(([name, arr]) => ({
      name,
      total: arr.reduce((s, x) => s + num(x.event_count), 0),
    }));
    groupTotals.sort((a, b) => b.total - a.total);
    const flat = [];
    for (const { name } of groupTotals) {
      const arr = [...byEvent.get(name)].sort((a, b) => num(b.event_count) - num(a.event_count));
      for (const r of arr) {
        flat.push({ ...r, _rowKind: 'detail' });
      }
      const st = arr.reduce(
        (acc, r) => ({
          event_count: acc.event_count + num(r.event_count),
          total_users: acc.total_users + evEventUsers(r),
          sessions: acc.sessions + num(r.sessions),
        }),
        { event_count: 0, total_users: 0, sessions: 0 },
      );
      flat.push({
        event_name: name,
        channel_group: 'Subtotal',
        source_medium: '—',
        event_count: st.event_count,
        total_users: st.total_users,
        sessions: st.sessions,
        _rowKind: 'subtotal',
      });
    }
    return flat;
  }, [eventsData?.events_by_channel, reportingEventNames, eventsRptFilter]);

  const eventsBreakdownSearched = useMemo(
    () =>
      filterGa4RowsByQuery(
        eventsBreakdownFlat,
        ga4TabSearch.events_breakdown ?? '',
        GA4_EVENTS_BREAKDOWN_SEARCH.haystacks,
      ),
    [eventsBreakdownFlat, ga4TabSearch.events_breakdown],
  );

  const eventsBreakdownPage = useMemo(
    () => paginate(eventsBreakdownSearched, evBreakPg),
    [eventsBreakdownSearched, evBreakPg],
  );

  const handleEventsBreakdownCsv = useCallback(() => {
    const cols = [
      { label: 'Event Name', value: (r) => r.event_name ?? '' },
      { label: 'Channel', value: (r) => r.channel_group ?? '' },
      { label: 'Source / Medium', value: (r) => String(r.source_medium ?? '') },
      { label: 'Event Count', value: (r) => r.event_count ?? 0 },
      { label: 'Users', value: (r) => evEventUsers(r) },
      { label: 'Sessions', value: (r) => r.sessions ?? 0 },
      { label: 'Row type', value: (r) => (r._rowKind === 'subtotal' ? 'Subtotal' : 'Detail') },
    ];
    exportCSV(cols, eventsBreakdownSearched, 'ga4-reporting-events-by-channel.csv');
  }, [eventsBreakdownSearched]);

  const renderTable = (tab, data, allColumns, opts = {}) => {
    let columns = allColumns.filter((c) => !hiddenCols[`${tab}:${c.col}`]);
    if (!columns.length) columns = allColumns;
    const s = sort[tab] || { col: columns[0]?.col, dir: 'desc' };
    const searchCfg = GA4_TAB_ROW_SEARCH[tab];
    const q = ga4TabSearch[tab] ?? '';
    const dataForTable =
      tab === 'geo' && Array.isArray(data) ? aggregateGa4GeoRowsForVisibleDims(data, columns) : data;
    const base = dataForTable || [];
    const filtered = searchCfg ? filterGa4RowsByQuery(base, q, searchCfg.haystacks) : base;
    const sorted = sortRows(filtered, s.col, s.dir);
    const info = paginate(sorted, pg[tab] || 1);
    const footerRow = buildGa4FooterRow(tab, sorted);
    const footerPrior = opts.footerPrior ?? null;
    return (
      <>
        <div className="panel"><div className="panel-body no-padding"><div className="table-wrapper">
          <table className="data-table gads-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <SortTh
                    key={c.col}
                    label={c.label}
                    col={c.col}
                    sortKey={c.sortKey}
                    sortable={c.sortable}
                    headerSub={c.headerSub}
                    thTitle={c.thTitle}
                    sort={s}
                    onSort={(col) => handleSort(tab, col)}
                    align={c.align}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {info.rows.length === 0 && <tr><td colSpan={columns.length} className="gads-empty-cell">No data for the selected filters.</td></tr>}
              {info.rows.map((r, i) => {
                const rowKey = opts.rowKey ? opts.rowKey(r) : i;
                const expandKey = opts.expandKey ? opts.expandKey(r) : null;
                const isExpanded = expandKey && expanded[expandKey];
                return (
                  <React.Fragment key={rowKey}>
                    <tr className={expandKey ? 'gads-row-click' : ''} onClick={expandKey ? () => toggleExpand(expandKey) : undefined}>
                      {columns.map((c) => (
                        <td key={c.col} className={c.align === 'r' ? 'text-right' : ''}>
                          {expandKey && c.col === columns[0]?.col ? <><span className="gads-expand-arrow">{isExpanded ? '▼' : '▶'}</span> {c.cell(r)}</> : c.cell(r)}
                        </td>
                      ))}
                    </tr>
                    {isExpanded && opts.subRows ? opts.subRows(r, columns) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
            {footerRow && info.total > 0 && (
              <tfoot>
                <tr>
                  {columns.map((c) => (
                    <td
                      key={c.col}
                      className={c.align === 'r' ? 'text-right' : ''}
                      style={{ fontWeight: 700, borderTop: '2px solid var(--border)', background: 'var(--bg-subtle, var(--bg))' }}
                    >
                      {c.footerCell ? c.footerCell(footerRow, footerPrior) : c.cell(footerRow)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div></div></div>
        <Pagination info={info} onPage={(p) => handlePage(tab, p)} />
      </>
    );
  };

  const renderWheelerMonthlyTable = (tabId, data, columns, opts = {}) => {
    const err = advancedMonthlyError[tabId];
    const busy = advancedMonthlyLoading[tabId];
    if (err) {
      return (
        <div className="panel">
          <div className="panel-body">
            <p className="gads-empty-cell" style={{ padding: 24 }}>{err}</p>
          </div>
        </div>
      );
    }
    if (busy && !(data?.length)) {
      return (
        <div className="gads-loading">
          <div className="gads-spinner" />
          Loading report…
        </div>
      );
    }
    const s = sort[tabId] || { col: 'page_views', dir: 'desc' };
    const priorRaw = wheelerReportsCompare?.[tabId];
    const footerPrior =
      advancedComparisonActive && Array.isArray(priorRaw) && priorRaw.length
        ? sortRows([...priorRaw], s.col, s.dir)
        : null;
    return renderTable(tabId, data, columns, { ...opts, footerPrior });
  };

  const handleCSV = () => {
    if (activeTab === 'overview' || activeTab === 'events') return;
    const raw = tabDataMap[activeTab];
    const allCols = tabColMap[activeTab];
    if (!raw?.length || !allCols?.length) return;
    const searchCfg = GA4_TAB_ROW_SEARCH[activeTab];
    const data = searchCfg
      ? filterGa4RowsByQuery(raw, ga4TabSearch[activeTab] ?? '', searchCfg.haystacks)
      : raw;
    if (!data.length) return;
    let cols = allCols.filter((c) => !hiddenCols[`${activeTab}:${c.col}`]);
    if (!cols.length) cols = allCols;
    const dataForCsv =
      activeTab === 'geo' && Array.isArray(data) ? aggregateGa4GeoRowsForVisibleDims(data, cols) : data;
    const s = sort[activeTab] || { col: cols[0]?.col, dir: 'desc' };
    const sorted = sortRows(dataForCsv, s.col, s.dir);

    if (activeTab === 'campaigns') {
      const flat = [];
      sorted.forEach((ch) => {
        (ch.campaigns || []).forEach((camp) => {
          flat.push({ channel_group: ch.channel_group, ...camp });
        });
      });
      const csvCols = [
        { label: 'Channel', value: (r) => r.channel_group },
        ...cols.filter((c) => c.col !== 'channel_group').map((c) => ({ label: c.label, value: (r) => c.value(r) })),
      ];
      exportCSV(csvCols, flat, 'ga4-campaigns.csv');
      return;
    }

    if (activeTab === 'pagetypes_drilldown') {
      const flat = [];
      sorted.forEach((parent) => {
        (parent.pages || []).forEach((p) => {
          flat.push({
            page_type: parent.page_type,
            page_path: p.page_path,
            page_title: p.page_title,
            page_views: p.page_views,
          });
        });
      });
      const csvCols = [
        { label: 'Page type', value: (r) => r.page_type },
        { label: 'Path', value: (r) => r.page_path },
        { label: 'Title', value: (r) => r.page_title },
        { label: 'Page views', value: (r) => r.page_views },
      ];
      exportCSV(csvCols, flat, 'ga4-page-type-details.csv');
      return;
    }

    const csvCols = cols.map((c) => ({ label: c.label, value: (r) => c.value(r) }));
    exportCSV(csvCols, sorted, `ga4-${activeTab}.csv`);
  };

  return (
    <div className="page-section active" id="page-ga4">
      <div className="page-content">
        <div className="page-title-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: 'linear-gradient(135deg,#E37400,#F9AB00)', color: 'white', borderRadius: 8, fontSize: 16 }}>GA4</span>
              GA4 Analytics
            </h2>
            <p>
              {wheelerAnalyticsMode === 'advanced' && isWheelerAgency ? (
                <>
                  Page &amp; VDP detail from <code style={{ fontSize: 12 }}>ga4_advanced_report</code> for the same date range as the summary below. Turn on comparison in the date picker to load a second <code style={{ fontSize: 12 }}>ga4_advanced_report</code> for the comparison range.
                </>
              ) : (
                <>
                  Session summary from <code style={{ fontSize: 12 }}>ga4_summary_report</code>
                </>
              )}
            </p>
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

        <div className="gads-filter-bar" id="gads-filter-bar">
          <div className="gads-filter-row">
            <div className="gads-filter-group gads-fg-sm">
              <label>Property</label>
              <select
                value={effectivePropertyId}
                onChange={handleAccountChange}
                disabled={ga4Accounts.length === 0 || ga4Accounts.some((a) => a.id === '__NONE__')}
              >
                {loading && ga4Accounts.length === 0 && (
                  <option value="" disabled>Loading properties…</option>
                )}
                {ga4Accounts.map((a) => (
                  <option key={a.id} value={a.id} disabled={a.id === '__NONE__'}>{a.name}</option>
                ))}
              </select>
            </div>
            <div className="gads-filter-group ga4-apply-beside-property">
              <label className="ga4-apply-align-label" aria-hidden="true">&nbsp;</label>
              <button type="button" className="btn btn-navy btn-sm" onClick={handleApply} disabled={loading} style={{ padding: '6px 20px' }}>{loading ? 'Loading…' : 'Apply'}</button>
            </div>
            <div className="gads-filter-group gads-filter-actions ga4-filter-actions-right">
              {isWheeler && (
                <div className="ga4-mode-toggle" role="group" aria-label="Analytics mode">
                  <button
                    type="button"
                    className={`ga4-mode-toggle-btn${wheelerAnalyticsMode === 'basic' ? ' active' : ''}`}
                    onClick={() => setWheelerAnalyticsMode('basic')}
                  >
                    Basic
                  </button>
                  <button
                    type="button"
                    className={`ga4-mode-toggle-btn${wheelerAnalyticsMode === 'advanced' ? ' active' : ''}`}
                    onClick={() => setWheelerAnalyticsMode('advanced')}
                  >
                    Advanced
                  </button>
                </div>
              )}
              <span style={{ color: loading ? 'var(--warning)' : error ? 'var(--danger)' : 'var(--accent)', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap', alignSelf: 'flex-end', paddingBottom: 2 }}>{loading ? 'Loading…' : error ? 'Error' : 'Live'}</span>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ padding: '16px 20px', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 'var(--radius-md)', margin: '0 0 16px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ flex: 1 }}>{error}</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleApply}>Retry</button>
          </div>
        )}

        {wheelerAnalyticsMode === 'basic' && (
        <div className="gads-kpi-section">
          <div className="kpi-grid" id="gads-kpi-grid">
            {KPI_ITEMS.map((item) => {
              const mom = momChanges?.[item.mom];
              const prevVal = compareKpis?.[item.key];
              const showCompare = filters.compareOn && mom != null && compareKpis != null && prevVal !== undefined && prevVal !== null;
              const lowerBetter = !!item.lowerIsBetter;
              const isGood = mom == null ? null : lowerBetter ? mom <= 0 : mom >= 0;
              return (
                <div key={item.key} className="kpi-card">
                  <div className="kpi-header">
                    <span className="kpi-label">{item.label}</span>
                  </div>
                  <div className="kpi-value">{kpis ? item.fmt(kpis[item.key] ?? 0) : '—'}</div>
                  {showCompare && (
                    <div className={`kpi-compare ${isGood ? 'kpi-compare-good' : 'kpi-compare-bad'}`}>
                      <span className="kpi-prev">vs {item.fmt(prevVal)}</span>
                      <span className="kpi-compare-arrow">{isGood ? '▲' : '▼'}</span>
                      <span className="kpi-compare-pct">{Math.abs(mom).toFixed(1)}%</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        )}

        {wheelerAnalyticsMode === 'basic' && (
        <div className="gads-chart-section">
          <div className="gads-chart-toolbar">
            <span className="gads-chart-title">Daily trend {filters.compareOn ? '(with comparison)' : ''}</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setChartCollapsed(!chartCollapsed)}>{chartCollapsed ? 'Show chart ▼' : 'Hide chart ▲'}</button>
          </div>
          {!chartCollapsed && <div className="gads-chart-wrap"><canvas ref={chartRef} style={{ height: 300 }} /></div>}
        </div>
        )}

        {wheelerAnalyticsMode === 'advanced' && isWheelerAgency && (
          <>
            <div className="gads-kpi-section">
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-muted)' }}>
                Snapshot from <code style={{ fontSize: 12 }}>ga4_advanced_report</code> (page types, paths, and VDP breakdowns). Not session-level GA4 metrics.
                {' '}
                {advancedComparisonActive
                  ? 'Comparison uses the date picker range; cards and tables show vs prior + % like Basic KPIs.'
                  : 'Turn on comparison in the date picker and apply to load a second advanced report and show vs / % on cards and Δ columns in sub-reports.'}
              </p>
              <div className="kpi-grid" id="gads-kpi-grid-advanced">
                <div className="kpi-card">
                  <div className="kpi-header"><span className="kpi-label">All page-type views</span></div>
                  <div className="kpi-value">{fI(advancedWheelerKpis.totalPageTypeViews)}</div>
                  {advancedComparisonActive && advancedWheelerKpiMom && advKpiMomStrip(advancedWheelerKpiMom.totalPageTypeViews, fI)}
                </div>
                <div className="kpi-card">
                  <div className="kpi-header"><span className="kpi-label">VDP New + Used (page types)</span></div>
                  <div className="kpi-value">{fI(advancedWheelerKpis.vdpListingViews)}</div>
                  {advancedComparisonActive && advancedWheelerKpiMom && advKpiMomStrip(advancedWheelerKpiMom.vdpListingViews, fI)}
                </div>
                <div className="kpi-card">
                  <div className="kpi-header"><span className="kpi-label">VDP New views</span></div>
                  <div className="kpi-value">{fI(advancedWheelerKpis.vdpNew)}</div>
                  {advancedComparisonActive && advancedWheelerKpiMom && advKpiMomStrip(advancedWheelerKpiMom.vdpNew, fI)}
                </div>
                <div className="kpi-card">
                  <div className="kpi-header"><span className="kpi-label">VDP Used views</span></div>
                  <div className="kpi-value">{fI(advancedWheelerKpis.vdpUsed)}</div>
                  {advancedComparisonActive && advancedWheelerKpiMom && advKpiMomStrip(advancedWheelerKpiMom.vdpUsed, fI)}
                </div>
                <div className="kpi-card">
                  <div className="kpi-header"><span className="kpi-label">SRP views</span></div>
                  <div className="kpi-value">{fI(advancedWheelerKpis.srp)}</div>
                  {advancedComparisonActive && advancedWheelerKpiMom && advKpiMomStrip(advancedWheelerKpiMom.srp, fI)}
                </div>
                <div className="kpi-card">
                  <div className="kpi-header"><span className="kpi-label">Home views</span></div>
                  <div className="kpi-value">{fI(advancedWheelerKpis.home)}</div>
                  {advancedComparisonActive && advancedWheelerKpiMom && advKpiMomStrip(advancedWheelerKpiMom.home, fI)}
                </div>
                <div className="kpi-card">
                  <div className="kpi-header"><span className="kpi-label">Top make (VDP report)</span></div>
                  <div className="kpi-value">{fI(advancedWheelerKpis.topMakeViews)}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{advancedWheelerKpis.topMakeName || '—'}</div>
                  {advancedComparisonActive && advancedWheelerKpiMom && advKpiMomStrip(advancedWheelerKpiMom.topMakeViews, fI)}
                </div>
                <div className="kpi-card">
                  <div className="kpi-header"><span className="kpi-label">Top model (VDP report)</span></div>
                  <div className="kpi-value">{fI(advancedWheelerKpis.topModelViews)}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                    {advancedWheelerKpis.topModelMake || advancedWheelerKpis.topModelName
                      ? `${advancedWheelerKpis.topModelMake || ''} ${advancedWheelerKpis.topModelName || ''}`.trim()
                      : '—'}
                  </div>
                  {advancedComparisonActive && advancedWheelerKpiMom && advKpiMomStrip(advancedWheelerKpiMom.topModelViews, fI)}
                </div>
                <div className="kpi-card">
                  <div className="kpi-header"><span className="kpi-label">Top channel (VDP)</span></div>
                  <div className="kpi-value">{fI(advancedWheelerKpis.topChannelViews)}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{advancedWheelerKpis.topChannelName || '—'}</div>
                  {advancedComparisonActive && advancedWheelerKpiMom && advKpiMomStrip(advancedWheelerKpiMom.topChannelViews, fI)}
                </div>
                <div className="kpi-card">
                  <div className="kpi-header"><span className="kpi-label">Top Google Ads campaign (VDP)</span></div>
                  <div className="kpi-value">{fI(advancedWheelerKpis.topGoogleCampaignViews)}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{advancedWheelerKpis.topGoogleCampaignName || '—'}</div>
                  {advancedComparisonActive && advancedWheelerKpiMom && advKpiMomStrip(advancedWheelerKpiMom.topGoogleCampaignViews, fI)}
                </div>
                <div className="kpi-card">
                  <div className="kpi-header"><span className="kpi-label">Top RV type (VDP)</span></div>
                  <div className="kpi-value">{fI(advancedWheelerKpis.topRvTypeViews)}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{advancedWheelerKpis.topRvTypeName || '—'}</div>
                  {advancedComparisonActive && advancedWheelerKpiMom && advKpiMomStrip(advancedWheelerKpiMom.topRvTypeViews, fI)}
                </div>
                <div className="kpi-card">
                  <div className="kpi-header"><span className="kpi-label">Avg daily VDP (New+Used page types)</span></div>
                  <div className="kpi-value">{fDec(advancedWheelerKpis.avgDailyVdpListings)}</div>
                  {advancedComparisonActive && advancedWheelerKpiMom && advKpiMomStrip(advancedWheelerKpiMom.avgDailyVdpListings, fDec)}
                </div>
              </div>
            </div>
            <div className="gads-chart-section">
              <div className="gads-chart-toolbar">
                <span className="gads-chart-title">
                  Daily VDP views {filters.compareOn ? '(with comparison)' : ''}
                  {' '}
                  · {advancedVdpDailyChartSeries.current?.length || 0} day{advancedVdpDailyChartSeries.current?.length === 1 ? '' : 's'}
                </span>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setChartCollapsed(!chartCollapsed)}>{chartCollapsed ? 'Show chart ▼' : 'Hide chart ▲'}</button>
              </div>
              {!chartCollapsed && (
                <div className="gads-chart-wrap" style={{ minHeight: 300 }}>
                  {(advancedVdpDailyChartSeries.current?.length || 0) > 0 ? (
                    <canvas ref={advancedChartRef} style={{ height: 300 }} />
                  ) : (
                    <p className="gads-empty-cell" style={{ padding: 24 }}>No VDP daily series for this date range yet.</p>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        <div className="gads-tabs-container">
          <div
            className="gads-tabs-row"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              gap: 12,
              justifyContent: 'space-between',
              width: '100%',
            }}
          >
            <div className="gads-tabs">
              {TABS.map((tab) => (
                <button key={tab.id} type="button" className={`gads-tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                gap: 10,
                marginLeft: 'auto',
              }}
            >
              {!loading && activeTab === 'overview' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: 0, minWidth: 180, maxWidth: 300 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Search</span>
                  <input
                    type="search"
                    style={GA4_SEARCH_INPUT_STYLE}
                    placeholder={GA4_OVERVIEW_SEARCH_PLACEHOLDER}
                    value={ga4TabSearch.overview ?? ''}
                    onChange={(e) => handleGa4TabSearchChange('overview', e.target.value)}
                    autoComplete="off"
                    aria-label="Search overview metrics"
                  />
                </label>
              )}
              {!loading && GA4_TAB_ROW_SEARCH[activeTab] && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: 0, minWidth: 180, maxWidth: 300 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Search</span>
                  <input
                    type="search"
                    style={GA4_SEARCH_INPUT_STYLE}
                    placeholder={GA4_TAB_ROW_SEARCH[activeTab].placeholder}
                    value={ga4TabSearch[activeTab] ?? ''}
                    onChange={(e) => handleGa4TabSearchChange(activeTab, e.target.value)}
                    autoComplete="off"
                    aria-label={`Search ${activeTab} table`}
                  />
                </label>
              )}
              {!loading && activeTab === 'events' && hasReportingEvents && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: 0, minWidth: 160, maxWidth: 260 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Breakdown search</span>
                  <input
                    type="search"
                    style={GA4_SEARCH_INPUT_STYLE}
                    placeholder={GA4_EVENTS_BREAKDOWN_SEARCH.placeholder}
                    value={ga4TabSearch.events_breakdown ?? ''}
                    onChange={(e) => handleGa4TabSearchChange('events_breakdown', e.target.value)}
                    autoComplete="off"
                    aria-label="Search reporting events breakdown"
                  />
                </label>
              )}
            <div className="gads-tabs-actions" style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <div style={{ position: 'relative' }} ref={colEditorRef}>
                <button type="button" className={`gads-col-btn${colEditorOpen ? ' active' : ''}`} title="Show or hide columns" onClick={() => setColEditorOpen((v) => !v)} disabled={activeTab === 'overview' || activeTab === 'events'}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ verticalAlign: '-2px', marginRight: 4 }} aria-hidden><rect x="1" y="1" width="4" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" /><rect x="1" y="8" width="4" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" /><rect x="7" y="1" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" /><rect x="7" y="8" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" /></svg>
                  Columns
                </button>
                {colEditorOpen && tabColMap[activeTab]?.length > 0 && (
                  <div className="gads-col-dropdown">
                    <div className="gads-col-dropdown-header">Toggle columns</div>
                    {tabColMap[activeTab].map((c) => {
                      const key = `${activeTab}:${c.col}`;
                      const hidden = !!hiddenCols[key];
                      return (
                        <label key={c.col} className={`gads-col-dropdown-item${!hidden ? ' active' : ''}`}>
                          <input type="checkbox" checked={!hidden} onChange={() => toggleColVisibility(activeTab, c.col)} />
                          <span>{c.label}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              <button type="button" className="gads-col-btn" title="Download CSV" onClick={handleCSV} disabled={activeTab === 'overview' || activeTab === 'events'}>↓ CSV</button>
            </div>
            </div>
          </div>
        </div>

        <div id="gads-tab-content">
          {loading && <div className="gads-loading"><div className="gads-spinner" /> {loadingPhase || 'Loading…'}</div>}
          {!loading && activeTab === 'overview' && (
            <div className="panel">
              <div className="panel-body">
                <h3>Overview</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
                  Summary for the selected property and date range from <code>ga4_summary_report</code>.
                  {' '}
                  Turn on comparison in the date picker to add previous period, Δ, and % change columns (green = better, red = worse; bounce rate is inverted).
                  {dailyBreakdown?.length ? ` ${fI(dailyBreakdown.length)} day(s) in range.` : ''}
                </p>
                {!ga4SummaryReady ? (
                  <p className="gads-empty-cell" style={{ padding: 16 }}>No summary data loaded. Adjust filters and click Apply, or check access to GA4 summary (database / RPC).</p>
                ) : (
                  <div className="table-wrapper ga4-overview-table-wrap">
                    <table className="data-table gads-table ga4-overview-table">
                      <thead>
                        <tr>
                          <th className="ga4-overview-metric-th">Metric</th>
                          <th className="text-right gads-th-num ga4-overview-period-th">
                            <div className="ga4-overview-th-title">This period</div>
                            <div className="ga4-overview-th-dates">{overviewPeriodLabels?.currentRange ?? '—'}</div>
                          </th>
                          {filters.compareOn && (
                            <>
                              <th className="text-right gads-th-num ga4-overview-period-th">
                                <div className="ga4-overview-th-title">Previous period</div>
                                <div className="ga4-overview-th-dates">{overviewPeriodLabels?.previousRange ?? '—'}</div>
                              </th>
                              <th className="text-right gads-th-num ga4-overview-period-th">
                                <div className="ga4-overview-th-title">Δ / % change</div>
                                <div className="ga4-overview-th-dates">vs previous period</div>
                              </th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {overviewKpiItemsFiltered.length === 0 ? (
                          <tr>
                            <td colSpan={filters.compareOn ? 4 : 2} className="gads-empty-cell">
                              No metrics match your search.
                            </td>
                          </tr>
                        ) : (
                          overviewKpiItemsFiltered.map((item) => {
                            const mom = momChanges?.[item.mom];
                            const prevVal = compareKpis?.[item.key];
                            const curVal = kpis ? kpis[item.key] : null;
                            const showCompare = filters.compareOn && compareKpis != null && prevVal !== undefined && prevVal !== null;
                            const deltaStr = showCompare ? formatOverviewDelta(item, curVal ?? 0, prevVal) : '—';
                            const pctStr = showCompare && mom != null ? `${mom >= 0 ? '+' : ''}${mom.toFixed(1)}%` : '';
                            const lowerBetter = !!item.lowerIsBetter;
                            const isGood = mom == null ? null : lowerBetter ? mom <= 0 : mom >= 0;
                            const deltaColor = !filters.compareOn || !showCompare || mom == null
                              ? undefined
                              : mom === 0
                                ? 'var(--text-muted)'
                                : isGood
                                  ? 'var(--success)'
                                  : 'var(--danger)';
                            return (
                              <tr key={item.key}>
                                <td>{item.label}</td>
                                <td className="text-right">{kpis ? item.fmt(kpis[item.key] ?? 0) : '—'}</td>
                                {filters.compareOn && (
                                  <>
                                    <td className="text-right">{showCompare ? item.fmt(prevVal) : '—'}</td>
                                    <td className="text-right" style={{ color: deltaColor, fontWeight: 600 }}>
                                      {showCompare && mom != null ? (
                                        <span>
                                          {deltaStr}
                                          <span style={{ fontWeight: 500, opacity: 0.9 }}>{` (${pctStr})`}</span>
                                        </span>
                                      ) : '—'}
                                    </td>
                                  </>
                                )}
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
          {!loading && activeTab === 'daily' && renderTable('daily', dailyBreakdown || [], dailyCols, {
            rowKey: (r) => r.report_date,
            expandKey: (r) => `d_${r.report_date}`,
            subRows: dailyChannelSubRows,
          })}
          {!loading && activeTab === 'channels' && renderTable('channels', channelData, channelCols, {
            rowKey: (r) => r.channel_group,
            expandKey: (r) => `ch_${r.channel_group}`,
            subRows: channelDaySubRows,
          })}
          {!loading && activeTab === 'sourcemedium' && renderTable('sourcemedium', sourceMediumData, sourceCols)}
          {!loading && activeTab === 'campaigns' && renderTable('campaigns', campaignData, campaignCols, {
            rowKey: (r) => r.channel_group,
            expandKey: (r) => `campch_${r.channel_group}`,
            subRows: campaignChannelSubRows,
          })}
          {!loading && activeTab === 'devices' && renderTable('devices', deviceData, deviceCols)}
          {!loading && activeTab === 'geo' && renderTable('geo', geoData, geoCols)}
          {!loading && activeTab === 'events' && (
            <>
              {eventsError && (
                <div
                  style={{
                    padding: '12px 16px',
                    background: 'var(--danger-bg)',
                    color: 'var(--danger)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: 16,
                    fontSize: 13,
                  }}
                >
                  {eventsError}
                </div>
              )}
              <div className="panel" style={{ marginBottom: 20 }}>
                <div className="panel-body">
                  <h3 style={{ marginTop: 0 }}>All events</h3>
                  <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: 13 }}>
                    Star an event to include it in reporting breakdowns. Data from <code style={{ fontSize: 12 }}>ga4_events_report</code>.
                    {' '}
                    Use the Search field above the tabs to filter this table.
                  </p>
                  {eventsLoading && (
                    <div className="gads-loading" style={{ padding: '16px 0' }}>
                      <div className="gads-spinner" />
                      Loading events…
                    </div>
                  )}
                  {!eventsLoading && (
                    <>
                      <div className="table-wrapper">
                        <table className="data-table gads-table">
                          <thead>
                            <tr>
                              <th className="text-center" style={{ width: 48 }} title="Reporting event">
                                ★
                              </th>
                              <SortTh
                                label="Event name"
                                col="event_name"
                                sort={sort.events || { col: 'event_count', dir: 'desc' }}
                                onSort={(col) => handleSort('events', col)}
                              />
                              <SortTh
                                label="Event count"
                                col="event_count"
                                align="r"
                                sort={sort.events || { col: 'event_count', dir: 'desc' }}
                                onSort={(col) => handleSort('events', col)}
                              />
                              <SortTh
                                label="Users"
                                col="total_users"
                                align="r"
                                sort={sort.events || { col: 'event_count', dir: 'desc' }}
                                onSort={(col) => handleSort('events', col)}
                              />
                              <SortTh
                                label="Sessions"
                                col="sessions"
                                align="r"
                                sort={sort.events || { col: 'event_count', dir: 'desc' }}
                                onSort={(col) => handleSort('events', col)}
                              />
                            </tr>
                          </thead>
                          <tbody>
                            {eventsSummaryFiltered.length === 0 && (
                              <tr>
                                <td colSpan={5} className="gads-empty-cell">
                                  No events for the selected filters.
                                </td>
                              </tr>
                            )}
                            {eventsSummaryPage.rows.map((r, i) => (
                              <tr key={`${String(r.event_name)}_${i}`}>
                                <td className="text-center">
                                  <button
                                    type="button"
                                    className="btn btn-link btn-sm"
                                    style={{
                                      padding: 4,
                                      minWidth: 32,
                                      fontSize: 18,
                                      lineHeight: 1,
                                      color: r.is_reporting ? 'var(--accent, #E37400)' : 'var(--text-muted)',
                                    }}
                                    title={r.is_reporting ? 'Remove from reporting' : 'Add to reporting'}
                                    aria-pressed={!!r.is_reporting}
                                    disabled={eventsLoading}
                                    onClick={() =>
                                      toggleReportingEvent(effectivePropertyId, r.event_name, !r.is_reporting)
                                    }
                                  >
                                    {r.is_reporting ? '★' : '☆'}
                                  </button>
                                </td>
                                <td>{r.event_name ?? '—'}</td>
                                <td className="text-right">{fI(r.event_count)}</td>
                                <td className="text-right">{fI(evEventUsers(r))}</td>
                                <td className="text-right">{fI(r.sessions)}</td>
                              </tr>
                            ))}
                          </tbody>
                          {eventsSummaryFooter && eventsSummaryFiltered.length > 0 && (
                            <tfoot>
                              <tr>
                                <td />
                                <td style={{ fontWeight: 700 }}>Total</td>
                                <td className="text-right" style={{ fontWeight: 700 }}>
                                  {fI(eventsSummaryFooter.event_count)}
                                </td>
                                <td className="text-right" style={{ fontWeight: 700 }}>
                                  {fI(eventsSummaryFooter.total_users)}
                                </td>
                                <td className="text-right" style={{ fontWeight: 700 }}>
                                  {fI(eventsSummaryFooter.sessions)}
                                </td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                      <Pagination info={eventsSummaryPage} onPage={(p) => handlePage('events', p)} />
                    </>
                  )}
                </div>
              </div>

              {hasReportingEvents && (
                <div className="panel">
                  <div className="panel-body">
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        marginBottom: 12,
                      }}
                    >
                      <h3 style={{ margin: 0 }}>Reporting events breakdown (by channel)</h3>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
                        <div className="gads-filter-group gads-fg-sm">
                          <label htmlFor="ga4-events-rpt-filter">Event</label>
                          <select
                            id="ga4-events-rpt-filter"
                            value={eventsRptFilter}
                            onChange={(e) => setEventsRptFilter(e.target.value)}
                          >
                            <option value="">All reporting events</option>
                            {reportingOptions.map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={handleEventsBreakdownCsv}
                          disabled={!eventsBreakdownSearched.length}
                        >
                          Export CSV
                        </button>
                      </div>
                    </div>
                    {eventsLoading && (
                      <div className="gads-loading" style={{ padding: '16px 0' }}>
                        <div className="gads-spinner" />
                        Loading…
                      </div>
                    )}
                    {!eventsLoading && (
                      <>
                        <div className="table-wrapper">
                          <table className="data-table gads-table">
                            <thead>
                              <tr>
                                <th>Event name</th>
                                <th>Channel</th>
                                <th>Source / Medium</th>
                                <th className="text-right gads-th-num">Event count</th>
                                <th className="text-right gads-th-num">Users</th>
                                <th className="text-right gads-th-num">Sessions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {eventsBreakdownSearched.length === 0 && (
                                <tr>
                                  <td colSpan={6} className="gads-empty-cell">
                                    {eventsBreakdownFlat.length === 0
                                      ? 'No channel rows for reporting events in this range.'
                                      : 'No rows match your breakdown search.'}
                                  </td>
                                </tr>
                              )}
                              {eventsBreakdownPage.rows.map((r, i) => (
                                <tr
                                  key={`${r.event_name}_${r.channel_group}_${r.source_medium}_${i}`}
                                  style={
                                    r._rowKind === 'subtotal'
                                      ? { fontWeight: 700, background: 'var(--bg-subtle, var(--bg))' }
                                      : undefined
                                  }
                                >
                                  <td>{r.event_name ?? '—'}</td>
                                  <td>{r.channel_group ?? '—'}</td>
                                  <td>{r.source_medium ?? '—'}</td>
                                  <td className="text-right">{fI(r.event_count)}</td>
                                  <td className="text-right">{fI(evEventUsers(r))}</td>
                                  <td className="text-right">{fI(r.sessions)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <Pagination
                          info={eventsBreakdownPage}
                          onPage={(p) => setEvBreakPg(p)}
                        />
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
          {!loading && isWheeler && activeTab === 'pagetypes_drilldown' &&
            renderWheelerMonthlyTable('pagetypes_drilldown', pagetypesDrilldownParentRows, pageTypeDrillCols, {
              rowKey: (r) => r.page_type,
              expandKey: (r) => `ptd_${r.page_type}`,
              subRows: pageTypeDrillSubRows,
            })}
          {!loading && isWheeler && activeTab === 'vdp_daily' &&
            renderWheelerMonthlyTable('vdp_daily', vdpDailyData, vdpDailyCols, {
              rowKey: (r) => r.report_date,
            })}
          {!loading && isWheeler && activeTab === 'vdp_channel' &&
            renderWheelerMonthlyTable('vdp_channel', vdpByChannelData, vdpChannelCols)}
          {!loading && isWheeler && activeTab === 'vdp_campaign_google' &&
            renderWheelerMonthlyTable('vdp_campaign_google', vdpByGoogleCampaignData, vdpGoogleCampCols)}
          {!loading && isWheeler && activeTab === 'vdp_make' &&
            renderWheelerMonthlyTable('vdp_make', vdpByMakeData, vdpMakeCols)}
          {!loading && isWheeler && activeTab === 'vdp_model' &&
            renderWheelerMonthlyTable('vdp_model', vdpByModelData, vdpModelCols)}
          {!loading && isWheeler && activeTab === 'vdp_rvtype' &&
            renderWheelerMonthlyTable('vdp_rvtype', vdpByRvTypeData, vdpRvCols)}
          {!loading && isWheeler && activeTab === 'vdp_condition' &&
            renderWheelerMonthlyTable('vdp_condition', vdpByConditionData, vdpCondCols)}
        </div>
      </div>
    </div>
  );
}
