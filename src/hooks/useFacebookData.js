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

export function useFacebookData() {
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

  const [rawCampaigns, setRawCampaigns] = useState([]);
  const [rawAdSets, setRawAdSets] = useState([]);
  const [rawAds, setRawAds] = useState([]);
  const [rawPlacements, setRawPlacements] = useState([]);
  const [facebookAccounts, setFacebookAccounts] = useState([]);
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
      const aid = scopeAgencyId;
      let accounts = [];
      if (aid && canViewAllCustomers) {
        const { data } = await supabase
          .from('client_platform_accounts')
          .select('platform_customer_id, account_name, client_id')
          .eq('agency_id', aid)
          .eq('platform', 'facebook')
          .eq('is_active', true)
          .order('account_name');
        accounts = (data || []).map((r) => ({
          id: r.platform_customer_id,
          name: r.account_name || r.platform_customer_id,
          client_id: r.client_id || null,
        }));
      } else {
        accounts = (allowedClientAccounts || [])
          .filter((a) => a.platform === 'facebook')
          .map((a) => ({
            id: a.platform_customer_id,
            name: a.account_name || a.client_name || a.platform_customer_id,
            client_id: a.client_id || null,
          }));
      }
      setFacebookAccounts(accounts);

      let customerIds = filters.customerId && filters.customerId !== 'ALL'
        ? [filters.customerId]
        : accounts.map((a) => a.id);

      if (customerIds.length === 0) {
        setRawCampaigns([]);
        setRawAdSets([]);
        setRawAds([]);
        setRawPlacements([]);
        setLoading(false);
        return;
      }

      const { from, to } = computeDateRange(filters.datePreset, filters.dateFrom, filters.dateTo);
      if (!from || !to) {
        setRawCampaigns([]);
        setRawAdSets([]);
        setRawAds([]);
        setRawPlacements([]);
        setLoading(false);
        return;
      }

      setLoadingPhase('Loading campaigns…');
      const { data: campaignData } = await supabase
        .from('fb_campaign_daily')
        .select('*')
        .in('customer_id', customerIds)
        .gte('report_date', from)
        .lte('report_date', to);

      setLoadingPhase('Loading ad sets, ads, placements…');
      const [adSetRes, adRes, placementRes] = await Promise.all([
        supabase.from('fb_adset_daily').select('*').in('customer_id', customerIds).gte('report_date', from).lte('report_date', to),
        supabase.from('fb_ad_daily').select('*').in('customer_id', customerIds).gte('report_date', from).lte('report_date', to),
        supabase.from('fb_placement_daily').select('*').in('customer_id', customerIds).gte('report_date', from).lte('report_date', to),
      ]);

      setRawCampaigns(campaignData || []);
      setRawAdSets(adSetRes.data || []);
      setRawAds(adRes.data || []);
      setRawPlacements(placementRes.data || []);
    } catch (err) {
      setError(err?.message || 'Failed to fetch data');
      setRawCampaigns([]);
      setRawAdSets([]);
      setRawAds([]);
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
    if (cid && cid !== 'ALL' && facebookAccounts.length > 0 && !facebookAccounts.some((a) => a.id === cid)) {
      setFilters((prev) => ({ ...prev, customerId: 'ALL' }));
    }
  }, [facebookAccounts, filters.customerId]);

  useEffect(() => {
    if (!facebookAccounts.length || !selectedClientId) return;

    const selectedFromAllowed = (allowedClientAccounts || [])
      .find((a) => String(a.platform_customer_id) === String(selectedClientId));
    const selectedGroupId = selectedFromAllowed?.client_id || null;

    let nextCustomerId = null;
    if (selectedGroupId) {
      const groupedFacebook = facebookAccounts.find((a) => a.client_id && a.client_id === selectedGroupId);
      if (groupedFacebook?.id) nextCustomerId = groupedFacebook.id;
    }
    if (!nextCustomerId) {
      const directFacebook = facebookAccounts.find((a) => String(a.id) === String(selectedClientId));
      if (directFacebook?.id) nextCustomerId = directFacebook.id;
    }
    if (!nextCustomerId) return;
    if (String(filters.customerId || 'ALL') === String(nextCustomerId)) return;

    setFilters((prev) => ({ ...prev, customerId: nextCustomerId }));
  }, [selectedClientId, facebookAccounts, allowedClientAccounts, filters.customerId]);

  const kpis = useMemo(() => {
    const rows = rawCampaigns;
    const totalImpressions = rows.reduce((s, r) => s + num(r.impressions), 0);
    const totalClicks = rows.reduce((s, r) => s + num(r.clicks), 0);
    const totalSpend = rows.reduce((s, r) => s + num(r.spend), 0);
    const totalPurchases = rows.reduce((s, r) => s + num(r.purchase_count), 0);
    const totalPurchaseValue = rows.reduce((s, r) => s + num(r.purchase_value), 0);

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
        map.set(key, { campaign_name: key, impressions: 0, clicks: 0, spend: 0, purchase_count: 0, purchase_value: 0 });
      }
      const a = map.get(key);
      a.impressions += num(r.impressions);
      a.clicks += num(r.clicks);
      a.spend += num(r.spend);
      a.purchase_count += num(r.purchase_count);
      a.purchase_value += num(r.purchase_value);
    });
    return [...map.values()].map((o) => {
      o.ctr = o.impressions ? (o.clicks / o.impressions) * 100 : 0;
      o.cpc = o.clicks ? o.spend / o.clicks : 0;
      o.roas = o.spend ? o.purchase_value / o.spend : 0;
      o.cpa = o.purchase_count ? o.spend / o.purchase_count : 0;
      return o;
    });
  }, [rawCampaigns]);

  const adSets = useMemo(() => {
    const map = new Map();
    rawAdSets.forEach((r) => {
      const key = `${r.campaign_name || ''}\x00${r.adset_name || r.adset_id || ''}`;
      if (!map.has(key)) {
        map.set(key, { campaign_name: r.campaign_name, adset_name: r.adset_name || r.adset_id, impressions: 0, clicks: 0, spend: 0, purchase_count: 0, purchase_value: 0 });
      }
      const a = map.get(key);
      a.impressions += num(r.impressions);
      a.clicks += num(r.clicks);
      a.spend += num(r.spend);
      a.purchase_count += num(r.purchase_count);
      a.purchase_value += num(r.purchase_value);
    });
    return [...map.values()].map((o) => {
      o.ctr = o.impressions ? (o.clicks / o.impressions) * 100 : 0;
      o.cpc = o.clicks ? o.spend / o.clicks : 0;
      o.roas = o.spend ? o.purchase_value / o.spend : 0;
      o.cpa = o.purchase_count ? o.spend / o.purchase_count : 0;
      return o;
    });
  }, [rawAdSets]);

  const ads = useMemo(() => {
    const map = new Map();
    rawAds.forEach((r) => {
      const key = `${r.campaign_name || ''}\x00${r.adset_name || ''}\x00${r.ad_name || r.ad_id || ''}`;
      if (!map.has(key)) {
        map.set(key, { campaign_name: r.campaign_name, adset_name: r.adset_name, ad_name: r.ad_name || r.ad_id, impressions: 0, clicks: 0, spend: 0, purchase_count: 0, purchase_value: 0 });
      }
      const a = map.get(key);
      a.impressions += num(r.impressions);
      a.clicks += num(r.clicks);
      a.spend += num(r.spend);
      a.purchase_count += num(r.purchase_count);
      a.purchase_value += num(r.purchase_value);
    });
    return [...map.values()].map((o) => {
      o.ctr = o.impressions ? (o.clicks / o.impressions) * 100 : 0;
      o.cpc = o.clicks ? o.spend / o.clicks : 0;
      o.roas = o.spend ? o.purchase_value / o.spend : 0;
      o.cpa = o.purchase_count ? o.spend / o.purchase_count : 0;
      return o;
    });
  }, [rawAds]);

  const placements = useMemo(() => {
    const map = new Map();
    rawPlacements.forEach((r) => {
      const key = `${r.publisher_platform || 'unknown'}|${r.platform_position || 'unknown'}`;
      if (!map.has(key)) {
        map.set(key, { placement: `${r.publisher_platform || ''} / ${r.platform_position || ''}`, impressions: 0, clicks: 0, spend: 0, purchase_count: 0, purchase_value: 0 });
      }
      const a = map.get(key);
      a.impressions += num(r.impressions);
      a.clicks += num(r.clicks);
      a.spend += num(r.spend);
      a.purchase_count += num(r.purchase_count);
      a.purchase_value += num(r.purchase_value);
    });
    return [...map.values()].map((o) => {
      o.ctr = o.impressions ? (o.clicks / o.impressions) * 100 : 0;
      o.cpc = o.clicks ? o.spend / o.clicks : 0;
      o.roas = o.spend ? o.purchase_value / o.spend : 0;
      o.cpa = o.purchase_count ? o.spend / o.purchase_count : 0;
      return o;
    });
  }, [rawPlacements]);

  const platforms = useMemo(() => {
    const map = new Map();
    rawPlacements.forEach((r) => {
      const key = r.publisher_platform || 'unknown';
      if (!map.has(key)) {
        map.set(key, { platform: key, impressions: 0, clicks: 0, spend: 0, purchase_count: 0, purchase_value: 0 });
      }
      const a = map.get(key);
      a.impressions += num(r.impressions);
      a.clicks += num(r.clicks);
      a.spend += num(r.spend);
      a.purchase_count += num(r.purchase_count);
      a.purchase_value += num(r.purchase_value);
    });
    return [...map.values()].map((o) => {
      o.ctr = o.impressions ? (o.clicks / o.impressions) * 100 : 0;
      o.cpc = o.clicks ? o.spend / o.clicks : 0;
      o.roas = o.spend ? o.purchase_value / o.spend : 0;
      o.cpa = o.purchase_count ? o.spend / o.purchase_count : 0;
      return o;
    });
  }, [rawPlacements]);

  const dailyTrend = useMemo(() => {
    const map = new Map();
    rawCampaigns.forEach((r) => {
      const d = r.report_date || r.date;
      if (!d) return;
      if (!map.has(d)) {
        map.set(d, { report_date: d, impressions: 0, clicks: 0, spend: 0, purchase_count: 0, purchase_value: 0 });
      }
      const a = map.get(d);
      a.impressions += num(r.impressions);
      a.clicks += num(r.clicks);
      a.spend += num(r.spend);
      a.purchase_count += num(r.purchase_count);
      a.purchase_value += num(r.purchase_value);
    });
    return [...map.values()]
      .sort((a, b) => (a.report_date || '').localeCompare(b.report_date || ''))
      .map((o) => {
        o.ctr = o.impressions ? (o.clicks / o.impressions) * 100 : 0;
        o.cpc = o.clicks ? o.spend / o.clicks : 0;
        o.roas = o.spend ? o.purchase_value / o.spend : 0;
        o.cpa = o.purchase_count ? o.spend / o.purchase_count : 0;
        return o;
      });
  }, [rawCampaigns]);

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
    adSets,
    ads,
    placements,
    platforms,
    dailyTrend,
    facebookAccounts,
    fetchData,
  };
}
