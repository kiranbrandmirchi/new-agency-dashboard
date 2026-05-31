import { supabase } from '../lib/supabaseClient';

function num(v) {
  return Number(v) || 0;
}

function gbpMetricKey(metricType) {
  const m = String(metricType || '').toUpperCase();
  if (m.includes('DIRECTION')) return 'direction_requests';
  if (m.includes('CALL')) return 'call_clicks';
  if (m.includes('WEBSITE')) return 'website_clicks';
  if (m.includes('DESKTOP_MAPS') || m.includes('MOBILE_MAPS')) return 'maps_impressions';
  if (m.includes('DESKTOP_SEARCH') || m.includes('MOBILE_SEARCH')) return 'search_impressions';
  return null;
}

function buildGbpSummaryFromMetrics(totals) {
  const maps = (totals.maps_impressions || 0);
  const search = (totals.search_impressions || 0);
  return {
    call_clicks: totals.call_clicks || 0,
    direction_requests: totals.direction_requests || 0,
    website_clicks: totals.website_clicks || 0,
    total_impressions_maps: maps,
    total_impressions_search: search,
    total_impressions: maps + search,
  };
}

async function aggregateGscPeriod(agencyId, customerIds, from, to) {
  if (!customerIds.length || !from || !to) {
    return { summary: [], queries: [] };
  }

  let query = supabase
    .from('gsc_daily_summary')
    .select('query, clicks, impressions, position')
    .in('customer_id', customerIds)
    .gte('report_date', from)
    .lte('report_date', to);

  if (agencyId) query = query.eq('agency_id', agencyId);

  let { data, error } = await query.limit(50000);
  if ((!data || !data.length) && agencyId && customerIds.length) {
    const retry = supabase
      .from('gsc_daily_summary')
      .select('query, clicks, impressions, position')
      .in('customer_id', customerIds)
      .gte('report_date', from)
      .lte('report_date', to)
      .limit(50000);
    const retryRes = await retry;
    data = retryRes.data;
    error = retryRes.error;
  }
  if (error) {
    console.warn('[SEO] gsc_daily_summary query:', error.message);
    return { summary: [], queries: [] };
  }

  let clicks = 0;
  let impressions = 0;
  let posWeighted = 0;
  const queryMap = new Map();

  (data || []).forEach((row) => {
    const c = num(row.clicks);
    const imp = num(row.impressions);
    clicks += c;
    impressions += imp;
    posWeighted += num(row.position) * imp;
    const q = row.query || '(not set)';
    if (!queryMap.has(q)) queryMap.set(q, { query: q, clicks: 0, impressions: 0 });
    const acc = queryMap.get(q);
    acc.clicks += c;
    acc.impressions += imp;
  });

  const summary = [{
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: impressions ? posWeighted / impressions : 0,
  }];

  const queries = [...queryMap.values()]
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, 500);

  return { summary, queries };
}

async function aggregateGbpPeriod(agencyId, customerIds, from, to) {
  if (!customerIds.length || !from || !to) return buildGbpSummaryFromMetrics({});

  let query = supabase
    .from('gmb_insights_daily')
    .select('metric_type, value')
    .in('customer_id', customerIds)
    .gte('report_date', from)
    .lte('report_date', to);

  if (agencyId) query = query.eq('agency_id', agencyId);

  let { data, error } = await query.limit(50000);
  if ((!data || !data.length) && agencyId && customerIds.length) {
    const retry = supabase
      .from('gmb_insights_daily')
      .select('metric_type, value')
      .in('customer_id', customerIds)
      .gte('report_date', from)
      .lte('report_date', to)
      .limit(50000);
    const retryRes = await retry;
    data = retryRes.data;
    error = retryRes.error;
  }
  if (error) {
    console.warn('[SEO] gmb_insights_daily query:', error.message);
    return buildGbpSummaryFromMetrics({});
  }

  const totals = {};
  (data || []).forEach((row) => {
    const key = gbpMetricKey(row.metric_type);
    if (!key) return;
    totals[key] = (totals[key] || 0) + num(row.value);
  });

  return buildGbpSummaryFromMetrics(totals);
}

