import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { getEffectiveAgencyScopeId } from '../lib/agencyScope';

/** Wheeler Motors — Advanced GA4 uses `ga4_advanced_report` + `ga4_summary_report` RPCs (live data). */
export const GA4_WHEELER_AGENCY_ID = '791536a9-5c5e-439d-93c9-6be6808012ec';
const WHEELER_AGENCY_ID = GA4_WHEELER_AGENCY_ID;
const NO_MATCH = '0';

const GMT5_OFFSET_MS = -5 * 60 * 60 * 1000;

function nowGMT5() {
  return new Date(Date.now() + GMT5_OFFSET_MS);
}

function fmtYMD(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Calendar month `YYYY-MM` (UTC, aligned with GMT+5 “today” via nowGMT5). */
function fmtMonthYMD(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function monthBoundsFromYYYYMM(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || '').trim());
  if (!m) return { from: null, to: null };
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  if (mo < 1 || mo > 12) return { from: null, to: null };
  const from = `${m[1]}-${m[2]}-01`;
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const to = `${m[1]}-${m[2]}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

/** Last N calendar months (newest first) for Advanced month picker. */
export function getWheelerAdvancedMonthOptions(count = 4) {
  const d = nowGMT5();
  const out = [];
  for (let i = 0; i < count; i++) {
    const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    const value = fmtMonthYMD(dt);
    const label = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(dt);
    out.push({ value, label });
  }
  return out;
}

function computeDateRange(preset, customFrom, customTo) {
  const today = nowGMT5();
  const fmt = (d) => fmtYMD(d);
  const daysAgo = (n) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - n));
  switch (preset) {
    case 'today': return { from: fmt(today), to: fmt(today) };
    case 'yesterday': return { from: fmt(daysAgo(1)), to: fmt(daysAgo(1)) };
    case 'last7': return { from: fmt(daysAgo(6)), to: fmt(today) };
    case 'last14': return { from: fmt(daysAgo(13)), to: fmt(today) };
    case 'last30': return { from: fmt(daysAgo(29)), to: fmt(today) };
    case 'this_month': {
      const y = today.getUTCFullYear(), m = today.getUTCMonth();
      return { from: fmt(new Date(Date.UTC(y, m, 1))), to: fmt(today) };
    }
    case 'last_month': {
      const y = today.getUTCFullYear(), m = today.getUTCMonth();
      return { from: fmt(new Date(Date.UTC(y, m - 1, 1))), to: fmt(new Date(Date.UTC(y, m, 0))) };
    }
    case 'custom': return { from: customFrom || null, to: customTo || null };
    default: return { from: null, to: null };
  }
}

function computePreviousPeriod(fromStr, toStr) {
  if (!fromStr || !toStr) return { from: null, to: null };
  const from = new Date(fromStr + 'T00:00:00');
  const to = new Date(toStr + 'T00:00:00');
  const days = Math.round((to - from) / 86400000) + 1;
  const prevTo = new Date(from);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - days + 1);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { from: fmt(prevFrom), to: fmt(prevTo) };
}

function num(v) {
  return Number(v) || 0;
}

function formatGa4DbError(message) {
  const m = String(message || '');
  if (/statement timeout|timeout/i.test(m)) {
    return 'Database query timed out. Try a shorter date range, one GA4 property, or Basic mode. If it keeps happening, your admin may need a higher statement timeout or indexes on ga4_raw / ga4_daily_summary (e.g. customer_id + report_date).';
  }
  return m;
}

/** Previous / next calendar month as `YYYY-MM`. */
export function addCalendarMonthsYYYYMM(ym, delta) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || '').trim());
  if (!m) return null;
  let y = parseInt(m[1], 10);
  let mo = parseInt(m[2], 10) - 1 + delta;
  y += Math.floor(mo / 12);
  mo = ((mo % 12) + 12) % 12;
  return `${y}-${String(mo + 1).padStart(2, '0')}`;
}

function formatMonthLabelEn(ym) {
  if (!ym || !/^(\d{4})-(\d{2})$/.test(String(ym))) return '';
  const [yy, mm] = ym.split('-');
  const d = new Date(Date.UTC(parseInt(yy, 10), parseInt(mm, 10) - 1, 1));
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

/**
 * Month-over-month comparison for one numeric field.
 * @returns {{ prev: number | null, pct: number | null, good: boolean | null }}
 */
function compareMoMField(cur, prevVal, lowerIsBetter) {
  const c = num(cur);
  const p = prevVal == null || prevVal === '' ? null : num(prevVal);
  if (p === null) return { prev: null, pct: null, good: null };
  let pct;
  if (p === 0) pct = c === 0 ? 0 : 100;
  else pct = ((c - p) / Math.abs(p)) * 100;
  let good = null;
  if (Math.abs(pct) < 1e-6) good = null;
  else if (lowerIsBetter) good = pct <= 0;
  else good = pct >= 0;
  return { prev: p, pct, good };
}

function enrichAdvancedRows(current, prior, keyFn, fieldSpecs) {
  const pmap = new Map();
  for (const r of prior || []) {
    pmap.set(keyFn(r), r);
  }
  return (current || []).map((r) => {
    const pr = pmap.get(keyFn(r));
    const _cmp = {};
    for (const spec of fieldSpecs) {
      const field = typeof spec === 'string' ? spec : spec.field;
      const lowerIsBetter = typeof spec === 'string' ? false : !!spec.lowerIsBetter;
      const prevVal = pr != null ? pr[field] : null;
      _cmp[field] = compareMoMField(r[field], prevVal, lowerIsBetter);
    }
    return { ...r, _cmp };
  });
}

function buildPagetypesDrilldownParents(rows) {
  return (rows || []).map((r) => {
    const pages = Array.isArray(r.pages) ? r.pages : [];
    const tv = num(r.total_views);
    const page_views = tv > 0 ? tv : pages.reduce((s, p) => s + num(p.page_views), 0);
    const total_users = pages.reduce((s, p) => s + num(p.total_users), 0);
    const sessions = pages.reduce((s, p) => s + num(p.sessions), 0);
    return { page_type: r.page_type, page_views, total_users, sessions, pages };
  });
}

function enrichPagetypesDrilldownParentsWithCompare(curRows, priRows) {
  const curParents = buildPagetypesDrilldownParents(curRows);
  const priParents = buildPagetypesDrilldownParents(priRows);
  const priByType = new Map(priParents.map((p) => [String(p.page_type || ''), p]));
  const fields = [{ field: 'page_views', lowerIsBetter: false }];
  return curParents.map((p) => {
    const pp = priByType.get(String(p.page_type || ''));
    const _cmp = {};
    for (const { field, lowerIsBetter } of fields) {
      _cmp[field] = compareMoMField(p[field], pp != null ? pp[field] : null, lowerIsBetter);
    }
    const pages = (p.pages || []).map((pg) => {
      const pPages = pp?.pages || [];
      const ppg = pPages.find((x) => String(x.page_path || '') === String(pg.page_path || ''));
      const cmp = {};
      for (const { field, lowerIsBetter } of fields) {
        cmp[field] = compareMoMField(pg[field], ppg != null ? ppg[field] : null, lowerIsBetter);
      }
      return { ...pg, _cmp: cmp };
    });
    return { ...p, pages, _cmp };
  });
}

function mergePagetypesDrilldownPayloads(rowArrays) {
  const byType = new Map();
  for (const rows of rowArrays) {
    for (const r of rows || []) {
      const pt = String(r.page_type ?? '');
      if (!byType.has(pt)) {
        byType.set(pt, { page_type: r.page_type, pages: new Map() });
      }
      const bucket = byType.get(pt);
      const pages = Array.isArray(r.pages) ? r.pages : [];
      for (const p of pages) {
        const path = String(p.page_path || '');
        const key = path || `title:${String(p.page_title || '')}`;
        if (!bucket.pages.has(key)) {
          bucket.pages.set(key, {
            page_path: p.page_path,
            page_title: p.page_title,
            page_views: 0,
            total_users: 0,
            sessions: 0,
          });
        }
        const acc = bucket.pages.get(key);
        acc.page_views = num(acc.page_views) + num(p.page_views);
        acc.total_users = num(acc.total_users) + num(p.total_users);
        acc.sessions = num(acc.sessions) + num(p.sessions);
      }
    }
  }
  return [...byType.values()].map((bucket) => {
    const pages = [...bucket.pages.values()].sort((a, b) => num(b.page_views) - num(a.page_views));
    const page_views = pages.reduce((s, p) => s + num(p.page_views), 0);
    const total_users = pages.reduce((s, p) => s + num(p.total_users), 0);
    const sessions = pages.reduce((s, p) => s + num(p.sessions), 0);
    return {
      page_type: bucket.page_type,
      page_views,
      total_users,
      sessions,
      pages,
    };
  });
}

function countDaysInclusiveUTC(fromStr, toStr) {
  if (!fromStr || !toStr) return 1;
  const a = new Date(`${fromStr}T12:00:00Z`);
  const b = new Date(`${toStr}T12:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 1;
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

/** Aggregates for Wheeler Advanced KPI strip (from `ga4_advanced_report` JSON only). */
function advancedWheelerKpisFromReports(wheelerReports, daysInMonth) {
  const pt = Array.isArray(wheelerReports?.pagetypes) ? wheelerReports.pagetypes : [];
  const sumPv = (rows) => rows.reduce((acc, r) => acc + num(r.page_views), 0);
  const byType = (t) => sumPv(pt.filter((r) => String(r.page_type || '') === t));
  const totalPageTypeViews = sumPv(pt);
  const vdpNew = byType('VDP_New');
  const vdpUsed = byType('VDP_Used');
  const vdpListingViews = vdpNew + vdpUsed;
  const srp = byType('SRP');
  const home = byType('Home');
  const contact = byType('Contact');
  const blog = byType('Blog');

  const vdpMake = Array.isArray(wheelerReports?.vdp_make) ? wheelerReports.vdp_make : [];
  const vdpModel = Array.isArray(wheelerReports?.vdp_model) ? wheelerReports.vdp_model : [];
  const vdpChannel = Array.isArray(wheelerReports?.vdp_channel) ? wheelerReports.vdp_channel : [];
  const vdpGoogle = Array.isArray(wheelerReports?.vdp_campaign_google) ? wheelerReports.vdp_campaign_google : [];
  const vdpRv = Array.isArray(wheelerReports?.vdp_rvtype) ? wheelerReports.vdp_rvtype : [];

  const sortedMakes = [...vdpMake].sort((a, b) => num(b.page_views) - num(a.page_views));
  const sortedModels = [...vdpModel].sort((a, b) => num(b.page_views) - num(a.page_views));
  const sortedChannels = [...vdpChannel].sort((a, b) => num(b.page_views) - num(a.page_views));
  const sortedGoogle = [...vdpGoogle].sort((a, b) => num(b.page_views) - num(a.page_views));
  const sortedRv = [...vdpRv].sort((a, b) => num(b.page_views) - num(a.page_views));
  const topMake = sortedMakes[0];
  const topModel = sortedModels[0];
  const topChannel = sortedChannels[0];
  const topGoogle = sortedGoogle[0];
  const topRv = sortedRv[0];

  const dim = Math.max(1, num(daysInMonth));
  const avgDailyVdpListings = dim ? vdpListingViews / dim : 0;

  return {
    totalPageTypeViews,
    vdpNew,
    vdpUsed,
    vdpListingViews,
    srp,
    home,
    contact,
    blog,
    topMakeName: topMake?.item_make != null ? String(topMake.item_make) : '',
    topMakeViews: num(topMake?.page_views),
    topModelMake: topModel?.item_make != null ? String(topModel.item_make) : '',
    topModelName: topModel?.item_model != null ? String(topModel.item_model) : '',
    topModelViews: num(topModel?.page_views),
    topChannelName: topChannel?.channel_group != null ? String(topChannel.channel_group) : '',
    topChannelViews: num(topChannel?.page_views),
    topGoogleCampaignName: topGoogle?.campaign_name != null ? String(topGoogle.campaign_name) : '',
    topGoogleCampaignViews: num(topGoogle?.page_views),
    topRvTypeName: topRv?.rv_type != null ? String(topRv.rv_type) : '',
    topRvTypeViews: num(topRv?.page_views),
    avgDailyVdpListings,
  };
}

/** KPIs from ga4_daily_summary (session-level; screen_page_views = deduplicated views). */
function computeKpisFromSummaryRows(rows) {
  let total_users = 0;
  let new_users = 0;
  let active_users = 0;
  let sessions = 0;
  let screen_page_views = 0;
  let engaged_sessions = 0;
  let event_count = 0;
  let key_events = 0;
  let user_engagement_duration = 0;
  let bounce_weighted_sum = 0;
  let duration_weighted_sum = 0;
  let engagement_rate_weighted_sum = 0;
  rows.forEach((r) => {
    const sess = num(r.sessions);
    total_users += num(r.total_users);
    new_users += num(r.new_users);
    active_users += num(r.active_users);
    sessions += sess;
    screen_page_views += num(r.screen_page_views);
    engaged_sessions += num(r.engaged_sessions);
    event_count += num(r.event_count);
    key_events += num(r.key_events);
    user_engagement_duration += num(r.user_engagement_duration);
    bounce_weighted_sum += num(r.bounce_rate) * sess;
    duration_weighted_sum += num(r.avg_session_duration) * sess;
    engagement_rate_weighted_sum += num(r.engagement_rate) * sess;
  });
  const bounce_rate = sessions ? bounce_weighted_sum / sessions : 0;
  const avg_session_duration = sessions ? duration_weighted_sum / sessions : 0;
  const engagement_rate = sessions ? engagement_rate_weighted_sum / sessions : 0;
  const views_per_session = sessions ? screen_page_views / sessions : 0;
  const sessions_per_user = total_users ? sessions / total_users : 0;
  return {
    total_users,
    new_users,
    active_users,
    sessions,
    screen_page_views,
    engaged_sessions,
    bounce_rate,
    engagement_rate,
    avg_session_duration,
    event_count,
    key_events,
    views_per_session,
    sessions_per_user,
    user_engagement_duration,
    page_views: screen_page_views,
    pages_per_session: views_per_session,
    unique_pages: 0,
  };
}

/** Match DB customer_id (sync stores numeric property id; Admin may paste properties/123). */
function normalizeGa4CustomerId(id) {
  if (id == null || id === '') return '';
  let s = String(id).trim();
  const lower = s.toLowerCase();
  if (lower.startsWith('properties/')) s = s.slice(11);
  return s.trim();
}

/** Advanced UI tab ids (error map keys; all load in one `ga4_advanced_report` call). */
export const GA4_MONTHLY_REPORT_TAB_TYPES = [
  'pagetypes_drilldown',
  'vdp_daily',
  'vdp_channel',
  'vdp_campaign_google',
  'vdp_condition',
  'vdp_make',
  'vdp_model',
  'vdp_rvtype',
];

function jsonbArrayField(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** GA4 summary via Postgres RPC (all agencies / modes). */
async function fetchGa4SummaryRpc(client, { customerIds, dateFrom, dateTo }) {
  const { data, error } = await client.rpc('ga4_summary_report', {
    p_customer_ids: customerIds,
    p_date_from: dateFrom,
    p_date_to: dateTo,
  });
  if (error) return { payload: null, error };
  let payload = data;
  if (payload == null) return { payload: null, error: null };
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return { payload: null, error: { message: 'Invalid JSON from ga4_summary_report' } };
    }
  }
  return { payload, error: null };
}

