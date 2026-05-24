import { supabase } from '../lib/supabaseClient';
import {
  momChange,
  formatChangePct,
  fU,
  fI,
  fP,
  fDur,
  formatMonthLabel,
  formatShortMonthLabel,
  formatBounceRate,
} from './monthlyReportHelpers';

function num(v) {
  return Number(v) || 0;
}

/** GA4 Data API property id (digits only; strips `properties/123` if stored that way). */
export function normalizeGa4PropertyId(id) {
  if (id == null || id === '') return '';
  const s = String(id).trim();
  const m = s.match(/properties\/(\d+)/i);
  return m ? m[1] : s;
}

function getAccountIds(accounts, platform) {
  return (accounts || [])
    .filter((a) => a.client_platform_accounts?.platform === platform)
    .map((a) => {
      const raw = a.client_platform_accounts.platform_customer_id;
      return platform === 'ga4' ? normalizeGa4PropertyId(raw) : raw;
    })
    .filter(Boolean);
}

async function ga4InvokeErrorMessage(error, data) {
  if (data?.error) return String(data.error);
  if (data?.detail) {
    return typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail).slice(0, 300);
  }
  if (error?.context && typeof error.context.json === 'function') {
    try {
      const body = await error.context.json();
      if (body?.error) return String(body.error);
      if (body?.detail) return typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail).slice(0, 300);
    } catch {
      /* ignore parse errors */
    }
  }
  return error?.message || 'GA4 edge function request failed';
}

async function fetchGadsTotals(customerIds, from, to) {
  if (!customerIds.length) return { cost: 0, clicks: 0, conversions: 0, impressions: 0 };
  const { data } = await supabase
    .from('gads_campaign_daily')
    .select('cost, clicks, conversions, impressions')
    .in('customer_id', customerIds)
    .gte('date', from)
    .lte('date', to);
  let cost = 0, clicks = 0, conversions = 0, impressions = 0;
  (data || []).forEach((r) => {
    cost += num(r.cost);
    clicks += num(r.clicks);
    conversions += num(r.conversions);
    impressions += num(r.impressions);
  });
  return { cost, clicks, conversions, impressions };
}

/**
 * Call ga4-realtime-users edge function (matches deployed handler: success + current/previous arrays).
 * On failure returns { success: false, error, current: [], previous: [] } so callers can surface the message.
 */
export async function invokeGa4Realtime(customerId, body) {
  const propertyId = normalizeGa4PropertyId(customerId);
  const requestBody = {
    ...body,
    customer_id: propertyId,
    date_from: body.date_from,
    date_to: body.date_to,
    breakdown: body.breakdown || 'none',
  };
  if (body.compare_date_from && body.compare_date_to) {
    requestBody.compare_date_from = body.compare_date_from;
    requestBody.compare_date_to = body.compare_date_to;
  }

  const { data: { session } } = await supabase.auth.getSession();
  const headers = session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : undefined;

  const { data, error } = await supabase.functions.invoke('ga4-realtime-users', {
    body: requestBody,
    headers,
  });

  const apiError = error || data?.error
    ? await ga4InvokeErrorMessage(error, data)
    : null;

  const debugEntry = {
    at: new Date().toISOString(),
    customerId: propertyId,
    breakdown: requestBody.breakdown,
    date_from: requestBody.date_from,
    date_to: requestBody.date_to,
    compare_date_from: requestBody.compare_date_from || null,
    compare_date_to: requestBody.compare_date_to || null,
    httpError: error?.message || null,
    success: data?.success,
    currentRows: Array.isArray(data?.current) ? data.current.length : 0,
    previousRows: Array.isArray(data?.previous) ? data.previous.length : 0,
    row_count: data?.row_count || null,
    apiError,
    sampleCurrent: data?.current?.[0] || null,
    samplePrevious: data?.previous?.[0] || null,
  };

  if (import.meta.env.DEV && typeof window !== 'undefined') {
    window.__ga4RealtimeLast = debugEntry;
    if (!window.__ga4RealtimeLog) window.__ga4RealtimeLog = [];
    window.__ga4RealtimeLog.push(debugEntry);
  }

  if (apiError) {
    console.warn('[GA4] ga4-realtime-users failed:', apiError, debugEntry);
    return { success: false, error: apiError, current: [], previous: [] };
  }

  if (!data || typeof data !== 'object') {
    const msg = 'Empty response from ga4-realtime-users';
    console.warn('[GA4]', msg, debugEntry);
    return { success: false, error: msg, current: [], previous: [] };
  }

  if (data.success === true && !data.current?.length && !data.previous?.length) {
    console.info('[GA4] ga4-realtime-users OK but no rows for range', debugEntry);
  }

  return {
    success: data.success !== false,
    error: null,
    current: Array.isArray(data.current) ? data.current : [],
    previous: Array.isArray(data.previous) ? data.previous : [],
    row_count: data.row_count,
  };
}

