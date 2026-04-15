import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { getEffectiveAgencyScopeId } from '../lib/agencyScope';
import {
  deriveHipaaCallLeadType,
  deriveHipaaFormLeadType,
  hipaaCallCleanSource,
  hipaaFormCleanSource,
  mapHipaaCallRowToView,
  mapHipaaFormRowToView,
} from '../utils/ghlHipaaAttribution';

const GMT5_OFFSET_MS = -5 * 60 * 60 * 1000;

function nowGMT5() {
  return new Date(Date.now() + GMT5_OFFSET_MS);
}

function fmtYMD(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function computeDateRange(preset, customFrom, customTo) {
  const today = nowGMT5();
  const fmt = (x) => fmtYMD(x);
  const daysAgo = (n) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - n));
  switch (preset) {
    case 'today': return { from: fmt(today), to: fmt(today) };
    case 'yesterday': return { from: fmt(daysAgo(1)), to: fmt(daysAgo(1)) };
    case 'last7': return { from: fmt(daysAgo(6)), to: fmt(today) };
    case 'last14': return { from: fmt(daysAgo(13)), to: fmt(today) };
    case 'last30': return { from: fmt(daysAgo(29)), to: fmt(today) };
    case 'this_month': {
      const y = today.getUTCFullYear();
      const m = today.getUTCMonth();
      return { from: fmt(new Date(Date.UTC(y, m, 1))), to: fmt(today) };
    }
    case 'last_month': {
      const y = today.getUTCFullYear();
      const m = today.getUTCMonth();
      return { from: fmt(new Date(Date.UTC(y, m - 1, 1))), to: fmt(new Date(Date.UTC(y, m, 0))) };
    }
    case 'all': return { from: '2020-01-01', to: fmt(today) };
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

function enumerateDates(fromStr, toStr) {
  if (!fromStr || !toStr) return [];
  const out = [];
  const cur = new Date(fromStr + 'T12:00:00');
  const end = new Date(toStr + 'T12:00:00');
  if (cur > end) return [];
  while (cur <= end) {
    out.push(fmtYMD(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

const PAGE_SIZE = 20;
const CONTACT_AGG_BATCH = 1000;
const CONTACT_AGG_MAX_BATCHES = 500;
/** Exported for empty-state copy in GHL Leads UI */
export const ATTRIBUTION_FETCH_LIMIT = 800;
const DRILL_FETCH_LIMIT = 600;
/** Cap merged standard+HIPAA call/form lists for client-side pagination */
const MERGED_FETCH_LIMIT = 5000;

const emptyKpis = () => ({
  totalCalls: 0,
  googleAdsCalls: 0,
  totalForms: 0,
  totalChatWidget: 0,
  firstTimeCallers: 0,
  totalDurationSeconds: 0,
  avgCallDurationSeconds: 0,
  organicLeads: 0,
  totalLeads: 0,
});

async function fetchDurationSum(ids, startTs, endTs) {
  const durationRes = await supabase
    .from('ghl_calls_view')
    .select('duration.sum()')
    .in('location_id', ids)
    .gte('date_added', startTs)
    .lte('date_added', endTs)
    .maybeSingle();
  if (durationRes.error) {
    const { data: durRows } = await supabase
      .from('ghl_calls_view')
      .select('duration')
      .in('location_id', ids)
      .gte('date_added', startTs)
      .lte('date_added', endTs)
      .limit(50000);
    let total = 0;
    (durRows || []).forEach((r) => { total += Number(r.duration) || 0; });
    return total;
  }
  const row = durationRes.data;
  const sumVal = row && (row.sum ?? row.duration);
  return Number(sumVal) || 0;
}

async function fetchKpiBundle(ids, from, to) {
  const startTs = `${from}T00:00:00`;
  const endTs = `${to}T23:59:59.999`;
  const [
    callsCountRes,
    googleAdsCallsRes,
    formsCountRes,
    chatCountRes,
    firstCountRes,
    organicCallsRes,
    organicFormsSubRes,
    organicFormsChatRes,
  ] = await Promise.all([
    supabase.from('ghl_calls_view').select('*', { count: 'exact', head: true }).in('location_id', ids).gte('date_added', startTs).lte('date_added', endTs),
    supabase.from('ghl_calls_view').select('*', { count: 'exact', head: true }).in('location_id', ids).eq('clean_lead_type', 'google_ads').gte('date_added', startTs).lte('date_added', endTs),
    supabase.from('ghl_form_submissions_view').select('*', { count: 'exact', head: true }).in('location_id', ids).eq('form_type', 'form_submission').gte('date_added', startTs).lte('date_added', endTs),
    supabase.from('ghl_form_submissions_view').select('*', { count: 'exact', head: true }).in('location_id', ids).eq('form_type', 'chat_widget').gte('date_added', startTs).lte('date_added', endTs),
    supabase.from('ghl_calls_view').select('*', { count: 'exact', head: true }).in('location_id', ids).eq('first_time', true).gte('date_added', startTs).lte('date_added', endTs),
    supabase.from('ghl_calls_view').select('*', { count: 'exact', head: true }).in('location_id', ids).eq('clean_lead_type', 'organic').gte('date_added', startTs).lte('date_added', endTs),
    supabase.from('ghl_form_submissions_view').select('*', { count: 'exact', head: true }).in('location_id', ids).eq('clean_lead_type', 'organic').eq('form_type', 'form_submission').gte('date_added', startTs).lte('date_added', endTs),
    supabase.from('ghl_form_submissions_view').select('*', { count: 'exact', head: true }).in('location_id', ids).eq('clean_lead_type', 'organic').eq('form_type', 'chat_widget').gte('date_added', startTs).lte('date_added', endTs),
  ]);
  if (callsCountRes.error) throw callsCountRes.error;
  if (googleAdsCallsRes.error) throw googleAdsCallsRes.error;
  if (formsCountRes.error) throw formsCountRes.error;
  if (chatCountRes.error) throw chatCountRes.error;
  if (firstCountRes.error) throw firstCountRes.error;
  if (organicCallsRes.error) throw organicCallsRes.error;
  if (organicFormsSubRes.error) throw organicFormsSubRes.error;
  if (organicFormsChatRes.error) throw organicFormsChatRes.error;

  const totalCalls = callsCountRes.count ?? 0;
  const totalDurationSeconds = await fetchDurationSum(ids, startTs, endTs);
  const totalForms = formsCountRes.count ?? 0;
  const totalChatWidget = chatCountRes.count ?? 0;
  const organicLeads = (organicCallsRes.count ?? 0) + (organicFormsSubRes.count ?? 0) + (organicFormsChatRes.count ?? 0);
  const totalLeads = totalCalls + totalForms + totalChatWidget;
  const avgCallDurationSeconds = totalCalls > 0 ? Math.round(totalDurationSeconds / totalCalls) : 0;

  return {
    totalCalls,
    googleAdsCalls: googleAdsCallsRes.count ?? 0,
    totalForms,
    totalChatWidget,
    firstTimeCallers: firstCountRes.count ?? 0,
    totalDurationSeconds,
    avgCallDurationSeconds,
    organicLeads,
    totalLeads,
  };
}

function mergeKpis(a, b) {
  return {
    totalCalls: a.totalCalls + b.totalCalls,
    googleAdsCalls: a.googleAdsCalls + b.googleAdsCalls,
    totalForms: a.totalForms + b.totalForms,
    totalChatWidget: a.totalChatWidget + b.totalChatWidget,
    firstTimeCallers: a.firstTimeCallers + b.firstTimeCallers,
    totalDurationSeconds: a.totalDurationSeconds + b.totalDurationSeconds,
    avgCallDurationSeconds: 0,
    organicLeads: a.organicLeads + b.organicLeads,
    totalLeads: a.totalLeads + b.totalLeads,
  };
}

async function fetchKpiBundleHipaa(ids, from, to) {
  const startTs = `${from}T00:00:00`;
  const endTs = `${to}T23:59:59.999`;
  let totalCalls = 0;
  let googleAdsCalls = 0;
  let firstTimeCallers = 0;
  let totalDurationSeconds = 0;
  let organicCalls = 0;
  let offset = 0;
  for (let b = 0; b < CONTACT_AGG_MAX_BATCHES; b += 1) {
    const { data, error } = await supabase
      .from('ghl_hipaa_calls')
      .select('first_time, duration_seconds, source_type, marketing_campaign, referrer, campaign')
      .in('location_id', ids)
      .gte('date_time', startTs)
      .lte('date_time', endTs)
      .order('date_time', { ascending: true })
      .range(offset, offset + CONTACT_AGG_BATCH - 1);
    if (error) throw error;
    const batch = data || [];
    if (batch.length === 0) break;
    batch.forEach((row) => {
      totalCalls += 1;
      totalDurationSeconds += Number(row.duration_seconds) || 0;
      if (row.first_time) firstTimeCallers += 1;
      const lt = deriveHipaaCallLeadType(row);
      if (lt === 'google_ads') googleAdsCalls += 1;
      if (lt === 'organic') organicCalls += 1;
    });
    offset += batch.length;
    if (batch.length < CONTACT_AGG_BATCH) break;
  }

  let totalForms = 0;
  let organicFormsSub = 0;
  offset = 0;
  for (let b = 0; b < CONTACT_AGG_MAX_BATCHES; b += 1) {
    const { data, error } = await supabase
      .from('ghl_hipaa_forms')
      .select('url')
      .in('location_id', ids)
      .gte('submission_date', startTs)
      .lte('submission_date', endTs)
      .order('submission_date', { ascending: true })
      .range(offset, offset + CONTACT_AGG_BATCH - 1);
    if (error) throw error;
    const batch = data || [];
    if (batch.length === 0) break;
    batch.forEach((row) => {
      totalForms += 1;
      if (deriveHipaaFormLeadType(row) === 'organic') organicFormsSub += 1;
    });
    offset += batch.length;
    if (batch.length < CONTACT_AGG_BATCH) break;
  }

  const totalChatWidget = 0;
  const organicLeads = organicCalls + organicFormsSub + totalChatWidget;
  const totalLeads = totalCalls + totalForms + totalChatWidget;
  const avgCallDurationSeconds = totalCalls > 0 ? Math.round(totalDurationSeconds / totalCalls) : 0;

  return {
    totalCalls,
    googleAdsCalls,
    totalForms,
    totalChatWidget,
    firstTimeCallers,
    totalDurationSeconds,
    avgCallDurationSeconds,
    organicLeads,
    totalLeads,
  };
}

async function fetchKpiBundleMerged(standardIds, hipaaIds, from, to) {
  if (!standardIds.length && !hipaaIds.length) return emptyKpis();
  const parts = [];
  if (standardIds.length) parts.push(fetchKpiBundle(standardIds, from, to));
  if (hipaaIds.length) parts.push(fetchKpiBundleHipaa(hipaaIds, from, to));
  const results = await Promise.all(parts);
  if (results.length === 1) {
    return results[0];
  }
  const merged = mergeKpis(results[0], results[1]);
  const tc = merged.totalCalls;
  merged.avgCallDurationSeconds = tc > 0 ? Math.round(merged.totalDurationSeconds / tc) : 0;
  return merged;
}

async function aggregateCallsByLeadType(ids, startTs, endTs) {
  const map = new Map();
  let offset = 0;
  for (let b = 0; b < CONTACT_AGG_MAX_BATCHES; b += 1) {
    const { data, error } = await supabase
      .from('ghl_calls_view')
      .select('clean_lead_type, duration')
      .in('location_id', ids)
      .gte('date_added', startTs)
      .lte('date_added', endTs)
      .order('date_added', { ascending: true })
      .range(offset, offset + CONTACT_AGG_BATCH - 1);
    if (error) throw error;
    const batch = data || [];
    if (batch.length === 0) break;
    batch.forEach((row) => {
      const t = row.clean_lead_type != null && String(row.clean_lead_type) !== '' ? String(row.clean_lead_type) : 'unknown';
      const cur = map.get(t) || { clean_lead_type: t, count: 0, durationSumSeconds: 0 };
      cur.count += 1;
      cur.durationSumSeconds += Number(row.duration) || 0;
      map.set(t, cur);
    });
    offset += batch.length;
    if (batch.length < CONTACT_AGG_BATCH) break;
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

async function aggregateFormsByLeadType(ids, startTs, endTs) {
  const map = new Map();
  let offset = 0;
  for (let b = 0; b < CONTACT_AGG_MAX_BATCHES; b += 1) {
    const { data, error } = await supabase
      .from('ghl_form_submissions_view')
      .select('clean_lead_type, form_type')
      .in('location_id', ids)
      .gte('date_added', startTs)
      .lte('date_added', endTs)
      .order('date_added', { ascending: true })
      .range(offset, offset + CONTACT_AGG_BATCH - 1);
    if (error) throw error;
    const batch = data || [];
    if (batch.length === 0) break;
    batch.forEach((row) => {
      const t = row.clean_lead_type != null && String(row.clean_lead_type) !== '' ? String(row.clean_lead_type) : 'unknown';
      const ft = String(row.form_type || '');
      const key = `${t}\0${ft}`;
      map.set(key, (map.get(key) || 0) + 1);
    });
    offset += batch.length;
    if (batch.length < CONTACT_AGG_BATCH) break;
  }
  return [...map.entries()].map(([key, count]) => {
    const [clean_lead_type, form_type] = key.split('\0');
    return { clean_lead_type, form_type, count };
  }).sort((a, b) => b.count - a.count);
}

function mergeCallAggRows(stdRows, hipaaRows) {
  const map = new Map();
  [...stdRows, ...hipaaRows].forEach((r) => {
    const t = r.clean_lead_type;
    const cur = map.get(t) || { clean_lead_type: t, count: 0, durationSumSeconds: 0 };
    cur.count += r.count;
    cur.durationSumSeconds += r.durationSumSeconds || 0;
    map.set(t, cur);
  });
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function mergeFormAggRows(stdRows, hipaaRows) {
  const map = new Map();
  [...stdRows, ...hipaaRows].forEach((r) => {
    const key = `${r.clean_lead_type}\0${r.form_type}`;
    const cur = map.get(key) || { clean_lead_type: r.clean_lead_type, form_type: r.form_type, count: 0 };
    cur.count += r.count;
    map.set(key, cur);
  });
  return [...map.values()].sort((a, b) => b.count - a.count);
}

async function aggregateHipaaCallsByLeadType(ids, startTs, endTs) {
  const map = new Map();
  let offset = 0;
  for (let b = 0; b < CONTACT_AGG_MAX_BATCHES; b += 1) {
    const { data, error } = await supabase
      .from('ghl_hipaa_calls')
      .select('source_type, marketing_campaign, referrer, campaign, duration_seconds')
      .in('location_id', ids)
      .gte('date_time', startTs)
      .lte('date_time', endTs)
      .order('date_time', { ascending: true })
      .range(offset, offset + CONTACT_AGG_BATCH - 1);
    if (error) throw error;
    const batch = data || [];
    if (batch.length === 0) break;
    batch.forEach((row) => {
      const t = deriveHipaaCallLeadType(row);
      const cur = map.get(t) || { clean_lead_type: t, count: 0, durationSumSeconds: 0 };
      cur.count += 1;
      cur.durationSumSeconds += Number(row.duration_seconds) || 0;
      map.set(t, cur);
    });
    offset += batch.length;
    if (batch.length < CONTACT_AGG_BATCH) break;
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

async function aggregateHipaaFormsByLeadType(ids, startTs, endTs) {
  const map = new Map();
  let offset = 0;
  for (let b = 0; b < CONTACT_AGG_MAX_BATCHES; b += 1) {
    const { data, error } = await supabase
      .from('ghl_hipaa_forms')
      .select('url')
      .in('location_id', ids)
      .gte('submission_date', startTs)
      .lte('submission_date', endTs)
      .order('submission_date', { ascending: true })
      .range(offset, offset + CONTACT_AGG_BATCH - 1);
    if (error) throw error;
    const batch = data || [];
    if (batch.length === 0) break;
    batch.forEach((row) => {
      const t = deriveHipaaFormLeadType(row);
      const key = `${t}\0form_submission`;
      map.set(key, (map.get(key) || 0) + 1);
    });
    offset += batch.length;
    if (batch.length < CONTACT_AGG_BATCH) break;
  }
  return [...map.entries()].map(([key, count]) => {
    const [clean_lead_type, form_type] = key.split('\0');
    return { clean_lead_type, form_type, count };
  }).sort((a, b) => b.count - a.count);
}

async function fetchHipaaSyntheticActivity(ids, from, to) {
  const startTs = `${from}T00:00:00`;
  const endTs = `${to}T23:59:59.999`;
  const callByDate = new Map();
  let offset = 0;
  for (let b = 0; b < CONTACT_AGG_MAX_BATCHES; b += 1) {
    const { data, error } = await supabase
      .from('ghl_hipaa_calls')
      .select('date_time')
      .in('location_id', ids)
      .gte('date_time', startTs)
      .lte('date_time', endTs)
      .range(offset, offset + CONTACT_AGG_BATCH - 1);
    if (error) throw error;
    const batch = data || [];
    if (batch.length === 0) break;
    batch.forEach((r) => {
      const d = r.date_time ? new Date(r.date_time).toISOString().slice(0, 10) : '';
      if (d) callByDate.set(d, (callByDate.get(d) || 0) + 1);
    });
    offset += batch.length;
    if (batch.length < CONTACT_AGG_BATCH) break;
  }
  const formByDate = new Map();
  offset = 0;
  for (let b = 0; b < CONTACT_AGG_MAX_BATCHES; b += 1) {
    const { data, error } = await supabase
      .from('ghl_hipaa_forms')
      .select('submission_date')
      .in('location_id', ids)
      .gte('submission_date', startTs)
      .lte('submission_date', endTs)
      .range(offset, offset + CONTACT_AGG_BATCH - 1);
    if (error) throw error;
    const batch = data || [];
    if (batch.length === 0) break;
    batch.forEach((r) => {
      const d = r.submission_date ? new Date(r.submission_date).toISOString().slice(0, 10) : '';
      if (d) formByDate.set(d, (formByDate.get(d) || 0) + 1);
    });
    offset += batch.length;
    if (batch.length < CONTACT_AGG_BATCH) break;
  }
  const loc = ids[0] || '';
  const out = [];
  callByDate.forEach((n, d) => {
    out.push({ report_date: d, location_id: loc, activity_type: 'call_hipaa', subtype: '', total_count: n });
  });
  formByDate.forEach((n, d) => {
    out.push({ report_date: d, location_id: loc, activity_type: 'form', subtype: 'form_submission', total_count: n });
  });
  return out;
}

async function buildDailyLeadBreakdown(standardIds, hipaaIds, from, to) {
  const startTs = `${from}T00:00:00`;
  const endTs = `${to}T23:59:59.999`;
  const key = (d, lt, src) => `${d}\0${lt}\0${src}`;
  const acc = new Map();

  const bump = (d, lt, src, field) => {
    if (!d) return;
    const k = key(d, lt, src);
    const cur = acc.get(k) || { report_date: d, lead_type: lt, source: src, calls: 0, forms: 0 };
    cur[field] += 1;
    acc.set(k, cur);
  };

  if (standardIds.length) {
    let offset = 0;
    for (let b = 0; b < CONTACT_AGG_MAX_BATCHES; b += 1) {
      const { data, error } = await supabase
        .from('ghl_calls_view')
        .select('date_added, clean_lead_type, clean_source')
        .in('location_id', standardIds)
        .gte('date_added', startTs)
        .lte('date_added', endTs)
        .order('date_added', { ascending: true })
        .range(offset, offset + CONTACT_AGG_BATCH - 1);
      if (error) throw error;
      const batch = data || [];
      if (batch.length === 0) break;
      batch.forEach((row) => {
        const d = String(row.date_added || '').slice(0, 10);
        const lt = row.clean_lead_type != null && String(row.clean_lead_type) !== '' ? String(row.clean_lead_type) : 'unknown';
        const src = row.clean_source != null && String(row.clean_source) !== '' ? String(row.clean_source) : '—';
        bump(d, lt, src, 'calls');
      });
      offset += batch.length;
      if (batch.length < CONTACT_AGG_BATCH) break;
    }
    offset = 0;
    for (let b = 0; b < CONTACT_AGG_MAX_BATCHES; b += 1) {
      const { data, error } = await supabase
        .from('ghl_form_submissions_view')
        .select('date_added, clean_lead_type, clean_source')
        .in('location_id', standardIds)
        .eq('form_type', 'form_submission')
        .gte('date_added', startTs)
        .lte('date_added', endTs)
        .order('date_added', { ascending: true })
        .range(offset, offset + CONTACT_AGG_BATCH - 1);
      if (error) throw error;
      const batch = data || [];
      if (batch.length === 0) break;
      batch.forEach((row) => {
        const d = String(row.date_added || '').slice(0, 10);
        const lt = row.clean_lead_type != null && String(row.clean_lead_type) !== '' ? String(row.clean_lead_type) : 'unknown';
        const src = row.clean_source != null && String(row.clean_source) !== '' ? String(row.clean_source) : '—';
        bump(d, lt, src, 'forms');
      });
      offset += batch.length;
      if (batch.length < CONTACT_AGG_BATCH) break;
    }
  }

  if (hipaaIds.length) {
    let offset = 0;
    for (let b = 0; b < CONTACT_AGG_MAX_BATCHES; b += 1) {
      const { data, error } = await supabase
        .from('ghl_hipaa_calls')
        .select('date_time, source_type, marketing_campaign, referrer, campaign')
        .in('location_id', hipaaIds)
        .gte('date_time', startTs)
        .lte('date_time', endTs)
        .order('date_time', { ascending: true })
        .range(offset, offset + CONTACT_AGG_BATCH - 1);
      if (error) throw error;
      const batch = data || [];
      if (batch.length === 0) break;
      batch.forEach((row) => {
        const d = row.date_time ? new Date(row.date_time).toISOString().slice(0, 10) : '';
        const lt = deriveHipaaCallLeadType(row);
        const src = hipaaCallCleanSource(row);
        bump(d, lt, src, 'calls');
      });
      offset += batch.length;
      if (batch.length < CONTACT_AGG_BATCH) break;
    }
    offset = 0;
    for (let b = 0; b < CONTACT_AGG_MAX_BATCHES; b += 1) {
      const { data, error } = await supabase
        .from('ghl_hipaa_forms')
        .select('submission_date, url')
        .in('location_id', hipaaIds)
        .gte('submission_date', startTs)
        .lte('submission_date', endTs)
        .order('submission_date', { ascending: true })
        .range(offset, offset + CONTACT_AGG_BATCH - 1);
      if (error) throw error;
      const batch = data || [];
      if (batch.length === 0) break;
      batch.forEach((row) => {
        const d = row.submission_date ? new Date(row.submission_date).toISOString().slice(0, 10) : '';
        const lt = deriveHipaaFormLeadType(row);
        const src = hipaaFormCleanSource(row);
        bump(d, lt, src, 'forms');
      });
      offset += batch.length;
      if (batch.length < CONTACT_AGG_BATCH) break;
    }
  }

  return [...acc.values()].sort(
    (a, b) => a.report_date.localeCompare(b.report_date)
      || a.lead_type.localeCompare(b.lead_type)
      || a.source.localeCompare(b.source),
  );
}

export function useGhlData() {
  const { canViewAllCustomers, allowedClientAccounts, activeAgencyId, agencyId, userProfile, userRole } = useAuth();
  const isSuperAdmin = !!(userProfile?.is_super_admin || userRole?.toLowerCase() === 'super_admin');
  const scopeAgencyId = useMemo(
    () => getEffectiveAgencyScopeId(isSuperAdmin, activeAgencyId, agencyId),
    [isSuperAdmin, activeAgencyId, agencyId],
  );

  const allowedGhlKey = useMemo(() => {
    if (canViewAllCustomers) return 'all';
    return (allowedClientAccounts || [])
      .filter((a) => a.platform === 'ghl')
      .map((a) => String(a.platform_customer_id))
      .sort()
      .join(',');
  }, [canViewAllCustomers, allowedClientAccounts]);

  const [filters, setFilters] = useState({
    datePreset: 'this_month',
    dateFrom: '',
    dateTo: '',
    compareOn: false,
    compareFrom: '',
    compareTo: '',
    locationId: 'ALL',
  });

  const [locations, setLocations] = useState([]);
  const [kpis, setKpis] = useState(emptyKpis());
  const [compareKpis, setCompareKpis] = useState(null);
  const [activityDailyRows, setActivityDailyRows] = useState([]);
  const [callsBySource, setCallsBySource] = useState([]);
  const [formsBySource, setFormsBySource] = useState([]);
  const [callsBySourceCompare, setCallsBySourceCompare] = useState([]);
  const [formsBySourceCompare, setFormsBySourceCompare] = useState([]);
  const [calls, setCalls] = useState([]);
  const [callsTotal, setCallsTotal] = useState(0);
  const [callsPage, setCallsPage] = useState(1);
  const [formSubmissions, setFormSubmissions] = useState([]);
  const [formSubmissionsTotal, setFormSubmissionsTotal] = useState(0);
  const [formSubmissionsPage, setFormSubmissionsPage] = useState(1);
  const [chatWidgets, setChatWidgets] = useState([]);
  const [chatWidgetsTotal, setChatWidgetsTotal] = useState(0);
  const [chatWidgetsPage, setChatWidgetsPage] = useState(1);
  const [leadsBySource, setLeadsBySource] = useState([]);
  const [attributionByType, setAttributionByType] = useState({});
  const [attributionLoading, setAttributionLoading] = useState({});
  const [drillRows, setDrillRows] = useState([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const [dailyLeadBreakdown, setDailyLeadBreakdown] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const allowedClientAccountsRef = useRef(allowedClientAccounts);
  allowedClientAccountsRef.current = allowedClientAccounts;

  const contextRef = useRef({
    ids: [],
    standardIds: [],
    hipaaIds: [],
    from: null,
    to: null,
    startTs: '',
    endTs: '',
    callsFetchMode: 'standard',
    mergedCallsBuffer: null,
    mergedFormsBuffer: null,
  });

  const updateFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const batchUpdateFilters = useCallback((updates) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  }, []);

  const resolveLocationContext = useCallback(
    async (selectedLocationId) => {
      let q = supabase
        .from('client_platform_accounts')
        .select('platform_customer_id, account_name, client_id, hipaa_compliant, clients(name)')
        .eq('is_active', true)
        .eq('platform', 'ghl');

      if (scopeAgencyId) q = q.eq('agency_id', scopeAgencyId);

      if (!canViewAllCustomers) {
        const ghlAllowed = (allowedClientAccountsRef.current || [])
          .filter((a) => a.platform === 'ghl')
          .map((a) => String(a.platform_customer_id));
        if (ghlAllowed.length === 0) return { options: [], ids: [] };
        q = q.in('platform_customer_id', ghlAllowed);
      }

      const { data, error: err } = await q;
      if (err) throw err;
      const rows = data || [];
      const options = rows.map((r) => ({
        id: String(r.platform_customer_id),
        name: r.account_name || r.platform_customer_id,
        client_name: r.clients?.name || '',
        hipaa_compliant: !!r.hipaa_compliant,
      }));
      let ids = options.map((o) => o.id);
      if (selectedLocationId && selectedLocationId !== 'ALL') {
        ids = ids.filter((id) => id === String(selectedLocationId));
      }
      return { options, ids };
    },
    [scopeAgencyId, canViewAllCustomers],
  );

  const aggregateContactsBySource = useCallback(async (standardIds, hipaaIds, from, to) => {
    if ((!standardIds.length && !hipaaIds.length) || !from || !to) {
      setLeadsBySource([]);
      return;
    }
    const startTs = `${from}T00:00:00`;
    const endTs = `${to}T23:59:59.999`;
    const counts = new Map();
    const bump = (src, lt) => {
      const s = src != null && String(src) !== '' ? String(src) : '—';
      const l = lt != null && String(lt) !== '' ? String(lt) : '—';
      const key = `${s}\0${l}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    };
    if (standardIds.length) {
      let offset = 0;
      for (let b = 0; b < CONTACT_AGG_MAX_BATCHES; b += 1) {
        const { data, error: err } = await supabase
          .from('ghl_contacts_view')
          .select('clean_source, clean_lead_type')
          .in('location_id', standardIds)
          .gte('date_added', startTs)
          .lte('date_added', endTs)
          .order('date_added', { ascending: true })
          .range(offset, offset + CONTACT_AGG_BATCH - 1);
        if (err) throw err;
        const batch = data || [];
        if (batch.length === 0) break;
        batch.forEach((row) => {
          bump(row.clean_source, row.clean_lead_type);
        });
        offset += batch.length;
        if (batch.length < CONTACT_AGG_BATCH) break;
      }
    }
    if (hipaaIds.length) {
      let offset = 0;
      for (let b = 0; b < CONTACT_AGG_MAX_BATCHES; b += 1) {
        const { data, error: err } = await supabase
          .from('ghl_hipaa_calls')
          .select('source_type, marketing_campaign, referrer, campaign')
          .in('location_id', hipaaIds)
          .gte('date_time', startTs)
          .lte('date_time', endTs)
          .order('date_time', { ascending: true })
          .range(offset, offset + CONTACT_AGG_BATCH - 1);
        if (err) throw err;
        const batch = data || [];
        if (batch.length === 0) break;
        batch.forEach((row) => {
          bump(hipaaCallCleanSource(row), deriveHipaaCallLeadType(row));
        });
        offset += batch.length;
        if (batch.length < CONTACT_AGG_BATCH) break;
      }
      offset = 0;
      for (let b = 0; b < CONTACT_AGG_MAX_BATCHES; b += 1) {
        const { data, error: err } = await supabase
          .from('ghl_hipaa_forms')
          .select('url')
          .in('location_id', hipaaIds)
          .gte('submission_date', startTs)
          .lte('submission_date', endTs)
          .order('submission_date', { ascending: true })
          .range(offset, offset + CONTACT_AGG_BATCH - 1);
        if (err) throw err;
        const batch = data || [];
        if (batch.length === 0) break;
        batch.forEach((row) => {
          bump(hipaaFormCleanSource(row), deriveHipaaFormLeadType(row));
        });
        offset += batch.length;
        if (batch.length < CONTACT_AGG_BATCH) break;
      }
    }
    const rows = [...counts.entries()]
      .map(([key, count]) => {
        const [clean_source, clean_lead_type] = key.split('\0');
        return { clean_source, clean_lead_type, count };
      })
      .sort((a, b) => b.count - a.count || a.clean_source.localeCompare(b.clean_source));
    setLeadsBySource(rows);
  }, []);

  const fetchCallsPage = useCallback(async () => {
    const ctx = contextRef.current;
    const {
      ids, startTs, endTs, callsFetchMode, mergedCallsBuffer, standardIds, hipaaIds,
    } = ctx;
    if (!ids?.length || !startTs || !endTs) {
      setCalls([]);
      setCallsTotal(0);
      return;
    }
    const cStart = (callsPage - 1) * PAGE_SIZE;
    if (callsFetchMode === 'merged' && Array.isArray(mergedCallsBuffer)) {
      setCalls(mergedCallsBuffer.slice(cStart, cStart + PAGE_SIZE));
      setCallsTotal(mergedCallsBuffer.length);
      return;
    }
    if (callsFetchMode === 'hipaa' && hipaaIds?.length) {
      const { data, count, error: err } = await supabase
        .from('ghl_hipaa_calls')
        .select(
          'id, location_id, date_time, contact_name, contact_phone, source_type, marketing_campaign, referrer, campaign, direction, call_status, duration_seconds, first_time',
          { count: 'exact' },
        )
        .in('location_id', hipaaIds)
        .gte('date_time', startTs)
        .lte('date_time', endTs)
        .order('date_time', { ascending: false })
        .range(cStart, cStart + PAGE_SIZE - 1);
      if (err) {
        setCalls([]);
        setCallsTotal(0);
        return;
      }
      setCalls((data || []).map(mapHipaaCallRowToView));
      setCallsTotal(count ?? 0);
      return;
    }
    const { data, count, error: err } = await supabase
      .from('ghl_calls_view')
      .select(
        'id, date_added, contact_name, contact_phone, contact_email, direction, status, duration, first_time, clean_source, clean_medium, clean_lead_type',
        { count: 'exact' },
      )
      .in('location_id', standardIds.length ? standardIds : ids)
      .gte('date_added', startTs)
      .lte('date_added', endTs)
      .order('date_added', { ascending: false })
      .range(cStart, cStart + PAGE_SIZE - 1);
    if (err) {
      setCalls([]);
      setCallsTotal(0);
      return;
    }
    setCalls(data || []);
    setCallsTotal(count ?? 0);
  }, [callsPage]);

  const fetchFormSubmissionsPage = useCallback(async () => {
    const ctx = contextRef.current;
    const {
      ids, startTs, endTs, callsFetchMode, mergedFormsBuffer, standardIds, hipaaIds,
    } = ctx;
    if (!ids?.length || !startTs || !endTs) {
      setFormSubmissions([]);
      setFormSubmissionsTotal(0);
      return;
    }
    const fStart = (formSubmissionsPage - 1) * PAGE_SIZE;
    if (callsFetchMode === 'merged' && Array.isArray(mergedFormsBuffer)) {
      setFormSubmissions(mergedFormsBuffer.slice(fStart, fStart + PAGE_SIZE));
      setFormSubmissionsTotal(mergedFormsBuffer.length);
      return;
    }
    if (callsFetchMode === 'hipaa' && hipaaIds?.length) {
      const { data, count, error: err } = await supabase
        .from('ghl_hipaa_forms')
        .select(
          'id, submission_date, name, email, phone, url',
          { count: 'exact' },
        )
        .in('location_id', hipaaIds)
        .gte('submission_date', startTs)
        .lte('submission_date', endTs)
        .order('submission_date', { ascending: false })
        .range(fStart, fStart + PAGE_SIZE - 1);
      if (err) {
        setFormSubmissions([]);
        setFormSubmissionsTotal(0);
        return;
      }
      setFormSubmissions((data || []).map(mapHipaaFormRowToView));
      setFormSubmissionsTotal(count ?? 0);
      return;
    }
    const { data, count, error: err } = await supabase
      .from('ghl_form_submissions_view')
      .select(
        'id, date_added, contact_name, contact_email, contact_phone, form_type, form_name, clean_source, clean_medium, clean_lead_type',
        { count: 'exact' },
      )
      .in('location_id', standardIds.length ? standardIds : ids)
      .eq('form_type', 'form_submission')
      .gte('date_added', startTs)
      .lte('date_added', endTs)
      .order('date_added', { ascending: false })
      .range(fStart, fStart + PAGE_SIZE - 1);
    if (err) {
      setFormSubmissions([]);
      setFormSubmissionsTotal(0);
      return;
    }
    setFormSubmissions(data || []);
    setFormSubmissionsTotal(count ?? 0);
  }, [formSubmissionsPage]);

  const fetchChatWidgetsPage = useCallback(async () => {
    const ctx = contextRef.current;
    const { ids, startTs, endTs, callsFetchMode, standardIds } = ctx;
    if (!ids?.length || !startTs || !endTs) {
      setChatWidgets([]);
      setChatWidgetsTotal(0);
      return;
    }
    if (callsFetchMode === 'hipaa' || callsFetchMode === 'merged') {
      setChatWidgets([]);
      setChatWidgetsTotal(0);
      return;
    }
    const fStart = (chatWidgetsPage - 1) * PAGE_SIZE;
    const { data, count, error: err } = await supabase
      .from('ghl_form_submissions_view')
      .select(
        'id, date_added, contact_name, contact_email, contact_phone, form_type, form_name, clean_source, clean_medium, clean_lead_type',
        { count: 'exact' },
      )
      .in('location_id', standardIds.length ? standardIds : ids)
      .eq('form_type', 'chat_widget')
      .gte('date_added', startTs)
      .lte('date_added', endTs)
      .order('date_added', { ascending: false })
      .range(fStart, fStart + PAGE_SIZE - 1);
    if (err) {
      setChatWidgets([]);
      setChatWidgetsTotal(0);
      return;
    }
    setChatWidgets(data || []);
    setChatWidgetsTotal(count ?? 0);
  }, [chatWidgetsPage]);

  /** Drill-down rows for one lead source bucket (same buckets as the donut: google_ads, organic, direct, …). */
  const loadAttributionDrillForLeadType = useCallback(async (cleanLeadType) => {
    const { ids, standardIds, hipaaIds, startTs, endTs } = contextRef.current;
    if (!ids?.length || !startTs || !endTs || !cleanLeadType) {
      setDrillRows([]);
      return;
    }
    setDrillLoading(true);
    setDrillRows([]);
    try {
      const callSel = 'id, date_added, contact_name, contact_phone, contact_email, direction, status, duration, first_time, clean_source, clean_medium, clean_lead_type';
      const formSel = 'id, date_added, contact_name, contact_email, contact_phone, form_type, form_name, first_time, clean_source, clean_medium, clean_lead_type';
      const hipaaCallSel = 'id, location_id, date_time, contact_name, contact_phone, source_type, marketing_campaign, referrer, campaign, direction, call_status, duration_seconds, first_time';

      const stdCallsP = standardIds.length
        ? supabase
          .from('ghl_calls_view')
          .select(callSel)
          .in('location_id', standardIds)
          .eq('clean_lead_type', cleanLeadType)
          .gte('date_added', startTs)
          .lte('date_added', endTs)
          .order('date_added', { ascending: false })
          .limit(DRILL_FETCH_LIMIT)
        : Promise.resolve({ data: [], error: null });
      const stdFormsP = standardIds.length
        ? supabase
          .from('ghl_form_submissions_view')
          .select(formSel)
          .in('location_id', standardIds)
          .eq('clean_lead_type', cleanLeadType)
          .gte('date_added', startTs)
          .lte('date_added', endTs)
          .order('date_added', { ascending: false })
          .limit(DRILL_FETCH_LIMIT)
        : Promise.resolve({ data: [], error: null });
      const hipCallsP = hipaaIds.length
        ? supabase
          .from('ghl_hipaa_calls')
          .select(hipaaCallSel)
          .in('location_id', hipaaIds)
          .gte('date_time', startTs)
          .lte('date_time', endTs)
          .order('date_time', { ascending: false })
          .limit(DRILL_FETCH_LIMIT)
        : Promise.resolve({ data: [], error: null });
      const hipFormsP = hipaaIds.length
        ? supabase
          .from('ghl_hipaa_forms')
          .select('id, submission_date, name, email, phone, url')
          .in('location_id', hipaaIds)
          .gte('submission_date', startTs)
          .lte('submission_date', endTs)
          .order('submission_date', { ascending: false })
          .limit(DRILL_FETCH_LIMIT)
        : Promise.resolve({ data: [], error: null });

      const [callsRes, formsRes, hipCallsRes, hipFormsRes] = await Promise.all([
        stdCallsP, stdFormsP, hipCallsP, hipFormsP,
      ]);
      if (callsRes.error) throw callsRes.error;
      if (formsRes.error) throw formsRes.error;
      if (hipCallsRes.error) throw hipCallsRes.error;
      if (hipFormsRes.error) throw hipFormsRes.error;

      const callRows = (callsRes.data || []).map((r) => ({
        ...r,
        _interaction: 'call',
        _sort: new Date(r.date_added).getTime(),
      }));
      const formRows = (formsRes.data || []).map((r) => ({
        ...r,
        _interaction: r.form_type === 'chat_widget' ? 'chat' : 'form',
        _sort: new Date(r.date_added).getTime(),
      }));
      const hipCallRows = (hipCallsRes.data || [])
        .filter((r) => deriveHipaaCallLeadType(r) === cleanLeadType)
        .map((r) => {
          const v = mapHipaaCallRowToView(r);
          return { ...v, _interaction: 'call', _sort: new Date(v.date_added).getTime() };
        });
      const hipFormRows = (hipFormsRes.data || [])
        .filter((r) => deriveHipaaFormLeadType(r) === cleanLeadType)
        .map((r) => {
          const v = mapHipaaFormRowToView(r);
          return { ...v, _interaction: 'form', _sort: new Date(v.date_added).getTime() };
        });
      setDrillRows([...callRows, ...formRows, ...hipCallRows, ...hipFormRows].sort((a, b) => b._sort - a._sort));
    } catch {
      setDrillRows([]);
    } finally {
      setDrillLoading(false);
    }
  }, []);

  const fetchInteractionDetail = useCallback(async (interaction, id) => {
    if (!id) return null;
    if (interaction === 'call') {
      const { data: hipaaRow } = await supabase.from('ghl_hipaa_calls').select('*').eq('id', id).maybeSingle();
      if (hipaaRow) return hipaaRow;
    } else {
      const { data: hipaaRow } = await supabase.from('ghl_hipaa_forms').select('*').eq('id', id).maybeSingle();
      if (hipaaRow) return hipaaRow;
    }
    const table = interaction === 'call' ? 'ghl_calls_view' : 'ghl_form_submissions_view';
    const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
    if (error || !data) return null;
    return data;
  }, []);

  const fetchAttributionByLeadType = useCallback(async (leadType) => {
    const { ids, standardIds, hipaaIds, startTs, endTs } = contextRef.current;
    if (!ids?.length || !startTs || !endTs || !leadType) return;
    setAttributionLoading((p) => ({ ...p, [leadType]: true }));
    try {
      const hipaaCallSel = 'id, location_id, date_time, contact_name, contact_phone, source_type, marketing_campaign, referrer, campaign, direction, call_status, duration_seconds, first_time';
      const stdCallsP = standardIds.length
        ? supabase
          .from('ghl_calls_view')
          .select('id, date_added, contact_name, contact_phone, contact_email, direction, status, duration, first_time, clean_source, clean_medium, clean_lead_type')
          .in('location_id', standardIds)
          .eq('clean_lead_type', leadType)
          .gte('date_added', startTs)
          .lte('date_added', endTs)
          .order('date_added', { ascending: false })
          .limit(ATTRIBUTION_FETCH_LIMIT)
        : Promise.resolve({ data: [], error: null });
      const stdFormsP = standardIds.length
        ? supabase
          .from('ghl_form_submissions_view')
          .select('id, date_added, contact_name, contact_email, contact_phone, form_type, form_name, first_time, clean_source, clean_medium, clean_lead_type')
          .in('location_id', standardIds)
          .eq('clean_lead_type', leadType)
          .gte('date_added', startTs)
          .lte('date_added', endTs)
          .order('date_added', { ascending: false })
          .limit(ATTRIBUTION_FETCH_LIMIT)
        : Promise.resolve({ data: [], error: null });
      const hipCallsP = hipaaIds.length
        ? supabase
          .from('ghl_hipaa_calls')
          .select(hipaaCallSel)
          .in('location_id', hipaaIds)
          .gte('date_time', startTs)
          .lte('date_time', endTs)
          .order('date_time', { ascending: false })
          .limit(ATTRIBUTION_FETCH_LIMIT)
        : Promise.resolve({ data: [], error: null });
      const hipFormsP = hipaaIds.length
        ? supabase
          .from('ghl_hipaa_forms')
          .select('id, submission_date, name, email, phone, url')
          .in('location_id', hipaaIds)
          .gte('submission_date', startTs)
          .lte('submission_date', endTs)
          .order('submission_date', { ascending: false })
          .limit(ATTRIBUTION_FETCH_LIMIT)
        : Promise.resolve({ data: [], error: null });

      const [callsRes, formsRes, hipCallsRes, hipFormsRes] = await Promise.all([
        stdCallsP, stdFormsP, hipCallsP, hipFormsP,
      ]);
      if (callsRes.error) throw callsRes.error;
      if (formsRes.error) throw formsRes.error;
      if (hipCallsRes.error) throw hipCallsRes.error;
      if (hipFormsRes.error) throw hipFormsRes.error;

      const callRows = (callsRes.data || []).map((r) => ({
        ...r,
        _interaction: 'call',
        _sort: new Date(r.date_added).getTime(),
      }));
      const formRows = (formsRes.data || []).map((r) => ({
        ...r,
        _interaction: r.form_type === 'chat_widget' ? 'chat' : 'form',
        _sort: new Date(r.date_added).getTime(),
      }));
      const hipCallRows = (hipCallsRes.data || [])
        .filter((r) => deriveHipaaCallLeadType(r) === leadType)
        .map((r) => {
          const v = mapHipaaCallRowToView(r);
          return { ...v, _interaction: 'call', _sort: new Date(v.date_added).getTime() };
        });
      const hipFormRows = (hipFormsRes.data || [])
        .filter((r) => deriveHipaaFormLeadType(r) === leadType)
        .map((r) => {
          const v = mapHipaaFormRowToView(r);
          return { ...v, _interaction: 'form', _sort: new Date(v.date_added).getTime() };
        });
      const merged = [...callRows, ...formRows, ...hipCallRows, ...hipFormRows].sort((a, b) => b._sort - a._sort);
      setAttributionByType((prev) => ({ ...prev, [leadType]: merged }));
    } catch {
      setAttributionByType((prev) => ({ ...prev, [leadType]: [] }));
    } finally {
      setAttributionLoading((p) => ({ ...p, [leadType]: false }));
    }
  }, []);

  const fetchCore = useCallback(async () => {
    const f = filtersRef.current;
    setLoading(true);
    setError(null);
    setAttributionByType({});
    setDrillRows([]);
    try {
      const { from, to } = computeDateRange(f.datePreset, f.dateFrom, f.dateTo);
      if (!from || !to) {
        setError('Select a valid date range.');
        setLocations([]);
        contextRef.current = {
          ids: [], standardIds: [], hipaaIds: [], from: null, to: null, startTs: '', endTs: '',
          callsFetchMode: 'standard', mergedCallsBuffer: null, mergedFormsBuffer: null,
        };
        setKpis(emptyKpis());
        setCompareKpis(null);
        setActivityDailyRows([]);
        setCallsBySource([]);
        setFormsBySource([]);
        setCallsBySourceCompare([]);
        setFormsBySourceCompare([]);
        setCalls([]);
        setCallsTotal(0);
        setFormSubmissions([]);
        setFormSubmissionsTotal(0);
        setChatWidgets([]);
        setChatWidgetsTotal(0);
        setLeadsBySource([]);
        setDailyLeadBreakdown([]);
        return;
      }

      const { options, ids } = await resolveLocationContext(f.locationId);
      setLocations(options);

      const startTs = `${from}T00:00:00`;
      const endTs = `${to}T23:59:59.999`;
      const hipaaIds = ids.filter((id) => options.find((o) => o.id === id)?.hipaa_compliant);
      const standardIds = ids.filter((id) => !options.find((o) => o.id === id)?.hipaa_compliant);

      let callsFetchMode = 'standard';
      let mergedCallsBuffer = null;
      let mergedFormsBuffer = null;
      if (hipaaIds.length && standardIds.length) {
        callsFetchMode = 'merged';
        const [stdC, hipC] = await Promise.all([
          supabase
            .from('ghl_calls_view')
            .select('id, date_added, contact_name, contact_phone, contact_email, direction, status, duration, first_time, clean_source, clean_medium, clean_lead_type')
            .in('location_id', standardIds)
            .gte('date_added', startTs)
            .lte('date_added', endTs)
            .order('date_added', { ascending: false })
            .limit(MERGED_FETCH_LIMIT),
          supabase
            .from('ghl_hipaa_calls')
            .select('id, location_id, date_time, contact_name, contact_phone, source_type, marketing_campaign, referrer, campaign, direction, call_status, duration_seconds, first_time')
            .in('location_id', hipaaIds)
            .gte('date_time', startTs)
            .lte('date_time', endTs)
            .order('date_time', { ascending: false })
            .limit(MERGED_FETCH_LIMIT),
        ]);
        if (stdC.error) throw stdC.error;
        if (hipC.error) throw hipC.error;
        const stdRows = stdC.data || [];
        const hipRows = (hipC.data || []).map(mapHipaaCallRowToView);
        mergedCallsBuffer = [...stdRows, ...hipRows]
          .sort((a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime())
          .slice(0, MERGED_FETCH_LIMIT);
        const [stdF, hipF] = await Promise.all([
          supabase
            .from('ghl_form_submissions_view')
            .select('id, date_added, contact_name, contact_email, contact_phone, form_type, form_name, clean_source, clean_medium, clean_lead_type')
            .in('location_id', standardIds)
            .eq('form_type', 'form_submission')
            .gte('date_added', startTs)
            .lte('date_added', endTs)
            .order('date_added', { ascending: false })
            .limit(MERGED_FETCH_LIMIT),
          supabase
            .from('ghl_hipaa_forms')
            .select('id, submission_date, name, email, phone, url')
            .in('location_id', hipaaIds)
            .gte('submission_date', startTs)
            .lte('submission_date', endTs)
            .order('submission_date', { ascending: false })
            .limit(MERGED_FETCH_LIMIT),
        ]);
        if (stdF.error) throw stdF.error;
        if (hipF.error) throw hipF.error;
        const stdFormRows = stdF.data || [];
        const hipFormRows = (hipF.data || []).map(mapHipaaFormRowToView);
        mergedFormsBuffer = [...stdFormRows, ...hipFormRows]
          .sort((a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime())
          .slice(0, MERGED_FETCH_LIMIT);
      } else if (hipaaIds.length) {
        callsFetchMode = 'hipaa';
      }

      contextRef.current = {
        ids,
        standardIds,
        hipaaIds,
        from,
        to,
        startTs,
        endTs,
        callsFetchMode,
        mergedCallsBuffer,
        mergedFormsBuffer,
      };

      if (ids.length === 0) {
        setKpis(emptyKpis());
        setCompareKpis(null);
        setActivityDailyRows([]);
        setCallsBySource([]);
        setFormsBySource([]);
        setCallsBySourceCompare([]);
        setFormsBySourceCompare([]);
        setCalls([]);
        setCallsTotal(0);
        setFormSubmissions([]);
        setFormSubmissionsTotal(0);
        setChatWidgets([]);
        setChatWidgetsTotal(0);
        setLeadsBySource([]);
        setDailyLeadBreakdown([]);
        return;
      }

      let activityRows = [];
      if (standardIds.length) {
        const activityRes = await supabase
          .from('ghl_activity_daily')
          .select('*')
          .in('location_id', standardIds)
          .gte('report_date', from)
          .lte('report_date', to);
        if (activityRes.error) throw activityRes.error;
        activityRows = activityRes.data || [];
      }
      if (hipaaIds.length) {
        const synth = await fetchHipaaSyntheticActivity(hipaaIds, from, to);
        activityRows = [...activityRows, ...synth];
      }

      const kpiPromise = fetchKpiBundleMerged(standardIds, hipaaIds, from, to);
      const [kpiData, callsStd, formsStd, callsHip, formsHip] = await Promise.all([
        kpiPromise,
        standardIds.length ? aggregateCallsByLeadType(standardIds, startTs, endTs) : Promise.resolve([]),
        standardIds.length ? aggregateFormsByLeadType(standardIds, startTs, endTs) : Promise.resolve([]),
        hipaaIds.length ? aggregateHipaaCallsByLeadType(hipaaIds, startTs, endTs) : Promise.resolve([]),
        hipaaIds.length ? aggregateHipaaFormsByLeadType(hipaaIds, startTs, endTs) : Promise.resolve([]),
      ]);

      const callsAgg = mergeCallAggRows(callsStd, callsHip);
      const formsAgg = mergeFormAggRows(formsStd, formsHip);

      setKpis(kpiData);
      setActivityDailyRows(activityRows);
      setCallsBySource(callsAgg);
      setFormsBySource(formsAgg);

      const breakdown = await buildDailyLeadBreakdown(standardIds, hipaaIds, from, to);
      setDailyLeadBreakdown(breakdown);

      if (f.compareOn) {
        let cFrom = f.compareFrom;
        let cTo = f.compareTo;
        if (!cFrom || !cTo) {
          const prev = computePreviousPeriod(from, to);
          cFrom = prev.from;
          cTo = prev.to;
        }
        if (cFrom && cTo) {
          const cStartTs = `${cFrom}T00:00:00`;
          const cEndTs = `${cTo}T23:59:59.999`;
          try {
            const [prevKpis, callsStdP, formsStdP, callsHipP, formsHipP] = await Promise.all([
              fetchKpiBundleMerged(standardIds, hipaaIds, cFrom, cTo),
              standardIds.length ? aggregateCallsByLeadType(standardIds, cStartTs, cEndTs) : Promise.resolve([]),
              standardIds.length ? aggregateFormsByLeadType(standardIds, cStartTs, cEndTs) : Promise.resolve([]),
              hipaaIds.length ? aggregateHipaaCallsByLeadType(hipaaIds, cStartTs, cEndTs) : Promise.resolve([]),
              hipaaIds.length ? aggregateHipaaFormsByLeadType(hipaaIds, cStartTs, cEndTs) : Promise.resolve([]),
            ]);
            setCompareKpis(prevKpis);
            setCallsBySourceCompare(mergeCallAggRows(callsStdP, callsHipP));
            setFormsBySourceCompare(mergeFormAggRows(formsStdP, formsHipP));
          } catch {
            setCompareKpis(null);
            setCallsBySourceCompare([]);
            setFormsBySourceCompare([]);
          }
        } else {
          setCompareKpis(null);
          setCallsBySourceCompare([]);
          setFormsBySourceCompare([]);
        }
      } else {
        setCompareKpis(null);
        setCallsBySourceCompare([]);
        setFormsBySourceCompare([]);
      }

      await aggregateContactsBySource(standardIds, hipaaIds, from, to);
    } catch (e) {
      setError(e?.message || 'Failed to load GHL data');
      contextRef.current = {
        ids: [], standardIds: [], hipaaIds: [], from: null, to: null, startTs: '', endTs: '',
        callsFetchMode: 'standard', mergedCallsBuffer: null, mergedFormsBuffer: null,
      };
      setKpis(emptyKpis());
      setCompareKpis(null);
      setActivityDailyRows([]);
      setCallsBySource([]);
      setFormsBySource([]);
      setCallsBySourceCompare([]);
      setFormsBySourceCompare([]);
      setCalls([]);
      setCallsTotal(0);
      setFormSubmissions([]);
      setFormSubmissionsTotal(0);
      setChatWidgets([]);
      setChatWidgetsTotal(0);
      setLeadsBySource([]);
      setDailyLeadBreakdown([]);
    } finally {
      setLoading(false);
    }
  }, [resolveLocationContext, aggregateContactsBySource]);

  useEffect(() => {
    fetchCore();
  }, [fetchCore, activeAgencyId, canViewAllCustomers, scopeAgencyId, allowedGhlKey]);

  useEffect(() => {
    if (loading) return;
    fetchCallsPage();
  }, [callsPage, loading, fetchCallsPage]);

  useEffect(() => {
    if (loading) return;
    fetchFormSubmissionsPage();
  }, [formSubmissionsPage, loading, fetchFormSubmissionsPage]);

  useEffect(() => {
    if (loading) return;
    fetchChatWidgetsPage();
  }, [chatWidgetsPage, loading, fetchChatWidgetsPage]);

  const dailyChart = useMemo(() => {
    const f = filtersRef.current;
    const { from, to } = computeDateRange(f.datePreset, f.dateFrom, f.dateTo);
    const labels = enumerateDates(from, to);
    const callsByDate = new Map();
    const formsByDate = new Map();
    const chatByDate = new Map();
    labels.forEach((d) => {
      callsByDate.set(d, 0);
      formsByDate.set(d, 0);
      chatByDate.set(d, 0);
    });
    activityDailyRows.forEach((row) => {
      const d = String(row.report_date || '').slice(0, 10);
      if (!d) return;
      const at = String(row.activity_type || '');
      const st = String(row.subtype || '');
      const n = Number(row.total_count) || 0;
      if (at.startsWith('call_')) {
        callsByDate.set(d, (callsByDate.get(d) || 0) + n);
      } else if (at === 'form' && st === 'form_submission') {
        formsByDate.set(d, (formsByDate.get(d) || 0) + n);
      } else if (at === 'form' && st === 'chat_widget') {
        chatByDate.set(d, (chatByDate.get(d) || 0) + n);
      }
    });
    return {
      labels,
      calls: labels.map((d) => callsByDate.get(d) || 0),
      forms: labels.map((d) => formsByDate.get(d) || 0),
      chat: labels.map((d) => chatByDate.get(d) || 0),
    };
  }, [activityDailyRows, filters.datePreset, filters.dateFrom, filters.dateTo]);

  const donutSegments = useMemo(() => {
    const order = ['google_ads', 'organic', 'direct', 'referral', 'facebook_ads', 'unknown'];
    const counts = new Map();
    order.forEach((k) => counts.set(k, 0));
    callsBySource.forEach((r) => {
      const k = order.includes(r.clean_lead_type) ? r.clean_lead_type : 'unknown';
      counts.set(k, (counts.get(k) || 0) + r.count);
    });
    formsBySource.forEach((r) => {
      const k = order.includes(r.clean_lead_type) ? r.clean_lead_type : 'unknown';
      counts.set(k, (counts.get(k) || 0) + r.count);
    });
    return order.map((key) => ({ key, value: counts.get(key) || 0 })).filter((s) => s.value > 0);
  }, [callsBySource, formsBySource]);

  const leadTypesPresent = useMemo(() => {
    const set = new Set();
    callsBySource.forEach((r) => { if (r.count) set.add(r.clean_lead_type); });
    formsBySource.forEach((r) => { if (r.count) set.add(r.clean_lead_type); });
    const preferred = ['google_ads', 'organic', 'direct', 'referral', 'facebook_ads'];
    const out = preferred.filter((t) => set.has(t));
    [...set].filter((t) => !preferred.includes(t)).sort().forEach((t) => out.push(t));
    return out;
  }, [callsBySource, formsBySource]);

  const setCallsPageSafe = useCallback((p) => {
    setCallsPage(Math.max(1, p));
  }, []);

  const setFormSubmissionsPageSafe = useCallback((p) => {
    setFormSubmissionsPage(Math.max(1, p));
  }, []);

  const setChatWidgetsPageSafe = useCallback((p) => {
    setChatWidgetsPage(Math.max(1, p));
  }, []);

  const clearAttributionDrill = useCallback(() => {
    setDrillRows([]);
    setDrillLoading(false);
  }, []);

  const handleApply = useCallback(() => {
    setCallsPage(1);
    setFormSubmissionsPage(1);
    setChatWidgetsPage(1);
    setTimeout(() => fetchCore(), 0);
  }, [fetchCore]);

  const handleDateApply = useCallback(
    (payload) => {
      batchUpdateFilters({
        datePreset: payload.preset,
        dateFrom: payload.dateFrom || '',
        dateTo: payload.dateTo || '',
        compareOn: !!payload.compareOn,
        compareFrom: payload.compareFrom || '',
        compareTo: payload.compareTo || '',
      });
      setCallsPage(1);
      setFormSubmissionsPage(1);
      setChatWidgetsPage(1);
      setTimeout(() => fetchCore(), 30);
    },
    [batchUpdateFilters, fetchCore],
  );

  const callsPagination = useMemo(() => {
    const pages = Math.max(1, Math.ceil(callsTotal / PAGE_SIZE));
    return { page: callsPage, pages, total: callsTotal, pageSize: PAGE_SIZE };
  }, [callsPage, callsTotal]);

  const formSubmissionsPagination = useMemo(() => {
    const pages = Math.max(1, Math.ceil(formSubmissionsTotal / PAGE_SIZE));
    return { page: formSubmissionsPage, pages, total: formSubmissionsTotal, pageSize: PAGE_SIZE };
  }, [formSubmissionsPage, formSubmissionsTotal]);

  const chatWidgetsPagination = useMemo(() => {
    const pages = Math.max(1, Math.ceil(chatWidgetsTotal / PAGE_SIZE));
    return { page: chatWidgetsPage, pages, total: chatWidgetsTotal, pageSize: PAGE_SIZE };
  }, [chatWidgetsPage, chatWidgetsTotal]);

  /** Same buckets as the donut; optional prior-period counts when compare is on. */
  const leadSourceAttributionRows = useMemo(() => {
    const order = ['google_ads', 'organic', 'direct', 'referral', 'facebook_ads', 'unknown'];
    const counts = new Map();
    const countsPrev = new Map();
    order.forEach((k) => {
      counts.set(k, 0);
      countsPrev.set(k, 0);
    });
    callsBySource.forEach((r) => {
      const k = order.includes(r.clean_lead_type) ? r.clean_lead_type : 'unknown';
      counts.set(k, (counts.get(k) || 0) + r.count);
    });
    formsBySource.forEach((r) => {
      const k = order.includes(r.clean_lead_type) ? r.clean_lead_type : 'unknown';
      counts.set(k, (counts.get(k) || 0) + r.count);
    });
    const compareOn = !!filtersRef.current.compareOn;
    if (compareOn) {
      callsBySourceCompare.forEach((r) => {
        const k = order.includes(r.clean_lead_type) ? r.clean_lead_type : 'unknown';
        countsPrev.set(k, (countsPrev.get(k) || 0) + r.count);
      });
      formsBySourceCompare.forEach((r) => {
        const k = order.includes(r.clean_lead_type) ? r.clean_lead_type : 'unknown';
        countsPrev.set(k, (countsPrev.get(k) || 0) + r.count);
      });
    }
    return order
      .map((clean_lead_type) => ({
        clean_lead_type,
        leads: counts.get(clean_lead_type) || 0,
        leadsPrev: compareOn ? countsPrev.get(clean_lead_type) || 0 : null,
      }))
      .filter((row) => row.leads > 0 || (compareOn && (row.leadsPrev ?? 0) > 0));
  }, [callsBySource, formsBySource, callsBySourceCompare, formsBySourceCompare, filters.compareOn]);

  const summaryForLeadType = useCallback(
    (leadType) => {
      const c = callsBySource.find((x) => x.clean_lead_type === leadType);
      const forms = formsBySource.filter((x) => x.clean_lead_type === leadType);
      let formSub = 0;
      let chat = 0;
      forms.forEach((f) => {
        if (f.form_type === 'form_submission') formSub += f.count;
        if (f.form_type === 'chat_widget') chat += f.count;
      });
      const callsCount = c?.count ?? 0;
      const durSec = c?.durationSumSeconds ?? 0;
      return {
        calls: callsCount,
        forms: formSub,
        chat,
        durationMinutes: Math.round(durSec / 60),
        totalLeads: callsCount + formSub + chat,
      };
    },
    [callsBySource, formsBySource],
  );

  return {
    filters,
    updateFilter,
    batchUpdateFilters,
    locations,
    hasLocations: locations.length > 0,
    loading,
    error,
    kpis,
    compareKpis,
    dailyChart,
    donutSegments,
    callsBySource,
    formsBySource,
    leadTypesPresent,
    activityDailyRows,
    dailyLeadBreakdown,
    calls,
    formSubmissions,
    chatWidgets,
    leadsBySource,
    leadSourceAttributionRows,
    callsPagination,
    formSubmissionsPagination,
    chatWidgetsPagination,
    setCallsPage: setCallsPageSafe,
    setFormSubmissionsPage: setFormSubmissionsPageSafe,
    setChatWidgetsPage: setChatWidgetsPageSafe,
    fetchData: fetchCore,
    handleApply,
    handleDateApply,
    fetchAttributionByLeadType,
    attributionByType,
    attributionLoading,
    summaryForLeadType,
    loadAttributionDrillForLeadType,
    drillRows,
    drillLoading,
    clearAttributionDrill,
    fetchInteractionDetail,
  };
}
