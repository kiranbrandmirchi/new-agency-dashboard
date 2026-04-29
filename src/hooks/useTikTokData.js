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

export function useTikTokData() {
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
  const [rawPlacements, setRawPlacements] = useState([]);
  const [tiktokAccounts, setTiktokAccounts] = useState([]);
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
          .eq('platform', 'tiktok')
          .eq('is_active', true)
          .order('account_name');
        accounts = (data || []).map((r) => ({
          id: r.platform_customer_id,
          name: r.account_name || r.platform_customer_id,
          client_id: r.client_id || null,
        }));
      } else {
        accounts = (allowedClientAccounts || [])
          .filter((a) => a.platform === 'tiktok')
          .map((a) => ({
            id: a.platform_customer_id,
            name: a.account_name || a.client_name || a.platform_customer_id,
            client_id: a.client_id || null,
          }));
      }
      setTiktokAccounts(accounts);

      const custId = dateOverrides?.customerId ?? filters.customerId;
      let customerIds = custId && custId !== 'ALL'
        ? [custId]
        : accounts.map((a) => a.id);

      if (customerIds.length === 0) {
        setRawCampaignDaily([]);
        setRawPlacements([]);
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
        setRawPlacements([]);
        setLoading(false);
        return;
      }

      setLoadingPhase('Loading campaign & placement data…');

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

      const [campaignRows, placementRows] = await Promise.all([
        fetchAll('tiktok_campaign_daily'),
        fetchAll('tiktok_placement_daily'),
      ]);

      setRawCampaignDaily(campaignRows);
      setRawPlacements(placementRows);
    } catch (err) {
      setError(err?.message || 'Failed to fetch data');
      setRawCampaignDaily([]);
      setRawPlacements([]);
    } finally {
      setLoading(false);
    }
  }, [filters.datePreset, filters.dateFrom, filters.dateTo, filters.customerId, scopeAgencyId, allowedClientAccounts, canViewAllCustomers]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const cid = filters.customerId;
    if (cid && cid !== 'ALL' && tiktokAccounts.length > 0 && !tiktokAccounts.some((a) => a.id === cid)) {
      setFilters((prev) => ({ ...prev, customerId: 'ALL' }));
    }
  }, [tiktokAccounts, filters.customerId]);

  useEffect(() => {
    if (!tiktokAccounts.length || !selectedClientId) return;

    const selectedFromAllowed = (allowedClientAccounts || [])
      .find((a) => String(a.platform_customer_id) === String(selectedClientId));
    const selectedGroupId = selectedFromAllowed?.client_id || null;

    let nextCustomerId = null;
    if (selectedGroupId) {
      const groupedTikTok = tiktokAccounts.find((a) => a.client_id && a.client_id === selectedGroupId);
      if (groupedTikTok?.id) nextCustomerId = groupedTikTok.id;
    }
    if (!nextCustomerId) {
      const directTikTok = tiktokAccounts.find((a) => String(a.id) === String(selectedClientId));
      if (directTikTok?.id) nextCustomerId = directTikTok.id;
    }
    if (!nextCustomerId) return;
    if (String(filters.customerId || 'ALL') === String(nextCustomerId)) return;

    setFilters((prev) => ({ ...prev, customerId: nextCustomerId }));
  }, [selectedClientId, tiktokAccounts, allowedClientAccounts, filters.customerId]);

  useEffect(() => {
    if (canViewAllCustomers) return;
    if (!tiktokAccounts.length) return;
    if (filters.customerId && filters.customerId !== 'ALL') return;
    setFilters((prev) => ({ ...prev, customerId: String(tiktokAccounts[0].id) }));
  }, [canViewAllCustomers, tiktokAccounts, filters.customerId]);

  const kpis = useMemo(() => {
    const rows = rawCampaignDaily;
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
  }, [rawCampaignDaily]);

  const campaigns = useMemo(() => {
    const map = new Map();
    rawCampaignDaily.forEach((r) => {
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
  }, [rawCampaignDaily]);

  const adGroups = useMemo(() => {
    const map = new Map();
    rawCampaignDaily
      .filter((r) => r.ad_group_id && String(r.ad_group_id).trim() !== '')
      .forEach((r) => {
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
  }, [rawCampaignDaily]);

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
    rawCampaignDaily.forEach((r) => {
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
  }, [rawCampaignDaily]);

  const rowCounts = useMemo(() => ({
    campaigns: campaigns.length,
    adGroups: adGroups.length,
    placements: rawPlacements.length,
  }), [campaigns, adGroups, rawPlacements]);

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
    placements,
    dailyTrend,
    tiktokAccounts,
    rowCounts,
    fetchData,
  };
}
