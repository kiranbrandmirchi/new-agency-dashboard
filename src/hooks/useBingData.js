import { useState, useCallback, useMemo, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { getEffectiveAgencyScopeId } from '../lib/agencyScope';
import { useApp } from '../context/AppContext';

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
  const daysAgo = (n) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - n));
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

function num(v) { return Number(v) || 0; }

export function useBingData() {
  const { activeAgencyId, agencyId, userProfile, userRole, allowedClientAccounts, canViewAllCustomers } = useAuth();
  const { selectedClientId } = useApp();
  const isSuperAdmin = !!(userProfile?.is_super_admin || userRole?.toLowerCase() === 'super_admin');
  const scopeAgencyId = useMemo(
    () => getEffectiveAgencyScopeId(isSuperAdmin, activeAgencyId, agencyId),
    [isSuperAdmin, activeAgencyId, agencyId],
  );

  const [filters, setFilters] = useState({
    datePreset: 'this_month',
    dateFrom: '',
    dateTo: '',
    customerId: 'ALL',
  });

  const [rawCampaignDaily, setRawCampaignDaily] = useState([]);
  const [rawKeywords, setRawKeywords] = useState([]);
  const [rawSearchTerms, setRawSearchTerms] = useState([]);
  const [rawAds, setRawAds] = useState([]);
  const [rawGeo, setRawGeo] = useState([]);
  const [bingAccounts, setBingAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingPhase, setLoadingPhase] = useState('');
  const [error, setError] = useState(null);

  const updateFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const batchUpdateFilters = useCallback((updates) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  }, []);

  const fetchData = useCallback(async (dateOverrides) => {
    setLoading(true);
    setError(null);
    setLoadingPhase('Loading accounts…');

    try {
      const aid = scopeAgencyId;
      let accounts = [];
      if (aid && canViewAllCustomers) {
        const { data } = await supabase
          .from('client_platform_accounts')
          .select('platform_customer_id, account_name, client_id')
          .eq('agency_id', aid)
          .eq('platform', 'bing')
          .eq('is_active', true)
          .order('account_name');
        accounts = (data || []).map((r) => ({
          id: r.platform_customer_id,
          name: r.account_name || r.platform_customer_id,
          client_id: r.client_id || null,
        }));
      } else {
        accounts = (allowedClientAccounts || [])
          .filter((a) => a.platform === 'bing')
          .map((a) => ({
            id: a.platform_customer_id,
            name: a.account_name || a.client_name || a.platform_customer_id,
            client_id: a.client_id || null,
          }));
      }
      setBingAccounts(accounts);

      const custId = dateOverrides?.customerId ?? filters.customerId;
      const customerIds = custId && custId !== 'ALL'
        ? [custId]
        : accounts.map((a) => a.id);

      if (customerIds.length === 0) {
        setRawCampaignDaily([]);
        setRawKeywords([]);
        setRawSearchTerms([]);
        setRawAds([]);
        setRawGeo([]);
        setLoading(false);
        return;
      }

      let from, to;
      if (dateOverrides?.dateFrom && dateOverrides?.dateTo) {
        from = dateOverrides.dateFrom;
        to = dateOverrides.dateTo;
      } else {
        const range = computeDateRange(filters.datePreset, filters.dateFrom, filters.dateTo);
        from = range.from;
        to = range.to;
      }
      if (!from || !to) {
        setRawCampaignDaily([]);
        setRawKeywords([]);
        setRawSearchTerms([]);
        setRawAds([]);
        setRawGeo([]);
        setLoading(false);
        return;
      }

      setLoadingPhase('Loading campaign / keyword / ad data…');

      const PAGE_SIZE = 1000;
      const fetchAll = async (table) => {
        const all = [];
        let offset = 0;
        let hasMore = true;
        while (hasMore) {
          const { data, error: qErr } = await supabase
            .from(table)
            .select('*')
            .in('customer_id', customerIds)
            .gte('report_date', from)
            .lte('report_date', to)
            .order('report_date', { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);
          if (qErr) throw qErr;
          all.push(...(data || []));
          hasMore = (data || []).length === PAGE_SIZE;
          offset += PAGE_SIZE;
        }
        return all;
      };

      const [campaignRows, keywordRows, searchTermRows, adRows, geoRows] = await Promise.all([
        fetchAll('bing_campaign_daily'),
        fetchAll('bing_keyword_daily'),
        fetchAll('bing_search_term_daily'),
        fetchAll('bing_ad_daily'),
        fetchAll('bing_geo_location_daily'),
      ]);

      setRawCampaignDaily(campaignRows);
      setRawKeywords(keywordRows);
      setRawSearchTerms(searchTermRows);
      setRawAds(adRows);
      setRawGeo(geoRows);
    } catch (err) {
      setError(err?.message || 'Failed to fetch data');
      setRawCampaignDaily([]);
      setRawKeywords([]);
      setRawSearchTerms([]);
      setRawAds([]);
      setRawGeo([]);
    } finally {
      setLoading(false);
    }
  }, [filters.datePreset, filters.dateFrom, filters.dateTo, filters.customerId, scopeAgencyId, allowedClientAccounts, canViewAllCustomers]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const cid = filters.customerId;
    if (cid && cid !== 'ALL' && bingAccounts.length > 0 && !bingAccounts.some((a) => a.id === cid)) {
      setFilters((prev) => ({ ...prev, customerId: 'ALL' }));
    }
  }, [bingAccounts, filters.customerId]);

  useEffect(() => {
    if (!bingAccounts.length || !selectedClientId) return;

    const selectedFromAllowed = (allowedClientAccounts || [])
      .find((a) => String(a.platform_customer_id) === String(selectedClientId));
    const selectedGroupId = selectedFromAllowed?.client_id || null;

    let nextCustomerId = null;
    if (selectedGroupId) {
      const grouped = bingAccounts.find((a) => a.client_id && a.client_id === selectedGroupId);
      if (grouped?.id) nextCustomerId = grouped.id;
    }
    if (!nextCustomerId) {
      const direct = bingAccounts.find((a) => String(a.id) === String(selectedClientId));
      if (direct?.id) nextCustomerId = direct.id;
    }
    if (!nextCustomerId) return;
    if (String(filters.customerId || 'ALL') === String(nextCustomerId)) return;

    setFilters((prev) => ({ ...prev, customerId: nextCustomerId }));
  }, [selectedClientId, bingAccounts, allowedClientAccounts, filters.customerId]);

  useEffect(() => {
    if (canViewAllCustomers) return;
    if (!bingAccounts.length) return;
    if (filters.customerId && filters.customerId !== 'ALL') return;
    setFilters((prev) => ({ ...prev, customerId: String(bingAccounts[0].id) }));
  }, [canViewAllCustomers, bingAccounts, filters.customerId]);

  /** Campaign-grain rows are the rows where ad_group_id is empty. */
  const campaignOnlyRows = useMemo(
    () => rawCampaignDaily.filter((r) => !r.ad_group_id),
    [rawCampaignDaily],
  );

  /** Ad-group-grain rows are the rows where ad_group_id is set. */
  const adGroupOnlyRows = useMemo(
    () => rawCampaignDaily.filter((r) => r.ad_group_id),
    [rawCampaignDaily],
  );

  const kpis = useMemo(() => {
    const rows = campaignOnlyRows.length ? campaignOnlyRows : rawCampaignDaily;
    const totalImpressions = rows.reduce((s, r) => s + num(r.impressions), 0);
    const totalClicks = rows.reduce((s, r) => s + num(r.clicks), 0);
    const totalSpend = rows.reduce((s, r) => s + num(r.spend), 0);
    const totalConversions = rows.reduce((s, r) => s + num(r.conversions), 0);
    const totalConvValue = rows.reduce((s, r) => s + num(r.conversions_value), 0);

    return {
      totalImpressions,
      totalClicks,
      totalSpend,
      ctr: totalImpressions ? (totalClicks / totalImpressions) * 100 : 0,
      cpc: totalClicks ? totalSpend / totalClicks : 0,
      totalConversions,
      cpa: totalConversions ? totalSpend / totalConversions : 0,
      roas: totalSpend ? totalConvValue / totalSpend : 0,
      totalConvValue,
    };
  }, [campaignOnlyRows, rawCampaignDaily]);

  const aggregateBy = (rows, key) => {
    const map = new Map();
    rows.forEach((r) => {
      const k = key(r);
      if (!map.has(k)) {
        map.set(k, { ...emptyAgg(), _key: k });
      }
      const a = map.get(k);
      a.impressions += num(r.impressions);
      a.clicks += num(r.clicks);
      a.spend += num(r.spend);
      a.conversions += num(r.conversions);
      a.conversions_value += num(r.conversions_value);
    });
    return [...map.values()].map(finalizeAgg);
  };

  const campaigns = useMemo(() => {
    const src = campaignOnlyRows.length ? campaignOnlyRows : rawCampaignDaily;
    return aggregateBy(src, (r) => r.campaign_name || r.campaign_id || 'Unknown')
      .map((a) => ({ ...a, campaign_name: a._key }));
  }, [campaignOnlyRows, rawCampaignDaily]);

  const adGroups = useMemo(() => {
    return aggregateBy(adGroupOnlyRows, (r) => `${r.campaign_name || ''}\x00${r.ad_group_name || r.ad_group_id || ''}`)
      .map((a) => {
        const [campaign_name, ad_group_name] = a._key.split('\x00');
        return { ...a, campaign_name, ad_group_name };
      });
  }, [adGroupOnlyRows]);

  const ads = useMemo(() => {
    return aggregateBy(rawAds, (r) => `${r.campaign_name || ''}\x00${r.ad_group_name || ''}\x00${r.ad_title || r.ad_id || ''}`)
      .map((a) => {
        const [campaign_name, ad_group_name, ad_title] = a._key.split('\x00');
        return { ...a, campaign_name, ad_group_name, ad_title };
      });
  }, [rawAds]);

  const keywords = useMemo(() => {
    const map = new Map();
    rawKeywords.forEach((r) => {
      const k = `${r.campaign_name || ''}\x00${r.ad_group_name || ''}\x00${r.keyword_text || r.keyword_id || ''}\x00${r.match_type || ''}`;
      if (!map.has(k)) {
        map.set(k, {
          ...emptyAgg(),
          campaign_name: r.campaign_name,
          ad_group_name: r.ad_group_name,
          keyword_text: r.keyword_text,
          match_type: r.match_type,
          avg_position_sum: 0,
          avg_position_n: 0,
        });
      }
      const a = map.get(k);
      a.impressions += num(r.impressions);
      a.clicks += num(r.clicks);
      a.spend += num(r.spend);
      a.conversions += num(r.conversions);
      a.conversions_value += num(r.conversions_value);
      if (r.avg_position) {
        a.avg_position_sum += num(r.avg_position);
        a.avg_position_n += 1;
      }
    });
    return [...map.values()].map((a) => {
      const o = finalizeAgg(a);
      o.avg_position = a.avg_position_n ? a.avg_position_sum / a.avg_position_n : 0;
      return o;
    });
  }, [rawKeywords]);

  const searchTerms = useMemo(() => {
    return aggregateBy(rawSearchTerms, (r) => `${r.campaign_name || ''}\x00${r.ad_group_name || ''}\x00${r.search_term || ''}\x00${r.match_type || ''}`)
      .map((a) => {
        const [campaign_name, ad_group_name, search_term, match_type] = a._key.split('\x00');
        return { ...a, campaign_name, ad_group_name, search_term, match_type };
      });
  }, [rawSearchTerms]);

  const geo = useMemo(() => {
    return aggregateBy(rawGeo, (r) => r.location_name || r.country_code || r.location_id || 'Unknown')
      .map((a) => ({ ...a, location_name: a._key }));
  }, [rawGeo]);

  const conversions = useMemo(() => {
    return aggregateBy(campaignOnlyRows.length ? campaignOnlyRows : rawCampaignDaily, (r) => r.campaign_name || r.campaign_id || 'Unknown')
      .map((a) => ({ ...a, campaign_name: a._key }));
  }, [campaignOnlyRows, rawCampaignDaily]);

  const dailyTrend = useMemo(() => {
    const rows = campaignOnlyRows.length ? campaignOnlyRows : rawCampaignDaily;
    const map = new Map();
    rows.forEach((r) => {
      const d = r.report_date;
      if (!d) return;
      if (!map.has(d)) {
        map.set(d, { report_date: d, impressions: 0, clicks: 0, spend: 0, conversions: 0, conversions_value: 0 });
      }
      const a = map.get(d);
      a.impressions += num(r.impressions);
      a.clicks += num(r.clicks);
      a.spend += num(r.spend);
      a.conversions += num(r.conversions);
      a.conversions_value += num(r.conversions_value);
    });
    return [...map.values()]
      .sort((a, b) => (a.report_date || '').localeCompare(b.report_date || ''))
      .map((o) => {
        o.ctr = o.impressions ? (o.clicks / o.impressions) * 100 : 0;
        o.cpc = o.clicks ? o.spend / o.clicks : 0;
        o.cpa = o.conversions ? o.spend / o.conversions : 0;
        o.roas = o.spend ? o.conversions_value / o.spend : 0;
        return o;
      });
  }, [campaignOnlyRows, rawCampaignDaily]);

  const rowCounts = useMemo(() => ({
    campaigns: campaigns.length,
    adGroups: adGroups.length,
    ads: ads.length,
    keywords: keywords.length,
    searchTerms: searchTerms.length,
    geo: geo.length,
  }), [campaigns, adGroups, ads, keywords, searchTerms, geo]);

  return {
    filters,
    setFilters,
    updateFilter,
    batchUpdateFilters,
    loading,
    loadingPhase,
    error,
    kpis,
    campaigns,
    adGroups,
    ads,
    keywords,
    searchTerms,
    geo,
    conversions,
    dailyTrend,
    bingAccounts,
    rowCounts,
    fetchData,
  };
}

function emptyAgg() {
  return { impressions: 0, clicks: 0, spend: 0, conversions: 0, conversions_value: 0 };
}

function finalizeAgg(o) {
  o.ctr = o.impressions ? (o.clicks / o.impressions) * 100 : 0;
  o.cpc = o.clicks ? o.spend / o.clicks : 0;
  o.cpa = o.conversions ? o.spend / o.conversions : 0;
  o.roas = o.spend ? o.conversions_value / o.spend : 0;
  return o;
}
