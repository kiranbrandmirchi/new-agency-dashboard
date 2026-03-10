import { useState, useCallback, useMemo, useEffect } from 'react';
import { sbFetchAllParallel, buildQuery } from '../lib/supabaseRest';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
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

export function useCombinedDashboardData() {
  const { canViewAllCustomers, allowedClientAccounts, activeAgencyId } = useAuth();
  const { selectedClientId } = useApp();

  const [filters, setFilters] = useState({
    datePreset: 'this_month',
    dateFrom: '',
    dateTo: '',
  });

  const [rawCampaigns, setRawCampaigns] = useState([]);
  const [rawAdGroups, setRawAdGroups] = useState([]);
  const [rawKeywords, setRawKeywords] = useState([]);
  const [accountMap, setAccountMap] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const updateFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = computeDateRange(filters.datePreset, filters.dateFrom, filters.dateTo);
      if (!from || !to) {
        setLoading(false);
        return;
      }

      let customerIds = [];
      let accountList = [];

      const useAgencyScoped = activeAgencyId || !canViewAllCustomers;
      if (canViewAllCustomers && !useAgencyScoped) {
        const { data: cpaData } = await supabase
          .from('client_platform_accounts')
          .select('id,platform_customer_id,account_name')
          .eq('platform', 'google_ads')
          .eq('is_active', true);
        (cpaData || []).forEach((r) => {
          const cid = String(r.platform_customer_id);
          const name = r.account_name || cid;
          accountList.push({ customer_id: cid, client_id: cid, client_name: name, account_name: r.account_name });
        });
        if (selectedClientId) {
          customerIds = [selectedClientId];
          accountList = accountList.filter((a) => String(a.customer_id) === String(selectedClientId));
        } else {
          customerIds = [...new Set(accountList.map((a) => a.customer_id))];
        }
      } else {
        const gads = (allowedClientAccounts || []).filter((a) => a.platform === 'google_ads');
        if (selectedClientId) {
          accountList = gads.filter((a) => String(a.platform_customer_id) === String(selectedClientId)).map((a) => ({
            customer_id: String(a.platform_customer_id),
            client_name: a.client_name || a.account_name,
            account_name: a.account_name,
          }));
        } else {
          accountList = gads.map((a) => ({
            customer_id: String(a.platform_customer_id),
            client_name: a.client_name,
            account_name: a.account_name,
          }));
        }
        customerIds = accountList.map((a) => a.customer_id);
      }

      const accMap = new Map();
      accountList.forEach((a) => {
        const cid = String(a.customer_id);
        accMap.set(cid, {
          client_name: a.client_name,
          account_name: a.account_name,
        });
      });
      setAccountMap(accMap);

      const NO_MATCH = '0';
      const ids = customerIds.length ? customerIds : [NO_MATCH];
      const baseFilter = { customerIds: ids, dateFrom: from, dateTo: to };

      const safe = (p) => p.catch((err) => {
        console.warn('[Combined] fetch failed:', err.message);
        return [];
      });

      const [campaignData, adGroupData, keywordData] = await Promise.all([
        safe(sbFetchAllParallel(buildQuery('gads_campaign_daily', { ...baseFilter, extra: '&order=date.desc' }))),
        safe(sbFetchAllParallel(buildQuery('gads_adgroup_daily', { ...baseFilter, extra: '&order=date.desc' }))),
        safe(sbFetchAllParallel(buildQuery('gads_keyword_daily', { ...baseFilter, extra: '&order=date.desc' }))),
      ]);

      setRawCampaigns(campaignData);
      setRawAdGroups(adGroupData);
      setRawKeywords(keywordData);
    } catch (err) {
      console.error('[Combined] error:', err);
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [canViewAllCustomers, allowedClientAccounts, activeAgencyId, selectedClientId, filters.datePreset, filters.dateFrom, filters.dateTo]);

  useEffect(() => {
    setRawCampaigns([]);
    setRawAdGroups([]);
    setRawKeywords([]);
    setAccountMap(new Map());
  }, [activeAgencyId, allowedClientAccounts]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const summaryKpis = useMemo(() => {
    const k = { cost: 0, clicks: 0, impressions: 0, conversions: 0, conversions_value: 0 };
    rawCampaigns.forEach((r) => {
      k.cost += num(r.cost);
      k.clicks += num(r.clicks);
      k.impressions += num(r.impressions);
      k.conversions += num(r.conversions);
      k.conversions_value += num(r.conversions_value);
    });
    k.ctr = k.impressions ? (k.clicks / k.impressions) * 100 : 0;
    k.cpc = k.clicks ? k.cost / k.clicks : 0;
    k.cpa = k.conversions ? k.cost / k.conversions : 0;
    k.roas = k.cost ? k.conversions_value / k.cost : 0;
    return k;
  }, [rawCampaigns]);

  const platformBreakdown = useMemo(() => {
    const byPlatform = new Map();
    rawCampaigns.forEach((r) => {
      const platform = 'Google Ads';
      if (!byPlatform.has(platform)) {
        byPlatform.set(platform, { platform, cost: 0, clicks: 0, impressions: 0, conversions: 0, conversions_value: 0 });
      }
      const p = byPlatform.get(platform);
      p.cost += num(r.cost);
      p.clicks += num(r.clicks);
      p.impressions += num(r.impressions);
      p.conversions += num(r.conversions);
      p.conversions_value += num(r.conversions_value);
    });
    return [...byPlatform.values()].map((p) => ({
      ...p,
      ctr: p.impressions ? (p.clicks / p.impressions) * 100 : 0,
      cpa: p.conversions ? p.cost / p.conversions : 0,
    }));
  }, [rawCampaigns]);

  const accountBreakdown = useMemo(() => {
    const byAccount = new Map();
    rawCampaigns.forEach((r) => {
      const cid = String(r.customer_id);
      const acc = accountMap.get(cid);
      const name = acc?.client_name || cid;
      const key = cid;
      if (!byAccount.has(key)) {
        byAccount.set(key, { customer_id: cid, account_name: name, account_label: acc?.account_name, cost: 0, clicks: 0, impressions: 0, conversions: 0, conversions_value: 0 });
      }
      const a = byAccount.get(key);
      a.cost += num(r.cost);
      a.clicks += num(r.clicks);
      a.impressions += num(r.impressions);
      a.conversions += num(r.conversions);
      a.conversions_value += num(r.conversions_value);
    });
    return [...byAccount.values()].map((a) => ({
      ...a,
      ctr: a.impressions ? (a.clicks / a.impressions) * 100 : 0,
      cpa: a.conversions ? a.cost / a.conversions : 0,
    })).sort((a, b) => b.cost - a.cost);
  }, [rawCampaigns, accountMap]);

  const campaignByAccount = useMemo(() => {
    const byAcc = new Map();
    rawCampaigns.forEach((r) => {
      const cid = String(r.customer_id);
      if (!byAcc.has(cid)) byAcc.set(cid, new Map());
      const byCamp = byAcc.get(cid);
      const campId = r.campaign_id;
      if (!byCamp.has(campId)) {
        byCamp.set(campId, {
          campaign_id: campId,
          campaign_name: r.campaign_name,
          cost: 0, clicks: 0, impressions: 0, conversions: 0, conversions_value: 0,
        });
      }
      const c = byCamp.get(campId);
      c.cost += num(r.cost);
      c.clicks += num(r.clicks);
      c.impressions += num(r.impressions);
      c.conversions += num(r.conversions);
      c.conversions_value += num(r.conversions_value);
    });
    const result = new Map();
    byAcc.forEach((campMap, cid) => {
      result.set(cid, [...campMap.values()].map((c) => ({
        ...c,
        ctr: c.impressions ? (c.clicks / c.impressions) * 100 : 0,
        cpa: c.conversions ? c.cost / c.conversions : 0,
      })).sort((a, b) => b.cost - a.cost));
    });
    return result;
  }, [rawCampaigns]);

  const adGroupsByCampaign = useMemo(() => {
    const byCamp = new Map();
    rawAdGroups.forEach((r) => {
      const campId = String(r.campaign_id);
      if (!byCamp.has(campId)) byCamp.set(campId, new Map());
      const byAg = byCamp.get(campId);
      const agId = r.ad_group_id;
      if (!byAg.has(agId)) {
        byAg.set(agId, {
          ad_group_id: agId,
          ad_group_name: r.ad_group_name,
          cost: 0, clicks: 0, impressions: 0, conversions: 0, conversions_value: 0,
        });
      }
      const a = byAg.get(agId);
      a.cost += num(r.cost);
      a.clicks += num(r.clicks);
      a.impressions += num(r.impressions);
      a.conversions += num(r.conversions);
      a.conversions_value += num(r.conversions_value);
    });
    const result = new Map();
    byCamp.forEach((agMap, campId) => {
      result.set(campId, [...agMap.values()].map((a) => ({
        ...a,
        ctr: a.impressions ? (a.clicks / a.impressions) * 100 : 0,
        cpa: a.conversions ? a.cost / a.conversions : 0,
      })).sort((a, b) => b.cost - a.cost));
    });
    return result;
  }, [rawAdGroups]);

  const keywordsByCampaign = useMemo(() => {
    const byCamp = new Map();
    rawKeywords.forEach((r) => {
      const campId = String(r.campaign_id);
      if (!byCamp.has(campId)) byCamp.set(campId, new Map());
      const byKw = byCamp.get(campId);
      const kwId = `${r.ad_group_id}_${r.keyword_id}`;
      if (!byKw.has(kwId)) {
        byKw.set(kwId, {
          keyword_id: r.keyword_id,
          keyword_text: r.keyword_text,
          cost: 0, clicks: 0, impressions: 0, conversions: 0, conversions_value: 0,
        });
      }
      const k = byKw.get(kwId);
      k.cost += num(r.cost);
      k.clicks += num(r.clicks);
      k.impressions += num(r.impressions);
      k.conversions += num(r.conversions);
      k.conversions_value += num(r.conversions_value);
    });
    const result = new Map();
    byCamp.forEach((kwMap, campId) => {
      const list = [...kwMap.values()].map((k) => ({
        ...k,
        ctr: k.impressions ? (k.clicks / k.impressions) * 100 : 0,
        cpa: k.conversions ? k.cost / k.conversions : 0,
      })).sort((a, b) => b.cost - a.cost);
      result.set(campId, list);
    });
    return result;
  }, [rawKeywords]);

  const isSingleAccount = accountBreakdown.length === 1;
  const hasGoogleAdsData = rawCampaigns.length > 0;

  return {
    filters,
    updateFilter,
    fetchData,
    loading,
    error,
    summaryKpis,
    platformBreakdown,
    accountBreakdown,
    campaignByAccount,
    adGroupsByCampaign,
    keywordsByCampaign,
    isSingleAccount,
    hasGoogleAdsData,
    accountMap,
  };
}
