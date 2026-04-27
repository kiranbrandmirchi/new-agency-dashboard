import { useState, useCallback, useMemo, useEffect } from 'react';
import { sbFetchAllParallel, buildQuery, buildGa4SummaryQuery } from '../lib/supabaseRest';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { getEffectiveAgencyScopeId } from '../lib/agencyScope';
import { useApp } from '../context/AppContext';

const GMT5_OFFSET_MS = -5 * 60 * 60 * 1000;

function nowGMT5() { return new Date(Date.now() + GMT5_OFFSET_MS); }

function fmtYMD(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
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
    case 'this_month': { const y = today.getUTCFullYear(), m = today.getUTCMonth(); return { from: fmt(new Date(Date.UTC(y, m, 1))), to: fmt(today) }; }
    case 'last_month': { const y = today.getUTCFullYear(), m = today.getUTCMonth(); return { from: fmt(new Date(Date.UTC(y, m - 1, 1))), to: fmt(new Date(Date.UTC(y, m, 0))) }; }
    case 'custom': return { from: customFrom || null, to: customTo || null };
    default: return { from: null, to: null };
  }
}

/** Same length as primary range, immediately before `from` (matches Google Ads / GA4 reports). */
function computePreviousPeriod(fromStr, toStr) {
  if (!fromStr || !toStr) return { from: null, to: null };
  const from = new Date(`${fromStr}T00:00:00`);
  const to = new Date(`${toStr}T00:00:00`);
  const days = Math.round((to - from) / 86400000) + 1;
  const prevTo = new Date(from);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - days + 1);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { from: fmt(prevFrom), to: fmt(prevTo) };
}

function fmtRangeUsShort(fromStr, toStr) {
  if (!fromStr || !toStr) return '—';
  const parts = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return `${m}/${d}/${String(y).slice(-2)}`;
  };
  return `${parts(fromStr)} – ${parts(toStr)}`;
}

function num(v) { return Number(v) || 0; }

/** Match GA4 Basic / sync: DB stores numeric property id; CPA may use `properties/123`. */
function normalizeGa4PropertyId(id) {
  if (id == null || id === '') return '';
  let s = String(id).trim();
  const lower = s.toLowerCase();
  if (lower.startsWith('properties/')) s = s.slice(11);
  return s.trim();
}