function normalizeGa4EventsRpcPayload(raw) {
  if (raw == null) return { events_summary: [], events_by_channel: [] };
  let p = raw;
  if (typeof p === 'string') {
    try {
      p = JSON.parse(p);
    } catch {
      return { events_summary: [], events_by_channel: [] };
    }
  }
  if (!p || typeof p !== 'object') return { events_summary: [], events_by_channel: [] };
  return {
    events_summary: Array.isArray(p.events_summary) ? p.events_summary : [],
    events_by_channel: Array.isArray(p.events_by_channel) ? p.events_by_channel : [],
  };
}

/** GA4 custom events + reporting flags via Postgres RPC. */
async function fetchGa4EventsRpc(client, { customerIds, dateFrom, dateTo }) {
  const { data, error } = await client.rpc('ga4_events_report', {
    p_customer_ids: customerIds,
    p_date_from: dateFrom,
    p_date_to: dateTo,
    p_reporting_only: false,
  });
  if (error) return { payload: null, error };
  return { payload: normalizeGa4EventsRpcPayload(data), error: null };
}

/** Wheeler Advanced — one JSON payload per property for the given date range. */
async function fetchGa4AdvancedReport(client, { customerId, dateFrom, dateTo }) {
  const { data, error } = await client.rpc('ga4_advanced_report', {
    p_customer_id: customerId,
    p_date_from: dateFrom,
    p_date_to: dateTo,
  });
  if (error) return { payload: null, error };
  let payload = data;
  if (payload == null) return { payload: null, error: null };
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return { payload: null, error: { message: 'Invalid JSON from ga4_advanced_report' } };
    }
  }
  return { payload, error: null };
}

function mergeWeight(r) {
  const s = num(r.sessions);
  return s > 0 ? s : num(r.page_views);
}

function mergeAdvancedReportRows(existing, incoming) {
  const sA = mergeWeight(existing);
  const sB = mergeWeight(incoming);
  const w = sA + sB;
  const out = { ...existing };
  out.page_views = num(existing.page_views) + num(incoming.page_views);
  out.total_users = num(existing.total_users) + num(incoming.total_users);
  out.sessions = num(existing.sessions) + num(incoming.sessions);
  out.engaged_sessions = num(existing.engaged_sessions) + num(incoming.engaged_sessions);
  out.event_count = num(existing.event_count) + num(incoming.event_count);
  out.key_events = num(existing.key_events) + num(incoming.key_events);
  if ('unique_vdps' in existing || 'unique_vdps' in incoming) {
    out.unique_vdps = num(existing.unique_vdps) + num(incoming.unique_vdps);
  }
  if ('new_vdps' in existing || 'new_vdps' in incoming) {
    out.new_vdps = num(existing.new_vdps) + num(incoming.new_vdps);
  }
  if ('used_vdps' in existing || 'used_vdps' in incoming) {
    out.used_vdps = num(existing.used_vdps) + num(incoming.used_vdps);
  }
  if (w > 0) {
    out.bounce_rate = (num(existing.bounce_rate) * sA + num(incoming.bounce_rate) * sB) / w;
    out.avg_session_duration =
      (num(existing.avg_session_duration) * sA + num(incoming.avg_session_duration) * sB) / w;
    out.engagement_rate =
      (num(existing.engagement_rate) * sA + num(incoming.engagement_rate) * sB) / w;
  }
  const uv = num(out.unique_vdps);
  if ('avg_views' in existing || 'avg_views' in incoming) {
    out.avg_views = uv ? num(out.page_views) / uv : 0;
  }
  return out;
}

function mergeAdvancedTable(rowArrays, keyFn) {
  const map = new Map();
  for (const rows of rowArrays) {
    for (const r of rows || []) {
      const k = keyFn(r);
      if (k === '' || k == null) continue;
      if (!map.has(k)) map.set(k, { ...r });
      else map.set(k, mergeAdvancedReportRows(map.get(k), r));
    }
  }
  return [...map.values()];
}

/** Merge multiple `ga4_advanced_report` payloads (one per property) into one. */
function mergeGa4AdvancedPayloads(payloads) {
  const pls = (payloads || []).filter((p) => p && typeof p === 'object');
  if (!pls.length) return {};
  if (pls.length === 1) return { ...pls[0] };
  const pick = (k) => pls.map((p) => jsonbArrayField(p[k]));
  return {
    pagetypes: mergeAdvancedTable(pick('pagetypes'), (r) => String(r.page_type || '')),
    pagetypes_drilldown: mergePagetypesDrilldownPayloads(pick('pagetypes_drilldown')),
    vdp_daily: (() => {
      const merged = mergeAdvancedTable(pick('vdp_daily'), (r) => String(r.report_date || ''));
      return merged.map((r) => ({
        ...r,
        avg_views: num(r.unique_vdps) ? num(r.page_views) / num(r.unique_vdps) : 0,
      }));
    })(),
    vdp_channel: mergeAdvancedTable(pick('vdp_channel'), (r) => String(r.channel_group || '')),
    vdp_campaign_google: mergeAdvancedTable(
      pick('vdp_campaign_google'),
      (r) =>
        [r.campaign_name, r.channel_group, r.source_medium].map((x) => String(x ?? '')).join('\x00'),
    ),
    vdp_condition: mergeAdvancedTable(pick('vdp_condition'), (r) => String(r.item_condition || '')),
    vdp_make: mergeAdvancedTable(pick('vdp_make'), (r) => String(r.item_make || '')),
    vdp_model: mergeAdvancedTable(
      pick('vdp_model'),
      (r) => `${String(r.item_make || '')}\x00${String(r.item_model || '')}`,
    ),
    vdp_rvtype: mergeAdvancedTable(pick('vdp_rvtype'), (r) => String(r.rv_type || '')),
  };
}

async function fetchGa4AdvancedReportMerged(client, { customerIds, dateFrom, dateTo }) {
  if (!customerIds?.length) return { payload: null, error: { message: 'No GA4 properties selected' } };
  if (!dateFrom || !dateTo) return { payload: null, error: { message: 'Missing date range for ga4_advanced_report' } };
  if (customerIds.length === 1) {
    return fetchGa4AdvancedReport(client, { customerId: customerIds[0], dateFrom, dateTo });
  }
  const results = await Promise.all(
    customerIds.map((customerId) => fetchGa4AdvancedReport(client, { customerId, dateFrom, dateTo })),
  );
  const okPayloads = [];
  let firstErr = null;
  results.forEach((r) => {
    if (r.error && !firstErr) firstErr = r.error;
    if (!r.error && r.payload && typeof r.payload === 'object') okPayloads.push(r.payload);
  });
  if (okPayloads.length === 0) {
    return { payload: null, error: firstErr || { message: 'ga4_advanced_report failed for all properties' } };
  }
  const merged = mergeGa4AdvancedPayloads(okPayloads);
  return { payload: merged, error: null };
}

/** Normalize `ga4_advanced_report` JSON to the `wheelerReports` shape (one array per tab id). */
function normalizeWheelerAdvancedRpcPayload(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  GA4_MONTHLY_REPORT_TAB_TYPES.forEach((t) => {
    out[t] = jsonbArrayField(src[t]);
  });
  out.pagetypes = jsonbArrayField(src.pagetypes);
  return out;
}

