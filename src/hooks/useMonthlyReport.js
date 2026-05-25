import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getMonthRange, momChange } from '../utils/monthlyReportHelpers';
import {
  buildMonthlySlideData,
  invokeGa4Realtime,
  normalizeGa4PropertyId,
  num,
} from '../utils/monthlySlideData';

export { getMonthRange };

async function fetchPlatformDataForAccounts(accountsData, dateRanges, options = {}) {
  const { currentFrom, currentTo, prevFrom, prevTo } = dateRanges;
  const compareOn = options.compareOn !== false;
  const emptyPrev = Promise.resolve({ data: [], count: 0 });
  const dataByAccount = {};
  let totalCost = 0, totalClicks = 0, totalImpressions = 0, totalConversions = 0;
  let prevCost = 0, prevClicks = 0, prevImpressions = 0, prevConversions = 0;
  let totalSessions = 0, prevSessions = 0;

  for (const acc of accountsData || []) {
    const cpa = acc.client_platform_accounts;
    if (!cpa) continue;
    const cid = cpa.platform_customer_id;
    const platform = cpa.platform || 'google_ads';
    const label = acc.label || cpa.account_name || cid;

    if (platform === 'google_ads') {
      const [campRes, kwRes, prevRes] = await Promise.all([
        supabase.from('gads_campaign_daily').select('*').eq('customer_id', cid).gte('date', currentFrom).lte('date', currentTo),
        supabase.from('gads_keyword_daily').select('*').eq('customer_id', cid).gte('date', currentFrom).lte('date', currentTo),
        compareOn
          ? supabase.from('gads_campaign_daily').select('*').eq('customer_id', cid).gte('date', prevFrom).lte('date', prevTo)
          : emptyPrev,
      ]);

      const campaignMap = new Map();
      (campRes.data || []).forEach((r) => {
        const key = r.campaign_id;
        if (!campaignMap.has(key)) campaignMap.set(key, { campaign_name: r.campaign_name, cost: 0, clicks: 0, impressions: 0, conversions: 0, conversions_value: 0 });
        const a = campaignMap.get(key);
        a.cost += num(r.cost); a.clicks += num(r.clicks); a.impressions += num(r.impressions); a.conversions += num(r.conversions); a.conversions_value += num(r.conversions_value);
      });
      const campaigns = [...campaignMap.values()].map((c) => ({
        ...c, cpc: c.clicks ? c.cost / c.clicks : 0, ctr: c.impressions ? (c.clicks / c.impressions) * 100 : 0, costPerConv: c.conversions ? c.cost / c.conversions : 0,
      })).sort((a, b) => b.cost - a.cost);

      const kwByText = new Map();
      (kwRes.data || []).forEach((r) => {
        const key = r.keyword_text || r.keyword_id;
        if (!kwByText.has(key)) kwByText.set(key, { keyword_text: r.keyword_text, cost: 0, clicks: 0, impressions: 0, conversions: 0 });
        const a = kwByText.get(key);
        a.cost += num(r.cost); a.clicks += num(r.clicks); a.impressions += num(r.impressions); a.conversions += num(r.conversions);
      });
      const keywords = [...kwByText.values()].map((k) => ({ ...k, ctr: k.impressions ? (k.clicks / k.impressions) * 100 : 0 })).sort((a, b) => b.clicks - a.clicks).slice(0, 10);

      const dailyByDate = new Map();
      (campRes.data || []).forEach((r) => {
        const d = r.date;
        if (!dailyByDate.has(d)) dailyByDate.set(d, { date: d, cost: 0 });
        dailyByDate.get(d).cost += num(r.cost);
      });
      const daily = [...dailyByDate.values()].sort((a, b) => a.date.localeCompare(b.date));

      const curCost = campaigns.reduce((s, c) => s + c.cost, 0);
      const curClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
      const curImpr = campaigns.reduce((s, c) => s + c.impressions, 0);
      const curConv = campaigns.reduce((s, c) => s + c.conversions, 0);

      let pCost = 0, pClicks = 0, pImpr = 0, pConv = 0;
      (prevRes.data || []).forEach((r) => { pCost += num(r.cost); pClicks += num(r.clicks); pImpr += num(r.impressions); pConv += num(r.conversions); });

      totalCost += curCost; totalClicks += curClicks; totalImpressions += curImpr; totalConversions += curConv;
      prevCost += pCost; prevClicks += pClicks; prevImpressions += pImpr; prevConversions += pConv;

      dataByAccount[acc.id] = {
        accountId: acc.id, label, platform,
        campaigns, keywords, daily,
        kpis: { cost: curCost, clicks: curClicks, impressions: curImpr, conversions: curConv, cpc: curClicks ? curCost / curClicks : 0, ctr: curImpr ? (curClicks / curImpr) * 100 : 0, costPerConv: curConv ? curCost / curConv : 0, convRate: curClicks ? (curConv / curClicks) * 100 : 0 },
        prevKpis: { cost: pCost, clicks: pClicks, impressions: pImpr, conversions: pConv },
        momChange: { cost: momChange(curCost, pCost), clicks: momChange(curClicks, pClicks), impressions: momChange(curImpr, pImpr), conversions: momChange(curConv, pConv) },
      };
    } else if (platform === 'facebook') {
      const [campRes, prevRes] = await Promise.all([
        supabase.from('fb_campaign_daily').select('*').eq('customer_id', cid).gte('report_date', currentFrom).lte('report_date', currentTo),
        compareOn
          ? supabase.from('fb_campaign_daily').select('*').eq('customer_id', cid).gte('report_date', prevFrom).lte('report_date', prevTo)
          : emptyPrev,
      ]);
      const campaignMap = new Map();
      (campRes.data || []).forEach((r) => {
        const key = r.campaign_id;
        if (!campaignMap.has(key)) campaignMap.set(key, { campaign_name: r.campaign_name, cost: 0, clicks: 0, impressions: 0, reach: 0, link_clicks: 0, purchase_count: 0, purchase_value: 0, lead_count: 0, lead_cost: 0, purchase_roas: 0, frequency: 0, _n: 0 });
        const a = campaignMap.get(key);
        a.cost += num(r.spend); a.clicks += num(r.clicks); a.impressions += num(r.impressions); a.reach += num(r.reach);
        a.link_clicks += num(r.link_clicks); a.purchase_count += num(r.purchase_count); a.purchase_value += num(r.purchase_value);
        a.lead_count += num(r.lead_count); a.lead_cost += num(r.lead_cost); a.frequency += num(r.frequency); a._n += 1;
      });
      const campaigns = [...campaignMap.values()].map((c) => ({
        ...c, cpc: c.clicks ? c.cost / c.clicks : 0, ctr: c.impressions ? (c.clicks / c.impressions) * 100 : 0,
        roas: c.cost ? c.purchase_value / c.cost : 0, cpl: c.lead_count ? c.cost / c.lead_count : 0, frequency: c._n ? c.frequency / c._n : 0,
      })).sort((a, b) => b.cost - a.cost);
      const dailyByDate = new Map();
      (campRes.data || []).forEach((r) => {
        const d = r.report_date;
        if (!dailyByDate.has(d)) dailyByDate.set(d, { date: d, cost: 0 });
        dailyByDate.get(d).cost += num(r.spend);
      });
      const daily = [...dailyByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
      const curCost = campaigns.reduce((s, c) => s + c.cost, 0);
      const curClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
      const curImpr = campaigns.reduce((s, c) => s + c.impressions, 0);
      const curReach = campaigns.reduce((s, c) => s + c.reach, 0);
      const curPurchases = campaigns.reduce((s, c) => s + c.purchase_count, 0);
      const curPurchaseVal = campaigns.reduce((s, c) => s + c.purchase_value, 0);
      const curLeads = campaigns.reduce((s, c) => s + c.lead_count, 0);
      let pCost = 0, pClicks = 0, pImpr = 0, pReach = 0, pPurchases = 0, pPurchaseVal = 0, pLeads = 0;
      (prevRes.data || []).forEach((r) => {
        pCost += num(r.spend); pClicks += num(r.clicks); pImpr += num(r.impressions); pReach += num(r.reach);
        pPurchases += num(r.purchase_count); pPurchaseVal += num(r.purchase_value); pLeads += num(r.lead_count);
      });
      totalCost += curCost; totalClicks += curClicks; totalImpressions += curImpr; totalConversions += curPurchases + curLeads;
      prevCost += pCost; prevClicks += pClicks; prevImpressions += pImpr; prevConversions += pPurchases + pLeads;
      dataByAccount[acc.id] = {
        accountId: acc.id, label, platform, campaigns, keywords: [], daily,
        kpis: { cost: curCost, clicks: curClicks, impressions: curImpr, reach: curReach, purchase_count: curPurchases, purchase_value: curPurchaseVal, lead_count: curLeads, conversions: curPurchases + curLeads, cpc: curClicks ? curCost / curClicks : 0 },
        prevKpis: { cost: pCost, clicks: pClicks, conversions: pPurchases + pLeads },
        momChange: { cost: momChange(curCost, pCost), conversions: momChange(curPurchases + curLeads, pPurchases + pLeads) },
      };
    } else if (platform === 'ga4') {
      const propertyId = normalizeGa4PropertyId(cid);
      const ga4Body = (breakdown, withCompare = true) => {
        const base = {
          date_from: currentFrom,
          date_to: currentTo,
          breakdown,
        };
        if (withCompare && compareOn) {
          base.compare_date_from = prevFrom;
          base.compare_date_to = prevTo;
        }
        return base;
      };
      const [totalsPayload, channelPayload, sourcePayload, pagePayload, devicePayload, eventPayload, geoPayload] =
        await Promise.all([
          invokeGa4Realtime(propertyId, ga4Body('none')),
          invokeGa4Realtime(propertyId, ga4Body('channel')),
          invokeGa4Realtime(propertyId, ga4Body('source_medium')),
          invokeGa4Realtime(propertyId, ga4Body('page', false)),
          invokeGa4Realtime(propertyId, ga4Body('device', false)),
          invokeGa4Realtime(propertyId, ga4Body('event', false)),
          invokeGa4Realtime(propertyId, ga4Body('geo', false)),
        ]);

      if (totalsPayload?.error && !totalsPayload?.current?.length && !totalsPayload?.previous?.length) {
        throw new Error(`GA4 (${propertyId}): ${totalsPayload.error}`);
      }

      const t = totalsPayload?.current?.[0] || {};
      const pt = totalsPayload?.previous?.[0] || {};
      const totalUsers = num(t.total_users);
      const sessions = num(t.sessions);
      const pageViews = num(t.screen_page_views);
      const newUsers = num(t.new_users);
      const conversions = num(t.key_events);
      const pUsers = num(pt.total_users);
      const pSessions = num(pt.sessions);
      const pPageViews = num(pt.screen_page_views);
      const pConversions = num(pt.key_events);

      const channelRows = (channelPayload?.current || []).sort((a, b) => b.sessions - a.sessions);
      const channelBreakdown = channelRows.map((c) => ({
        channel_group: c.channel_group,
        total_users: c.total_users,
        sessions: c.sessions,
        page_views: c.screen_page_views,
        conversions: c.key_events,
        bounce_rate: c.bounce_rate,
        engagement_rate: c.engagement_rate,
        pct_users: totalUsers ? (c.total_users / totalUsers) * 100 : 0,
      }));

      const topPages = (pagePayload?.current || [])
        .sort((a, b) => b.screen_page_views - a.screen_page_views)
        .slice(0, 10)
        .map((p) => ({
          page_path: p.page_path,
          page_title: p.page_title,
          page_views: p.screen_page_views,
          total_users: p.total_users,
        }));

      const topSources = (sourcePayload?.current || [])
        .sort((a, b) => b.total_users - a.total_users)
        .slice(0, 10)
        .map((s) => ({
          source: s.source,
          medium: s.medium,
          total_users: s.total_users,
          sessions: s.sessions,
          conversions: s.key_events,
        }));

      const deviceBreakdown = (devicePayload?.current || []).map((d) => ({
        device_category: d.device_category,
        total_users: d.total_users,
        sessions: d.sessions,
      }));

      const topEvents = (eventPayload?.current || [])
        .sort((a, b) => b.event_count - a.event_count)
        .slice(0, 20)
        .map((e) => ({
          event_name: e.event_name,
          event_count: e.event_count,
          event_value: e.event_value,
        }));

      const geoBreakdown = (geoPayload?.current || [])
        .sort((a, b) => b.total_users - a.total_users)
        .slice(0, 20)
        .map((g) => ({
          country: g.country,
          region: g.region,
          city: g.city,
          total_users: g.total_users,
          sessions: g.sessions,
          conversions: g.key_events,
        }));

      totalSessions += sessions;
      prevSessions += pSessions;

      dataByAccount[acc.id] = {
        accountId: acc.id,
        label,
        platform: 'ga4',
        campaigns: [],
        keywords: [],
        daily: [],
        ga4: {
          totalUsers,
          newUsers,
          sessions,
          pageViews,
          pagesPerSession: num(t.pages_per_session),
          avgDuration: num(t.avg_session_duration),
          avgBounce: num(t.bounce_rate),
          avgEngagement: num(t.engagement_rate),
          conversions,
          channelBreakdown,
          topPages,
          topSources,
          deviceBreakdown,
          topEvents,
          geoBreakdown,
        },
        kpis: { totalUsers, newUsers, sessions, pageViews, cost: 0, clicks: 0, impressions: 0 },
        prevKpis: { totalUsers: pUsers, sessions: pSessions, pageViews: pPageViews, cost: 0, clicks: 0, impressions: 0 },
        momChange: {
          users: momChange(totalUsers, pUsers),
          sessions: momChange(sessions, pSessions),
          pageViews: momChange(pageViews, pPageViews),
          conversions: momChange(conversions, pConversions),
        },
      };
    } else if (platform === 'ghl') {
      const startTs = `${currentFrom}T00:00:00`;
      const endTs = `${currentTo}T23:59:59.999`;
      const prevStartTs = `${prevFrom}T00:00:00`;
      const prevEndTs = `${prevTo}T23:59:59.999`;
      const [callsRes, formsRes, chatRes, prevCallsRes, prevFormsRes] = await Promise.all([
        supabase.from('ghl_calls_view').select('*', { count: 'exact', head: true }).eq('location_id', cid).gte('date_added', startTs).lte('date_added', endTs),
        supabase.from('ghl_form_submissions_view').select('*', { count: 'exact', head: true }).eq('location_id', cid).eq('form_type', 'form_submission').gte('date_added', startTs).lte('date_added', endTs),
        supabase.from('ghl_form_submissions_view').select('*', { count: 'exact', head: true }).eq('location_id', cid).eq('form_type', 'chat_widget').gte('date_added', startTs).lte('date_added', endTs),
        compareOn
          ? supabase.from('ghl_calls_view').select('*', { count: 'exact', head: true }).eq('location_id', cid).gte('date_added', prevStartTs).lte('date_added', prevEndTs)
          : emptyPrev,
        compareOn
          ? supabase.from('ghl_form_submissions_view').select('*', { count: 'exact', head: true }).eq('location_id', cid).gte('date_added', prevStartTs).lte('date_added', prevEndTs)
          : emptyPrev,
      ]);
      const totalCalls = callsRes.count || 0;
      const totalForms = formsRes.count || 0;
      const totalChat = chatRes.count || 0;
      const pCalls = prevCallsRes.count || 0;
      const pForms = prevFormsRes.count || 0;
      dataByAccount[acc.id] = {
        accountId: acc.id, label, platform: 'ghl', campaigns: [], keywords: [], daily: [],
        ghl: { totalCalls, totalForms, totalChat, totalLeads: totalCalls + totalForms + totalChat },
        kpis: { totalCalls, totalForms, totalChat, cost: 0, clicks: 0, impressions: 0 },
        prevKpis: { totalCalls: pCalls, totalForms: pForms },
        momChange: { calls: momChange(totalCalls, pCalls) },
      };
    }
  }

  return {
    dataByAccount,
    overallKpis: {
      cost: totalCost, clicks: totalClicks, impressions: totalImpressions, conversions: totalConversions,
      cpc: totalClicks ? totalCost / totalClicks : 0, convRate: totalClicks ? (totalConversions / totalClicks) * 100 : 0,
      sessions: totalSessions,
    },
    previousKpis: { cost: prevCost, clicks: prevClicks, impressions: prevImpressions, conversions: prevConversions, sessions: prevSessions },
    momChanges: {
      cost: momChange(totalCost, prevCost), clicks: momChange(totalClicks, prevClicks),
      impressions: momChange(totalImpressions, prevImpressions), conversions: momChange(totalConversions, prevConversions),
      sessions: momChange(totalSessions, prevSessions),
    },
  };
}

export function useMonthlyReport(reportId) {
  const [report, setReport] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [sections, setSections] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [platformData, setPlatformData] = useState({});
  const [overallKpis, setOverallKpis] = useState({});
  const [previousKpis, setPreviousKpis] = useState({});
  const [momChanges, setMomChanges] = useState({});
  const [slideData, setSlideData] = useState(null);
  const [dateRanges, setDateRanges] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dataApplied, setDataApplied] = useState(false);

  const loadReport = useCallback(async () => {
    if (!reportId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: reportData, error: reportErr } = await supabase
        .from('monthly_reports').select('*, clients(name, logo_url)').eq('id', reportId).single();
      if (reportErr) throw reportErr;
      setReport(reportData);

      const { data: accountsData } = await supabase
        .from('monthly_report_accounts')
        .select('*, client_platform_accounts(id, platform_customer_id, account_name, platform)')
        .eq('report_id', reportId).order('sort_order');
      setAccounts(accountsData || []);

      const { data: sectionsData } = await supabase
        .from('monthly_report_sections').select('*').eq('report_id', reportId).order('sort_order');
      setSections(sectionsData || []);

      const { data: uploadsData } = await supabase
        .from('monthly_report_uploads').select('*').eq('report_id', reportId);
      setUploads(uploadsData || []);

      if (!reportData) return;

      const ranges = getMonthRange(reportData.report_month);
      setDateRanges(ranges);

      if (reportData.status === 'published' && reportData.published_data) {
        const snap = reportData.published_data;
        setPlatformData(snap.platformData || {});
        setOverallKpis(snap.overallKpis || {});
        setMomChanges(snap.momChanges || {});
        setPreviousKpis(snap.previousKpis || {});
        setSlideData(snap.slideData || null);
        setDateRanges(snap.dateRanges || ranges);
        setSections((snap.sections && snap.sections.length) ? snap.sections : (sectionsData || []));
        if (Array.isArray(snap.uploads) && snap.uploads.length) setUploads(snap.uploads);
        setDataApplied(true);
      }
    } catch (err) {
      setError(err?.message || 'Failed to load report');
      console.warn('[useMonthlyReport]', err);
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  const fetchReportData = useCallback(async (customRanges, accountsOverride, options = {}) => {
    if (!reportId || !report) return;
    const ranges = customRanges || dateRanges || getMonthRange(report.report_month);
    const accs = accountsOverride || accounts;
    const compareOn = options.compareOn !== false;
    setDataLoading(true);
    setError(null);
    try {
      const { dataByAccount, overallKpis: ok, previousKpis: pk, momChanges: mc } =
        await fetchPlatformDataForAccounts(accs, ranges, { compareOn });
      const slides = await buildMonthlySlideData(accs, ranges, { compareOn });
      setPlatformData(dataByAccount);
      setOverallKpis(ok);
      setPreviousKpis(pk);
      setMomChanges(mc);
      setSlideData(slides);
      setDateRanges(ranges);
      setDataApplied(true);
      return { platformData: dataByAccount, slideData: slides, dateRanges: ranges };
    } catch (err) {
      setError(err?.message || 'Failed to fetch report data');
      throw err;
    } finally {
      setDataLoading(false);
    }
  }, [reportId, report, accounts, dateRanges]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const saveReport = useCallback(async (updates) => {
    if (!reportId) return;
    const { error: err } = await supabase.from('monthly_reports').update(updates).eq('id', reportId);
    if (err) throw err;
    setReport((r) => (r ? { ...r, ...updates } : null));
  }, [reportId]);

  const saveAccounts = useCallback(async (newAccounts) => {
    if (!reportId) return;
    await supabase.from('monthly_report_accounts').delete().eq('report_id', reportId);
    if (newAccounts.length) {
      const rows = newAccounts.map((a, i) => ({
        report_id: reportId,
        platform_account_id: a.platform_account_id,
        label: a.label,
        sort_order: i,
      }));
      const { data } = await supabase.from('monthly_report_accounts').insert(rows)
        .select('*, client_platform_accounts(id, platform_customer_id, account_name, platform)');
      setAccounts(data || rows);
      return data || rows;
    }
    setAccounts([]);
    return [];
  }, [reportId]);

  const saveSections = useCallback(async (newSections) => {
    if (!reportId) return;
    await supabase.from('monthly_report_sections').delete().eq('report_id', reportId);
    if (newSections.length) {
      const rows = newSections.map((s, i) => ({
        report_id: reportId,
        section_key: s.section_key,
        title: s.title || s.section_key,
        content: typeof s.content === 'string' ? s.content : JSON.stringify(s.content),
        sort_order: i,
      }));
      await supabase.from('monthly_report_sections').insert(rows);
    }
    setSections(newSections.map((s) => ({
      ...s,
      content: typeof s.content === 'string' ? s.content : JSON.stringify(s.content),
    })));
  }, [reportId]);

  const upsertSections = useCallback(async (updates) => {
    if (!reportId) return;
    const merged = [...sections];
    for (const u of updates) {
      const content = typeof u.content === 'string' ? u.content : JSON.stringify(u.content);
      const existing = merged.find((s) => s.section_key === u.section_key);
      if (existing?.id) {
        await supabase.from('monthly_report_sections').update({ content, title: u.title || u.section_key }).eq('id', existing.id);
        Object.assign(existing, { content, title: u.title || u.section_key });
      } else {
        const { data } = await supabase.from('monthly_report_sections').insert({
          report_id: reportId,
          section_key: u.section_key,
          title: u.title || u.section_key,
          content,
          sort_order: merged.length,
        }).select().single();
        if (data) merged.push(data);
      }
    }
    setSections([...merged]);
  }, [reportId, sections]);

  const saveUpload = useCallback(async (uploadId, data) => {
    if (!uploadId) return;
    await supabase.from('monthly_report_uploads').update({ data, updated_at: new Date().toISOString() }).eq('id', uploadId);
    setUploads((prev) => prev.map((u) => (u.id === uploadId ? { ...u, data } : u)));
  }, []);

  const createUpload = useCallback(async (uploadType, platformAccountId, label) => {
    if (!reportId) return null;
    const { data: row, error } = await supabase.from('monthly_report_uploads').insert({
      report_id: reportId, upload_type: uploadType, platform_account_id: platformAccountId || null, label: label || null, data: [],
    }).select().single();
    if (error) throw error;
    setUploads((prev) => [...prev, row]);
    return row.id;
  }, [reportId]);

  const updateUpload = useCallback(async (uploadId, updates) => {
    if (!uploadId) return;
    await supabase.from('monthly_report_uploads').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', uploadId);
    setUploads((prev) => prev.map((u) => (u.id === uploadId ? { ...u, ...updates } : u)));
  }, []);

  const deleteUpload = useCallback(async (uploadId) => {
    if (!uploadId) return;
    await supabase.from('monthly_report_uploads').delete().eq('id', uploadId);
    setUploads((prev) => prev.filter((u) => u.id !== uploadId));
  }, []);

  const publishReport = useCallback(async () => {
    if (!reportId) return;
    const publishedAt = new Date().toISOString();
    const snapshot = {
      overallKpis,
      platformData,
      momChanges,
      previousKpis,
      sections,
      uploads,
      slideData,
      dateRanges,
      accounts: accounts.map((a) => ({ ...a })),
      publishedAt,
    };
    const { error: upErr } = await supabase.from('monthly_reports').update({
      status: 'published',
      published_at: publishedAt,
      published_data: snapshot,
    }).eq('id', reportId);
    if (upErr) throw upErr;
    setReport((r) => (r ? { ...r, status: 'published', published_at: publishedAt, published_data: snapshot } : null));
  }, [reportId, overallKpis, platformData, momChanges, previousKpis, sections, uploads, slideData, dateRanges, accounts]);

  return {
    report, accounts, sections, uploads, platformData, overallKpis, previousKpis, momChanges,
    slideData, dateRanges, loading, dataLoading, error, dataApplied,
    loadReport, fetchReportData, saveReport, saveAccounts, saveSections, upsertSections,
    saveUpload, createUpload, updateUpload, deleteUpload, publishReport,
  };
}