function firstGa4InvokeError(responses) {
  const failed = (responses || []).find((p) => p?.error);
  return failed?.error || null;
}

/** Session-weighted GA4 aggregates (bounce 0–1, duration in seconds). */
function aggregateGa4MetricRows(rows) {
  let users = 0;
  let sessions = 0;
  let pageViews = 0;
  let bounceWeighted = 0;
  let durationWeighted = 0;
  (rows || []).forEach((row) => {
    if (!row) return;
    const s = num(row.sessions);
    users += num(row.total_users);
    sessions += s;
    pageViews += num(row.screen_page_views);
    if (row.bounce_rate != null && s) bounceWeighted += num(row.bounce_rate) * s;
    if (row.avg_session_duration != null && s) durationWeighted += num(row.avg_session_duration) * s;
  });
  return {
    users,
    sessions,
    pageViews,
    pagesPerSession: sessions ? pageViews / sessions : 0,
    bounceRate: sessions ? bounceWeighted / sessions : 0,
    avgSessionDuration: sessions ? durationWeighted / sessions : 0,
  };
}

function aggregateGa4TotalRows(rows) {
  return aggregateGa4MetricRows(rows);
}

function isGoogleCpcRow(row) {
  const src = String(row.source || '').toLowerCase().trim();
  const med = String(row.medium || '').toLowerCase().trim();
  const sm = String(row.source_medium || '').toLowerCase().replace(/\s+/g, ' ');
  return (
    (src === 'google' && med === 'cpc')
    || sm === 'google / cpc'
    || sm === 'google/cpc'
  );
}

function isOrganicSearchRow(row) {
  const ch = String(row.channel_group || '').toLowerCase();
  const src = String(row.source || '').toLowerCase().trim();
  const med = String(row.medium || '').toLowerCase().trim();
  return (
    ch.includes('organic search')
    || (src === 'google' && med === 'organic')
    || med === 'organic'
  );
}

/** Live GA4 totals via edge function (current + previous in one call per property). */
async function fetchGa4TotalsPair(customerIds, currentFrom, currentTo, prevFrom, prevTo) {
  if (!customerIds.length) {
    const empty = { users: 0, sessions: 0, pageViews: 0, bounceRate: 0, avgSessionDuration: 0, pagesPerSession: 0 };
    return { current: empty, previous: empty, rawRows: [] };
  }
  const responses = await Promise.all(
    customerIds.map((customer_id) =>
      invokeGa4Realtime(customer_id, {
        date_from: currentFrom,
        date_to: currentTo,
        compare_date_from: prevFrom,
        compare_date_to: prevTo,
        breakdown: 'none',
      }),
    ),
  );
  const err = firstGa4InvokeError(responses);
  const currentRows = [];
  const previousRows = [];
  responses.forEach((payload) => {
    if (payload?.current?.[0]) currentRows.push(payload.current[0]);
    if (payload?.previous?.[0]) previousRows.push(payload.previous[0]);
  });
  if (err && !currentRows.length && !previousRows.length) {
    throw new Error(`GA4 (${customerIds.join(', ')}): ${err}`);
  }
  return {
    current: aggregateGa4TotalRows(currentRows),
    previous: aggregateGa4TotalRows(previousRows),
    rawRows: currentRows,
  };
}

/** Slide 7: overall from property totals; paid = google/cpc; organic = organic search. */
async function fetchGa4SearchOverviewMetrics(customerIds, from, to, overallTotals) {
  const empty = {
    users: 0,
    sessions: 0,
    pageViews: 0,
    pagesPerSession: 0,
    bounceRate: 0,
    avgSessionDuration: 0,
  };
  if (!customerIds.length) {
    return { overall: empty, paid: empty, organic: empty };
  }

  const responses = await Promise.all(
    customerIds.map((customer_id) =>
      invokeGa4Realtime(customer_id, {
        date_from: from,
        date_to: to,
        breakdown: 'source_medium',
      }),
    ),
  );
  const smErr = firstGa4InvokeError(responses);
  if (smErr && responses.every((p) => !(p?.current?.length))) {
    console.warn('[GA4] source_medium breakdown failed:', smErr);
  }

  const sourceRows = [];
  responses.forEach((payload) => {
    sourceRows.push(...(payload?.current || []));
  });

  const paidRows = sourceRows.filter(isGoogleCpcRow);
  const organicRows = sourceRows.filter(isOrganicSearchRow);

  const overall = {
    users: num(overallTotals?.users),
    sessions: num(overallTotals?.sessions),
    pageViews: num(overallTotals?.pageViews),
    pagesPerSession: overallTotals?.sessions
      ? num(overallTotals.pageViews) / num(overallTotals.sessions)
      : 0,
    bounceRate: num(overallTotals?.bounceRate),
    avgSessionDuration: num(overallTotals?.avgSessionDuration),
  };

  return {
    overall,
    paid: aggregateGa4MetricRows(paidRows),
    organic: aggregateGa4MetricRows(organicRows),
  };
}