/** Map RPC `kpis` object to the same shape as {@link computeKpisFromSummaryRows}. */
function kpiObjectFromRpcKpis(k) {
  if (!k || typeof k !== 'object') return computeKpisFromSummaryRows([]);
  const total_users = num(k.total_users);
  const new_users = num(k.new_users);
  const active_users = num(k.active_users);
  const sessions = num(k.sessions);
  const screen_page_views = num(k.screen_page_views);
  const engaged_sessions = num(k.engaged_sessions);
  const bounce_rate = num(k.bounce_rate);
  const engagement_rate = num(k.engagement_rate);
  const avg_session_duration = num(k.avg_session_duration);
  const event_count = num(k.event_count);
  const key_events = num(k.key_events);
  const views_per_session = sessions ? screen_page_views / sessions : 0;
  const sessions_per_user = total_users ? sessions / total_users : 0;
  return {
    total_users,
    new_users,
    active_users,
    sessions,
    screen_page_views,
    engaged_sessions,
    bounce_rate,
    engagement_rate,
    avg_session_duration,
    event_count,
    key_events,
    views_per_session,
    sessions_per_user,
    user_engagement_duration: num(k.user_engagement_duration),
    page_views: screen_page_views,
    pages_per_session: views_per_session,
    unique_pages: 0,
  };
}

function mapRpcDailyTrendRow(r) {
  const sessions = num(r.sessions);
  return {
    report_date: r.report_date,
    page_views: num(r.screen_page_views ?? r.page_views),
    total_users: num(r.total_users),
    active_users: num(r.active_users),
    new_users: num(r.new_users),
    sessions,
    engaged_sessions: num(r.engaged_sessions),
    event_count: num(r.event_count),
    key_events: num(r.key_events),
    bounce_rate: num(r.bounce_rate),
    avg_session_duration: num(r.avg_session_duration),
    engagement_rate: num(r.engagement_rate),
  };
}

function mapRpcDailyTrend(rows) {
  return (Array.isArray(rows) ? rows : []).map(mapRpcDailyTrendRow).sort((a, b) => String(a.report_date).localeCompare(String(b.report_date)));
}

function mapRpcChannels(rows) {
  const list = (Array.isArray(rows) ? rows : []).map((r) => {
    const sess = num(r.sessions);
    return {
      channel_group: r.channel_group != null && r.channel_group !== '' ? String(r.channel_group) : 'Unknown',
      page_views: num(r.screen_page_views ?? r.page_views),
      total_users: num(r.total_users),
      sessions: sess,
      engaged_sessions: num(r.engaged_sessions),
      bounce_rate: num(r.bounce_rate),
      avg_session_duration: num(r.avg_session_duration),
      engagement_rate: num(r.engagement_rate),
      event_count: num(r.event_count),
      key_events: num(r.key_events),
    };
  });
  const totalSessions = list.reduce((s, r) => s + r.sessions, 0);
  return list
    .map((r) => ({ ...r, pct_sessions: totalSessions ? (r.sessions / totalSessions) * 100 : 0 }))
    .sort((a, b) => b.sessions - a.sessions);
}

function mapRpcSourceMedium(rows) {
  const list = (Array.isArray(rows) ? rows : []).map((r) => {
    const sm = r.source_medium || `${r.source || ''} / ${r.medium || ''}`;
    const sess = num(r.sessions);
    return {
      source_medium: sm,
      source: r.source || '',
      medium: r.medium || '',
      page_views: num(r.screen_page_views ?? r.page_views),
      total_users: num(r.total_users),
      sessions: sess,
      engaged_sessions: num(r.engaged_sessions),
      bounce_rate: num(r.bounce_rate),
      avg_session_duration: num(r.avg_session_duration),
      engagement_rate: num(r.engagement_rate),
      event_count: num(r.event_count),
      key_events: num(r.key_events),
    };
  });
  const totalSessions = list.reduce((s, r) => s + r.sessions, 0);
  return list
    .map((r) => ({ ...r, pct_sessions: totalSessions ? (r.sessions / totalSessions) * 100 : 0 }))
    .sort((a, b) => b.page_views - a.page_views);
}

function mapRpcDevices(rows) {
  const list = (Array.isArray(rows) ? rows : []).map((r) => {
    const sess = num(r.sessions);
    return {
      device_category: r.device_category != null && r.device_category !== '' ? String(r.device_category) : 'Unknown',
      page_views: num(r.screen_page_views ?? r.page_views),
      total_users: num(r.total_users),
      sessions: sess,
      engaged_sessions: num(r.engaged_sessions),
      bounce_rate: num(r.bounce_rate),
      avg_session_duration: num(r.avg_session_duration),
      engagement_rate: num(r.engagement_rate),
      event_count: num(r.event_count),
      key_events: num(r.key_events),
    };
  });
  const totalSessions = list.reduce((s, r) => s + r.sessions, 0);
  return list
    .map((r) => ({ ...r, pct_sessions: totalSessions ? (r.sessions / totalSessions) * 100 : 0 }))
    .sort((a, b) => b.page_views - a.page_views);
}

function mapRpcGeo(rows) {
  const list = (Array.isArray(rows) ? rows : []).map((r) => {
    const sess = num(r.sessions);
    const country = r.country != null ? String(r.country) : '';
    const reg = r.region != null ? String(r.region) : '';
    const city = r.city != null ? String(r.city) : '';
    const regionLabel = country && reg ? `${country} · ${reg}` : country || reg || 'Unknown';
    return {
      region: regionLabel,
      city: city || 'Unknown',
      page_views: num(r.screen_page_views ?? r.page_views),
      total_users: num(r.total_users),
      sessions: sess,
      engaged_sessions: num(r.engaged_sessions),
      bounce_rate: num(r.bounce_rate),
      avg_session_duration: num(r.avg_session_duration),
      engagement_rate: num(r.engagement_rate),
      event_count: num(r.event_count),
      key_events: num(r.key_events),
    };
  });
  const totalSessions = list.reduce((s, r) => s + r.sessions, 0);
  return list
    .map((r) => ({ ...r, pct_sessions: totalSessions ? (r.sessions / totalSessions) * 100 : 0 }))
    .sort((a, b) => b.page_views - a.page_views);
}