/** Discover GSC customer_id keys in gsc_daily_summary (often site URL or GA4 id on the client tag). */
export async function discoverGscCustomerIds(agencyId, ga4PropertyId, clientId = null) {
  const ids = new Set();
  if (ga4PropertyId) ids.add(String(ga4PropertyId));

  if (clientId) {
    const { data: accounts } = await supabase
      .from('client_platform_accounts')
      .select('platform, platform_customer_id, account_name')
      .eq('client_id', clientId)
      .eq('is_active', true);
    (accounts || []).forEach((a) => {
      if (a.platform !== 'gsc' && a.platform !== 'search_console') return;
      for (const v of [a.platform_customer_id, a.account_name]) {
        const s = String(v || '').trim();
        if (s) ids.add(s);
      }
    });
  }

  if (!agencyId) return [...ids];

  const { data } = await supabase.from('gsc_daily_summary').select('customer_id').eq('agency_id', agencyId).limit(500);
  (data || []).forEach((r) => {
    if (r.customer_id) ids.add(String(r.customer_id));
  });

  return [...ids];
}

export function pickGscSiteUrlFromCustomerIds(customerIds) {
  return (customerIds || []).find((id) => {
    const s = String(id).trim();
    return s.startsWith('sc-domain:') || s.startsWith('http://') || s.startsWith('https://');
  }) || '';
}