async function fetchTopKeywords(customerIds, from, to, limit = 10) {
  if (!customerIds.length) return [];
  const { data } = await supabase
    .from('gads_keyword_daily')
    .select('keyword_text, cost, conversions, clicks')
    .in('customer_id', customerIds)
    .gte('date', from)
    .lte('date', to);

  const map = new Map();
  (data || []).forEach((r) => {
    const key = r.keyword_text || 'Unknown';
    if (!map.has(key)) map.set(key, { keyword_text: key, cost: 0, conversions: 0, clicks: 0 });
    const a = map.get(key);
    a.cost += num(r.cost);
    a.conversions += num(r.conversions);
    a.clicks += num(r.clicks);
  });
  return [...map.values()].sort((a, b) => b.conversions - a.conversions || b.cost - a.cost).slice(0, limit);
}

async function fetchGhlLeadRows(accounts, from, to, prevFrom, prevTo) {
  const rows = [];
  for (const acc of accounts || []) {
    const cpa = acc.client_platform_accounts;
    if (!cpa || cpa.platform !== 'ghl') continue;
    const cid = cpa.platform_customer_id;
    const label = acc.label || cpa.account_name || cid;
    const startTs = `${from}T00:00:00`;
    const endTs = `${to}T23:59:59.999`;
    const prevStartTs = `${prevFrom}T00:00:00`;
    const prevEndTs = `${prevTo}T23:59:59.999`;

    const [calls, forms, chat, prevCalls, prevForms, prevChat] = await Promise.all([
      supabase.from('ghl_calls_view').select('*', { count: 'exact', head: true }).eq('location_id', cid).gte('date_added', startTs).lte('date_added', endTs),
      supabase.from('ghl_form_submissions_view').select('*', { count: 'exact', head: true }).eq('location_id', cid).eq('form_type', 'form_submission').gte('date_added', startTs).lte('date_added', endTs),
      supabase.from('ghl_form_submissions_view').select('*', { count: 'exact', head: true }).eq('location_id', cid).eq('form_type', 'chat_widget').gte('date_added', startTs).lte('date_added', endTs),
      supabase.from('ghl_calls_view').select('*', { count: 'exact', head: true }).eq('location_id', cid).gte('date_added', prevStartTs).lte('date_added', prevEndTs),
      supabase.from('ghl_form_submissions_view').select('*', { count: 'exact', head: true }).eq('location_id', cid).eq('form_type', 'form_submission').gte('date_added', prevStartTs).lte('date_added', prevEndTs),
      supabase.from('ghl_form_submissions_view').select('*', { count: 'exact', head: true }).eq('location_id', cid).eq('form_type', 'chat_widget').gte('date_added', prevStartTs).lte('date_added', prevEndTs),
    ]);

    rows.push({
      location: label,
      callCurrent: calls.count || 0,
      formsCurrent: forms.count || 0,
      chatCurrent: chat.count || 0,
      callPrevious: prevCalls.count || 0,
      formsPrevious: prevForms.count || 0,
      chatPrevious: prevChat.count || 0,
    });
  }
  return rows;
}

function buildSlide5(current, previous, currentLabel, previousLabel) {
  const cpc = current.clicks ? current.cost / current.clicks : 0;
  const prevCpc = previous.clicks ? previous.cost / previous.clicks : 0;
  const cpl = current.conversions ? current.cost / current.conversions : 0;
  const prevCpl = previous.conversions ? previous.cost / previous.conversions : 0;

  const rows = [
    { metric: 'Clicks', cur: current.clicks, prev: previous.clicks, lowerIsBetter: false },
    { metric: 'Conversions', cur: current.conversions, prev: previous.conversions, lowerIsBetter: false },
    { metric: 'Avg. CPC', cur: cpc, prev: prevCpc, lowerIsBetter: true, fmt: fU },
    { metric: 'Cost/Lead', cur: cpl, prev: prevCpl, lowerIsBetter: true, fmt: fU },
  ];

  return {
    comparisonSubtitle: `${currentLabel} vs ${previousLabel} cost and conversion analysis`,
    currentLabel,
    previousLabel,
    topStats: [
      { label: 'Total Cost', value: fU(current.cost) },
      { label: 'Total Clicks', value: fI(current.clicks) },
      { label: 'Conversions', value: fI(current.conversions) },
      { label: 'Cost/Lead', value: fU(cpl) },
    ],
    table: rows.map((r) => {
      const pct = momChange(r.cur, r.prev);
      const ch = formatChangePct(pct, r.lowerIsBetter);
      const fmt = r.fmt || fI;
      return {
        metric: r.metric,
        current: fmt(r.cur),
        previous: fmt(r.prev),
        change: ch.text,
        positive: ch.positive,
      };
    }),
    raw: { current, previous },
  };
}