export function useCombinedDashboardData() {
  const { canViewAllCustomers, allowedClientAccounts, activeAgencyId, agencyId, userProfile, userRole } = useAuth();
  const isSuperAdmin = !!(userProfile?.is_super_admin || userRole?.toLowerCase() === 'super_admin');
  const scopeAgencyId = useMemo(
    () => getEffectiveAgencyScopeId(isSuperAdmin, activeAgencyId, agencyId),
    [isSuperAdmin, activeAgencyId, agencyId],
  );
  const { selectedClientId } = useApp();

  const [filters, setFilters] = useState({
    datePreset: 'this_month', dateFrom: '', dateTo: '',
    compareOn: false, compareFrom: '', compareTo: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [rawGads, setRawGads] = useState([]);
  const [rawFb, setRawFb] = useState([]);
  const [rawReddit, setRawReddit] = useState([]);
  const [rawTiktok, setRawTiktok] = useState([]);
  const [rawGa4, setRawGa4] = useState([]);
  const [rawGadsCompare, setRawGadsCompare] = useState([]);
  const [rawFbCompare, setRawFbCompare] = useState([]);
  const [rawRedditCompare, setRawRedditCompare] = useState([]);
  const [rawTiktokCompare, setRawTiktokCompare] = useState([]);
  const [rawGa4Compare, setRawGa4Compare] = useState([]);
  const [accountMap, setAccountMap] = useState(new Map());
  /** GA4 properties linked in CPA (for empty-state copy when summary rows are missing). */
  const [linkedGa4CpaCount, setLinkedGa4CpaCount] = useState(0);

  const updateFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const batchUpdateFilters = useCallback((partial) => {
    setFilters((prev) => ({ ...prev, ...partial }));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = computeDateRange(filters.datePreset, filters.dateFrom, filters.dateTo);
      if (!from || !to) {
        setRawGadsCompare([]); setRawFbCompare([]); setRawRedditCompare([]); setRawTiktokCompare([]); setRawGa4Compare([]);
        setLoading(false);
        return;
      }

      let cmpFrom = null;
      let cmpTo = null;
      if (filters.compareOn) {
        if (filters.compareFrom && filters.compareTo) {
          cmpFrom = filters.compareFrom;
          cmpTo = filters.compareTo;
        } else {
          const prev = computePreviousPeriod(from, to);
          cmpFrom = prev.from;
          cmpTo = prev.to;
        }
      }

      // Match AuthContext: CPA rows are scoped by agency_id on client_platform_accounts.
      // Do NOT rely only on clients.client_id — some agencies have ads accounts without
      // matching client rows, which previously returned zero accounts for Wheeler.
      let accountQuery = supabase.from('client_platform_accounts')
        .select('id, platform_customer_id, account_name, platform, client_id, agency_id, clients(name)')
        .eq('is_active', true);

      if (scopeAgencyId) {
        accountQuery = accountQuery.eq('agency_id', scopeAgencyId);
      }

      if (!canViewAllCustomers) {
        const allowedIds = (allowedClientAccounts || []).map((a) => a.platform_customer_id);
        if (allowedIds.length === 0) {
          setRawGads([]); setRawFb([]); setRawReddit([]); setRawTiktok([]); setRawGa4([]);
          setRawGadsCompare([]); setRawFbCompare([]); setRawRedditCompare([]); setRawTiktokCompare([]); setRawGa4Compare([]);
          setLinkedGa4CpaCount(0);
          setLoading(false);
          return;
        }
        accountQuery = accountQuery.in('platform_customer_id', allowedIds);
      }

      const { data: allAccounts } = await accountQuery;
      const accounts = allAccounts || [];

      const accMap = new Map();
      accounts.forEach((a) => {
        const raw = String(a.platform_customer_id);
        const info = {
          platform: a.platform,
          account_name: a.account_name || a.platform_customer_id,
          client_name: a.clients?.name || '',
          client_id: a.client_id,
        };
        accMap.set(raw, info);
        if (a.platform === 'ga4') {
          const norm = normalizeGa4PropertyId(raw);
          if (norm && norm !== raw) accMap.set(norm, info);
        }
      });
      setAccountMap(accMap);
      setLinkedGa4CpaCount(accounts.filter((a) => a.platform === 'ga4').length);

      const byPlatform = { google_ads: [], facebook: [], reddit: [], tiktok: [], ga4: [] };
      const ga4IdSet = new Set();
      accounts.forEach((a) => {
        if (!byPlatform[a.platform]) return;
        if (a.platform === 'ga4') {
          const norm = normalizeGa4PropertyId(String(a.platform_customer_id));
          if (norm) ga4IdSet.add(norm);
        } else {
          byPlatform[a.platform].push(String(a.platform_customer_id));
        }
      });
      byPlatform.ga4.push(...ga4IdSet);

      const safe = (p) => p.catch((err) => { console.warn('[Dashboard] fetch failed:', err.message); return []; });

      const fetchGa4ForRange = async (dateFrom, dateTo) => {
        if (byPlatform.ga4.length === 0) return [];
        const ids = [...new Set(byPlatform.ga4)];
        let q = buildGa4SummaryQuery({
          agencyId: scopeAgencyId || undefined,
          customerIds: ids,
          dateFrom,
          dateTo,
          extra: '&order=report_date.desc',
        });
        let rows = await safe(sbFetchAllParallel(q));
        if (!rows.length && scopeAgencyId) {
          q = buildGa4SummaryQuery({
            customerIds: ids,
            dateFrom,
            dateTo,
            extra: '&order=report_date.desc',
          });
          rows = await safe(sbFetchAllParallel(q));
        }
        return rows;
      };

      // Google Ads - uses buildQuery (date column = 'date')
      let gadsData = [];
      let gadsCmp = [];
      if (byPlatform.google_ads.length > 0) {
        const gadsPrimary = sbFetchAllParallel(buildQuery('gads_campaign_daily', {
          customerIds: byPlatform.google_ads, dateFrom: from, dateTo: to, extra: '&order=date.desc',
        }));
        if (filters.compareOn && cmpFrom && cmpTo) {
          const gadsCompareQ = sbFetchAllParallel(buildQuery('gads_campaign_daily', {
            customerIds: byPlatform.google_ads, dateFrom: cmpFrom, dateTo: cmpTo, extra: '&order=date.desc',
          }));
          [gadsData, gadsCmp] = await Promise.all([safe(gadsPrimary), safe(gadsCompareQ)]);
        } else {
          gadsData = await safe(gadsPrimary);
        }
      }

      // Facebook - uses report_date
      let fbData = [];
      let fbCmp = [];
      if (byPlatform.facebook.length > 0) {
        if (filters.compareOn && cmpFrom && cmpTo) {
          const [p, c] = await Promise.all([
            supabase.from('fb_campaign_daily').select('*')
              .in('customer_id', byPlatform.facebook)
              .gte('report_date', from).lte('report_date', to),
            supabase.from('fb_campaign_daily').select('*')
              .in('customer_id', byPlatform.facebook)
              .gte('report_date', cmpFrom).lte('report_date', cmpTo),
          ]);
          fbData = p.data || [];
          fbCmp = c.data || [];
        } else {
          const { data } = await supabase.from('fb_campaign_daily').select('*')
            .in('customer_id', byPlatform.facebook)
            .gte('report_date', from).lte('report_date', to);
          fbData = data || [];
        }
      }

      // Reddit - uses report_date
      let redditData = [];
      let redditCmp = [];
      if (byPlatform.reddit.length > 0) {
        if (filters.compareOn && cmpFrom && cmpTo) {
          const [p, c] = await Promise.all([
            supabase.from('reddit_campaign_daily').select('*')
              .in('customer_id', byPlatform.reddit)
              .gte('report_date', from).lte('report_date', to),
            supabase.from('reddit_campaign_daily').select('*')
              .in('customer_id', byPlatform.reddit)
              .gte('report_date', cmpFrom).lte('report_date', cmpTo),
          ]);
          redditData = p.data || [];
          redditCmp = c.data || [];
        } else {
          const { data } = await supabase.from('reddit_campaign_daily').select('*')
            .in('customer_id', byPlatform.reddit)
            .gte('report_date', from).lte('report_date', to);
          redditData = data || [];
        }
      }

      // TikTok Ads — same grain as Reddit (`tiktok_campaign_daily`)
      let tiktokData = [];
      let tiktokCmp = [];
      if (byPlatform.tiktok.length > 0) {
        if (filters.compareOn && cmpFrom && cmpTo) {
          const [p, c] = await Promise.all([
            supabase.from('tiktok_campaign_daily').select('*')
              .in('customer_id', byPlatform.tiktok)
              .gte('report_date', from).lte('report_date', to),
            supabase.from('tiktok_campaign_daily').select('*')
              .in('customer_id', byPlatform.tiktok)
              .gte('report_date', cmpFrom).lte('report_date', cmpTo),
          ]);
          tiktokData = p.data || [];
          tiktokCmp = c.data || [];
        } else {
          const { data } = await supabase.from('tiktok_campaign_daily').select('*')
            .in('customer_id', byPlatform.tiktok)
            .gte('report_date', from).lte('report_date', to);
          tiktokData = data || [];
        }
      }

      // GA4 — same store as Basic GA4 report: `ga4_daily_summary` (sync / ga4_summary_report source)
      let ga4Data = [];
      let ga4Cmp = [];
      if (byPlatform.ga4.length > 0) {
        if (filters.compareOn && cmpFrom && cmpTo) {
          [ga4Data, ga4Cmp] = await Promise.all([
            fetchGa4ForRange(from, to),
            fetchGa4ForRange(cmpFrom, cmpTo),
          ]);
        } else {
          ga4Data = await fetchGa4ForRange(from, to);
        }
      }

      setRawGads(gadsData);
      setRawFb(fbData);
      setRawReddit(redditData);
      setRawTiktok(tiktokData);
      setRawGa4(ga4Data);
      setRawGadsCompare(filters.compareOn && cmpFrom && cmpTo ? gadsCmp : []);
      setRawFbCompare(filters.compareOn && cmpFrom && cmpTo ? fbCmp : []);
      setRawRedditCompare(filters.compareOn && cmpFrom && cmpTo ? redditCmp : []);
      setRawTiktokCompare(filters.compareOn && cmpFrom && cmpTo ? tiktokCmp : []);
      setRawGa4Compare(filters.compareOn && cmpFrom && cmpTo ? ga4Cmp : []);
    } catch (err) {
      console.error('[Dashboard] error:', err);
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [canViewAllCustomers, allowedClientAccounts, scopeAgencyId, selectedClientId, filters.datePreset, filters.dateFrom, filters.dateTo, filters.compareOn, filters.compareFrom, filters.compareTo]);

  useEffect(() => {
    setRawGads([]); setRawFb([]); setRawReddit([]); setRawTiktok([]); setRawGa4([]);
    setRawGadsCompare([]); setRawFbCompare([]); setRawRedditCompare([]); setRawTiktokCompare([]); setRawGa4Compare([]);
    setAccountMap(new Map());
    setLinkedGa4CpaCount(0);
  }, [scopeAgencyId, allowedClientAccounts]);
  useEffect(() => { fetchData(); }, [fetchData]);

  // Aggregate helper: raw rows -> account-level breakdown
  function aggregateByAccount(rows, platform, costField, dateField) {
    const byAcc = new Map();
    rows.forEach((r) => {
      const cid = String(r.customer_id);
      const info = accountMap.get(cid);
      if (!byAcc.has(cid)) {
        byAcc.set(cid, {
          customer_id: cid, platform,
          account_name: info?.account_name || cid,
          client_name: info?.client_name || '',
          client_id: info?.client_id ?? null,
          cost: 0, clicks: 0, impressions: 0, conversions: 0,
          reach: 0, sessions: 0, total_users: 0, page_views: 0,
          purchase_count: 0, purchase_value: 0, lead_count: 0,
        });
      }
      const a = byAcc.get(cid);

      if (platform === 'google_ads') {
        a.cost += num(r.cost); a.clicks += num(r.clicks); a.impressions += num(r.impressions); a.conversions += num(r.conversions);
      } else if (platform === 'facebook') {
        a.cost += num(r.spend); a.clicks += num(r.clicks); a.impressions += num(r.impressions); a.reach += num(r.reach);
        a.purchase_count += num(r.purchase_count); a.purchase_value += num(r.purchase_value); a.lead_count += num(r.lead_count);
        a.conversions += num(r.purchase_count) + num(r.lead_count);
      } else if (platform === 'reddit' || platform === 'tiktok') {
        a.cost += num(r.spend); a.clicks += num(r.clicks); a.impressions += num(r.impressions); a.reach += num(r.reach);
        a.conversions += num(r.purchase_clicks || 0);
      } else if (platform === 'ga4') {
        const pv = r.screen_page_views != null ? r.screen_page_views : r.page_views;
        const conv = r.key_events != null ? r.key_events : r.conversions;
        a.sessions += num(r.sessions);
        a.total_users += num(r.total_users);
        a.page_views += num(pv);
        a.conversions += num(conv);
        a.new_users = (a.new_users || 0) + num(r.new_users);
        a.engaged_sessions = (a.engaged_sessions || 0) + num(r.engaged_sessions);
        a.event_count = (a.event_count || 0) + num(r.event_count);
        const s = num(r.sessions);
        a._bounce_w = (a._bounce_w || 0) + num(r.bounce_rate) * s;
        a._dur_w = (a._dur_w || 0) + num(r.avg_session_duration) * s;
      }
    });
    return [...byAcc.values()].map((a) => {
      const base = {
        ...a,
        ctr: a.impressions ? (a.clicks / a.impressions) * 100 : 0,
        cpc: a.clicks ? a.cost / a.clicks : 0,
        cpa: a.conversions ? a.cost / a.conversions : 0,
      };
      if (a.platform === 'ga4') {
        const s = a.sessions || 0;
        base.bounce_rate = s ? (a._bounce_w || 0) / s : 0;
        base.avg_session_duration = s ? (a._dur_w || 0) / s : 0;
        base.pages_per_session = s ? a.page_views / s : 0;
        delete base._bounce_w;
        delete base._dur_w;
      }
      return base;
    }).sort((a, b) => b.cost - a.cost || b.sessions - a.sessions);
  }

  // Campaign-level aggregation for ad platforms
  function aggregateCampaigns(rows, platform) {
    const map = new Map();
    rows.forEach((r) => {
      const cid = String(r.customer_id);
      const campId = r.campaign_id;
      const key = `${cid}::${campId}`;
      if (!map.has(key)) map.set(key, { customer_id: cid, campaign_id: campId, campaign_name: r.campaign_name, cost: 0, clicks: 0, impressions: 0, conversions: 0 });
      const a = map.get(key);
      if (platform === 'google_ads') {
        a.cost += num(r.cost); a.clicks += num(r.clicks); a.impressions += num(r.impressions); a.conversions += num(r.conversions);
      } else if (platform === 'facebook') {
        a.cost += num(r.spend); a.clicks += num(r.clicks); a.impressions += num(r.impressions);
        a.conversions += num(r.purchase_count) + num(r.lead_count);
      } else if (platform === 'reddit' || platform === 'tiktok') {
        a.cost += num(r.spend); a.clicks += num(r.clicks); a.impressions += num(r.impressions); a.conversions += num(r.purchase_clicks || 0);
      }
    });
    // group by customer_id
    const byCust = new Map();
    [...map.values()].forEach((c) => {
      if (!byCust.has(c.customer_id)) byCust.set(c.customer_id, []);
      byCust.get(c.customer_id).push({
        ...c,
        ctr: c.impressions ? (c.clicks / c.impressions) * 100 : 0,
        cpc: c.clicks ? c.cost / c.clicks : 0,
        cpa: c.conversions ? c.cost / c.conversions : 0,
      });
    });
    byCust.forEach((list) => list.sort((a, b) => b.cost - a.cost));
    return byCust;
  }

  const gadsAccounts = useMemo(() => aggregateByAccount(rawGads, 'google_ads'), [rawGads, accountMap]);
  const fbAccounts = useMemo(() => aggregateByAccount(rawFb, 'facebook'), [rawFb, accountMap]);
  const redditAccounts = useMemo(() => aggregateByAccount(rawReddit, 'reddit'), [rawReddit, accountMap]);
  const tiktokAccounts = useMemo(() => aggregateByAccount(rawTiktok, 'tiktok'), [rawTiktok, accountMap]);
  const ga4Accounts = useMemo(() => aggregateByAccount(rawGa4, 'ga4'), [rawGa4, accountMap]);

  const gadsAccountsCompare = useMemo(() => aggregateByAccount(rawGadsCompare, 'google_ads'), [rawGadsCompare, accountMap]);
  const fbAccountsCompare = useMemo(() => aggregateByAccount(rawFbCompare, 'facebook'), [rawFbCompare, accountMap]);
  const redditAccountsCompare = useMemo(() => aggregateByAccount(rawRedditCompare, 'reddit'), [rawRedditCompare, accountMap]);
  const tiktokAccountsCompare = useMemo(() => aggregateByAccount(rawTiktokCompare, 'tiktok'), [rawTiktokCompare, accountMap]);
  const ga4AccountsCompare = useMemo(() => aggregateByAccount(rawGa4Compare, 'ga4'), [rawGa4Compare, accountMap]);

  /** Roll GA4 properties up to client (same date range) for dashboard overview. */
  const ga4ByClient = useMemo(() => {
    if (!ga4Accounts.length) return [];
    const m = new Map();
    ga4Accounts.forEach((a) => {
      const key = a.client_id != null && a.client_id !== '' ? String(a.client_id) : `_n:${a.client_name || 'Unassigned'}`;
      if (!m.has(key)) {
        m.set(key, {
          id: key,
          client_name: a.client_name || 'Unassigned',
          property_count: 0,
          sessions: 0,
          total_users: 0,
          page_views: 0,
          conversions: 0,
          new_users: 0,
          engaged_sessions: 0,
          event_count: 0,
          _bounce_w: 0,
          _dur_w: 0,
        });
      }
      const o = m.get(key);
      o.property_count += 1;
      const s = a.sessions || 0;
      o.sessions += s;
      o.total_users += a.total_users || 0;
      o.page_views += a.page_views || 0;
      o.conversions += a.conversions || 0;
      o.new_users += a.new_users || 0;
      o.engaged_sessions += a.engaged_sessions || 0;
      o.event_count += a.event_count || 0;
      o._bounce_w += (a.bounce_rate || 0) * s;
      o._dur_w += (a.avg_session_duration || 0) * s;
    });
    return [...m.values()].map((o) => {
      const s = o.sessions || 0;
      return {
        id: o.id,
        client_name: o.client_name,
        property_count: o.property_count,
        sessions: o.sessions,
        total_users: o.total_users,
        page_views: o.page_views,
        conversions: o.conversions,
        new_users: o.new_users,
        engaged_sessions: o.engaged_sessions,
        event_count: o.event_count,
        bounce_rate: s ? o._bounce_w / s : 0,
        avg_session_duration: s ? o._dur_w / s : 0,
        pages_per_session: s ? o.page_views / s : 0,
        engagement_rate: s ? (o.engaged_sessions / s) * 100 : 0,
      };
    }).sort((a, b) => b.sessions - a.sessions);
  }, [ga4Accounts]);

  const gadsCampaigns = useMemo(() => aggregateCampaigns(rawGads, 'google_ads'), [rawGads]);
  const fbCampaigns = useMemo(() => aggregateCampaigns(rawFb, 'facebook'), [rawFb]);
  const redditCampaigns = useMemo(() => aggregateCampaigns(rawReddit, 'reddit'), [rawReddit]);
  const tiktokCampaigns = useMemo(() => aggregateCampaigns(rawTiktok, 'tiktok'), [rawTiktok]);

  // Overall KPIs: ad metrics vs GA4 (avoid mixing conversions for CPA / labels)
  const summaryKpis = useMemo(() => {
    const k = {
      cost: 0, clicks: 0, impressions: 0,
      ad_conversions: 0, ga4_conversions: 0,
      sessions: 0, total_users: 0, page_views: 0,
    };
    const addAd = (accs) => accs.forEach((a) => {
      k.cost += a.cost; k.clicks += a.clicks; k.impressions += a.impressions; k.ad_conversions += a.conversions;
    });
    addAd(gadsAccounts); addAd(fbAccounts); addAd(redditAccounts); addAd(tiktokAccounts);
    ga4Accounts.forEach((a) => {
      k.sessions += a.sessions; k.total_users += a.total_users; k.page_views += a.page_views; k.ga4_conversions += a.conversions;
    });
    k.ctr = k.impressions ? (k.clicks / k.impressions) * 100 : 0;
    k.cpc = k.clicks ? k.cost / k.clicks : 0;
    k.cpa = k.ad_conversions ? k.cost / k.ad_conversions : 0;
    return k;
  }, [gadsAccounts, fbAccounts, redditAccounts, tiktokAccounts, ga4Accounts]);

  const hasData = rawGads.length > 0 || rawFb.length > 0 || rawReddit.length > 0 || rawTiktok.length > 0 || rawGa4.length > 0;

  const compareRangeResolved = useMemo(() => {
    const dr = computeDateRange(filters.datePreset, filters.dateFrom, filters.dateTo);
    if (!filters.compareOn || !dr.from || !dr.to) return { from: null, to: null };
    if (filters.compareFrom && filters.compareTo) {
      return { from: filters.compareFrom, to: filters.compareTo };
    }
    return computePreviousPeriod(dr.from, dr.to);
  }, [filters.compareOn, filters.compareFrom, filters.compareTo, filters.datePreset, filters.dateFrom, filters.dateTo]);

  const primaryRangeLabel = useMemo(() => {
    const dr = computeDateRange(filters.datePreset, filters.dateFrom, filters.dateTo);
    return fmtRangeUsShort(dr.from, dr.to);
  }, [filters.datePreset, filters.dateFrom, filters.dateTo]);

  const compareRangeLabel = useMemo(() => {
    if (!filters.compareOn) return '';
    return fmtRangeUsShort(compareRangeResolved.from, compareRangeResolved.to);
  }, [filters.compareOn, compareRangeResolved.from, compareRangeResolved.to]);

  return {
    filters, updateFilter, batchUpdateFilters, fetchData, loading, error, summaryKpis, accountMap, hasData,
    gadsAccounts, fbAccounts, redditAccounts, tiktokAccounts, ga4Accounts, ga4ByClient, linkedGa4CpaCount,
    gadsAccountsCompare, fbAccountsCompare, redditAccountsCompare, tiktokAccountsCompare, ga4AccountsCompare,
    gadsCampaigns, fbCampaigns, redditCampaigns, tiktokCampaigns,
    primaryRangeLabel, compareRangeLabel,
  };
}
