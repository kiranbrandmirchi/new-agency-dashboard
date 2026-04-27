import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

function getMonthRange(reportMonth) {
  const d = new Date(reportMonth);
  const y = d.getFullYear();
  const m = d.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const prevFirst = new Date(y, m - 1, 1);
  const prevLast = new Date(y, m, 0);
  const fmt = (x) => x.toISOString().slice(0, 10);
  return { currentFrom: fmt(first), currentTo: fmt(last), prevFrom: fmt(prevFirst), prevTo: fmt(prevLast) };
}

function num(v) { return Number(v) || 0; }

function momChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

      if (reportData.status === 'published' && reportData.published_data) {
        const snap = reportData.published_data;
        setPlatformData(snap.platformData || {});
        setOverallKpis(snap.overallKpis || {});
        setMomChanges(snap.momChanges || {});
        setPreviousKpis(snap.previousKpis || {});
        setSections((snap.sections && snap.sections.length) ? snap.sections : (sectionsData || []));
        if (Array.isArray(snap.uploads) && snap.uploads.length) setUploads(snap.uploads);
        setLoading(false);
        return;
      }

      const { currentFrom, currentTo, prevFrom, prevTo } = getMonthRange(reportData.report_month);

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
            supabase.from('gads_campaign_daily').select('*').eq('customer_id', cid).gte('date', prevFrom).lte('date', prevTo),
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
            supabase.from('fb_campaign_daily').select('*').eq('customer_id', cid).gte('report_date', prevFrom).lte('report_date', prevTo),
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
            ...c,
            cpc: c.clicks ? c.cost / c.clicks : 0,
            ctr: c.impressions ? (c.clicks / c.impressions) * 100 : 0,
            roas: c.cost ? c.purchase_value / c.cost : 0,
            cpl: c.lead_count ? c.cost / c.lead_count : 0,
            frequency: c._n ? c.frequency / c._n : 0,
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
          const curLinkClicks = campaigns.reduce((s, c) => s + c.link_clicks, 0);

          let pCost = 0, pClicks = 0, pImpr = 0, pReach = 0, pPurchases = 0, pPurchaseVal = 0, pLeads = 0;
          (prevRes.data || []).forEach((r) => {
            pCost += num(r.spend); pClicks += num(r.clicks); pImpr += num(r.impressions); pReach += num(r.reach);
            pPurchases += num(r.purchase_count); pPurchaseVal += num(r.purchase_value); pLeads += num(r.lead_count);
          });

          totalCost += curCost; totalClicks += curClicks; totalImpressions += curImpr; totalConversions += curPurchases + curLeads;
          prevCost += pCost; prevClicks += pClicks; prevImpressions += pImpr; prevConversions += pPurchases + pLeads;

          dataByAccount[acc.id] = {
            accountId: acc.id, label, platform,
            campaigns, keywords: [], daily,
            kpis: { cost: curCost, clicks: curClicks, impressions: curImpr, reach: curReach, link_clicks: curLinkClicks, purchase_count: curPurchases, purchase_value: curPurchaseVal, lead_count: curLeads, roas: curCost ? curPurchaseVal / curCost : 0, cpc: curClicks ? curCost / curClicks : 0, ctr: curImpr ? (curClicks / curImpr) * 100 : 0, cpl: curLeads ? curCost / curLeads : 0, conversions: curPurchases + curLeads },
            prevKpis: { cost: pCost, clicks: pClicks, impressions: pImpr, reach: pReach, purchase_count: pPurchases, purchase_value: pPurchaseVal, lead_count: pLeads, conversions: pPurchases + pLeads },
            momChange: { cost: momChange(curCost, pCost), clicks: momChange(curClicks, pClicks), impressions: momChange(curImpr, pImpr), reach: momChange(curReach, pReach), purchase_count: momChange(curPurchases, pPurchases), purchase_value: momChange(curPurchaseVal, pPurchaseVal), lead_count: momChange(curLeads, pLeads), conversions: momChange(curPurchases + curLeads, pPurchases + pLeads) },
          };

        } else if (platform === 'reddit') {
          const [campRes, prevRes] = await Promise.all([
            supabase.from('reddit_campaign_daily').select('*').eq('customer_id', cid).gte('report_date', currentFrom).lte('report_date', currentTo),
            supabase.from('reddit_campaign_daily').select('*').eq('customer_id', cid).gte('report_date', prevFrom).lte('report_date', prevTo),
          ]);

          const campaignMap = new Map();
          (campRes.data || []).forEach((r) => {
            const key = r.campaign_id;
            if (!campaignMap.has(key)) campaignMap.set(key, { campaign_name: r.campaign_name, cost: 0, clicks: 0, impressions: 0, reach: 0, conversions: 0, purchase_value: 0 });
            const a = campaignMap.get(key);
            a.cost += num(r.spend); a.clicks += num(r.clicks); a.impressions += num(r.impressions); a.reach += num(r.reach);
            a.conversions += num(r.purchase_clicks || 0); a.purchase_value += num(r.purchase_total_value || 0);
          });
          const campaigns = [...campaignMap.values()].map((c) => ({
            ...c, cpc: c.clicks ? c.cost / c.clicks : 0, ctr: c.impressions ? (c.clicks / c.impressions) * 100 : 0,
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
          const curConv = campaigns.reduce((s, c) => s + c.conversions, 0);
          const curPurchVal = campaigns.reduce((s, c) => s + c.purchase_value, 0);

          let pCost = 0, pClicks = 0, pImpr = 0, pConv = 0;
          (prevRes.data || []).forEach((r) => { pCost += num(r.spend); pClicks += num(r.clicks); pImpr += num(r.impressions); pConv += num(r.purchase_clicks || 0); });

          totalCost += curCost; totalClicks += curClicks; totalImpressions += curImpr; totalConversions += curConv;
          prevCost += pCost; prevClicks += pClicks; prevImpressions += pImpr; prevConversions += pConv;

          dataByAccount[acc.id] = {
            accountId: acc.id, label, platform,
            campaigns, keywords: [], daily,
            kpis: { cost: curCost, clicks: curClicks, impressions: curImpr, reach: curReach, conversions: curConv, purchase_value: curPurchVal, cpc: curClicks ? curCost / curClicks : 0, ctr: curImpr ? (curClicks / curImpr) * 100 : 0 },
            prevKpis: { cost: pCost, clicks: pClicks, impressions: pImpr, conversions: pConv },
            momChange: { cost: momChange(curCost, pCost), clicks: momChange(curClicks, pClicks), impressions: momChange(curImpr, pImpr), conversions: momChange(curConv, pConv) },
          };

        } else if (platform === 'tiktok') {
          const [campRes, prevRes] = await Promise.all([
            supabase.from('tiktok_campaign_daily').select('*').eq('customer_id', cid).gte('report_date', currentFrom).lte('report_date', currentTo),
            supabase.from('tiktok_campaign_daily').select('*').eq('customer_id', cid).gte('report_date', prevFrom).lte('report_date', prevTo),
          ]);

          const campaignMap = new Map();
          (campRes.data || []).forEach((r) => {
            const key = r.campaign_id;
            if (!campaignMap.has(key)) campaignMap.set(key, { campaign_name: r.campaign_name, cost: 0, clicks: 0, impressions: 0, reach: 0, conversions: 0, purchase_value: 0 });
            const a = campaignMap.get(key);
            a.cost += num(r.spend); a.clicks += num(r.clicks); a.impressions += num(r.impressions); a.reach += num(r.reach);
            a.conversions += num(r.purchase_clicks || 0); a.purchase_value += num(r.purchase_total_value || 0);
          });
          const campaigns = [...campaignMap.values()].map((c) => ({
            ...c, cpc: c.clicks ? c.cost / c.clicks : 0, ctr: c.impressions ? (c.clicks / c.impressions) * 100 : 0,
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
          const curConv = campaigns.reduce((s, c) => s + c.conversions, 0);
          const curPurchVal = campaigns.reduce((s, c) => s + c.purchase_value, 0);

          let pCost = 0, pClicks = 0, pImpr = 0, pConv = 0;
          (prevRes.data || []).forEach((r) => { pCost += num(r.spend); pClicks += num(r.clicks); pImpr += num(r.impressions); pConv += num(r.purchase_clicks || 0); });

          totalCost += curCost; totalClicks += curClicks; totalImpressions += curImpr; totalConversions += curConv;
          prevCost += pCost; prevClicks += pClicks; prevImpressions += pImpr; prevConversions += pConv;

          dataByAccount[acc.id] = {
            accountId: acc.id, label, platform,
            campaigns, keywords: [], daily,
            kpis: { cost: curCost, clicks: curClicks, impressions: curImpr, reach: curReach, conversions: curConv, purchase_value: curPurchVal, cpc: curClicks ? curCost / curClicks : 0, ctr: curImpr ? (curClicks / curImpr) * 100 : 0 },
            prevKpis: { cost: pCost, clicks: pClicks, impressions: pImpr, conversions: pConv },
            momChange: { cost: momChange(curCost, pCost), clicks: momChange(curClicks, pClicks), impressions: momChange(curImpr, pImpr), conversions: momChange(curConv, pConv) },
          };

        } else if (platform === 'ga4') {
          const [ga4Res, ga4PrevRes] = await Promise.all([
            supabase.from('ga4_raw').select('*').eq('customer_id', cid).gte('report_date', currentFrom).lte('report_date', currentTo),
            supabase.from('ga4_raw').select('*').eq('customer_id', cid).gte('report_date', prevFrom).lte('report_date', prevTo),
          ]);
          const ga4Rows = ga4Res.data || [];
          const ga4PrevRows = ga4PrevRes.data || [];

          let totalUsers = 0; let newUsers = 0; let sessions = 0; let pageViews = 0;
          ga4Rows.forEach((r) => {
            totalUsers += num(r.total_users);
            newUsers += num(r.new_users);
            sessions += num(r.sessions);
            pageViews += num(r.page_views);
          });

          let pUsers = 0; let pSessions = 0; let pPageViews = 0;
          ga4PrevRows.forEach((r) => {
            pUsers += num(r.total_users);
            pSessions += num(r.sessions);
            pPageViews += num(r.page_views);
          });

          const channelMap = new Map();
          ga4Rows.forEach((r) => {
            const ch = r.channel_group || 'Other';
            if (!channelMap.has(ch)) channelMap.set(ch, { channel: ch, users: 0, sessions: 0, pageViews: 0 });
            const agg = channelMap.get(ch);
            agg.users += num(r.total_users);
            agg.sessions += num(r.sessions);
            agg.pageViews += num(r.page_views);
          });
          const channels = [...channelMap.values()].sort((a, b) => b.sessions - a.sessions);
          const channelBreakdown = channels.map((c) => ({
            channel_group: c.channel,
            total_users: c.users,
            sessions: c.sessions,
            page_views: c.pageViews,
            conversions: 0,
            bounce_rate: 0,
            engagement_rate: 0,
            pct_users: totalUsers ? (c.users / totalUsers) * 100 : 0,
          }));

          const pageMap = new Map();
          ga4Rows.forEach((r) => {
            const p = r.page_path || '/';
            if (!pageMap.has(p)) pageMap.set(p, { page: p, title: r.page_title, page_path: p, page_title: r.page_title, views: 0, users: 0, page_views: 0, total_users: 0 });
            const agg = pageMap.get(p);
            agg.views += num(r.page_views);
            agg.users += num(r.total_users);
            agg.page_views = agg.views;
            agg.total_users = agg.users;
          });
          const topPages = [...pageMap.values()].sort((a, b) => b.views - a.views).slice(0, 10);

          const engagementRate = 0;
          const bounceRate = 0;

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
              engagementRate,
              bounceRate,
              channels,
              topPages,
              channelBreakdown,
              topSources: [],
              deviceBreakdown: [],
              topEvents: [],
              geoBreakdown: [],
              pagesPerSession: sessions ? pageViews / sessions : 0,
              avgDuration: 0,
              avgBounce: bounceRate,
              avgEngagement: engagementRate,
              conversions: 0,
            },
            kpis: { totalUsers, newUsers, sessions, pageViews, cost: 0, clicks: 0, impressions: 0 },
            prevKpis: { totalUsers: pUsers, sessions: pSessions, pageViews: pPageViews, cost: 0, clicks: 0, impressions: 0 },
            momChange: {
              users: momChange(totalUsers, pUsers),
              sessions: momChange(sessions, pSessions),
              pageViews: momChange(pageViews, pPageViews),
            },
          };
          continue;

        } else if (platform === 'ghl') {
          const startTs = `${currentFrom}T00:00:00`;
          const endTs = `${currentTo}T23:59:59.999`;
          const prevStartTs = `${prevFrom}T00:00:00`;
          const prevEndTs = `${prevTo}T23:59:59.999`;

          const [callsRes, formsRes, chatRes, firstRes, durRes, prevCallsRes, prevFormsRes] = await Promise.all([
            supabase.from('ghl_calls_view').select('*', { count: 'exact', head: true }).eq('location_id', cid).gte('date_added', startTs).lte('date_added', endTs),
            supabase.from('ghl_form_submissions_view').select('*', { count: 'exact', head: true }).eq('location_id', cid).eq('form_type', 'form_submission').gte('date_added', startTs).lte('date_added', endTs),
            supabase.from('ghl_form_submissions_view').select('*', { count: 'exact', head: true }).eq('location_id', cid).eq('form_type', 'chat_widget').gte('date_added', startTs).lte('date_added', endTs),
            supabase.from('ghl_calls_view').select('*', { count: 'exact', head: true }).eq('location_id', cid).eq('first_time', true).gte('date_added', startTs).lte('date_added', endTs),
            supabase.from('ghl_calls_view').select('duration').eq('location_id', cid).gte('date_added', startTs).lte('date_added', endTs),
            supabase.from('ghl_calls_view').select('*', { count: 'exact', head: true }).eq('location_id', cid).gte('date_added', prevStartTs).lte('date_added', prevEndTs),
            supabase.from('ghl_form_submissions_view').select('*', { count: 'exact', head: true }).eq('location_id', cid).gte('date_added', prevStartTs).lte('date_added', prevEndTs),
          ]);

          const totalCalls = callsRes.count || 0;
          const totalForms = formsRes.count || 0;
          const totalChat = chatRes.count || 0;
          const firstTime = firstRes.count || 0;
          let totalDuration = 0;
          (durRes.data || []).forEach((r) => { totalDuration += num(r.duration); });
          const totalLeads = totalCalls + totalForms + totalChat;

          const attrRes = await supabase.from('ghl_contacts_view')
            .select('clean_lead_type')
            .eq('location_id', cid)
            .gte('date_added', startTs)
            .lte('date_added', endTs);
          const attrMap = new Map();
          (attrRes.data || []).forEach((r) => {
            const lt = r.clean_lead_type || 'direct';
            attrMap.set(lt, (attrMap.get(lt) || 0) + 1);
          });
          const attribution = [...attrMap.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);

          const pCalls = prevCallsRes.count || 0;
          const pForms = prevFormsRes.count || 0;

          dataByAccount[acc.id] = {
            accountId: acc.id,
            label,
            platform: 'ghl',
            campaigns: [],
            keywords: [],
            daily: [],
            ghl: { totalCalls, totalForms, totalChat, firstTime, totalDuration, totalLeads, attribution },
            kpis: { totalCalls, totalForms, totalChat, firstTime, totalDuration, totalLeads, cost: 0, clicks: 0, impressions: 0 },
            prevKpis: { totalCalls: pCalls, totalForms: pForms, cost: 0, clicks: 0, impressions: 0 },
            momChange: {
              calls: momChange(totalCalls, pCalls),
              forms: momChange(totalForms + totalChat, pForms),
            },
          };
          continue;
        }
      }

      setPlatformData(dataByAccount);
      setOverallKpis({
        cost: totalCost, clicks: totalClicks, impressions: totalImpressions, conversions: totalConversions,
        cpc: totalClicks ? totalCost / totalClicks : 0, convRate: totalClicks ? (totalConversions / totalClicks) * 100 : 0,
        sessions: totalSessions,
      });
      setPreviousKpis({ cost: prevCost, clicks: prevClicks, impressions: prevImpressions, conversions: prevConversions, sessions: prevSessions });
      setMomChanges({
        cost: momChange(totalCost, prevCost), clicks: momChange(totalClicks, prevClicks),
        impressions: momChange(totalImpressions, prevImpressions), conversions: momChange(totalConversions, prevConversions),
        sessions: momChange(totalSessions, prevSessions),
      });
    } catch (err) {
      setError(err?.message || 'Failed to load report');
      console.warn('[useMonthlyReport]', err);
    } finally {
      setLoading(false);
    }
  }, [reportId]);

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
      const rows = newAccounts.map((a, i) => ({ report_id: reportId, platform_account_id: a.platform_account_id, label: a.label, sort_order: i }));
      await supabase.from('monthly_report_accounts').insert(rows);
    }
    setAccounts(newAccounts);
  }, [reportId]);

  const saveSections = useCallback(async (newSections) => {
    if (!reportId) return;
    await supabase.from('monthly_report_sections').delete().eq('report_id', reportId);
    if (newSections.length) {
      const rows = newSections.map((s, i) => ({ report_id: reportId, section_key: s.section_key, title: s.title, content: s.content, sort_order: i }));
      await supabase.from('monthly_report_sections').insert(rows);
    }
    setSections(newSections);
  }, [reportId]);

  const saveUpload = useCallback(async (uploadId, data) => {
    if (!uploadId) return;
    await supabase.from('monthly_report_uploads').update({ data, updated_at: new Date().toISOString() }).eq('id', uploadId);
    setUploads((prev) => prev.map((u) => (u.id === uploadId ? { ...u, data } : u)));
  }, []);

  const createUpload = useCallback(async (uploadType, platformAccountId, label) => {
    if (!reportId) return null;
    const { data: row, error } = await supabase.from('monthly_report_uploads').insert({ report_id: reportId, upload_type: uploadType, platform_account_id: platformAccountId || null, label: label || null, data: [] }).select().single();
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
  }, [reportId, overallKpis, platformData, momChanges, previousKpis, sections, uploads, accounts]);

  return { report, accounts, sections, uploads, platformData, overallKpis, previousKpis, momChanges, loading, error, loadReport, saveReport, saveAccounts, saveSections, saveUpload, createUpload, updateUpload, deleteUpload, publishReport };
}