function buildSlide6(currentGa4, prevGa4, currentGads, prevGads, currentLabel, previousLabel) {
  const curCost = currentGads.cost;
  const prevCost = prevGads.cost;
  const curConv = currentGads.conversions;
  const prevConv = prevGads.conversions;
  const curCpl = curConv ? curCost / curConv : 0;
  const prevCpl = prevConv ? prevCost / prevConv : 0;

  const current = {
    label: currentLabel,
    tag: 'Current Month',
    users: fI(currentGa4.users),
    sessions: fI(currentGa4.sessions),
    views: fI(currentGa4.pageViews),
    cost: fU(curCost),
    conversions: fI(curConv),
    costLead: fU(curCpl),
  };
  const previous = {
    label: previousLabel,
    tag: 'Previous Month',
    users: fI(prevGa4.users),
    sessions: fI(prevGa4.sessions),
    views: fI(prevGa4.pageViews),
    cost: fU(prevCost),
    conversions: fI(prevConv),
    costLead: fU(prevCpl),
  };

  const metrics = [
    { name: 'Total Users', cur: currentGa4.users, prev: prevGa4.users, lowerIsBetter: false },
    { name: 'Sessions', cur: currentGa4.sessions, prev: prevGa4.sessions, lowerIsBetter: false },
    { name: 'Page Views', cur: currentGa4.pageViews, prev: prevGa4.pageViews, lowerIsBetter: false },
    { name: 'Cost', cur: curCost, prev: prevCost, lowerIsBetter: true, fmt: fU },
    { name: 'Conversions', cur: curConv, prev: prevConv, lowerIsBetter: false },
    { name: 'Cost/Lead', cur: curCpl, prev: prevCpl, lowerIsBetter: true, fmt: fU },
  ];

  const table = metrics.map((m) => {
    const pct = momChange(m.cur, m.prev);
    const ch = formatChangePct(pct, m.lowerIsBetter);
    const fmt = m.fmt || fI;
    return {
      metric: m.name,
      current: fmt(m.cur),
      previous: fmt(m.prev),
      change: ch.text,
      status: pct >= 0 ? 'Increase' : 'Decrease',
      positive: ch.positive,
    };
  });

  return { current, previous, table };
}

function buildSlide7(channels) {
  const pct = (paid, overall) => (overall ? fP((paid / overall) * 100) : '—');
  const fmtNum = (v, d = 0) => (d ? Number(v).toFixed(2) : fI(v));
  const seg = (key) => channels[key] || {};

  const rows = [
    {
      metric: 'Total Users',
      overall: fmtNum(seg('overall').users),
      paid: fmtNum(seg('paid').users),
      organic: fmtNum(seg('organic').users),
      paidPct: pct(seg('paid').users, seg('overall').users),
      organicPct: pct(seg('organic').users, seg('overall').users),
    },
    {
      metric: 'Sessions',
      overall: fmtNum(seg('overall').sessions),
      paid: fmtNum(seg('paid').sessions),
      organic: fmtNum(seg('organic').sessions),
      paidPct: pct(seg('paid').sessions, seg('overall').sessions),
      organicPct: pct(seg('organic').sessions, seg('overall').sessions),
    },
    {
      metric: 'Views',
      overall: fmtNum(seg('overall').pageViews),
      paid: fmtNum(seg('paid').pageViews),
      organic: fmtNum(seg('organic').pageViews),
      paidPct: pct(seg('paid').pageViews, seg('overall').pageViews),
      organicPct: pct(seg('organic').pageViews, seg('overall').pageViews),
    },
    {
      metric: 'Pages/Session',
      overall: fmtNum(seg('overall').pagesPerSession, 2),
      paid: fmtNum(seg('paid').pagesPerSession, 2),
      organic: fmtNum(seg('organic').pagesPerSession, 2),
      paidPct: '—',
      organicPct: '—',
    },
    {
      metric: 'Bounce Rate',
      overall: formatBounceRate(seg('overall').bounceRate),
      paid: formatBounceRate(seg('paid').bounceRate),
      organic: formatBounceRate(seg('organic').bounceRate),
      paidPct: '—',
      organicPct: '—',
    },
    {
      metric: 'Avg Time on Site',
      overall: fDur(seg('overall').avgSessionDuration),
      paid: fDur(seg('paid').avgSessionDuration),
      organic: fDur(seg('organic').avgSessionDuration),
      paidPct: '—',
      organicPct: '—',
    },
  ];
  return { table: rows };
}

