import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { sbFetchAllParallel, buildQuery } from '../lib/supabaseRest';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { getEffectiveAgencyScopeId } from '../lib/agencyScope';

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

function computeDateRange(preset, customFrom, customTo) {
  const today = nowGMT5();
  const fmt = (d) => fmtYMD(d);
  const daysAgo = (n) => { const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - n)); return d; };
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

function num(v) { return Number(v) || 0; }

function addMetrics(o) {
  o.ctr = o.impressions ? (o.clicks / o.impressions) * 100 : 0;
  o.cpc = o.clicks ? o.cost / o.clicks : 0;
  o.conv_rate = o.clicks ? (o.conversions / o.clicks) * 100 : 0;
  o.cpa = o.conversions ? o.cost / o.conversions : 0;
  return o;
}

export function useGoogleAdsData() {
  const { canViewAllCustomers, allowedClientAccounts, activeAgencyId, agencyId, userProfile, userRole } = useAuth();
  const isSuperAdmin = !!(userProfile?.is_super_admin || userRole?.toLowerCase() === 'super_admin');
  const scopeAgencyId = useMemo(
    () => getEffectiveAgencyScopeId(isSuperAdmin, activeAgencyId, agencyId),
    [isSuperAdmin, activeAgencyId, agencyId],
  );

  const allowedClientAccountsRef = useRef(allowedClientAccounts);
  allowedClientAccountsRef.current = allowedClientAccounts;

  const fetchInProgressRef = useRef(false);

  const [filters, setFilters] = useState({
    datePreset: 'this_month', dateFrom: '', dateTo: '',
    compareOn: false, compareFrom: '', compareTo: '',
    customerId: 'ALL', channelType: 'all', status: 'all',
    campaignSearch: '', adGroupSearch: '', keywordSearch: '',
  });

  const [rawCampaigns, setRawCampaigns] = useState([]);
  const [rawAdGroups, setRawAdGroups] = useState([]);
  const [rawKeywords, setRawKeywords] = useState([]);
  const [rawSearchTerms, setRawSearchTerms] = useState([]);
  const [rawGeo, setRawGeo] = useState([]);
  const [geoConstants, setGeoConstants] = useState([]);
  const [rawConversions, setRawConversions] = useState([]);
  const [rawCompareCampaigns, setRawCompareCampaigns] = useState([]);
  const [campaignStatusMap, setCampaignStatusMap] = useState(new Map());
  const [clientOptions, setClientOptions] = useState([]);
  const [channelTypes, setChannelTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingPhase, setLoadingPhase] = useState('');
  const [error, setError] = useState(null);

  const optionsLoaded = useRef(false);
  const clientIdToPlatformIds = useRef(new Map());
  /** Google Ads customer IDs from client_platform_accounts (for explicit `in.(…)` when Client = All). */
  const gadsAllCustomerIdsRef = useRef([]);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const customers = clientOptions;
  const showAllClientsOption = canViewAllCustomers;

  const updateFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const batchUpdateFilters = useCallback((updates) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  }, []);

  const fetchData = useCallback(async () => {
    if (fetchInProgressRef.current) return;
    fetchInProgressRef.current = true;
    const f = filtersRef.current;
    setLoading(true);
    setError(null);
    setLoadingPhase('Loading accounts…');
    try {
      const { from, to } = computeDateRange(f.datePreset, f.dateFrom, f.dateTo);
      let cid = f.customerId;

      const useAgencyScoped = scopeAgencyId || !canViewAllCustomers;
      if (!optionsLoaded.current) {
        if (canViewAllCustomers && !useAgencyScoped) {
          const { data: cpaData, error: cpaErr } = await supabase
            .from('client_platform_accounts')
            .select('id,platform_customer_id,account_name')
            .eq('platform', 'google_ads')
            .eq('is_active', true);
          if (cpaErr) console.warn('[GAds] client_platform_accounts error:', cpaErr);
          const map = new Map();
          (cpaData || []).forEach((r) => {
            const cid = String(r.platform_customer_id);
            if (!map.has(cid)) map.set(cid, [cid]);
          });
          clientIdToPlatformIds.current = map;
          const options = [{ id: 'ALL', name: 'All Accounts' }];
          (cpaData || []).forEach((c) => {
            options.push({
              id: String(c.platform_customer_id),
              name: c.account_name || c.platform_customer_id,
            });
          });
          gadsAllCustomerIdsRef.current = [
            ...new Set((cpaData || []).map((r) => String(r.platform_customer_id)).filter(Boolean)),
          ];
          setClientOptions(options);
        } else {
          const gadsAccounts = (allowedClientAccountsRef.current || []).filter((a) => a.platform === 'google_ads');
          if (gadsAccounts.length === 0) {
            cid = '__NONE__';
            setClientOptions([{ id: '__NONE__', name: 'No accounts assigned. Contact admin.' }]);
            setFilters((prev) => ({ ...prev, customerId: '__NONE__' }));
            if (canViewAllCustomers) {
              setError(
                'No active Google Ads accounts found for your agency access. Verify user agency mapping and client_platform_accounts entries (platform=google_ads, is_active=true).'
              );
            }
          } else if (gadsAccounts.length === 1) {
            cid = gadsAccounts[0].platform_customer_id;
            setClientOptions([{ id: gadsAccounts[0].platform_customer_id, name: gadsAccounts[0].client_name }]);
            setFilters((prev) => ({ ...prev, customerId: gadsAccounts[0].platform_customer_id }));
          } else {
            const options = [
              { id: 'ALL_MINE', name: 'All my accounts' },
              ...gadsAccounts.map((a) => ({
                id: a.platform_customer_id,
                name: a.client_name + (a.account_name ? ` (${a.account_name})` : ''),
              })),
            ];
            setClientOptions(options);
            if (cid === 'ALL') {
              cid = 'ALL_MINE';
              setFilters((prev) => ({ ...prev, customerId: 'ALL_MINE' }));
            }
          }
        }
        optionsLoaded.current = true;
      }

      const campaignExtra = '&order=date.desc'
        + (f.campaignSearch ? '&campaign_name=ilike.*' + encodeURIComponent(f.campaignSearch) + '*' : '');
      const adGroupExtra = '&order=date.desc'
        + (f.adGroupSearch ? '&ad_group_name=ilike.*' + encodeURIComponent(f.adGroupSearch) + '*' : '');
      const keywordExtra = '&order=date.desc'
        + (f.keywordSearch ? '&keyword_text=ilike.*' + encodeURIComponent(f.keywordSearch) + '*' : '');

      let compFrom = null, compTo = null;
      if (f.compareOn) {
        if (f.compareFrom && f.compareTo) {
          compFrom = f.compareFrom; compTo = f.compareTo;
        } else {
          const prev = computePreviousPeriod(from, to);
          compFrom = prev.from; compTo = prev.to;
        }
      }

      const safe = (promise) => promise.catch((err) => {
        console.warn('[GAds] Table fetch failed, skipping:', err.message);
        return [];
      });

      const NO_MATCH_ID = '0';

      const resolveCustomerFilter = () => {
        if (cid === 'ALL') {
          if (!canViewAllCustomers || useAgencyScoped) {
            const ids = (allowedClientAccountsRef.current || []).filter((a) => a.platform === 'google_ads').map((a) => a.platform_customer_id);
            return ids.length ? { customerIds: ids } : { customerIds: [NO_MATCH_ID] };
          }
          const allIds = gadsAllCustomerIdsRef.current;
          if (allIds.length > 0) return { customerIds: allIds };
          return {};
        }
        if (cid === '__NONE__') return { customerIds: [NO_MATCH_ID] };
        if (cid === 'ALL_MINE') {
          const ids = (allowedClientAccountsRef.current || []).filter((a) => a.platform === 'google_ads').map((a) => a.platform_customer_id);
          return ids.length ? { customerIds: ids } : { customerIds: [NO_MATCH_ID] };
        }
        return { customerId: cid };
      };

      const queryParams = (extra) => {
        const filter = resolveCustomerFilter();
        return { ...filter, dateFrom: from, dateTo: to, extra };
      };

      const baseFilter = resolveCustomerFilter();
      const qParams = { ...baseFilter, dateFrom: from, dateTo: to, extra: campaignExtra };
      const statusParams = baseFilter;
      const qParamsCompare = { ...baseFilter, dateFrom: compFrom, dateTo: compTo, extra: campaignExtra };

      setLoadingPhase('Loading campaigns…');
      const [campaignData, statusData] = await Promise.all([
        safe(sbFetchAllParallel(buildQuery('gads_campaign_daily', qParams))),
        safe(sbFetchAllParallel(buildQuery('gads_campaign_status', statusParams))),
      ]);

      setLoadingPhase('Loading ad groups, keywords…');
      const [adGroupData, keywordData] = await Promise.all([
        safe(sbFetchAllParallel(buildQuery('gads_adgroup_daily', queryParams(adGroupExtra)))),
        safe(sbFetchAllParallel(buildQuery('gads_keyword_daily', queryParams(keywordExtra)))),
      ]);

      setLoadingPhase('Loading conversions…');
      const conversionData = await safe(sbFetchAllParallel(buildQuery('gads_conversion_daily', queryParams('&order=date.desc'))));

      let compareCampaignData = [];
      if (f.compareOn && compFrom && compTo) {
        compareCampaignData = await safe(sbFetchAllParallel(buildQuery('gads_campaign_daily', qParamsCompare)));
      }

      console.log('[GAds] Fetch results:', {
        campaigns: campaignData.length,
        adGroups: adGroupData.length,
        keywords: keywordData.length,
        conversions: conversionData.length,
        statuses: statusData.length,
        dateRange: { from, to },
      });

      const statusMap = new Map();
      (statusData || []).forEach((s) => statusMap.set(String(s.campaign_id), s));
      setCampaignStatusMap(statusMap);

      let validCampaignIds = null;
      if (f.channelType !== 'all' || f.status !== 'all') {
        const filtered = (statusData || []).filter((s) => {
          if (f.channelType !== 'all' && s.campaign_type !== f.channelType) return false;
          if (f.status !== 'all' && s.campaign_status !== f.status) return false;
          return true;
        });
        validCampaignIds = new Set(filtered.map((s) => String(s.campaign_id)));
      }

      const filterByCampaign = (rows) =>
        validCampaignIds ? rows.filter((r) => validCampaignIds.has(String(r.campaign_id))) : rows;

      setRawCampaigns(filterByCampaign(campaignData));
      setRawAdGroups(filterByCampaign(adGroupData));
      setRawKeywords(filterByCampaign(keywordData));
      setRawSearchTerms([]);
      setRawGeo([]);
      setRawConversions(filterByCampaign(conversionData));
      setRawCompareCampaigns(f.compareOn ? filterByCampaign(compareCampaignData) : []);

      if (campaignData.length === 0 && (statusData || []).length === 0) {
        console.warn('[GAds] All tables returned 0 rows. Check RLS policies or ensure tables have data.');
      }

      if (!optionsLoaded.current) {
        const types = new Set();
        (statusData || []).forEach((s) => { if (s.campaign_type) types.add(s.campaign_type); });
        if (types.size === 0) campaignData.forEach((r) => { if (r.campaign_type) types.add(r.campaign_type); });
        setChannelTypes([...types].sort());
        optionsLoaded.current = true;
      }
    } catch (err) {
      console.error('[GAds] Fetch error:', err);
      const msg = err.message || 'Failed to fetch data';
      setError(
        msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network')
          ? 'Cannot reach Supabase. Check your network connection or try a VPN/mobile hotspot.'
          : msg
      );
    } finally {
      fetchInProgressRef.current = false;
      setLoading(false);
    }
  }, [canViewAllCustomers, allowedClientAccounts, scopeAgencyId]);

  useEffect(() => {
    optionsLoaded.current = false;
    fetchInProgressRef.current = false;
    gadsAllCustomerIdsRef.current = [];
    setClientOptions([]);
    setFilters((prev) => ({ ...prev, customerId: 'ALL' }));
  }, [canViewAllCustomers, scopeAgencyId, allowedClientAccounts]);
  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── KPIs ── */
  const kpis = useMemo(() => {
    if (!rawCampaigns.length) return null;
    const k = { cost: 0, clicks: 0, impressions: 0, conversions: 0, conversions_value: 0, allConversions: 0 };
    rawCampaigns.forEach((r) => {
      k.cost += num(r.cost);
      k.clicks += num(r.clicks);
      k.impressions += num(r.impressions);
      k.conversions += num(r.conversions);
      k.conversions_value += num(r.conversions_value);
      k.allConversions += num(r.all_conversions);
    });
    k.ctr = k.impressions ? (k.clicks / k.impressions) * 100 : 0;
    k.cpc = k.clicks ? k.cost / k.clicks : 0;
    k.conv_rate = k.clicks ? (k.conversions / k.clicks) * 100 : 0;
    k.cpa = k.conversions ? k.cost / k.conversions : 0;
    k.roas = k.cost ? k.conversions_value / k.cost : 0;
    k.campaigns = new Set(rawCampaigns.map((r) => r.campaign_id)).size;
    return k;
  }, [rawCampaigns]);

  /* ── Campaign Types ── */
  const campaignTypesAgg = useMemo(() => {
    const map = new Map();
    let totalCost = 0;
    rawCampaigns.forEach((r) => {
      const type = r.campaign_type || campaignStatusMap.get(String(r.campaign_id))?.campaign_type || 'Unknown';
      if (!map.has(type)) map.set(type, { type, campaign_ids: new Set(), cost: 0, clicks: 0, impressions: 0, conversions: 0, conversions_value: 0 });
      const a = map.get(type);
      a.campaign_ids.add(r.campaign_id);
      const cost = num(r.cost);
      a.cost += cost;
      a.clicks += num(r.clicks);
      a.impressions += num(r.impressions);
      a.conversions += num(r.conversions);
      a.conversions_value += num(r.conversions_value);
      totalCost += cost;
    });
    return [...map.values()].map((o) => {
      o.campaign_count = o.campaign_ids.size;
      delete o.campaign_ids;
      o.spend_pct = totalCost ? (o.cost / totalCost) * 100 : 0;
      return addMetrics(o);
    }).sort((a, b) => b.cost - a.cost);
  }, [rawCampaigns, campaignStatusMap]);

  /* ── Campaigns ── */
  const campaignsAgg = useMemo(() => {
    const map = new Map();
    rawCampaigns.forEach((r) => {
      const id = r.campaign_id;
      if (!map.has(id)) {
        const status = campaignStatusMap.get(String(id));
        map.set(id, {
          campaign_id: id,
          campaign_name: r.campaign_name,
          campaign_status: status?.campaign_status || '',
          channel_type: r.campaign_type || status?.campaign_type || '',
          cost: 0, clicks: 0, impressions: 0, conversions: 0,
          conversions_value: 0, allConversions: 0,
        });
      }
      const a = map.get(id);
      a.cost += num(r.cost);
      a.clicks += num(r.clicks);
      a.impressions += num(r.impressions);
      a.conversions += num(r.conversions);
      a.conversions_value += num(r.conversions_value);
      a.allConversions += num(r.all_conversions);
    });
    return [...map.values()].map(addMetrics).sort((a, b) => b.cost - a.cost);
  }, [rawCampaigns, campaignStatusMap]);

  /* ── Ad Groups (with match type from keywords) ── */
  const adGroupsAgg = useMemo(() => {
    const matchByAdGroup = new Map();
    rawKeywords.forEach((r) => {
      const id = r.ad_group_id;
      const cost = num(r.cost);
      if (!matchByAdGroup.has(id)) matchByAdGroup.set(id, {});
      const m = matchByAdGroup.get(id);
      const mt = r.keyword_match_type || 'UNKNOWN';
      m[mt] = (m[mt] || 0) + cost;
    });
    const getDominantMatchType = (adGroupId) => {
      const m = matchByAdGroup.get(adGroupId);
      if (!m) return '';
      let best = '', bestCost = 0;
      Object.entries(m).forEach(([mt, c]) => { if (c > bestCost) { bestCost = c; best = mt; } });
      return best;
    };

    const map = new Map();
    rawAdGroups.forEach((r) => {
      const id = r.ad_group_id;
      if (!map.has(id)) map.set(id, {
        ad_group_id: id,
        ad_group_name: r.ad_group_name,
        campaign_name: r.campaign_name || '',
        campaign_id: r.campaign_id,
        keyword_match_type: getDominantMatchType(id),
        cost: 0, clicks: 0, impressions: 0, conversions: 0, conversions_value: 0,
      });
      const a = map.get(id);
      a.cost += num(r.cost);
      a.clicks += num(r.clicks);
      a.impressions += num(r.impressions);
      a.conversions += num(r.conversions);
      a.conversions_value += num(r.conversions_value);
    });
    return [...map.values()].map(addMetrics).sort((a, b) => b.cost - a.cost);
  }, [rawAdGroups, rawKeywords]);

  /* ── Keywords ── */
  const keywordsAgg = useMemo(() => {
    const map = new Map();
    rawKeywords.forEach((r) => {
      const id = `${r.ad_group_id}_${r.keyword_id}`;
      if (!map.has(id)) map.set(id, {
        _key: id,
        keyword_id: r.keyword_id,
        keyword_text: r.keyword_text,
        keyword_match_type: r.keyword_match_type,
        campaign_id: r.campaign_id,
        ad_group_id: r.ad_group_id,
        campaign_name: r.campaign_name || '',
        ad_group_name: r.ad_group_name || '',
        quality_score: r.quality_score,
        cost: 0, clicks: 0, impressions: 0, conversions: 0, conversions_value: 0,
      });
      const a = map.get(id);
      a.cost += num(r.cost);
      a.clicks += num(r.clicks);
      a.impressions += num(r.impressions);
      a.conversions += num(r.conversions);
      a.conversions_value += num(r.conversions_value);
    });
    return [...map.values()].map(addMetrics).sort((a, b) => b.cost - a.cost);
  }, [rawKeywords]);

  /* ── Search Terms (with top keyword from same ad group) ── */
  const searchTermsAgg = useMemo(() => {
    const topKeywordByAdGroup = new Map();
    rawKeywords.forEach((r) => {
      const id = r.ad_group_id;
      const cost = num(r.cost);
      const cur = topKeywordByAdGroup.get(id);
      if (!cur || cost > cur.cost) topKeywordByAdGroup.set(id, { keyword_text: r.keyword_text, cost });
    });

    const map = new Map();
    rawSearchTerms.forEach((r) => {
      const id = `${r.ad_group_id}_${r.search_term}`;
      const topKw = topKeywordByAdGroup.get(r.ad_group_id);
      if (!map.has(id)) map.set(id, {
        _key: id,
        search_term: r.search_term,
        keyword_text: topKw?.keyword_text || '',
        campaign_id: r.campaign_id,
        campaign_name: r.campaign_name || '',
        ad_group_id: r.ad_group_id,
        cost: 0, clicks: 0, impressions: 0, conversions: 0, conversions_value: 0,
      });
      const a = map.get(id);
      a.cost += num(r.cost);
      a.clicks += num(r.clicks);
      a.impressions += num(r.impressions);
      a.conversions += num(r.conversions);
      a.conversions_value += num(r.conversions_value);
    });
    return [...map.values()].map(addMetrics).sort((a, b) => b.cost - a.cost);
  }, [rawSearchTerms, rawKeywords]);

  /* ── Geo (resolve IDs via gads_geo_constants, use canonical_name; fallback to raw IDs) ── */
  const geoAgg = useMemo(() => {
    if (!rawGeo || rawGeo.length === 0) return [];

    const geoLookup = new Map();
    (geoConstants || []).forEach((g) => {
      const id = String(g.geo_id || '').trim();
      const name = g.canonical_name || g.geo_name || g.geo_id || '';
      const rec = { name, target_type: g.target_type || '', country_code: g.country_code || '' };
      geoLookup.set(id, rec);
      if (id.includes('/')) geoLookup.set(id.split('/').pop() || id, rec);
    });
    const toId = (v) => {
      if (v == null || v === '') return '';
      const s = String(v).trim();
      const parts = s.split('/');
      return (parts[parts.length - 1] || s).trim();
    };
    const resolve = (id) => {
      const k = toId(id) || String(id);
      return geoLookup.get(k)?.name || geoLookup.get(String(id))?.name || '';
    };
    const getRec = (id) => {
      const k = toId(id) || String(id);
      return geoLookup.get(k) || geoLookup.get(String(id));
    };

    const map = new Map();
    rawGeo.forEach((r) => {
      if (!r || typeof r !== 'object') return;
      const locId = r.most_specific || r.city || r.region || r.country || '';
      const loc = resolve(locId) || locId || 'Unknown';
      const countryId = r.country || '';
      const countryName = resolve(countryId) || countryId || '';
      const countryCode = getRec(countryId)?.country_code || '';
      const targetType = getRec(locId)?.target_type || '';

      if (!map.has(loc)) map.set(loc, {
        location: loc,
        location_id: locId,
        geo_type: targetType,
        country: countryName,
        country_code: countryCode,
        country_id: countryId,
        cost: 0, clicks: 0, impressions: 0, conversions: 0, conversions_value: 0,
      });
      const a = map.get(loc);
      a.cost += num(r.cost);
      a.clicks += num(r.clicks);
      a.impressions += num(r.impressions);
      a.conversions += num(r.conversions);
      a.conversions_value += num(r.conversions_value);
    });
    return [...map.values()].map(addMetrics).sort((a, b) => b.cost - a.cost);
  }, [rawGeo, geoConstants]);

  /* ── Conversions ── */
  const conversionsAgg = useMemo(() => {
    const map = new Map();
    rawConversions.forEach((r) => {
      const id = `${r.campaign_id}_${r.conversion_action_id}`;
      if (!map.has(id)) {
        const status = campaignStatusMap.get(String(r.campaign_id));
        map.set(id, {
          _key: id,
          campaign_id: r.campaign_id,
          campaign_name: r.campaign_name || '',
          conversion_action_name: r.conversion_action_name || '',
          conversion_action_category: r.conversion_action_category || '',
          channel_type: status?.campaign_type || '',
          conversions: 0, conversions_value: 0, allConversions: 0, cost: 0,
        });
      }
      const a = map.get(id);
      a.conversions += num(r.conversions);
      a.conversions_value += num(r.conversions_value);
    });

    const campaignCostMap = new Map();
    rawCampaigns.forEach((r) => {
      campaignCostMap.set(r.campaign_id, (campaignCostMap.get(r.campaign_id) || 0) + num(r.cost));
    });

    return [...map.values()].map((o) => {
      o.cost = campaignCostMap.get(o.campaign_id) || 0;
      o.cpa = o.conversions ? o.cost / o.conversions : 0;
      return o;
    }).sort((a, b) => b.conversions - a.conversions);
  }, [rawConversions, rawCampaigns, campaignStatusMap]);

  /* ── Daily Trends ── */
  const dailyTrends = useMemo(() => {
    const map = new Map();
    rawCampaigns.forEach((r) => {
      const d = r.date; if (!d) return;
      if (!map.has(d)) map.set(d, { date: d, cost: 0, clicks: 0, impressions: 0, conversions: 0 });
      const a = map.get(d);
      a.cost += num(r.cost);
      a.clicks += num(r.clicks);
      a.impressions += num(r.impressions);
      a.conversions += num(r.conversions);
    });
    return [...map.values()].map(addMetrics).sort((a, b) => a.date.localeCompare(b.date));
  }, [rawCampaigns]);

  /* ── Daily Breakdown (date rows with expandable campaigns) ── */
  const dailyBreakdown = useMemo(() => {
    const byDate = new Map();
    rawCampaigns.forEach((r) => {
      const d = r.date; if (!d) return;
      if (!byDate.has(d)) byDate.set(d, { date: d, cost: 0, clicks: 0, impressions: 0, conversions: 0, conversions_value: 0, campaigns: new Map() });
      const day = byDate.get(d);
      day.cost += num(r.cost);
      day.clicks += num(r.clicks);
      day.impressions += num(r.impressions);
      day.conversions += num(r.conversions);
      day.conversions_value += num(r.conversions_value);
      const cid = r.campaign_id;
      if (!day.campaigns.has(cid)) day.campaigns.set(cid, { campaign_id: cid, campaign_name: r.campaign_name, cost: 0, clicks: 0, impressions: 0, conversions: 0, conversions_value: 0 });
      const c = day.campaigns.get(cid);
      c.cost += num(r.cost);
      c.clicks += num(r.clicks);
      c.impressions += num(r.impressions);
      c.conversions += num(r.conversions);
      c.conversions_value += num(r.conversions_value);
    });
    return [...byDate.values()].map((day) => {
      const campaigns = [...day.campaigns.values()].map(addMetrics).sort((a, b) => b.cost - a.cost);
      delete day.campaigns;
      return { ...addMetrics(day), campaigns };
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [rawCampaigns]);

  /* ── Compare KPIs ── */
  const compareKpis = useMemo(() => {
    if (!rawCompareCampaigns.length) return null;
    const k = { cost: 0, clicks: 0, impressions: 0, conversions: 0, conversions_value: 0, allConversions: 0 };
    rawCompareCampaigns.forEach((r) => {
      k.cost += num(r.cost);
      k.clicks += num(r.clicks);
      k.impressions += num(r.impressions);
      k.conversions += num(r.conversions);
      k.conversions_value += num(r.conversions_value);
      k.allConversions += num(r.all_conversions);
    });
    k.ctr = k.impressions ? (k.clicks / k.impressions) * 100 : 0;
    k.cpc = k.clicks ? k.cost / k.clicks : 0;
    k.conv_rate = k.clicks ? (k.conversions / k.clicks) * 100 : 0;
    k.cpa = k.conversions ? k.cost / k.conversions : 0;
    k.roas = k.cost ? k.conversions_value / k.cost : 0;
    k.campaigns = new Set(rawCompareCampaigns.map((r) => r.campaign_id)).size;
    return k;
  }, [rawCompareCampaigns]);

  /* ── Compare Daily Trends ── */
  const compareDailyTrends = useMemo(() => {
    if (!rawCompareCampaigns.length) return [];
    const map = new Map();
    rawCompareCampaigns.forEach((r) => {
      const d = r.date; if (!d) return;
      if (!map.has(d)) map.set(d, { date: d, cost: 0, clicks: 0, impressions: 0, conversions: 0 });
      const a = map.get(d);
      a.cost += num(r.cost);
      a.clicks += num(r.clicks);
      a.impressions += num(r.impressions);
      a.conversions += num(r.conversions);
    });
    return [...map.values()].map(addMetrics).sort((a, b) => a.date.localeCompare(b.date));
  }, [rawCompareCampaigns]);

  return {
    filters, updateFilter, batchUpdateFilters, fetchData,
    loading, loadingPhase, error, customers, channelTypes, showAllClientsOption,
    kpis, compareKpis,
    campaignTypes: campaignTypesAgg,
    campaigns: campaignsAgg,
    adGroups: adGroupsAgg,
    keywords: keywordsAgg,
    searchTerms: searchTermsAgg,
    geoData: geoAgg,
    conversionsData: conversionsAgg,
    dailyTrends, compareDailyTrends, dailyBreakdown,
    rowCounts: {
      campaigns: rawCampaigns.length,
      adGroups: rawAdGroups.length,
      keywords: rawKeywords.length,
      searchTerms: rawSearchTerms.length,
      geo: rawGeo.length,
      conversions: rawConversions.length,
    },
  };
}
