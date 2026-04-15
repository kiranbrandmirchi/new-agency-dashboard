import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { sbFetchAllParallel, buildQuery } from '../lib/supabaseRest';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

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
function num(v) { return Number(v) || 0; }
function addMetrics(o) {
  o.ctr = o.impressions ? (o.clicks / o.impressions) * 100 : 0;
  o.cpc = o.clicks ? o.cost / o.clicks : 0;
  o.conv_rate = o.clicks ? (o.conversions / o.clicks) * 100 : 0;
  o.cpa = o.conversions ? o.cost / o.conversions : 0;
  return o;
}

export function useAgencyReportData(reportType) {
  const { canViewAllCustomers, allowedClientAccounts, activeAgencyId } = useAuth();
  const allowedRef = useRef(allowedClientAccounts);
  allowedRef.current = allowedClientAccounts;

  const [filters, setFilters] = useState({
    datePreset: 'this_month', dateFrom: '', dateTo: '',
    customerId: 'ALL',
  });
  const [rawData, setRawData] = useState([]);
  const [rawKeywords, setRawKeywords] = useState([]);
  const [geoConstants, setGeoConstants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingPhase, setLoadingPhase] = useState('');
  const [error, setError] = useState(null);
  const [clientOptions, setClientOptions] = useState([]);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const updateFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const computeDateRange = useCallback((preset, from, to) => {
    const today = nowGMT5();
    const fmt = (d) => fmtYMD(d);
    const daysAgo = (n) => {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - n));
      return d;
    };
    switch (preset) {
      case 'today': return { from: fmt(today), to: fmt(today) };
      case 'yesterday': return { from: fmt(daysAgo(1)), to: fmt(daysAgo(1)) };
      case 'last7': return { from: fmt(daysAgo(6)), to: fmt(today) };
      case 'last14': return { from: fmt(daysAgo(13)), to: fmt(today) };
      case 'last30': return { from: fmt(daysAgo(29)), to: fmt(today) };
      case 'this_month': {
        const y = today.getUTCFullYear(), m = today.getUTCMonth();
        const first = new Date(Date.UTC(y, m, 1));
        return { from: fmt(first), to: fmt(today) };
      }
      case 'last_month': {
        const y = today.getUTCFullYear(), m = today.getUTCMonth();
        const first = new Date(Date.UTC(y, m - 1, 1));
        const last = new Date(Date.UTC(y, m, 0));
        return { from: fmt(first), to: fmt(last) };
      }
      case 'custom': return { from: from || null, to: to || null };
      default: return { from: null, to: null };
    }
  }, []);

  const resolveCustomerFilter = useCallback((cid) => {
    const NO_MATCH_ID = '0';
    if (cid === 'ALL') {
      const ids = (allowedRef.current || []).filter((a) => a.platform === 'google_ads').map((a) => a.platform_customer_id);
      return ids.length ? { customerIds: ids } : { customerIds: [NO_MATCH_ID] };
    }
    if (cid === '__NONE__') return { customerIds: [NO_MATCH_ID] };
    return { customerId: cid };
  }, []);

  const fetchData = useCallback(async () => {
    const f = filtersRef.current;
    const { from, to } = computeDateRange(f.datePreset, f.dateFrom, f.dateTo);
    if (!from || !to) return;

    setLoading(true);
    setError(null);
    setLoadingPhase('Loading…');

    const safe = (p) => p.catch((err) => {
      console.warn('[AgencyReport]', err.message);
      return [];
    });

    const baseFilter = resolveCustomerFilter(f.customerId);
    const queryParams = (extra) => ({ ...baseFilter, dateFrom: from, dateTo: to, extra: extra || '' });

    try {
      if (reportType === 'geo') {
        setLoadingPhase('Loading geo, constants…');
        const [geoData, geoConstData] = await Promise.all([
          safe(sbFetchAllParallel(buildQuery('gads_geo_location_daily', queryParams('&order=date.desc')))),
          safe(sbFetchAllParallel('gads_geo_constants?select=geo_id,geo_name,canonical_name,target_type,country_code')),
        ]);
        setGeoConstants(Array.isArray(geoConstData) ? geoConstData : []);
        setRawData(Array.isArray(geoData) ? geoData : []);
        setRawKeywords([]);
      } else {
        setLoadingPhase('Loading search terms, keywords…');
        const [searchTermData, keywordData] = await Promise.all([
          safe(sbFetchAllParallel(buildQuery('gads_search_term_daily', queryParams('&order=date.desc')))),
          safe(sbFetchAllParallel(buildQuery('gads_keyword_daily', queryParams('&order=date.desc')))),
        ]);
        setRawData(Array.isArray(searchTermData) ? searchTermData : []);
        setRawKeywords(Array.isArray(keywordData) ? keywordData : []);
        setGeoConstants([]);
      }
    } catch (err) {
      setError(err?.message || 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, [reportType, computeDateRange, resolveCustomerFilter]);

  useEffect(() => {
    const gadsAccounts = (allowedRef.current || []).filter((a) => a.platform === 'google_ads');
    if (gadsAccounts.length === 0) {
      setClientOptions([{ id: '__NONE__', name: 'No accounts assigned' }]);
    } else if (gadsAccounts.length === 1) {
      setClientOptions([{ id: gadsAccounts[0].platform_customer_id, name: gadsAccounts[0].client_name }]);
      setFilters((prev) => ({ ...prev, customerId: gadsAccounts[0].platform_customer_id }));
    } else {
      setClientOptions([
        { id: 'ALL', name: 'All my accounts' },
        ...gadsAccounts.map((a) => ({ id: a.platform_customer_id, name: a.client_name })),
      ]);
    }
  }, [allowedClientAccounts]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const aggregated = useMemo(() => {
    if (reportType === 'geo') {
      const geoLookup = new Map();
      (geoConstants || []).forEach((g) => {
        const id = String(g.geo_id || '').trim();
        const name = g.canonical_name || g.geo_name || g.geo_id || '';
        const rec = { name, target_type: g.target_type || '', country_code: g.country_code || '' };
        geoLookup.set(id, rec);
        if (id.includes('/')) geoLookup.set(id.split('/').pop() || id, rec);
      });
      const resolve = (id) => {
        const s = String(id || '').trim();
        const k = s.includes('/') ? s.split('/').pop() : s;
        return geoLookup.get(k)?.name || geoLookup.get(s)?.name || id || 'Unknown';
      };
      const getRec = (id) => {
        const s = String(id || '').trim();
        const k = s.includes('/') ? s.split('/').pop() : s;
        return geoLookup.get(k) || geoLookup.get(s);
      };
      const map = new Map();
      (rawData || []).forEach((r) => {
        const locId = r.most_specific || r.city || r.region || r.country || '';
        const loc = resolve(locId) || locId || 'Unknown';
        const countryId = r.country || '';
        const countryName = resolve(countryId) || countryId || '';
        const countryCode = getRec(countryId)?.country_code || '';
        const targetType = getRec(locId)?.target_type || '';
        if (!map.has(loc)) map.set(loc, { location: loc, geo_type: targetType, country: countryName, country_code: countryCode, cost: 0, clicks: 0, impressions: 0, conversions: 0, conversions_value: 0 });
        const a = map.get(loc);
        a.cost += num(r.cost); a.clicks += num(r.clicks); a.impressions += num(r.impressions);
        a.conversions += num(r.conversions); a.conversions_value += num(r.conversions_value);
      });
      return [...map.values()].map(addMetrics).sort((a, b) => b.cost - a.cost);
    }
    const topKeywordByAdGroup = new Map();
    (rawKeywords || []).forEach((r) => {
      const id = r.ad_group_id;
      const cost = num(r.cost);
      const cur = topKeywordByAdGroup.get(id);
      if (!cur || cost > cur.cost) topKeywordByAdGroup.set(id, { keyword_text: r.keyword_text, cost });
    });
    const map = new Map();
    (rawData || []).forEach((r) => {
      const id = `${r.ad_group_id}_${r.search_term}`;
      const topKw = topKeywordByAdGroup.get(r.ad_group_id);
      if (!map.has(id)) map.set(id, { _key: id, search_term: r.search_term, keyword_text: topKw?.keyword_text || '', campaign_name: r.campaign_name || '', ad_group_id: r.ad_group_id, cost: 0, clicks: 0, impressions: 0, conversions: 0, conversions_value: 0 });
      const a = map.get(id);
      a.cost += num(r.cost); a.clicks += num(r.clicks); a.impressions += num(r.impressions);
      a.conversions += num(r.conversions); a.conversions_value += num(r.conversions_value);
    });
    return [...map.values()].map(addMetrics).sort((a, b) => b.cost - a.cost);
  }, [reportType, rawData, rawKeywords, geoConstants]);

  return {
    data: aggregated,
    loading,
    loadingPhase,
    error,
    fetchData,
    filters,
    updateFilter,
    clientOptions,
    computeDateRange,
  };
}