export async function buildMonthlySlideData(accounts, dateRanges) {
  const { currentFrom, currentTo, prevFrom, prevTo } = dateRanges;
  const currentLabel = formatMonthLabel(currentFrom);
  const previousLabel = formatMonthLabel(prevFrom);

  const gadsIds = getAccountIds(accounts, 'google_ads');
  const ga4Ids = getAccountIds(accounts, 'ga4');
  const ghlAccounts = (accounts || []).filter((a) => a.client_platform_accounts?.platform === 'ghl');

  if (import.meta.env.DEV) {
    console.info('[GA4] buildMonthlySlideData', {
      ga4PropertyIds: ga4Ids,
      currentFrom,
      currentTo,
      prevFrom,
      prevTo,
    });
    if (!ga4Ids.length) {
      console.warn('[GA4] No GA4 accounts linked on this report — slides 6/7 will show zeros.');
    }
  }

  const [
    curGads,
    prevGads,
    ga4Totals,
    keywords,
    ghlRows,
  ] = await Promise.all([
    fetchGadsTotals(gadsIds, currentFrom, currentTo),
    fetchGadsTotals(gadsIds, prevFrom, prevTo),
    fetchGa4TotalsPair(ga4Ids, currentFrom, currentTo, prevFrom, prevTo),
    fetchTopKeywords(gadsIds, currentFrom, currentTo),
    fetchGhlLeadRows(ghlAccounts, currentFrom, currentTo, prevFrom, prevTo),
  ]);
  const curGa4 = ga4Totals.current;
  const prevGa4 = ga4Totals.previous;
  const channels = await fetchGa4SearchOverviewMetrics(ga4Ids, currentFrom, currentTo, curGa4);

  if (import.meta.env.DEV && ga4Ids.length) {
    console.info('[GA4] Slide 6 mapping (edge current → Apr card, previous → Mar card)', {
      currentPeriod: `${currentFrom} → ${currentTo}`,
      previousPeriod: `${prevFrom} → ${prevTo}`,
      aprilCard: { users: curGa4.users, sessions: curGa4.sessions, pageViews: curGa4.pageViews },
      marchCard: { users: prevGa4.users, sessions: prevGa4.sessions, pageViews: prevGa4.pageViews },
      rawCurrentRow: ga4Totals.rawRows?.[0] || null,
    });
    console.info('[GA4] Slide 7 paid = google/cpc source_medium', {
      paid: channels.paid,
      organic: channels.organic,
    });
  }

  const totalCalls = ghlRows.reduce((s, r) => s + r.callCurrent, 0);
  const totalFormsChat = ghlRows.reduce((s, r) => s + r.formsCurrent + r.chatCurrent, 0);
  const prevTotalCalls = ghlRows.reduce((s, r) => s + r.callPrevious, 0);
  const prevTotalFormsChat = ghlRows.reduce((s, r) => s + r.formsPrevious + r.chatPrevious, 0);

  return {
    currentLabel,
    previousLabel,
    comparisonHeader: `${formatShortMonthLabel(currentFrom)} Vs ${formatShortMonthLabel(prevFrom)}`,
    slide3Prefill: {
      rows: ghlRows,
      statBoxes: [
        { value: String(totalCalls), label: 'Total Call Leads' },
        { value: String(totalFormsChat), label: 'Total Forms and Chat Widgets' },
        { value: String(prevTotalCalls), label: `Total Calls (${formatShortMonthLabel(prevFrom)})` },
        { value: String(prevTotalFormsChat), label: `Forms & Chat (${formatShortMonthLabel(prevFrom)})` },
      ],
    },
    slide5: buildSlide5(curGads, prevGads, formatShortMonthLabel(currentFrom), formatShortMonthLabel(prevFrom)),
    slide6: buildSlide6(curGa4, prevGa4, curGads, prevGads, formatShortMonthLabel(currentFrom), formatShortMonthLabel(prevFrom)),
    slide7: buildSlide7(channels),
    slide8: { keywords },
  };
}

export { num, momChange };