export function gbpCustomerIdVariants(locationId) {
  const s = String(locationId || '').trim();
  if (!s) return [];
  const out = new Set([s]);
  if (s.startsWith('locations/')) out.add(s.replace(/^locations\//, ''));
  else out.add(`locations/${s}`);
  return [...out];
}

/**
 * GBP rows in gmb_insights_daily use customer_id = client tag (platform_customer_id / account name),
 * not Google locations/… IDs. Collect all GBP/GMB accounts linked to this client.
 */
export async function discoverGbpCustomerIdsForClient(clientId, agencyId, gbpLocationId = '') {
  const ids = new Set();
  if (gbpLocationId) {
    gbpCustomerIdVariants(gbpLocationId).forEach((id) => ids.add(id));
  }

  if (clientId) {
    const { data: accounts } = await supabase
      .from('client_platform_accounts')
      .select('platform, platform_customer_id, account_name')
      .eq('client_id', clientId)
      .eq('is_active', true);

    (accounts || []).forEach((a) => {
      if (a.platform !== 'gbp' && a.platform !== 'gmb') return;
      for (const v of [a.platform_customer_id, a.account_name]) {
        const s = String(v || '').trim();
        if (s) ids.add(s);
      }
    });
  }

  if (agencyId && clientId && ids.size) {
    const { data: insightRows } = await supabase
      .from('gmb_insights_daily')
      .select('customer_id')
      .eq('agency_id', agencyId)
      .limit(500);
    const tagged = [...ids].map((id) => normalizeGbpMatchKey(id));
    (insightRows || []).forEach((r) => {
      const cid = String(r.customer_id || '').trim();
      if (!cid) return;
      const key = normalizeGbpMatchKey(cid);
      if (tagged.some((t) => t === key || key.includes(t) || t.includes(key))) {
        ids.add(cid);
      }
    });
  }

  if (!ids.size && agencyId) {
    const { data } = await supabase
      .from('gmb_insights_daily')
      .select('customer_id')
      .eq('agency_id', agencyId)
      .limit(300);
    (data || []).forEach((r) => {
      if (r.customer_id) ids.add(String(r.customer_id));
    });
  }

  return [...ids];
}

function normalizeGbpMatchKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** @deprecated use discoverGbpCustomerIdsForClient */
export async function discoverGbpCustomerIds(agencyId, gbpLocationId, ga4PropertyId) {
  return discoverGbpCustomerIdsForClient(null, agencyId, gbpLocationId || ga4PropertyId);
}

function reportMonthFromDate(dateStr) {
  if (!dateStr || dateStr.length < 7) return '';
  return `${dateStr.substring(0, 7)}-01`;
}

function isGbpPlatform(platform) {
  const p = String(platform || '').toLowerCase();
  return p === 'gbp' || p === 'gmb';
}

function emptyGbpLocation(displayName, storeCode = '') {
  return {
    business_name: displayName,
    store_code: storeCode,
    address: '',
    calls: 0,
    directions: 0,
    website_clicks: 0,
    total_impressions: 0,
  };
}

/** Strip shared brand prefix; expand PB → palm beach for fuzzy GBP location matching. */
function gbpLocationSignature(value) {
  let s = normalizeGbpMatchKey(value);
  s = s.replace(/^urgent care of the palm beaches\s+/, '');
  s = s.replace(/^urgent care of the palm beaches\s+/, '');
  s = s.replace(/^urgent care palm beaches\s+/, '');
  s = s.replace(/\bpb\b/g, 'palm beach');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

const GBP_STOP_WORDS = new Set([
  'urgent', 'care', 'the', 'of', 'palm', 'beaches', 'location', 'llc', 'inc',
]);

function distinctiveTokens(text) {
  return gbpLocationSignature(text)
    .split(' ')
    .filter((t) => t.length > 1 && !GBP_STOP_WORDS.has(t));
}

function gbpRegionHint(text) {
  const sig = gbpLocationSignature(text);
  if (/\bwest\b/.test(sig) || sig.includes('west palm')) return 'west';
  if (/\bnorth\b/.test(sig) || sig.includes('north palm')) return 'north';
  if (sig.includes('palm springs')) return 'palm_springs';
  // Urgent Care admin tag "Central PB" → gbp_performance "(Palm Springs Location)"
  if (/\bcentral\b/.test(sig) && /palm|beach|pb|urgent/.test(sig)) return 'palm_springs';
  if (
    /\bcentral\b/.test(sig)
    || sig.includes('lake worth')
    || sig.includes('boynton')
    || sig.includes('boca')
  ) return 'central';
  return '';
}

/** Urgent Care of the PBs — admin short names vs gbp_performance business_name in CSV. */
function urgentCareGbpAliasScore(loc, account) {
  const locName = normalizeGbpMatchKey(loc?.business_name);
  const accText = normalizeGbpMatchKey(
    `${account?.account_name || ''} ${account?.platform_customer_id || ''}`,
  );
  if (!locName.includes('urgent care') && !accText.includes('urgent care') && !accText.includes('palm')) {
    return 0;
  }
  const aliases = [
    { acc: /north|north pb|north palm/, row: /north palm beach/ },
    { acc: /west|west pb|west palm/, row: /west palm beach/ },
    { acc: /central|central pb|palm springs/, row: /palm springs/ },
  ];
  for (const { acc, row } of aliases) {
    if (acc.test(accText) && row.test(locName)) return 80;
  }
  return 0;
}

function regionOnlyMatchScore(loc, account) {
  const lh = gbpRegionHint(`${loc.business_name || ''} ${loc.store_code || ''}`);
  const ah = gbpRegionHint(`${account.account_name || ''} ${account.platform_customer_id || ''}`);
  if (lh && ah && lh === ah) return 55;
  return 0;
}

function scoreGbpLocationMatch(loc, account) {
  if (!loc || !account) return 0;

  const locName = normalizeGbpMatchKey(loc.business_name);
  const locStore = normalizeGbpMatchKey(loc.store_code);
  const needles = [
    normalizeGbpMatchKey(account.account_name),
    normalizeGbpMatchKey(account.platform_customer_id),
  ].filter(Boolean);

  for (const needle of needles) {
    for (const key of [locName, locStore].filter(Boolean)) {
      if (key === needle) return 100;
      if (key.includes(needle) || needle.includes(key)) return 75;
    }
  }

  const locSig = gbpLocationSignature(loc.business_name || loc.store_code);
  let best = 0;
  for (const field of [account.account_name, account.platform_customer_id]) {
    const accSig = gbpLocationSignature(field);
    if (!accSig || !locSig) continue;
    if (locSig === accSig) best = Math.max(best, 90);
    else if (locSig.includes(accSig) || accSig.includes(locSig)) best = Math.max(best, 70);
    else {
      const accTokens = distinctiveTokens(field);
      if (accTokens.length && accTokens.every((t) => locSig.includes(t))) {
        best = Math.max(best, 50 + accTokens.length * 5);
      }
    }
  }

  return Math.max(best, regionOnlyMatchScore(loc, account), urgentCareGbpAliasScore(loc, account));
}

function sortGbpAccounts(accounts) {
  return [...(accounts || [])].sort((a, b) =>
    String(a.account_name || a.platform_customer_id || '').localeCompare(
      String(b.account_name || b.platform_customer_id || ''),
    ),
  );
}

function locationMetricTotal(loc) {
  if (!loc) return 0;
  return num(loc.calls) + num(loc.directions) + num(loc.website_clicks);
}

function mapGbpPerformanceRowToLoc(row) {
  if (!row) return emptyGbpLocation();
  const impressions = num(row.total_impressions) || (
    num(row.impressions_search_mobile)
    + num(row.impressions_search_desktop)
    + num(row.impressions_maps_mobile)
    + num(row.impressions_maps_desktop)
  );
  return {
    business_name: row.business_name,
    address: row.address || '',
    store_code: row.store_code || '',
    calls: num(row.calls ?? row.call_clicks ?? row.phone_calls),
    directions: num(row.directions ?? row.direction_requests),
    website_clicks: num(row.website_clicks),
    total_impressions: impressions,
    _source_key: normalizeGbpMatchKey(row.business_name || row.store_code),
  };
}

function locShapeToRaw(loc) {
  if (!loc) return null;
  return {
    business_name: loc.business_name,
    store_code: loc.store_code,
    address: loc.address,
    calls: loc.calls,
    directions: loc.directions,
    website_clicks: loc.website_clicks,
    total_impressions: loc.total_impressions,
  };
}

function dedupeGbpRawRows(rows) {
  const seen = new Set();
  const out = [];
  (rows || []).forEach((row) => {
    if (!row) return;
    const key = normalizeGbpMatchKey(row.business_name || row.store_code);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(row);
  });
  return out;
}

/** Re-assign any zero-metric slots from unused raw rows (e.g. West PB name mismatch). */
export function fillMissingGbpLocations(accounts, locations, rawRows) {
  const sortedAccounts = sortGbpAccounts(accounts);
  const merged = mergeGbpLocationsWithAccounts(rawRows, sortedAccounts, mapGbpPerformanceRowToLoc);
  const usedSourceKeys = new Set(
    merged.filter((l) => locationMetricTotal(l) > 0 && l._source_key).map((l) => l._source_key),
  );

  return sortedAccounts.map((acc, idx) => {
    const fromMerge = merged[idx];
    if (fromMerge && locationMetricTotal(fromMerge) > 0) {
      const { _source_key, ...rest } = fromMerge;
      return {
        ...rest,
        business_name: acc.account_name || rest.business_name,
        store_code: acc.platform_customer_id || rest.store_code,
      };
    }

    const existing = (locations || [])[idx];
    if (existing && locationMetricTotal(existing) > 0) {
      return {
        ...existing,
        business_name: acc.account_name || existing.business_name,
        store_code: acc.platform_customer_id || existing.store_code,
      };
    }

    let bestRow = null;
    let bestScore = 0;
    for (const row of rawRows || []) {
      const key = normalizeGbpMatchKey(row.business_name || row.store_code);
      if (usedSourceKeys.has(key)) continue;
      const score = scoreGbpLocationMatch(row, acc);
      if (score > bestScore) {
        bestScore = score;
        bestRow = row;
      }
    }

    if (!bestRow || bestScore < 50) {
      const hint = gbpRegionHint(`${acc.account_name || ''} ${acc.platform_customer_id || ''}`);
      if (hint) {
        bestRow = (rawRows || []).find((row) => {
          const key = normalizeGbpMatchKey(row.business_name || row.store_code);
          if (usedSourceKeys.has(key)) return false;
          return gbpRegionHint(`${row.business_name || ''} ${row.store_code || ''}`) === hint;
        }) || null;
      }
    }

    if (bestRow) {
      usedSourceKeys.add(normalizeGbpMatchKey(bestRow.business_name || bestRow.store_code));
      const mapped = mapGbpPerformanceRowToLoc(bestRow);
      const { _source_key, ...rest } = mapped;
      return {
        ...rest,
        business_name: acc.account_name || rest.business_name,
        store_code: acc.platform_customer_id || rest.store_code,
      };
    }

    return emptyGbpLocation(acc.account_name, acc.platform_customer_id);
  });
}

/** Merge edge + DB raw rows into one row per linked GBP account. */
export function buildGbpPayloadFromSources({
  accounts,
  rawCurRows = [],
  rawPrevRows = [],
  edgeLocations = [],
  edgePrevLocations = [],
}) {
  const sortedAccounts = sortGbpAccounts(accounts);
  if (!sortedAccounts.length) return null;

  const curCandidates = dedupeGbpRawRows([
    ...rawCurRows,
    ...edgeLocations.map(locShapeToRaw).filter(Boolean),
  ]);
  const prevCandidates = dedupeGbpRawRows([
    ...rawPrevRows,
    ...edgePrevLocations.map(locShapeToRaw).filter(Boolean),
  ]);

  let locations = mergeGbpLocationsWithAccounts(curCandidates, sortedAccounts, mapGbpPerformanceRowToLoc);
  locations = fillMissingGbpLocations(sortedAccounts, locations, curCandidates).map(({ _source_key, ...rest }) => rest);

  let previous_locations = mergeGbpLocationsWithAccounts(
    prevCandidates,
    sortedAccounts,
    mapGbpPerformanceRowToLoc,
  );
  previous_locations = fillMissingGbpLocations(
    sortedAccounts,
    previous_locations,
    prevCandidates,
  ).map(({ _source_key, ...rest }) => rest);

  return {
    locations,
    previous_locations,
    summary: aggregateFromLocationMetrics(locations),
    previous_summary: prevCandidates.length
      ? aggregateFromLocationMetrics(previous_locations)
      : null,
    source: 'gbp_performance',
  };
}

function locationMatchesGbpAccount(loc, account) {
  return scoreGbpLocationMatch(loc, account) >= 50;
}

function filterGbpPerformanceRows(rows, gbpAccounts) {
  const accounts = (gbpAccounts || []).filter((a) => isGbpPlatform(a.platform));
  if (!accounts.length) return rows || [];
  return (rows || []).filter((row) => accounts.some((acc) => locationMatchesGbpAccount(row, acc)));
}

/** One row per linked GBP account — fill from gbp_performance when matched, else zeros. */
export function mergeGbpLocationsWithAccounts(apiLocations, gbpAccounts, mapRow = (r) => r) {
  const accounts = (gbpAccounts || []).filter((a) => isGbpPlatform(a.platform));
  if (!accounts.length) return (apiLocations || []).map(mapRow);

  const rows = apiLocations || [];
  const pairs = [];
  accounts.forEach((acc, ai) => {
    rows.forEach((loc, li) => {
      const score = scoreGbpLocationMatch(loc, acc);
      if (score >= 50) pairs.push({ ai, li, score });
    });
  });
  pairs.sort((a, b) => b.score - a.score);

  const usedAcc = new Set();
  const usedLoc = new Set();
  const assign = new Map();

  pairs.forEach(({ ai, li, score }) => {
    if (usedAcc.has(ai) || usedLoc.has(li)) return;
    usedAcc.add(ai);
    usedLoc.add(li);
    assign.set(ai, li);
  });

  return accounts.map((acc, ai) => {
    const displayName = String(acc.account_name || acc.platform_customer_id || 'Location').trim();
    const storeCode = String(acc.platform_customer_id || '').trim();
    const li = assign.get(ai);
    if (li != null) {
      const mapped = mapRow(rows[li]);
      return {
        ...mapped,
        business_name: displayName || mapped.business_name,
        store_code: storeCode || mapped.store_code,
      };
    }
    return emptyGbpLocation(displayName, storeCode);
  });
}

export async function fetchClientGbpAccounts(clientId) {
  if (!clientId) return [];
  const { data } = await supabase
    .from('client_platform_accounts')
    .select('platform, platform_customer_id, account_name')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('account_name');
  return sortGbpAccounts((data || []).filter((a) => isGbpPlatform(a.platform)));
}

/** Align account labels; locations are already one-per-account in sorted account order. */
export async function enrichGbpWithClientAccounts(clientId, gbp) {
  if (!clientId || !gbp) return gbp;
  const accounts = await fetchClientGbpAccounts(clientId);
  if (!accounts.length) return gbp;

  const locations = accounts.map((acc, idx) => {
    const existing = (gbp.locations || [])[idx];
    if (existing && locationMetricTotal(existing) > 0) {
      return {
        ...existing,
        business_name: acc.account_name || existing.business_name,
        store_code: acc.platform_customer_id || existing.store_code,
      };
    }
    const hit = (gbp.locations || []).find((loc) => scoreGbpLocationMatch(loc, acc) >= 50);
    if (hit && locationMetricTotal(hit) > 0) {
      return {
        ...hit,
        business_name: acc.account_name || hit.business_name,
        store_code: acc.platform_customer_id || hit.store_code,
      };
    }
    return emptyGbpLocation(acc.account_name, acc.platform_customer_id);
  });

  const previous_locations = accounts.map((acc, idx) => {
    const existing = (gbp.previous_locations || [])[idx];
    if (existing && locationMetricTotal(existing) > 0) {
      return {
        ...existing,
        business_name: acc.account_name || existing.business_name,
        store_code: acc.platform_customer_id || existing.store_code,
      };
    }
    const hit = (gbp.previous_locations || []).find((loc) => scoreGbpLocationMatch(loc, acc) >= 50);
    if (hit) {
      return {
        ...hit,
        business_name: acc.account_name || hit.business_name,
        store_code: acc.platform_customer_id || hit.store_code,
      };
    }
    return emptyGbpLocation(acc.account_name, acc.platform_customer_id);
  });

  return { ...gbp, locations, previous_locations };
}

function aggregateFromLocationMetrics(locations) {
  const agg = {
    location_count: (locations || []).length,
    calls: 0,
    directions: 0,
    website_clicks: 0,
    total_impressions: 0,
  };
  (locations || []).forEach((loc) => {
    agg.calls += num(loc.calls);
    agg.directions += num(loc.directions);
    agg.website_clicks += num(loc.website_clicks);
    agg.total_impressions += num(loc.total_impressions);
  });
  return agg;
}

/**
 * GBP from gbp_performance (same table/logic as marketing-report-realtime V2).
 */
export async function fetchGbpFromGbpPerformance({
  clientId,
  agencyId = null,
  dateFrom,
  compareFrom,
  compareOn = true,
}) {
  if (!clientId || !dateFrom) return null;

  let resolvedAgencyId = agencyId;
  if (!resolvedAgencyId) {
    const { data: clientRow } = await supabase
      .from('clients')
      .select('agency_id')
      .eq('id', clientId)
      .maybeSingle();
    resolvedAgencyId = clientRow?.agency_id || null;
  }

  const { data: accounts } = await supabase
    .from('client_platform_accounts')
    .select('platform, platform_customer_id, account_name')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('account_name');

  const gbpAccounts = sortGbpAccounts((accounts || []).filter((a) => isGbpPlatform(a.platform)));
  if (!gbpAccounts.length) return null;

  const curMonth = reportMonthFromDate(dateFrom);
  const prevMonth = compareOn && compareFrom ? reportMonthFromDate(compareFrom) : '';

  let curQuery = supabase.from('gbp_performance').select('*').eq('report_month', curMonth);
  if (resolvedAgencyId) curQuery = curQuery.eq('agency_id', resolvedAgencyId);
  const { data: monthCurRows, error: curErr } = await curQuery;
  if (curErr) {
    console.warn('[SEO] gbp_performance query:', curErr.message);
  }

  const curRows = monthCurRows || [];
  let prevRows = [];
  if (prevMonth) {
    let prevQuery = supabase.from('gbp_performance').select('*').eq('report_month', prevMonth);
    if (resolvedAgencyId) prevQuery = prevQuery.eq('agency_id', resolvedAgencyId);
    const { data: monthPrevRows, error: prevErr } = await prevQuery;
    if (prevErr) console.warn('[SEO] gbp_performance prev query:', prevErr.message);
    prevRows = monthPrevRows || [];
  }

  if (import.meta.env?.DEV) {
    const ucRows = curRows.filter((r) => /urgent care.*palm/i.test(r.business_name || ''));
    console.log('[SEO] gbp_performance rows', {
      curMonth,
      agencyId: resolvedAgencyId,
      curRows: curRows.length,
      prevRows: prevRows.length,
      urgentCareRows: ucRows.map((r) => ({ name: r.business_name, calls: r.calls })),
      accounts: gbpAccounts.map((a) => a.account_name),
    });
  }

  const payload = buildGbpPayloadFromSources({
    accounts: gbpAccounts,
    rawCurRows: curRows,
    rawPrevRows: prevRows,
  });

  return payload ? { ...payload, rawCurRows: curRows, rawPrevRows: prevRows } : null;
}

/** GBP only — GSC is loaded via marketing-report-realtime (Search Console API). */
export async function fetchGbpFromDatabase({
  agencyId,
  clientId = null,
  gbpLocationId,
  dateFrom,
  dateTo,
  compareFrom,
  compareTo,
  compareOn = true,
}) {
  const gbpIds = await discoverGbpCustomerIdsForClient(clientId, agencyId, gbpLocationId);
  const [curGbp, prevGbp] = await Promise.all([
    aggregateGbpPeriod(agencyId, gbpIds, dateFrom, dateTo),
    compareOn && compareFrom && compareTo
      ? aggregateGbpPeriod(agencyId, gbpIds, compareFrom, compareTo)
      : Promise.resolve(buildGbpSummaryFromMetrics({})),
  ]);

  return {
    summary: curGbp,
    previous_summary: compareOn ? prevGbp : null,
    source: 'database',
    customer_ids: gbpIds,
  };
}

/** @deprecated use fetchGbpFromDatabase for GBP; GSC is realtime-only */
export async function fetchGscGbpFromDatabase(opts) {
  const gbp = await fetchGbpFromDatabase(opts);
  return {
    gsc: { summary: { current: [], previous: [] }, queries: { current: [], previous: [] } },
    gbp,
    gbpCustomerIds: gbp.customer_ids,
  };
}

export function gscHasData(gsc) {
  if (!gsc || gsc.error) return false;
  const cur = gsc.summary?.current?.[0];
  return num(cur?.clicks) > 0 || num(cur?.impressions) > 0;
}

export function gbpHasData(gbp) {
  if (!gbp || gbp.error) return false;
  const s = gbp.summary || {};
  const calls = num(s.calls ?? s.call_clicks);
  const directions = num(s.directions ?? s.direction_requests);
  const website = num(s.website_clicks);
  const impressions = num(s.total_impressions);
  return directions > 0 || calls > 0 || website > 0 || impressions > 0;
}

export function countGbpLocationsWithMetrics(locations) {
  return (locations || []).filter(
    (l) => num(l.calls) > 0 || num(l.directions) > 0 || num(l.website_clicks) > 0,
  ).length;
}
