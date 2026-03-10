import { useState, useCallback, useMemo, useEffect } from 'react';
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

function computeDateRange(preset, customFrom, customTo) {
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
    case 'custom': return { from: customFrom || null, to: customTo || null };
    default: return { from: null, to: null };
  }
}

function num(v) { return Number(v) || 0; }

export function useRedditData() {
  const { activeAgencyId, allowedClientAccounts } = useAuth();

  const [filters, setFilters] = useState({
    datePreset: 'this_month',
    dateFrom: '',
    dateTo: '',
    customerIds: [],
  });

  const [rawCampaigns, setRawCampaigns] = useState([]);
  const [rawAdGroups, setRawAdGroups] = useState([]);
  const [rawCommunities, setRawCommunities] = useState([]);
  const [rawPlacements, setRawPlacements] = useState([]);
  const [redditAccounts, setRedditAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingPhase, setLoadingPhase] = useState('');
  const [error, setError] = useState(null);

  const updateFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const batchUpdateFilters = useCallback((updates) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLoadingPhase('Loading accounts…');

    try {
      const aid = activeAgencyId;
      let accounts = [];
      if (aid) {
        const { data } = await supabase
          .from('client_platform_accounts')
          .select('platform_customer_id, account_name')
          .eq('agency_id', aid)
          .eq('platform', 'reddit')
          .eq('is_active', true)
          .order('account_name');
        accounts = (data || []).map((r) => ({ id: r.platform_customer_id, name: r.account_name || r.platform_customer_id }));
      } else {
        accounts = (allowedClientAccounts || [])
          .filter((a) => a.platform === 'reddit')
          .map((a) => ({ id: a.platform_customer_id, name: a.account_name || a.client_name || a.platform_customer_id }));
      }
      setRedditAccounts(accounts);

      let customerIds = filters.customerIds && filters.customerIds.length > 0 ? filters.customerIds : accounts.map((a) => a.id);

      if (customerIds.length === 0) {
        setRawCampaigns([]);
        setRawAdGroups([]);
        setRawCommunities([]);
        setRawPlacements([]);
        setLoading(false);
        return;
      }

      const { from, to } = computeDateRange(filters.datePreset, filters.dateFrom, filters.dateTo);
      if (!from || !to) {
        setRawCampaigns([]);
        setRawAdGroups([]);
        setRawCommunities([]);
        setRawPlacements([]);
        setLoading(false);
        return;
      }

      setLoadingPhase('Loading campaigns…');
      const { data: campaignData } = await supabase
        .from('reddit_campaign_daily')
        .select('*')
        .in('customer_id', customerIds)
        .gte('report_date', from)
        .lte('report_date', to);

      setLoadingPhase('Loading ad groups, communities, placements…');
      const [adGroupRes, communityRes, placementRes] = await Promise.all([
        supabase.from('reddit_adgroup_daily').select('*').in('customer_id', customerIds).gte('report_date', from).lte('report_date', to),
        supabase.from('reddit_community_daily').select('*').in('customer_id', customerIds).gte('report_date', from).lte('report_date', to),
        supabase.from('reddit_placement_daily').select('*').in('customer_id', customerIds).gte('report_date', from).lte('report_date', to),
      ]);

      setRawCampaigns(campaignData || []);
      setRawAdGroups(adGroupRes.data || []);
      setRawCommunities(communityRes.data || []);
      setRawPlacements(placementRes.data || []);
    } catch (err) {
      setError(err?.message || 'Failed to fetch data');
      setRawCampaigns([]);
      setRawAdGroups([]);
      setRawCommunities([]);
      setRawPlacements([]);
    } finally {
      setLoading(false);
    }
  }, [filters.datePreset, filters.dateFrom, filters.dateTo, filters.customerIds, activeAgencyId, allowedClientAccounts]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const kpis = useMemo(() => {
    const rows = rawCampaigns;
    const totalImpressions = rows.reduce((s, r) => s + num(r.impressions), 0);
    const totalClicks = rows.reduce((s, r) => s + num(r.clicks), 0);
    const totalSpend = rows.reduce((s, r) => s + num(r.spend || r.cost), 0);
    const totalPurchases = rows.reduce((s, r) => s + num(r.purchase_views || 0) + num(r.purchase_clicks || 0), 0);
    const totalPurchaseValue = rows.reduce((s, r) => s + num(r.purchase_total_value || r.conversions_value), 0);

    return {
      totalImpressions,
      totalClicks,
      totalSpend,
      ctr: totalImpressions ? (totalClicks / totalImpressions) * 100 : 0,
      cpc: totalClicks ? totalSpend / totalClicks : 0,
      totalPurchases,
      roas: totalSpend ? totalPurchaseValue / totalSpend : 0,
      cpa: totalPurchases ? totalSpend / totalPurchases : 0,
      totalPurchaseValue,
    };
  }, [rawCampaigns]);

  const campaigns = useMemo(() => {
    const map = new Map();
    rawCampaigns.forEach((r) => {
      const key = r.campaign_name || r.campaign_id || 'Unknown';
      if (!map.has(key)) {
        map.set(key, { campaign_name: key, impressions: 0, clicks: 0, spend: 0, purchase_views: 0, purchase_clicks: 0, purchase_total_value: 0 });
      }
      const a = map.get(key);
      a.impressions += num(r.impressions);
      a.clicks += num(r.clicks);
      a.spend += num(r.spend || r.cost);
      a.purchase_views += num(r.purchase_views);
      a.purchase_clicks += num(r.purchase_clicks);
      a.purchase_total_value += num(r.purchase_total_value || r.conversions_value);
    });
    return [...map.values()].map((o) => {
      o.ctr = o.impressions ? (o.clicks / o.impressions) * 100 : 0;
      o.cpc = o.clicks ? o.spend / o.clicks : 0;
      o.totalPurchases = o.purchase_views + o.purchase_clicks;
      o.roas = o.spend ? o.purchase_total_value / o.spend : 0;
      o.cpa = o.totalPurchases ? o.spend / o.totalPurchases : 0;
      return o;
    });
  }, [rawCampaigns]);

  const adGroups = useMemo(() => {
    const map = new Map();
    rawAdGroups.forEach((r) => {
      const key = `${r.campaign_name || ''}\x00${r.ad_group_name || r.ad_group_id || ''}`;
      if (!map.has(key)) {
        map.set(key, { campaign_name: r.campaign_name, ad_group_name: r.ad_group_name || r.ad_group_id, impressions: 0, clicks: 0, spend: 0, purchase_views: 0, purchase_clicks: 0, purchase_total_value: 0 });
      }
      const a = map.get(key);
      a.impressions += num(r.impressions);
      a.clicks += num(r.clicks);
      a.spend += num(r.spend || r.cost);
      a.purchase_views += num(r.purchase_views);
      a.purchase_clicks += num(r.purchase_clicks);
      a.purchase_total_value += num(r.purchase_total_value || r.conversions_value);
    });
    return [...map.values()].map((o) => {
      o.ctr = o.impressions ? (o.clicks / o.impressions) * 100 : 0;
      o.cpc = o.clicks ? o.spend / o.clicks : 0;
      o.totalPurchases = o.purchase_views + o.purchase_clicks;
      o.roas = o.spend ? o.purchase_total_value / o.spend : 0;
      o.cpa = o.totalPurchases ? o.spend / o.totalPurchases : 0;
      return o;
    });
  }, [rawAdGroups]);

  const communities = useMemo(() => {
    const map = new Map();
    rawCommunities.forEach((r) => {
      const key = r.community || r.subreddit || 'Unknown';
      if (!map.has(key)) {
        map.set(key, { community: key, impressions: 0, clicks: 0, spend: 0, purchase_views: 0, purchase_clicks: 0, purchase_total_value: 0 });
      }
      const a = map.get(key);
      a.impressions += num(r.impressions);
      a.clicks += num(r.clicks);
      a.spend += num(r.spend || r.cost);
      a.purchase_views += num(r.purchase_views);
      a.purchase_clicks += num(r.purchase_clicks);
      a.purchase_total_value += num(r.purchase_total_value || r.conversions_value);
    });
    return [...map.values()].map((o) => {
      o.ctr = o.impressions ? (o.clicks / o.impressions) * 100 : 0;
      o.cpc = o.clicks ? o.spend / o.clicks : 0;
      o.totalPurchases = o.purchase_views + o.purchase_clicks;
      o.roas = o.spend ? o.purchase_total_value / o.spend : 0;
      o.cpa = o.totalPurchases ? o.spend / o.totalPurchases : 0;
      return o;
    });
  }, [rawCommunities]);

  const placements = useMemo(() => {
    const map = new Map();
    rawPlacements.forEach((r) => {
      const key = r.placement || r.placement_id || 'Unknown';
      if (!map.has(key)) {
        map.set(key, { placement: key, impressions: 0, clicks: 0, spend: 0, purchase_views: 0, purchase_clicks: 0, purchase_total_value: 0 });
      }
      const a = map.get(key);
      a.impressions += num(r.impressions);
      a.clicks += num(r.clicks);
      a.spend += num(r.spend || r.cost);
      a.purchase_views += num(r.purchase_views);
      a.purchase_clicks += num(r.purchase_clicks);
      a.purchase_total_value += num(r.purchase_total_value || r.conversions_value);
    });
    return [...map.values()].map((o) => {
      o.ctr = o.impressions ? (o.clicks / o.impressions) * 100 : 0;
      o.cpc = o.clicks ? o.spend / o.clicks : 0;
      o.totalPurchases = o.purchase_views + o.purchase_clicks;
      o.roas = o.spend ? o.purchase_total_value / o.spend : 0;
      o.cpa = o.totalPurchases ? o.spend / o.totalPurchases : 0;
      return o;
    });
  }, [rawPlacements]);

  const dailyTrend = useMemo(() => {
    const map = new Map();
    rawCampaigns.forEach((r) => {
      const d = r.report_date || r.date;
      if (!d) return;
      if (!map.has(d)) {
        map.set(d, { report_date: d, impressions: 0, clicks: 0, spend: 0, purchase_views: 0, purchase_clicks: 0, purchase_total_value: 0 });
      }
      const a = map.get(d);
      a.impressions += num(r.impressions);
      a.clicks += num(r.clicks);
      a.spend += num(r.spend || r.cost);
      a.purchase_views += num(r.purchase_views);
      a.purchase_clicks += num(r.purchase_clicks);
      a.purchase_total_value += num(r.purchase_total_value || r.conversions_value);
    });
    return [...map.values()]
      .sort((a, b) => (a.report_date || '').localeCompare(b.report_date || ''))
      .map((o) => {
        o.ctr = o.impressions ? (o.clicks / o.impressions) * 100 : 0;
        o.cpc = o.clicks ? o.spend / o.clicks : 0;
        o.totalPurchases = o.purchase_views + o.purchase_clicks;
        o.roas = o.spend ? o.purchase_total_value / o.spend : 0;
        o.cpa = o.totalPurchases ? o.spend / o.totalPurchases : 0;
        return o;
      });
  }, [rawCampaigns]);

  const rowCounts = useMemo(() => ({
    campaigns: rawCampaigns.length,
    adGroups: rawAdGroups.length,
    communities: rawCommunities.length,
    placements: rawPlacements.length,
  }), [rawCampaigns, rawAdGroups, rawCommunities, rawPlacements]);

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
    communities,
    placements,
    dailyTrend,
    redditAccounts,
    rowCounts,
    fetchData,
  };
}