/** Flat RPC `campaigns` rows → channel → campaigns tree expected by GA4Page. */
function buildCampaignDataFromRpc(campaigns) {
  const raw = Array.isArray(campaigns) ? campaigns : [];
  if (!raw.length) return [];

  const normalized = raw.map((r) => {
    const sess = num(r.sessions);
    const cg =
      r.channel_group != null && String(r.channel_group).trim() !== '' ? String(r.channel_group).trim() : '';
    return {
      channel_group: cg,
      campaign_name:
        r.campaign_name != null && String(r.campaign_name).trim() !== ''
          ? String(r.campaign_name).trim()
          : '(not set)',
      page_views: num(r.screen_page_views ?? r.page_views),
      total_users: num(r.total_users),
      sessions: sess,
      engaged_sessions: num(r.engaged_sessions),
      bounce_rate: num(r.bounce_rate),
      avg_session_duration: num(r.avg_session_duration),
      engagement_rate: num(r.engagement_rate),
      event_count: num(r.event_count),
      key_events: num(r.key_events),
      _bounce_ws: num(r.bounce_rate) * sess,
      _dur_ws: num(r.avg_session_duration) * sess,
      _er_ws: num(r.engagement_rate) * sess,
    };
  });

  const hasChannel = normalized.some((c) => c.channel_group !== '');
  const groups = new Map();
  for (const c of normalized) {
    const key = hasChannel ? c.channel_group || 'Unknown' : '__flat__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  let totalSessionsAll = 0;
  normalized.forEach((c) => {
    totalSessionsAll += c.sessions;
  });

  const parents = [];
  for (const [gkey, camps] of groups) {
    const chSessions = camps.reduce((s, c) => s + c.sessions, 0);
    let pv = 0;
    let tu = 0;
    let es = 0;
    let ev = 0;
    let ke = 0;
    let bw = 0;
    let dw = 0;
    let ew = 0;
    camps.forEach((c) => {
      pv += c.page_views;
      tu += c.total_users;
      es += c.engaged_sessions;
      ev += c.event_count;
      ke += c.key_events;
      bw += c._bounce_ws;
      dw += c._dur_ws;
      ew += c._er_ws;
    });
    const channel_group = gkey === '__flat__' ? 'Campaigns' : gkey;
    parents.push({
      channel_group,
      page_views: pv,
      total_users: tu,
      sessions: chSessions,
      engaged_sessions: es,
      bounce_rate: chSessions ? bw / chSessions : 0,
      avg_session_duration: chSessions ? dw / chSessions : 0,
      engagement_rate: chSessions ? ew / chSessions : 0,
      event_count: ev,
      key_events: ke,
      pct_sessions: totalSessionsAll ? (chSessions / totalSessionsAll) * 100 : 0,
      campaigns: camps
        .map((c) => ({
          campaign_name: c.campaign_name,
          page_views: c.page_views,
          total_users: c.total_users,
          sessions: c.sessions,
          engaged_sessions: c.engaged_sessions,
          bounce_rate: c.bounce_rate,
          avg_session_duration: c.avg_session_duration,
          engagement_rate: c.engagement_rate,
          event_count: c.event_count,
          key_events: c.key_events,
          pct_sessions: chSessions ? (c.sessions / chSessions) * 100 : 0,
        }))
        .sort((a, b) => b.sessions - a.sessions),
    });
  }
  return parents.sort((a, b) => b.sessions - a.sessions);
}

async function loadGa4AccountOptions(supabaseClient, { scopeAgencyId, canViewAllCustomers, allowed }) {
  const useAgencyScoped = scopeAgencyId || !canViewAllCustomers;
  if (canViewAllCustomers && !useAgencyScoped) {
    const { data, error } = await supabaseClient
      .from('client_platform_accounts')
      .select('platform_customer_id, account_name')
      .eq('platform', 'ga4')
      .eq('is_active', true)
      .order('account_name');
    if (error) console.warn('[GA4] accounts:', error);
    const opts = [{ id: 'ALL', name: 'All Properties' }];
    (data || []).forEach((r) => opts.push({ id: String(r.platform_customer_id), name: r.account_name || r.platform_customer_id }));
    return opts;
  }
  if (canViewAllCustomers && scopeAgencyId) {
    const { data, error } = await supabaseClient
      .from('client_platform_accounts')
      .select('platform_customer_id, account_name')
      .eq('agency_id', scopeAgencyId)
      .eq('platform', 'ga4')
      .eq('is_active', true)
      .order('account_name');
    if (error) console.warn('[GA4] accounts (agency):', error);
    if (!(data || []).length) return [{ id: '__NONE__', name: 'No GA4 properties for this agency.' }];
    const opts = [{ id: 'ALL', name: 'All Properties' }];
    (data || []).forEach((r) => opts.push({ id: String(r.platform_customer_id), name: r.account_name || r.platform_customer_id }));
    return opts;
  }
  const ga4Acc = (allowed || []).filter((a) => a.platform === 'ga4');
  if (ga4Acc.length === 0) return [{ id: '__NONE__', name: 'No properties assigned. Contact admin.' }];
  if (ga4Acc.length === 1) {
    return [{ id: String(ga4Acc[0].platform_customer_id), name: ga4Acc[0].account_name || ga4Acc[0].client_name || ga4Acc[0].platform_customer_id }];
  }
  return [
    { id: 'ALL_MINE', name: 'All my properties' },
    ...ga4Acc.map((a) => ({
      id: String(a.platform_customer_id),
      name: `${a.client_name || ''}${a.account_name ? ` (${a.account_name})` : ''}`.trim() || a.platform_customer_id,
    })),
  ];
}

/** Ensure select value matches a real option (avoids blank native select when value not in options). */
function reconcilePropertyId(accountOptions, currentId) {
  const opts = (accountOptions || []).filter((a) => a && a.id !== '__NONE__');
  if (opts.length === 0) {
    const none = (accountOptions || []).find((a) => a && a.id === '__NONE__');
    if (none) return '__NONE__';
    return '';
  }
  const ids = opts.map((o) => String(o.id));
  const cur = String(currentId ?? '');
  if (ids.includes(cur)) return cur;
  if (ids.includes('ALL')) return 'ALL';
  if (ids.includes('ALL_MINE')) return 'ALL_MINE';
  return String(opts[0].id);
}

function resolveGa4CustomerIds(customerId, accountOptions, allowed) {
  if (customerId === '__NONE__') return [];
  const hasAll = accountOptions.some((a) => a.id === 'ALL');
  if (customerId === 'ALL' && hasAll) {
    return accountOptions.filter((a) => a.id !== 'ALL').map((a) => a.id);
  }
  if (customerId === 'ALL_MINE' || (customerId === 'ALL' && !hasAll)) {
    const ids = (allowed || []).filter((a) => a.platform === 'ga4').map((a) => String(a.platform_customer_id));
    return ids.length ? ids : [NO_MATCH];
  }
  if (customerId && customerId !== 'ALL' && customerId !== 'ALL_MINE') return [String(customerId)];
  const ids = (allowed || []).filter((a) => a.platform === 'ga4').map((a) => String(a.platform_customer_id));
  return ids.length ? ids : [NO_MATCH];
}

/**
 * When admins view an agency, GA4 account lists come from `client_platform_accounts` by agency_id —
 * not from `allowedClientAccounts`, which hydrates a moment later. Depending on the full allowed array
 * caused a duplicate full fetch (slow + brief empty UI). Key by agency for view-all; by assignments otherwise.
 */
function ga4AllowedFetchKey(canViewAllCustomers, scopeAgencyId, allowedClientAccounts) {
  if (canViewAllCustomers && scopeAgencyId) return `agency:${scopeAgencyId}`;
  if (canViewAllCustomers && !scopeAgencyId) return 'all-properties';
  if (!allowedClientAccounts?.length) return '';
  return [...allowedClientAccounts]
    .map((a) => `${a.platform}::${a.platform_customer_id}`)
    .sort()
    .join('|');
}

/**
 * @param {{ enableWheelerRaw?: boolean }} [options]
 * - **Basic (Wheeler):** `enableWheelerRaw: false` — `ga4_summary_report` RPC for the date range.
 * - **Advanced (Wheeler):** `enableWheelerRaw: true` — same summary RPC for the date range + one `ga4_advanced_report` call (same dates); optional second call for the comparison range when Compare is on.
 */
export function useGA4Data(options = {}) {
  const { enableWheelerRaw = true } = options;
  const { activeAgencyId, allowedClientAccounts, canViewAllCustomers, agencyId, userProfile, userRole } = useAuth();
  const isSuperAdmin = !!(userProfile?.is_super_admin || userRole?.toLowerCase() === 'super_admin');
  const scopeAgencyId = useMemo(
    () => getEffectiveAgencyScopeId(isSuperAdmin, activeAgencyId, agencyId),
    [isSuperAdmin, activeAgencyId, agencyId],
  );

  const allowedRef = useRef(allowedClientAccounts);
  allowedRef.current = allowedClientAccounts;
  const filtersRef = useRef({});
  /** Incremented on each fetch; stale async work must not overwrite state or clear loading. */
  const fetchGenerationRef = useRef(0);
  const wheelerRpcGenRef = useRef(0);
  const reportRpcParamsRef = useRef(null);
  const wheelerReportsRef = useRef({});

  const [filters, setFilters] = useState({
    datePreset: 'this_month',
    dateFrom: '',
    dateTo: '',
    compareOn: false,
    compareFrom: '',
    compareTo: '',
    customerId: 'ALL',
  });

  const [summaryRows, setSummaryRows] = useState([]);
  const [summaryCompareRows, setSummaryCompareRows] = useState([]);
  /** Set when basic (non–Wheeler-Advanced) summary is loaded via `ga4_summary_report` RPC. */
  const [basicRpcCurrent, setBasicRpcCurrent] = useState(null);
  const [basicRpcCompare, setBasicRpcCompare] = useState(null);
  const [ga4Accounts, setGa4Accounts] = useState([]);
  /** Wheeler Advanced: tab datasets from `ga4_advanced_report` RPC (one object, all keys). */
  const [wheelerReports, setWheelerReports] = useState({});
  /** Comparison-period payload (same shape as `wheelerReports`) when Basic “Compare” is on. */
  const [wheelerReportsCompare, setWheelerReportsCompare] = useState({});
  /** False when compare-period `ga4_advanced_report` was skipped, failed, or returned no payload. */
  const [advancedCompareReportOk, setAdvancedCompareReportOk] = useState(false);
  const [wheelerReportLoading, setWheelerReportLoading] = useState({});
  const [wheelerReportError, setWheelerReportError] = useState({});
  /** Bumps after Advanced monthly data load so GA4Page can re-run tab effects. */
  const [wheelerReportVersion, setWheelerReportVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingPhase, setLoadingPhase] = useState('');
  const [error, setError] = useState(null);

  const [eventsData, setEventsData] = useState({ events_summary: [], events_by_channel: [] });
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState(null);
  const eventsFetchParamsRef = useRef(null);

  wheelerReportsRef.current = wheelerReports;

  filtersRef.current = filters;

  const isWheeler = activeAgencyId === WHEELER_AGENCY_ID || agencyId === WHEELER_AGENCY_ID;

  const allowedFetchKey = useMemo(
    () => ga4AllowedFetchKey(canViewAllCustomers, scopeAgencyId, allowedClientAccounts),
    [canViewAllCustomers, scopeAgencyId, allowedClientAccounts],
  );

  const updateFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const batchUpdateFilters = useCallback((updates) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetEventsState = useCallback(() => {
    eventsFetchParamsRef.current = null;
    setEventsData({ events_summary: [], events_by_channel: [] });
    setEventsError(null);
    setEventsLoading(false);
  }, []);

  const fetchEventsData = useCallback(async ({ generation } = {}) => {
    const gen = generation ?? fetchGenerationRef.current;
    const p = eventsFetchParamsRef.current;
    if (!p?.customerIds?.length) {
      if (gen === fetchGenerationRef.current) {
        setEventsData({ events_summary: [], events_by_channel: [] });
        setEventsError(null);
        setEventsLoading(false);
      }
      return;
    }
    setEventsLoading(true);
    setEventsError(null);
    const res = await fetchGa4EventsRpc(supabase, {
      customerIds: p.customerIds,
      dateFrom: p.dateFrom,
      dateTo: p.dateTo,
    });
    if (gen !== fetchGenerationRef.current) return;
    if (res.error) {
      setEventsError(formatGa4DbError(res.error.message) || res.error.message);
      setEventsData({ events_summary: [], events_by_channel: [] });
    } else {
      setEventsData(res.payload || { events_summary: [], events_by_channel: [] });
      setEventsError(null);
    }
    setEventsLoading(false);
  }, []);

  const toggleReportingEvent = useCallback(
    async (customerId, eventName, isReporting) => {
      const p = eventsFetchParamsRef.current;
      if (!p?.customerIds?.length || !scopeAgencyId || !eventName) return;
      const ids =
        customerId === 'ALL' || customerId === 'ALL_MINE' ? [...p.customerIds] : [String(customerId)];
      try {
        for (const cid of ids) {
          if (isReporting) {
            const { error: upErr } = await supabase.from('ga4_reporting_events').upsert(
              {
                customer_id: cid,
                agency_id: scopeAgencyId,
                event_name: eventName,
                is_active: true,
              },
              { onConflict: 'customer_id,event_name' },
            );
            if (upErr) throw upErr;
          } else {
            const { error: updErr } = await supabase
              .from('ga4_reporting_events')
              .update({ is_active: false })
              .eq('customer_id', cid)
              .eq('event_name', eventName);
            if (updErr) throw updErr;
          }
        }
      } catch (e) {
        console.error('[GA4] toggleReportingEvent', e);
        setEventsError(e?.message || 'Failed to update reporting event');
        return;
      }
      await fetchEventsData({ generation: fetchGenerationRef.current });
    },
    [scopeAgencyId, fetchEventsData],
  );

  const fetchData = useCallback(async () => {
    const gen = ++fetchGenerationRef.current;
    const f = filtersRef.current;
    setLoading(true);
    setError(null);
    setLoadingPhase('Loading accounts…');
    setBasicRpcCurrent(null);
    setBasicRpcCompare(null);

    const isStale = () => gen !== fetchGenerationRef.current;

    try {
      const accountOptions = await loadGa4AccountOptions(supabase, {
        scopeAgencyId,
        canViewAllCustomers,
        allowed: allowedRef.current,
      });
      if (isStale()) return;
      setGa4Accounts(accountOptions);

      let effectiveCustomerId = reconcilePropertyId(accountOptions, f.customerId);
      if (effectiveCustomerId !== f.customerId) {
        setFilters((prev) => ({ ...prev, customerId: effectiveCustomerId }));
      }
      const ga4Acc = (allowedRef.current || []).filter((a) => a.platform === 'ga4');
      const hasAllPropertiesOption = accountOptions.some((a) => a.id === 'ALL');
      /** Keep true "All Properties" when the dropdown includes it; only fall back for multi-property users without that option. */
      if (!hasAllPropertiesOption && ga4Acc.length > 1 && effectiveCustomerId === 'ALL') {
        effectiveCustomerId = 'ALL_MINE';
        setFilters((prev) => ({ ...prev, customerId: 'ALL_MINE' }));
      }

      let customerIds = resolveGa4CustomerIds(effectiveCustomerId, accountOptions, allowedRef.current);
      customerIds = [...new Set(customerIds.map(normalizeGa4CustomerId).filter(Boolean))];

      if (!customerIds.length || customerIds[0] === NO_MATCH) {
        if (isStale()) return;
        setSummaryRows([]);
        setSummaryCompareRows([]);
        setBasicRpcCurrent(null);
        setBasicRpcCompare(null);
        reportRpcParamsRef.current = null;
        wheelerRpcGenRef.current += 1;
        setWheelerReports({});
        setWheelerReportsCompare({});
        setAdvancedCompareReportOk(false);
        setWheelerReportLoading({});
        setWheelerReportError({});
        resetEventsState();
        return;
      }

      const wheelerAdvanced = isWheeler && enableWheelerRaw;
      const dr = computeDateRange(f.datePreset, f.dateFrom, f.dateTo);
      const from = dr.from;
      const to = dr.to;
      if (!from || !to) {
        if (isStale()) return;
        setSummaryRows([]);
        setSummaryCompareRows([]);
        setBasicRpcCurrent(null);
        setBasicRpcCompare(null);
        reportRpcParamsRef.current = null;
        wheelerRpcGenRef.current += 1;
        setWheelerReports({});
        setWheelerReportsCompare({});
        setAdvancedCompareReportOk(false);
        setWheelerReportLoading({});
        setWheelerReportError({});
        resetEventsState();
        return;
      }

      let compFrom = null;
      let compTo = null;
      if (f.compareOn) {
        if (f.compareFrom && f.compareTo) {
          compFrom = f.compareFrom;
          compTo = f.compareTo;
        } else {
          const prev = computePreviousPeriod(from, to);
          compFrom = prev.from;
          compTo = prev.to;
        }
      }

      let rpcCurrentPayload = null;
      let rpcComparePayload = null;

      if (wheelerAdvanced) {
        if (f.compareOn && compFrom && compTo) {
          setLoadingPhase('Loading GA4 summaries…');
          const [cur, prev] = await Promise.all([
            fetchGa4SummaryRpc(supabase, {
              customerIds,
              dateFrom: from,
              dateTo: to,
            }),
            fetchGa4SummaryRpc(supabase, {
              customerIds,
              dateFrom: compFrom,
              dateTo: compTo,
            }),
          ]);
          if (isStale()) return;
          if (cur.error) {
            setError(
              formatGa4DbError(cur.error.message) ||
                'Could not load ga4_summary_report. Check RLS and function access.',
            );
            setSummaryRows([]);
            setSummaryCompareRows([]);
            setBasicRpcCurrent(null);
            setBasicRpcCompare(null);
            reportRpcParamsRef.current = null;
            wheelerRpcGenRef.current += 1;
            setWheelerReports({});
            setWheelerReportsCompare({});
            setAdvancedCompareReportOk(false);
            setWheelerReportLoading({});
            setWheelerReportError({});
            resetEventsState();
            return;
          }
          rpcCurrentPayload = cur.payload;
          if (prev.error) {
            console.warn('[GA4] summary compare period (RPC):', prev.error.message);
            rpcComparePayload = null;
          } else {
            rpcComparePayload = prev.payload;
          }
        } else {
          setLoadingPhase('Loading GA4 summary…');
          const cur = await fetchGa4SummaryRpc(supabase, {
            customerIds,
            dateFrom: from,
            dateTo: to,
          });
          if (isStale()) return;
          if (cur.error) {
            setError(
              formatGa4DbError(cur.error.message) ||
                'Could not load ga4_summary_report. Check RLS and function access.',
            );
            setSummaryRows([]);
            setSummaryCompareRows([]);
            setBasicRpcCurrent(null);
            setBasicRpcCompare(null);
            reportRpcParamsRef.current = null;
            wheelerRpcGenRef.current += 1;
            setWheelerReports({});
            setWheelerReportsCompare({});
            setAdvancedCompareReportOk(false);
            setWheelerReportLoading({});
            setWheelerReportError({});
            resetEventsState();
            return;
          }
          rpcCurrentPayload = cur.payload;
        }
        setSummaryRows([]);
        setSummaryCompareRows([]);
        if (isStale()) return;
        setBasicRpcCurrent(rpcCurrentPayload);
        setBasicRpcCompare(rpcComparePayload);

        eventsFetchParamsRef.current = { customerIds: [...customerIds], dateFrom: from, dateTo: to };
        void fetchEventsData({ generation: gen });

        wheelerRpcGenRef.current += 1;
        reportRpcParamsRef.current = {
          customerIds: [...customerIds],
          dateFrom: from,
          dateTo: to,
        };
        setLoadingPhase('Loading advanced GA4 reports…');
        const advComparePromise =
          f.compareOn && compFrom && compTo
            ? fetchGa4AdvancedReportMerged(supabase, {
                customerIds,
                dateFrom: compFrom,
                dateTo: compTo,
              })
            : Promise.resolve({ payload: null, error: null });
        const [advRes, advCompareRes] = await Promise.all([
          fetchGa4AdvancedReportMerged(supabase, { customerIds, dateFrom: from, dateTo: to }),
          advComparePromise,
        ]);
        if (isStale()) return;
        setWheelerReportLoading({});
        if (advRes.error) {
          const msg =
            formatGa4DbError(advRes.error.message) || 'Could not load ga4_advanced_report. Check RLS and function access.';
          const errObj = {};
          GA4_MONTHLY_REPORT_TAB_TYPES.forEach((t) => {
            errObj[t] = msg;
          });
          setWheelerReportError(errObj);
          setWheelerReports(normalizeWheelerAdvancedRpcPayload(null));
          setWheelerReportsCompare({});
          setAdvancedCompareReportOk(false);
        } else {
          setWheelerReportError({});
          setWheelerReports(normalizeWheelerAdvancedRpcPayload(advRes.payload));
          if (!f.compareOn || !compFrom || !compTo) {
            setWheelerReportsCompare(normalizeWheelerAdvancedRpcPayload(null));
            setAdvancedCompareReportOk(false);
          } else if (advCompareRes.error || !advCompareRes.payload) {
            if (advCompareRes.error) {
              console.warn('[GA4] compare period ga4_advanced_report:', advCompareRes.error.message);
            }
            setWheelerReportsCompare(normalizeWheelerAdvancedRpcPayload(null));
            setAdvancedCompareReportOk(false);
          } else {
            setWheelerReportsCompare(normalizeWheelerAdvancedRpcPayload(advCompareRes.payload));
            setAdvancedCompareReportOk(true);
          }
        }
        setWheelerReportVersion((v) => v + 1);
      } else {
        if (f.compareOn && compFrom && compTo) {
          setLoadingPhase('Loading GA4 summaries…');
          const [cur, prev] = await Promise.all([
            fetchGa4SummaryRpc(supabase, {
              customerIds,
              dateFrom: from,
              dateTo: to,
            }),
            fetchGa4SummaryRpc(supabase, {
              customerIds,
              dateFrom: compFrom,
              dateTo: compTo,
            }),
          ]);
          if (isStale()) return;
          if (cur.error) {
            setError(
              formatGa4DbError(cur.error.message) ||
                'Could not load ga4_summary_report. Check RLS and function access.',
            );
            setSummaryRows([]);
            setSummaryCompareRows([]);
            reportRpcParamsRef.current = null;
            wheelerRpcGenRef.current += 1;
            setWheelerReports({});
            setWheelerReportsCompare({});
            setAdvancedCompareReportOk(false);
            setWheelerReportLoading({});
            setWheelerReportError({});
            resetEventsState();
            return;
          }
          rpcCurrentPayload = cur.payload;
          if (prev.error) {
            console.warn('[GA4] summary compare period (RPC):', prev.error.message);
            rpcComparePayload = null;
          } else {
            rpcComparePayload = prev.payload;
          }
        } else {
          setLoadingPhase('Loading GA4 summary…');
          const cur = await fetchGa4SummaryRpc(supabase, {
            customerIds,
            dateFrom: from,
            dateTo: to,
          });
          if (isStale()) return;
          if (cur.error) {
            setError(
              formatGa4DbError(cur.error.message) ||
                'Could not load ga4_summary_report. Check RLS and function access.',
            );
            setSummaryRows([]);
            setSummaryCompareRows([]);
            reportRpcParamsRef.current = null;
            wheelerRpcGenRef.current += 1;
            setWheelerReports({});
            setWheelerReportsCompare({});
            setAdvancedCompareReportOk(false);
            setWheelerReportLoading({});
            setWheelerReportError({});
            resetEventsState();
            return;
          }
          rpcCurrentPayload = cur.payload;
        }
        setSummaryRows([]);
        setSummaryCompareRows([]);
        if (isStale()) return;
        setBasicRpcCurrent(rpcCurrentPayload);
        setBasicRpcCompare(rpcComparePayload);

        eventsFetchParamsRef.current = { customerIds: [...customerIds], dateFrom: from, dateTo: to };
        void fetchEventsData({ generation: gen });
      }

      if (!wheelerAdvanced) {
        wheelerRpcGenRef.current += 1;
        reportRpcParamsRef.current = null;
        setWheelerReports({});
        setWheelerReportsCompare({});
        setAdvancedCompareReportOk(false);
        setWheelerReportLoading({});
        setWheelerReportError({});
      }
    } catch (err) {
      if (!isStale()) {
        console.error('[GA4]', err);
        setError(formatGa4DbError(err?.message) || 'Failed to fetch GA4 data');
        setSummaryRows([]);
        setSummaryCompareRows([]);
        setBasicRpcCurrent(null);
        setBasicRpcCompare(null);
        reportRpcParamsRef.current = null;
        wheelerRpcGenRef.current += 1;
        setWheelerReports({});
        setWheelerReportsCompare({});
        setAdvancedCompareReportOk(false);
        setWheelerReportLoading({});
        setWheelerReportError({});
        resetEventsState();
      }
    } finally {
      if (gen === fetchGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [
    scopeAgencyId,
    canViewAllCustomers,
    isWheeler,
    agencyId,
    enableWheelerRaw,
    allowedFetchKey,
    resetEventsState,
    fetchEventsData,
  ]);

  /** No-op: advanced data loads in one `fetchData` call. GA4Page may still invoke on tab change. */
  const loadWheelerReport = useCallback(async () => {}, []);

  useEffect(() => {
    setGa4Accounts([]);
    setFilters((prev) => ({ ...prev, customerId: 'ALL' }));
  }, [canViewAllCustomers, scopeAgencyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /** Valid select value for Property dropdown (always matches an option when options exist). */
  const effectivePropertyId = useMemo(
    () => reconcilePropertyId(ga4Accounts, filters.customerId),
    [ga4Accounts, filters.customerId],
  );

  const kpis = useMemo(() => {
    if (basicRpcCurrent != null) {
      return kpiObjectFromRpcKpis(basicRpcCurrent.kpis);
    }
    return computeKpisFromSummaryRows(summaryRows);
  }, [basicRpcCurrent, summaryRows]);

  const compareKpis = useMemo(() => {
    if (!filters.compareOn) return null;
    if (basicRpcCompare != null) return kpiObjectFromRpcKpis(basicRpcCompare.kpis);
    return null;
  }, [filters.compareOn, basicRpcCompare]);

  const momChanges = useMemo(() => {
    if (!compareKpis || !kpis) return null;
    const mom = (cur, prev) => {
      if (prev === 0) return cur > 0 ? 100 : 0;
      return ((cur - prev) / Math.abs(prev)) * 100;
    };
    return {
      total_users: mom(kpis.total_users, compareKpis.total_users),
      new_users: mom(kpis.new_users, compareKpis.new_users),
      active_users: mom(kpis.active_users, compareKpis.active_users),
      sessions: mom(kpis.sessions, compareKpis.sessions),
      screen_page_views: mom(kpis.screen_page_views, compareKpis.screen_page_views),
      page_views: mom(kpis.screen_page_views, compareKpis.screen_page_views),
      engaged_sessions: mom(kpis.engaged_sessions, compareKpis.engaged_sessions),
      bounce_rate: mom(kpis.bounce_rate, compareKpis.bounce_rate),
      engagement_rate: mom(kpis.engagement_rate, compareKpis.engagement_rate),
      avg_session_duration: mom(kpis.avg_session_duration, compareKpis.avg_session_duration),
      event_count: mom(kpis.event_count, compareKpis.event_count),
      key_events: mom(kpis.key_events, compareKpis.key_events),
      views_per_session: mom(kpis.views_per_session, compareKpis.views_per_session),
      sessions_per_user: mom(kpis.sessions_per_user, compareKpis.sessions_per_user),
      user_engagement_duration: mom(kpis.user_engagement_duration, compareKpis.user_engagement_duration),
      pages_per_session: mom(kpis.pages_per_session, compareKpis.pages_per_session),
    };
  }, [kpis, compareKpis]);

  /** Date range strings for Overview table headers (this period / previous period). */
  const overviewPeriodLabels = useMemo(() => {
    const { from, to } = computeDateRange(filters.datePreset, filters.dateFrom, filters.dateTo);
    const rangeStr = (a, b) => (a && b ? `${a} – ${b}` : '—');
    const currentRange = rangeStr(from, to);
    let previousRange = '—';
    let previousFrom = null;
    let previousTo = null;
    if (filters.compareOn) {
      if (filters.compareFrom && filters.compareTo) {
        previousFrom = filters.compareFrom;
        previousTo = filters.compareTo;
        previousRange = rangeStr(previousFrom, previousTo);
      } else if (from && to) {
        const p = computePreviousPeriod(from, to);
        previousFrom = p.from;
        previousTo = p.to;
        previousRange = rangeStr(previousFrom, previousTo);
      }
    }
    return {
      currentRange,
      previousRange,
      currentFrom: from,
      currentTo: to,
      previousFrom,
      previousTo,
    };
  }, [
    filters.datePreset,
    filters.dateFrom,
    filters.dateTo,
    filters.compareOn,
    filters.compareFrom,
    filters.compareTo,
  ]);

  const dailyTrend = useMemo(() => {
    if (basicRpcCurrent != null) {
      return mapRpcDailyTrend(basicRpcCurrent.daily_trend);
    }
    const map = new Map();
    summaryRows.forEach((r) => {
      const d = r.report_date;
      if (!d) return;
      if (!map.has(d)) {
        map.set(d, {
          report_date: d,
          page_views: 0,
          total_users: 0,
          active_users: 0,
          new_users: 0,
          sessions: 0,
          engaged_sessions: 0,
          event_count: 0,
          key_events: 0,
          _bounce_ws: 0,
          _dur_ws: 0,
          _er_ws: 0,
        });
      }
      const a = map.get(d);
      const sess = num(r.sessions);
      a.page_views += num(r.screen_page_views);
      a.total_users += num(r.total_users);
      a.active_users += num(r.active_users);
      a.new_users += num(r.new_users);
      a.sessions += sess;
      a.engaged_sessions += num(r.engaged_sessions);
      a.event_count += num(r.event_count);
      a.key_events += num(r.key_events);
      a._bounce_ws += num(r.bounce_rate) * sess;
      a._dur_ws += num(r.avg_session_duration) * sess;
      a._er_ws += num(r.engagement_rate) * sess;
    });
    return [...map.values()]
      .map((a) => {
        const s = a.sessions;
        return {
          report_date: a.report_date,
          page_views: a.page_views,
          total_users: a.total_users,
          active_users: a.active_users,
          new_users: a.new_users,
          sessions: s,
          engaged_sessions: a.engaged_sessions,
          event_count: a.event_count,
          key_events: a.key_events,
          bounce_rate: s ? a._bounce_ws / s : 0,
          avg_session_duration: s ? a._dur_ws / s : 0,
          engagement_rate: s ? a._er_ws / s : 0,
        };
      })
      .sort((a, b) => String(a.report_date).localeCompare(String(b.report_date)));
  }, [basicRpcCurrent, summaryRows]);

  const compareDailyTrends = useMemo(() => {
    if (basicRpcCompare != null) {
      return mapRpcDailyTrend(basicRpcCompare.daily_trend);
    }
    const map = new Map();
    summaryCompareRows.forEach((r) => {
      const d = r.report_date;
      if (!d) return;
      if (!map.has(d)) {
        map.set(d, {
          report_date: d,
          page_views: 0,
          total_users: 0,
          active_users: 0,
          new_users: 0,
          sessions: 0,
          engaged_sessions: 0,
          event_count: 0,
          key_events: 0,
          _bounce_ws: 0,
          _dur_ws: 0,
          _er_ws: 0,
        });
      }
      const a = map.get(d);
      const sess = num(r.sessions);
      a.page_views += num(r.screen_page_views);
      a.total_users += num(r.total_users);
      a.active_users += num(r.active_users);
      a.new_users += num(r.new_users);
      a.sessions += sess;
      a.engaged_sessions += num(r.engaged_sessions);
      a.event_count += num(r.event_count);
      a.key_events += num(r.key_events);
      a._bounce_ws += num(r.bounce_rate) * sess;
      a._dur_ws += num(r.avg_session_duration) * sess;
      a._er_ws += num(r.engagement_rate) * sess;
    });
    return [...map.values()]
      .map((a) => {
        const s = a.sessions;
        return {
          report_date: a.report_date,
          page_views: a.page_views,
          total_users: a.total_users,
          active_users: a.active_users,
          new_users: a.new_users,
          sessions: s,
          engaged_sessions: a.engaged_sessions,
          event_count: a.event_count,
          key_events: a.key_events,
          bounce_rate: s ? a._bounce_ws / s : 0,
          avg_session_duration: s ? a._dur_ws / s : 0,
          engagement_rate: s ? a._er_ws / s : 0,
        };
      })
      .sort((a, b) => String(a.report_date).localeCompare(String(b.report_date)));
  }, [basicRpcCompare, summaryCompareRows]);

  const channelData = useMemo(() => {
    if (basicRpcCurrent != null) {
      return mapRpcChannels(basicRpcCurrent.channels);
    }
    const map = new Map();
    let totalSessions = 0;
    summaryRows.forEach((r) => {
      const key = r.channel_group || 'Unknown';
      if (!map.has(key)) {
        map.set(key, {
          channel_group: key,
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
      const sess = num(r.sessions);
      a.page_views += num(r.screen_page_views);
      a.total_users += num(r.total_users);
      a.sessions += sess;
      a.engaged_sessions += num(r.engaged_sessions);
      a.event_count += num(r.event_count);
      a.key_events += num(r.key_events);
      a._bounce_ws += num(r.bounce_rate) * sess;
      a._dur_ws += num(r.avg_session_duration) * sess;
      a._er_ws += num(r.engagement_rate) * sess;
      totalSessions += sess;
    });
    return [...map.values()]
      .map((o) => {
        const s = o.sessions;
        return {
          channel_group: o.channel_group,
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
      .sort((a, b) => b.sessions - a.sessions);
  }, [basicRpcCurrent, summaryRows]);

  const sourceMediumData = useMemo(() => {
    if (basicRpcCurrent != null) {
      return mapRpcSourceMedium(basicRpcCurrent.source_medium);
    }
    const map = new Map();
    let totalSessions = 0;
    summaryRows.forEach((r) => {
      const sm = r.source_medium || `${r.source || ''} / ${r.medium || ''}`;
      const key = sm;
      if (!map.has(key)) {
        map.set(key, {
          source_medium: sm,
          source: r.source || '',
          medium: r.medium || '',
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
      const sess = num(r.sessions);
      a.page_views += num(r.screen_page_views);
      a.total_users += num(r.total_users);
      a.sessions += sess;
      a.engaged_sessions += num(r.engaged_sessions);
      a.event_count += num(r.event_count);
      a.key_events += num(r.key_events);
      a._bounce_ws += num(r.bounce_rate) * sess;
      a._dur_ws += num(r.avg_session_duration) * sess;
      a._er_ws += num(r.engagement_rate) * sess;
      totalSessions += sess;
    });
    return [...map.values()]
      .map((o) => {
        const s = o.sessions;
        return {
          source_medium: o.source_medium,
          source: o.source,
          medium: o.medium,
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
  }, [basicRpcCurrent, summaryRows]);

  const advancedComparisonActive = useMemo(
    () => !!(filters.compareOn && advancedCompareReportOk),
    [filters.compareOn, advancedCompareReportOk],
  );

  const vdpByChannelData = useMemo(() => {
    const cur = Array.isArray(wheelerReports.vdp_channel) ? wheelerReports.vdp_channel : [];
    if (!advancedComparisonActive) return cur;
    const pri = Array.isArray(wheelerReportsCompare.vdp_channel) ? wheelerReportsCompare.vdp_channel : [];
    return enrichAdvancedRows(cur, pri, (r) => String(r.channel_group || 'Unknown'), [
      { field: 'page_views', lowerIsBetter: false },
      { field: 'unique_vdps', lowerIsBetter: false },
      { field: 'avg_views', lowerIsBetter: false },
    ]);
  }, [wheelerReports.vdp_channel, wheelerReportsCompare.vdp_channel, advancedComparisonActive]);

  const vdpByGoogleCampaignData = useMemo(() => {
    const cur = Array.isArray(wheelerReports.vdp_campaign_google) ? wheelerReports.vdp_campaign_google : [];
    if (!advancedComparisonActive) return cur;
    const pri = Array.isArray(wheelerReportsCompare.vdp_campaign_google)
      ? wheelerReportsCompare.vdp_campaign_google
      : [];
    const keyFn = (r) =>
      [r.campaign_name, r.channel_group, r.source_medium].map((x) => String(x ?? '')).join('\x00');
    return enrichAdvancedRows(cur, pri, keyFn, [
      { field: 'page_views', lowerIsBetter: false },
      { field: 'unique_vdps', lowerIsBetter: false },
      { field: 'avg_views', lowerIsBetter: false },
    ]);
  }, [wheelerReports.vdp_campaign_google, wheelerReportsCompare.vdp_campaign_google, advancedComparisonActive]);

  const vdpByMakeData = useMemo(() => {
    const cur = Array.isArray(wheelerReports.vdp_make) ? wheelerReports.vdp_make : [];
    if (!advancedComparisonActive) return cur;
    const pri = Array.isArray(wheelerReportsCompare.vdp_make) ? wheelerReportsCompare.vdp_make : [];
    return enrichAdvancedRows(cur, pri, (r) => String(r.item_make || ''), [
      { field: 'page_views', lowerIsBetter: false },
      { field: 'unique_vdps', lowerIsBetter: false },
      { field: 'avg_views', lowerIsBetter: false },
    ]);
  }, [wheelerReports.vdp_make, wheelerReportsCompare.vdp_make, advancedComparisonActive]);

  const vdpByModelData = useMemo(() => {
    const cur = Array.isArray(wheelerReports.vdp_model) ? wheelerReports.vdp_model : [];
    if (!advancedComparisonActive) return cur;
    const pri = Array.isArray(wheelerReportsCompare.vdp_model) ? wheelerReportsCompare.vdp_model : [];
    return enrichAdvancedRows(
      cur,
      pri,
      (r) => `${String(r.item_make || '')}\x00${String(r.item_model || '')}`,
      [
        { field: 'page_views', lowerIsBetter: false },
        { field: 'unique_vdps', lowerIsBetter: false },
      ],
    );
  }, [wheelerReports.vdp_model, wheelerReportsCompare.vdp_model, advancedComparisonActive]);

  const vdpByRvTypeData = useMemo(() => {
    const cur = Array.isArray(wheelerReports.vdp_rvtype) ? wheelerReports.vdp_rvtype : [];
    if (!advancedComparisonActive) return cur;
    const pri = Array.isArray(wheelerReportsCompare.vdp_rvtype) ? wheelerReportsCompare.vdp_rvtype : [];
    return enrichAdvancedRows(cur, pri, (r) => String(r.rv_type || ''), [
      { field: 'page_views', lowerIsBetter: false },
      { field: 'unique_vdps', lowerIsBetter: false },
    ]);
  }, [wheelerReports.vdp_rvtype, wheelerReportsCompare.vdp_rvtype, advancedComparisonActive]);

  const vdpByConditionData = useMemo(() => {
    const cur = Array.isArray(wheelerReports.vdp_condition) ? wheelerReports.vdp_condition : [];
    if (!advancedComparisonActive) return cur;
    const pri = Array.isArray(wheelerReportsCompare.vdp_condition) ? wheelerReportsCompare.vdp_condition : [];
    return enrichAdvancedRows(cur, pri, (r) => String(r.item_condition || ''), [
      { field: 'page_views', lowerIsBetter: false },
    ]);
  }, [wheelerReports.vdp_condition, wheelerReportsCompare.vdp_condition, advancedComparisonActive]);

  const pagetypesDrilldownParentRows = useMemo(() => {
    const cur = Array.isArray(wheelerReports.pagetypes_drilldown) ? wheelerReports.pagetypes_drilldown : [];
    if (!advancedComparisonActive) return buildPagetypesDrilldownParents(cur);
    const pri = Array.isArray(wheelerReportsCompare.pagetypes_drilldown)
      ? wheelerReportsCompare.pagetypes_drilldown
      : [];
    return enrichPagetypesDrilldownParentsWithCompare(cur, pri);
  }, [
    wheelerReports.pagetypes_drilldown,
    wheelerReportsCompare.pagetypes_drilldown,
    advancedComparisonActive,
  ]);

  const vdpDailyData = useMemo(() => {
    const cur = Array.isArray(wheelerReports.vdp_daily) ? wheelerReports.vdp_daily : [];
    if (!advancedComparisonActive) return cur;
    const pri = Array.isArray(wheelerReportsCompare.vdp_daily) ? wheelerReportsCompare.vdp_daily : [];
    return enrichAdvancedRows(cur, pri, (r) => String(r.report_date || ''), [
      { field: 'page_views', lowerIsBetter: false },
      { field: 'unique_vdps', lowerIsBetter: false },
      { field: 'avg_views', lowerIsBetter: false },
      { field: 'new_vdps', lowerIsBetter: false },
      { field: 'used_vdps', lowerIsBetter: false },
    ]);
  }, [wheelerReports.vdp_daily, wheelerReportsCompare.vdp_daily, advancedComparisonActive]);

  /** Channel → campaigns (expandable Campaigns tab). */
  const campaignData = useMemo(() => {
    if (basicRpcCurrent != null) {
      const byCh = jsonbArrayField(basicRpcCurrent.campaign_by_channel);
      const flat = jsonbArrayField(basicRpcCurrent.campaigns);
      return buildCampaignDataFromRpc(byCh.length ? byCh : flat);
    }
    const byChannel = new Map();
    let totalSessions = 0;
    summaryRows.forEach((r) => {
      const ch = r.channel_group || 'Unknown';
      const camp = r.campaign_name || '(not set)';
      if (!byChannel.has(ch)) {
        byChannel.set(ch, {
          channel_group: ch,
          page_views: 0,
          total_users: 0,
          sessions: 0,
          engaged_sessions: 0,
          event_count: 0,
          key_events: 0,
          _bounce_ws: 0,
          _dur_ws: 0,
          _er_ws: 0,
          campaigns: new Map(),
        });
      }
      const row = byChannel.get(ch);
      const sess = num(r.sessions);
      row.page_views += num(r.screen_page_views);
      row.total_users += num(r.total_users);
      row.sessions += sess;
      row.engaged_sessions += num(r.engaged_sessions);
      row.event_count += num(r.event_count);
      row.key_events += num(r.key_events);
      row._bounce_ws += num(r.bounce_rate) * sess;
      row._dur_ws += num(r.avg_session_duration) * sess;
      row._er_ws += num(r.engagement_rate) * sess;
      totalSessions += sess;

      if (!row.campaigns.has(camp)) {
        row.campaigns.set(camp, {
          campaign_name: camp,
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
      const c = row.campaigns.get(camp);
      c.page_views += num(r.screen_page_views);
      c.total_users += num(r.total_users);
      c.sessions += sess;
      c.engaged_sessions += num(r.engaged_sessions);
      c.event_count += num(r.event_count);
      c.key_events += num(r.key_events);
      c._bounce_ws += num(r.bounce_rate) * sess;
      c._dur_ws += num(r.avg_session_duration) * sess;
      c._er_ws += num(r.engagement_rate) * sess;
    });

    return [...byChannel.values()]
      .map((row) => {
        const chSess = row.sessions;
        const finalizeCamp = (o) => {
          const s = o.sessions;
          return {
            campaign_name: o.campaign_name,
            page_views: o.page_views,
            total_users: o.total_users,
            sessions: s,
            engaged_sessions: o.engaged_sessions,
            bounce_rate: s ? o._bounce_ws / s : 0,
            avg_session_duration: s ? o._dur_ws / s : 0,
            engagement_rate: s ? o._er_ws / s : 0,
            event_count: o.event_count,
            key_events: o.key_events,
            pct_sessions: chSess ? (s / chSess) * 100 : 0,
          };
        };
        const campaigns = [...row.campaigns.values()].map(finalizeCamp).sort((a, b) => b.sessions - a.sessions);
        const s = row.sessions;
        return {
          channel_group: row.channel_group,
          page_views: row.page_views,
          total_users: row.total_users,
          sessions: s,
          engaged_sessions: row.engaged_sessions,
          bounce_rate: s ? row._bounce_ws / s : 0,
          avg_session_duration: s ? row._dur_ws / s : 0,
          engagement_rate: s ? row._er_ws / s : 0,
          event_count: row.event_count,
          key_events: row.key_events,
          pct_sessions: totalSessions ? (s / totalSessions) * 100 : 0,
          campaigns,
        };
      })
      .sort((a, b) => b.sessions - a.sessions);
  }, [basicRpcCurrent, summaryRows]);

  const deviceData = useMemo(() => {
    if (basicRpcCurrent != null) {
      return mapRpcDevices(basicRpcCurrent.devices);
    }
    const map = new Map();
    let totalSessions = 0;
    summaryRows.forEach((r) => {
      const key = r.device_category || 'Unknown';
      if (!map.has(key)) {
        map.set(key, {
          device_category: key,
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
      const sess = num(r.sessions);
      a.page_views += num(r.screen_page_views);
      a.total_users += num(r.total_users);
      a.sessions += sess;
      a.engaged_sessions += num(r.engaged_sessions);
      a.event_count += num(r.event_count);
      a.key_events += num(r.key_events);
      a._bounce_ws += num(r.bounce_rate) * sess;
      a._dur_ws += num(r.avg_session_duration) * sess;
      a._er_ws += num(r.engagement_rate) * sess;
      totalSessions += sess;
    });
    return [...map.values()]
      .map((o) => {
        const s = o.sessions;
        return {
          device_category: o.device_category,
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
  }, [basicRpcCurrent, summaryRows]);

  const geoData = useMemo(() => {
    if (basicRpcCurrent != null) {
      return mapRpcGeo(basicRpcCurrent.geo);
    }
    const map = new Map();
    let totalSessions = 0;
    summaryRows.forEach((r) => {
      const reg = r.region || 'Unknown';
      const city = r.city || 'Unknown';
      const key = `${reg}\x00${city}`;
      if (!map.has(key)) {
        map.set(key, {
          region: reg,
          city,
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
      const sess = num(r.sessions);
      a.page_views += num(r.screen_page_views);
      a.total_users += num(r.total_users);
      a.sessions += sess;
      a.engaged_sessions += num(r.engaged_sessions);
      a.event_count += num(r.event_count);
      a.key_events += num(r.key_events);
      a._bounce_ws += num(r.bounce_rate) * sess;
      a._dur_ws += num(r.avg_session_duration) * sess;
      a._er_ws += num(r.engagement_rate) * sess;
      totalSessions += sess;
    });
    return [...map.values()]
      .map((o) => {
        const s = o.sessions;
        return {
          region: o.region,
          city: o.city,
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
  }, [basicRpcCurrent, summaryRows]);

  const dailyBreakdown = useMemo(() => {
    if (basicRpcCurrent != null) {
      const dbc = jsonbArrayField(basicRpcCurrent.daily_by_channel);
      if (dbc.length) {
        const byDate = new Map();
        dbc.forEach((r) => {
          const d = r.report_date;
          if (!d) return;
          const sess = num(r.sessions);
          const ch = r.channel_group || 'Unknown';
          if (!byDate.has(d)) {
            byDate.set(d, {
              report_date: d,
              page_views: 0,
              total_users: 0,
              active_users: 0,
              new_users: 0,
              sessions: 0,
              engaged_sessions: 0,
              event_count: 0,
              key_events: 0,
              _bounce_ws: 0,
              _dur_ws: 0,
              _er_ws: 0,
              channels: new Map(),
            });
          }
          const day = byDate.get(d);
          const pv = num(r.screen_page_views ?? r.page_views);
          day.page_views += pv;
          day.total_users += num(r.total_users);
          day.active_users += num(r.active_users);
          day.new_users += num(r.new_users);
          day.sessions += sess;
          day.engaged_sessions += num(r.engaged_sessions);
          day.event_count += num(r.event_count);
          day.key_events += num(r.key_events);
          day._bounce_ws += num(r.bounce_rate) * sess;
          day._dur_ws += num(r.avg_session_duration) * sess;
          day._er_ws += num(r.engagement_rate) * sess;
          if (!day.channels.has(ch)) {
            day.channels.set(ch, {
              channel_group: ch,
              page_views: 0,
              total_users: 0,
              active_users: 0,
              new_users: 0,
              sessions: 0,
              engaged_sessions: 0,
              event_count: 0,
              key_events: 0,
              _bounce_ws: 0,
              _dur_ws: 0,
              _er_ws: 0,
            });
          }
          const c = day.channels.get(ch);
          c.page_views += pv;
          c.total_users += num(r.total_users);
          c.active_users += num(r.active_users);
          c.new_users += num(r.new_users);
          c.sessions += sess;
          c.engaged_sessions += num(r.engaged_sessions);
          c.event_count += num(r.event_count);
          c.key_events += num(r.key_events);
          c._bounce_ws += num(r.bounce_rate) * sess;
          c._dur_ws += num(r.avg_session_duration) * sess;
          c._er_ws += num(r.engagement_rate) * sess;
        });
        return [...byDate.values()]
          .map((day) => {
            const s = day.sessions;
            const finalizeCh = (c) => {
              const cs = c.sessions;
              return {
                channel_group: c.channel_group,
                page_views: c.page_views,
                total_users: c.total_users,
                active_users: c.active_users,
                new_users: c.new_users,
                sessions: cs,
                engaged_sessions: c.engaged_sessions,
                event_count: c.event_count,
                key_events: c.key_events,
                bounce_rate: cs ? c._bounce_ws / cs : 0,
                avg_session_duration: cs ? c._dur_ws / cs : 0,
                engagement_rate: cs ? c._er_ws / cs : 0,
              };
            };
            return {
              report_date: day.report_date,
              page_views: day.page_views,
              total_users: day.total_users,
              active_users: day.active_users,
              new_users: day.new_users,
              sessions: s,
              engaged_sessions: day.engaged_sessions,
              event_count: day.event_count,
              key_events: day.key_events,
              bounce_rate: s ? day._bounce_ws / s : 0,
              avg_session_duration: s ? day._dur_ws / s : 0,
              engagement_rate: s ? day._er_ws / s : 0,
              channels: [...day.channels.values()].map(finalizeCh).sort((a, b) => b.sessions - a.sessions),
            };
          })
          .sort((a, b) => String(b.report_date).localeCompare(String(a.report_date)));
      }
      return mapRpcDailyTrend(basicRpcCurrent.daily_trend).map((d) => ({ ...d, channels: [] }));
    }
    const byDate = new Map();
    summaryRows.forEach((r) => {
      const d = r.report_date;
      if (!d) return;
      if (!byDate.has(d)) {
        byDate.set(d, {
          report_date: d,
          page_views: 0,
          total_users: 0,
          active_users: 0,
          new_users: 0,
          sessions: 0,
          engaged_sessions: 0,
          event_count: 0,
          key_events: 0,
          _bounce_ws: 0,
          _dur_ws: 0,
          _er_ws: 0,
          channels: new Map(),
        });
      }
      const day = byDate.get(d);
      const sess = num(r.sessions);
      day.page_views += num(r.screen_page_views);
      day.total_users += num(r.total_users);
      day.active_users += num(r.active_users);
      day.new_users += num(r.new_users);
      day.sessions += sess;
      day.engaged_sessions += num(r.engaged_sessions);
      day.event_count += num(r.event_count);
      day.key_events += num(r.key_events);
      day._bounce_ws += num(r.bounce_rate) * sess;
      day._dur_ws += num(r.avg_session_duration) * sess;
      day._er_ws += num(r.engagement_rate) * sess;
      const ch = r.channel_group || 'Unknown';
      if (!day.channels.has(ch)) {
        day.channels.set(ch, {
          channel_group: ch,
          page_views: 0,
          total_users: 0,
          active_users: 0,
          new_users: 0,
          sessions: 0,
          engaged_sessions: 0,
          event_count: 0,
          key_events: 0,
          _bounce_ws: 0,
          _dur_ws: 0,
          _er_ws: 0,
        });
      }
      const c = day.channels.get(ch);
      c.page_views += num(r.screen_page_views);
      c.total_users += num(r.total_users);
      c.active_users += num(r.active_users);
      c.new_users += num(r.new_users);
      c.sessions += sess;
      c.engaged_sessions += num(r.engaged_sessions);
      c.event_count += num(r.event_count);
      c.key_events += num(r.key_events);
      c._bounce_ws += num(r.bounce_rate) * sess;
      c._dur_ws += num(r.avg_session_duration) * sess;
      c._er_ws += num(r.engagement_rate) * sess;
    });
    return [...byDate.values()]
      .map((day) => {
        const s = day.sessions;
        const finalizeCh = (c) => {
          const cs = c.sessions;
          return {
            channel_group: c.channel_group,
            page_views: c.page_views,
            total_users: c.total_users,
            active_users: c.active_users,
            new_users: c.new_users,
            sessions: cs,
            engaged_sessions: c.engaged_sessions,
            event_count: c.event_count,
            key_events: c.key_events,
            bounce_rate: cs ? c._bounce_ws / cs : 0,
            avg_session_duration: cs ? c._dur_ws / cs : 0,
            engagement_rate: cs ? c._er_ws / cs : 0,
          };
        };
        return {
          report_date: day.report_date,
          page_views: day.page_views,
          total_users: day.total_users,
          active_users: day.active_users,
          new_users: day.new_users,
          sessions: s,
          engaged_sessions: day.engaged_sessions,
          event_count: day.event_count,
          key_events: day.key_events,
          bounce_rate: s ? day._bounce_ws / s : 0,
          avg_session_duration: s ? day._dur_ws / s : 0,
          engagement_rate: s ? day._er_ws / s : 0,
          channels: [...day.channels.values()].map(finalizeCh).sort((a, b) => b.sessions - a.sessions),
        };
      })
      .sort((a, b) => String(b.report_date).localeCompare(String(a.report_date)));
  }, [basicRpcCurrent, summaryRows]);

  /** Per channel: day-level rows (for Channels tab drill-down). */
  const channelDayBreakdown = useMemo(() => {
    if (basicRpcCurrent != null) {
      const dbc = jsonbArrayField(basicRpcCurrent.daily_by_channel);
      if (dbc.length) {
        const byChannel = new Map();
        dbc.forEach((r) => {
          const ch = r.channel_group || 'Unknown';
          const d = r.report_date;
          if (!d) return;
          if (!byChannel.has(ch)) byChannel.set(ch, new Map());
          const byDate = byChannel.get(ch);
          const sess = num(r.sessions);
          const pv = num(r.screen_page_views ?? r.page_views);
          if (!byDate.has(d)) {
            byDate.set(d, {
              report_date: d,
              page_views: 0,
              total_users: 0,
              active_users: 0,
              new_users: 0,
              sessions: 0,
              engaged_sessions: 0,
              event_count: 0,
              key_events: 0,
              _bounce_ws: 0,
              _dur_ws: 0,
              _er_ws: 0,
            });
          }
          const cell = byDate.get(d);
          cell.page_views += pv;
          cell.total_users += num(r.total_users);
          cell.active_users += num(r.active_users);
          cell.new_users += num(r.new_users);
          cell.sessions += sess;
          cell.engaged_sessions += num(r.engaged_sessions);
          cell.event_count += num(r.event_count);
          cell.key_events += num(r.key_events);
          cell._bounce_ws += num(r.bounce_rate) * sess;
          cell._dur_ws += num(r.avg_session_duration) * sess;
          cell._er_ws += num(r.engagement_rate) * sess;
        });
        const result = new Map();
        for (const [ch, m] of byChannel) {
          const raw = [...m.values()];
          const totalSess = raw.reduce((acc, o) => acc + o.sessions, 0);
          const rows = raw
            .map((o) => {
              const s = o.sessions;
              return {
                report_date: o.report_date,
                page_views: o.page_views,
                total_users: o.total_users,
                active_users: o.active_users,
                new_users: o.new_users,
                sessions: s,
                engaged_sessions: o.engaged_sessions,
                bounce_rate: s ? o._bounce_ws / s : 0,
                avg_session_duration: s ? o._dur_ws / s : 0,
                engagement_rate: s ? o._er_ws / s : 0,
                event_count: o.event_count,
                key_events: o.key_events,
                pct_sessions: totalSess ? (s / totalSess) * 100 : 0,
              };
            })
            .sort((a, b) => String(a.report_date).localeCompare(String(b.report_date)));
          result.set(ch, rows);
        }
        return result;
      }
      return new Map();
    }
    const byChannel = new Map();
    summaryRows.forEach((r) => {
      const ch = r.channel_group || 'Unknown';
      const d = r.report_date;
      if (!d) return;
      if (!byChannel.has(ch)) byChannel.set(ch, new Map());
      const byDate = byChannel.get(ch);
      if (!byDate.has(d)) {
        byDate.set(d, {
          report_date: d,
          page_views: 0,
          total_users: 0,
          active_users: 0,
          new_users: 0,
          sessions: 0,
          engaged_sessions: 0,
          event_count: 0,
          key_events: 0,
          _bounce_ws: 0,
          _dur_ws: 0,
          _er_ws: 0,
        });
      }
      const cell = byDate.get(d);
      const sess = num(r.sessions);
      cell.page_views += num(r.screen_page_views);
      cell.total_users += num(r.total_users);
      cell.active_users += num(r.active_users);
      cell.new_users += num(r.new_users);
      cell.sessions += sess;
      cell.engaged_sessions += num(r.engaged_sessions);
      cell.event_count += num(r.event_count);
      cell.key_events += num(r.key_events);
      cell._bounce_ws += num(r.bounce_rate) * sess;
      cell._dur_ws += num(r.avg_session_duration) * sess;
      cell._er_ws += num(r.engagement_rate) * sess;
    });
    const result = new Map();
    for (const [ch, m] of byChannel) {
      const raw = [...m.values()];
      const totalSess = raw.reduce((acc, o) => acc + o.sessions, 0);
      const rows = raw
        .map((o) => {
          const s = o.sessions;
          return {
            report_date: o.report_date,
            page_views: o.page_views,
            total_users: o.total_users,
            active_users: o.active_users,
            new_users: o.new_users,
            sessions: s,
            engaged_sessions: o.engaged_sessions,
            bounce_rate: s ? o._bounce_ws / s : 0,
            avg_session_duration: s ? o._dur_ws / s : 0,
            engagement_rate: s ? o._er_ws / s : 0,
            event_count: o.event_count,
            key_events: o.key_events,
            pct_sessions: totalSess ? (s / totalSess) * 100 : 0,
          };
        })
        .sort((a, b) => String(a.report_date).localeCompare(String(b.report_date)));
      result.set(ch, rows);
    }
    return result;
  }, [basicRpcCurrent, summaryRows]);

  /** True when GA4 summary data is available for the Overview empty-state (row-based or RPC). */
  const ga4SummaryReady = useMemo(() => basicRpcCurrent != null, [basicRpcCurrent]);

  const advancedWheelerKpis = useMemo(() => {
    const days = countDaysInclusiveUTC(overviewPeriodLabels.currentFrom, overviewPeriodLabels.currentTo);
    return advancedWheelerKpisFromReports(wheelerReports, days);
  }, [wheelerReports, overviewPeriodLabels.currentFrom, overviewPeriodLabels.currentTo]);

  const advancedWheelerKpisPrior = useMemo(() => {
    const pf = overviewPeriodLabels.previousFrom;
    const pt = overviewPeriodLabels.previousTo;
    if (!pf || !pt) return advancedWheelerKpisFromReports({}, 0);
    const days = countDaysInclusiveUTC(pf, pt);
    return advancedWheelerKpisFromReports(wheelerReportsCompare, days);
  }, [wheelerReportsCompare, overviewPeriodLabels.previousFrom, overviewPeriodLabels.previousTo]);

  const advancedWheelerKpiMom = useMemo(() => {
    if (!filters.compareOn || !advancedCompareReportOk) return null;
    const cur = advancedWheelerKpis;
    const prev = advancedWheelerKpisPrior;
    const keys = [
      'totalPageTypeViews',
      'vdpListingViews',
      'vdpNew',
      'vdpUsed',
      'srp',
      'home',
      'avgDailyVdpListings',
      'topMakeViews',
      'topModelViews',
      'topChannelViews',
      'topGoogleCampaignViews',
      'topRvTypeViews',
    ];
    const o = {};
    keys.forEach((k) => {
      o[k] = compareMoMField(cur[k], prev[k], false);
    });
    return o;
  }, [filters.compareOn, advancedCompareReportOk, advancedWheelerKpis, advancedWheelerKpisPrior]);

  const advancedVdpDailyChartSeries = useMemo(() => {
    const sortByDate = (arr) =>
      [...(Array.isArray(arr) ? arr : [])].sort((a, b) =>
        String(a.report_date || '').localeCompare(String(b.report_date || '')),
      );
    return {
      current: sortByDate(wheelerReports.vdp_daily),
      compare: sortByDate(wheelerReportsCompare.vdp_daily),
    };
  }, [wheelerReports.vdp_daily, wheelerReportsCompare.vdp_daily]);

  return {
    filters,
    effectivePropertyId,
    updateFilter,
    batchUpdateFilters,
    fetchData,
    eventsData,
    eventsLoading,
    eventsError,
    fetchEventsData,
    toggleReportingEvent,
    loading,
    loadingPhase,
    error,
    ga4Accounts,
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
    summaryRows,
    vdpByMakeData,
    vdpByModelData,
    vdpByRvTypeData,
    vdpByConditionData,
    ga4SummaryReady,
    advancedWheelerKpis,
    advancedWheelerKpisPrior,
    advancedWheelerKpiMom,
    advancedCompareReportOk,
    advancedComparisonActive,
    advancedVdpDailyChartSeries,
    pagetypesDrilldownParentRows,
    vdpDailyData,
    wheelerReportsCompare,
    loadAdvancedMonthlyReport: loadWheelerReport,
    advancedMonthlyLoading: wheelerReportLoading,
    advancedMonthlyError: wheelerReportError,
    advancedMonthlyVersion: wheelerReportVersion,
  };
}
