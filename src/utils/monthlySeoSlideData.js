import {
  momChange,
  formatChangePct,
  fI,
  fP,
  fDur,
  formatBounceRate,
  formatPeriodShort,
} from './monthlyReportHelpers';
import { invokeMarketingReportRealtime, normalizeGbpSummary } from './marketingReportRealtime';
import { resolveClientMarketingSeoConfig } from './monthlyClientSeoConfig';
import {
  fetchGbpFromGbpPerformance,
  fetchGbpFromDatabase,
  enrichGbpWithClientAccounts,
  fetchClientGbpAccounts,
  buildGbpPayloadFromSources,
  gscHasData,
  gbpHasData,
} from './monthlySeoDbFallback';
import { supabase } from '../lib/supabaseClient';

function num(v) {
  return Number(v) || 0;
}

function fmtEngagementSeconds(totalSec) {
  const n = num(totalSec);
  if (n <= 0) return '—';
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return `${d}d ${rh}h`;
  }
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(n % 60)}s`;
}

function fmtCompact(n) {
  const v = num(n);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `${Math.round(v / 1000)}K`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return fI(v);
}

function fmtPosition(pos) {
  const n = num(pos);
  if (!n) return '—';
  return n.toFixed(1);
}

function fmtCtr(ctr) {
  const n = num(ctr);
  if (n > 0 && n <= 1) return `${(n * 100).toFixed(1)}%`;
  return `${n.toFixed(1)}%`;
}

function changeArrow(pct, lowerIsBetter = false) {
  const ch = formatChangePct(pct, lowerIsBetter);
  const arrow = pct >= 0 ? '▲' : '▼';
  return { text: ch.text, positive: ch.positive, arrow };
}

function findChannelRow(rows, matcher) {
  return (rows || []).find(matcher) || {};
}

function isOrganicSearchChannel(row) {
  const ch = String(row.channel_group || '').toLowerCase();
  return ch.includes('organic search');
}

function aggregateChannelRows(rows) {
  let users = 0;
  let newUsers = 0;
  let sessions = 0;
  let engaged = 0;
  let views = 0;
  let bounceWeighted = 0;
  let engagementSec = 0;
  (rows || []).forEach((row) => {
    const s = num(row.sessions);
    users += num(row.total_users);
    newUsers += num(row.new_users);
    sessions += s;
    engaged += num(row.engaged_sessions);
    views += num(row.screen_page_views);
    bounceWeighted += num(row.bounce_rate) * s;
    engagementSec += num(row.user_engagement_duration);
  });
  return {
    users,
    newUsers,
    sessions,
    engaged,
    views,
    bounceRate: sessions ? bounceWeighted / sessions : 0,
    engagement: fmtEngagementSeconds(engagementSec),
    engagementSec,
  };
}

function buildOrganicComparisonTable(current, previous, compareOn) {
  const rows = [
    { metric: 'Total Users', cur: current.users, prev: previous.users, lowerIsBetter: false, fmt: fI },
    { metric: 'New Users', cur: current.newUsers, prev: previous.newUsers, lowerIsBetter: false, fmt: fI },
    { metric: 'Engaged Sessions', cur: current.engaged, prev: previous.engaged, lowerIsBetter: false, fmt: fI },
    { metric: 'Views', cur: current.views, prev: previous.views, lowerIsBetter: false, fmt: fI },
    {
      metric: 'Bounce Rate',
      cur: current.bounceRate,
      prev: previous.bounceRate,
      lowerIsBetter: true,
      fmt: formatBounceRate,
      isPoints: true,
    },
    {
      metric: 'User Engagement',
      cur: current.engagement,
      prev: previous.engagement,
      lowerIsBetter: false,
      fmt: (v) => v,
      skipPct: true,
    },
  ];

  return rows.map((r) => {
    if (!compareOn) {
      return {
        metric: r.metric,
        current: r.fmt(r.cur),
        previous: '—',
        change: '—',
        positive: true,
      };
    }
    if (r.skipPct) {
      return {
        metric: r.metric,
        current: r.fmt(r.cur),
        previous: r.fmt(r.prev),
        change: '—',
        positive: true,
      };
    }
    if (r.isPoints) {
      const diff = (num(r.cur) - num(r.prev)) * (num(r.cur) <= 1 && num(r.prev) <= 1 ? 100 : 1);
      const ch = changeArrow(diff, r.lowerIsBetter);
      return {
        metric: r.metric,
        current: r.fmt(r.cur),
        previous: r.fmt(r.prev),
        change: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)} pts`,
        positive: ch.positive,
      };
    }
    const pct = momChange(r.cur, r.prev);
    const ch = changeArrow(pct, r.lowerIsBetter);
    return {
      metric: r.metric,
      current: r.fmt(r.cur),
      previous: r.fmt(r.prev),
      change: ch.text,
      positive: ch.positive,
    };
  });
}

const DUAL_PERIOD_TABLE_ROWS = 5;

function buildAllChannelsTable(rows, limit = 10) {
  const sorted = [...(rows || [])].sort((a, b) => num(b.total_users) - num(a.total_users));
  return sorted.slice(0, limit).map((row) => ({
    channel: row.channel_group || '(not set)',
    users: fI(row.total_users),
    newUsers: fI(row.new_users),
    engaged: fI(row.engaged_sessions),
    bounceRate: formatBounceRate(row.bounce_rate),
    views: fI(row.screen_page_views),
    engagement: fmtEngagementSeconds(row.user_engagement_duration),
  }));
}

function channelTotals(rows) {
  const agg = aggregateChannelRows(rows);
  return {
    users: fI(agg.users),
    newUsers: fI(agg.newUsers),
    engaged: fI(agg.engaged),
    bounceRate: formatBounceRate(agg.bounceRate),
    views: fI(agg.views),
    engagement: agg.engagement,
  };
}

function isNotSetLandingPage(row) {
  const page = String(row?.landing_page || row?.page_path || row?.page || '').trim().toLowerCase();
  return !page || page === '(not set)' || page === 'not set' || page === '(none)';
}

function buildLandingPagesTable(rows, limit = 10) {
  return [...(rows || [])]
    .filter((row) => !isNotSetLandingPage(row))
    .sort((a, b) => num(b.sessions) - num(a.sessions))
    .slice(0, limit)
    .map((row) => ({
      page: row.landing_page || row.page_path || '/',
      sessions: fI(row.sessions),
      activeUsers: fI(row.active_users || row.total_users),
      newUsers: fI(row.new_users),
      avgEngagement: fDur(row.avg_session_duration),
    }));
}

function landingTotals(rows) {
  let sessions = 0;
  let activeUsers = 0;
  let newUsers = 0;
  let durationWeighted = 0;
  (rows || []).filter((row) => !isNotSetLandingPage(row)).forEach((row) => {
    const s = num(row.sessions);
    sessions += s;
    activeUsers += num(row.active_users || row.total_users);
    newUsers += num(row.new_users);
    durationWeighted += num(row.avg_session_duration) * s;
  });
  return {
    sessions: fI(sessions),
    activeUsers: fI(activeUsers),
    newUsers: fI(newUsers),
    avgEngagement: fDur(sessions ? durationWeighted / sessions : 0),
  };
}

function isNotSetCity(row) {
  const city = String(row?.city || '').trim().toLowerCase();
  return !city || city === '(not set)' || city === 'not set';
}

function buildCitiesTable(rows, limit = 10) {
  return [...(rows || [])]
    .filter((row) => !isNotSetCity(row))
    .sort((a, b) => num(b.screen_page_views || b.views) - num(a.screen_page_views || a.views))
    .slice(0, limit)
    .map((row) => ({
      city: [row.city, row.region].filter(Boolean).join(', ') || row.city || '—',
      views: fI(row.screen_page_views),
      sessions: fI(row.sessions),
      engaged: fI(row.engaged_sessions),
      users: fI(row.total_users),
      engagement: fmtEngagementSeconds(row.user_engagement_duration),
      bounceRate: formatBounceRate(row.bounce_rate),
    }));
}

function cityTotals(rows) {
  const filtered = (rows || []).filter((row) => !isNotSetCity(row));
  const agg = aggregateChannelRows(filtered.map((r) => ({
    ...r,
    screen_page_views: r.screen_page_views,
  })));
  return {
    views: fI(agg.views),
    sessions: fI(agg.sessions),
    engaged: fI(agg.engaged),
    users: fI(agg.users),
    bounceRate: formatBounceRate(agg.bounceRate),
  };
}

function gscSummaryRow(summaryPart) {
  const row = Array.isArray(summaryPart)
    ? (summaryPart[0] || {})
    : (summaryPart && typeof summaryPart === 'object' ? summaryPart : {});
  return {
    clicks: num(row.clicks),
    impressions: num(row.impressions),
    ctr: num(row.ctr),
    position: num(row.position),
  };
}

function organicAggFromSummary(summary) {
  if (!summary) {
    return aggregateChannelRows([]);
  }
  return {
    users: num(summary.total_users),
    newUsers: num(summary.new_users),
    sessions: num(summary.sessions),
    engaged: num(summary.engaged_sessions),
    views: num(summary.screen_page_views),
    bounceRate: num(summary.bounce_rate),
    engagement: fmtEngagementSeconds(summary.user_engagement_duration),
    engagementSec: num(summary.user_engagement_duration),
  };
}

function buildCompareStatBox(current, previous, label, compareOn, fmt = fI, lowerIsBetter = false) {
  const cur = num(current);
  const prev = num(previous);
  const box = {
    value: fmt(current),
    label,
    sub: '',
  };
  if (compareOn) {
    const pct = momChange(cur, prev);
    const ch = changeArrow(pct, lowerIsBetter);
    box.previousValue = fmt(previous);
    box.comparePct = pct;
    box.compareUp = pct >= 0;
    box.compareGood = ch.positive;
    box.sub = `${box.previousValue} · ${ch.text}`;
  }
  return box;
}

function buildTopQueriesTable(currentQueries, previousQueries, limit = 10) {
  const prevMap = new Map((previousQueries || []).map((q) => [q.query, q]));
  return [...(currentQueries || [])]
    .sort((a, b) => num(b.clicks) - num(a.clicks) || num(b.impressions) - num(a.impressions))
    .slice(0, limit)
    .map((q) => {
      const prev = prevMap.get(q.query) || {};
      const clickDiff = num(q.clicks) - num(prev.clicks);
      const imprDiff = num(q.impressions) - num(prev.impressions);
      return {
        query: q.query || '—',
        currentClicks: fI(q.clicks),
        previousClicks: fI(prev.clicks),
        clickDiff: clickDiff >= 0 ? `+${clickDiff}` : String(clickDiff),
        currentImpr: fmtCompact(q.impressions),
        previousImpr: fmtCompact(prev.impressions),
        imprDiff: imprDiff >= 0 ? `+${fmtCompact(imprDiff)}` : String(imprDiff),
      };
    });
}

function buildTopPagesTable(currentPages, previousPages, limit = 6) {
  const prevMap = new Map((previousPages || []).map((p) => [p.page, p]));
  return [...(currentPages || [])]
    .sort((a, b) => num(b.clicks) - num(a.clicks) || num(b.impressions) - num(a.impressions))
    .slice(0, limit)
    .map((p) => {
      const prev = prevMap.get(p.page) || {};
      const clickDiff = num(p.clicks) - num(prev.clicks);
      const imprDiff = num(p.impressions) - num(prev.impressions);
      const page = p.page || '—';
      const shortPage = page.length > 48 ? `${page.slice(0, 45)}…` : page;
      return {
        page: shortPage,
        fullPage: page,
        currentClicks: fI(p.clicks),
        previousClicks: fI(prev.clicks),
        clickDiff: clickDiff >= 0 ? `+${clickDiff}` : String(clickDiff),
        currentImpr: fmtCompact(p.impressions),
        previousImpr: fmtCompact(prev.impressions),
        imprDiff: imprDiff >= 0 ? `+${fmtCompact(imprDiff)}` : String(imprDiff),
        position: fmtPosition(p.position),
      };
    });
}

function buildGa4ExecStatBoxes(cur, prev, compareOn) {
  return [
    buildCompareStatBox(cur.sessions, prev.sessions, 'Organic Sessions', compareOn),
    buildCompareStatBox(cur.users, prev.users, 'Organic Users', compareOn),
    buildCompareStatBox(cur.views, prev.views, 'Pageviews', compareOn),
    buildCompareStatBox(cur.bounceRate, prev.bounceRate, 'Bounce Rate', compareOn, formatBounceRate, true),
  ];
}

function buildGscStatBoxes(current, previous, compareOn) {
  return [
    buildCompareStatBox(current.clicks, previous.clicks, 'Clicks', compareOn),
    buildCompareStatBox(current.impressions, previous.impressions, 'Impressions', compareOn, fmtCompact),
    buildCompareStatBox(current.ctr, previous.ctr, 'CTR', compareOn, fmtCtr, true),
    buildCompareStatBox(current.position, previous.position, 'Avg Position', compareOn, fmtPosition, true),
  ];
}

function locKey(loc) {
  return String(loc.business_name || loc.store_code || loc.name || '').trim().toLowerCase();
}

function buildGbpLocationComparison(gbp, compareOn, currentLabel, previousLabel) {
  const curLocs = gbp.locations || [];
  const prevLocs = gbp.previous_locations || [];
  const prevMap = new Map(prevLocs.map((l) => [locKey(l), l]));

  const metricRow = (label, curVal, prevVal, fmt = fI) => ({
    metric: label,
    current: fmt(curVal),
    previous: compareOn ? fmt(prevVal) : '—',
    change: compareOn ? changeArrow(momChange(curVal, prevVal)).text : '—',
  });

  if (curLocs.length) {
    return curLocs.map((loc, idx) => {
      const prev = prevLocs[idx] || prevMap.get(locKey(loc)) || {};
      const curImp = num(loc.total_impressions);
      const prevImp = num(prev.total_impressions);
      return {
        name: loc.business_name || loc.store_code || 'Location',
        address: loc.address || '',
        table: [
          metricRow('Calls', num(loc.calls), num(prev.calls)),
          metricRow('Directions', num(loc.directions), num(prev.directions)),
          metricRow('Website Clicks', num(loc.website_clicks), num(prev.website_clicks)),
          metricRow('Impressions', curImp, prevImp, fmtCompact),
        ],
      };
    });
  }

  const s = gbp.summary || {};
  const p = gbp.previous_summary || {};
  return [{
    name: 'All locations',
    address: '',
    table: [
      metricRow('Calls', num(s.call_clicks ?? s.calls), num(p.call_clicks ?? p.calls)),
      metricRow('Directions', num(s.direction_requests ?? s.directions), num(p.direction_requests ?? p.directions)),
      metricRow('Website Clicks', num(s.website_clicks), num(p.website_clicks)),
      metricRow('Impressions', num(s.total_impressions), num(p.total_impressions), fmtCompact),
    ],
  }];
}

function buildGbpStatBoxes(summary, previousSummary, compareOn) {
  const s = summary || {};
  const p = previousSummary || {};
  return [
    buildCompareStatBox(s.call_clicks ?? s.calls, p.call_clicks ?? p.calls, 'Calls from GBP', compareOn),
    buildCompareStatBox(s.direction_requests ?? s.directions, p.direction_requests ?? p.directions, 'Direction Requests', compareOn),
    buildCompareStatBox(s.website_clicks, p.website_clicks, 'Website Clicks', compareOn),
    buildCompareStatBox(s.total_impressions, p.total_impressions, 'Total Impressions', compareOn, fmtCompact),
  ];
}

function deriveBrandTerms(clientName) {
  const name = String(clientName || '').trim();
  if (!name) return [];
  const stop = new Set(['the', 'of', 'and', 'a', 'an', 'at', 'in', 'on', 'for', '&', 'llc', 'inc']);
  const words = name.toLowerCase().replace(/[^a-z0-9\s&]/g, ' ').split(/\s+/).filter(Boolean);
  const terms = words.filter((t) => (t.length > 2 || t === 'pb' || t === 'pbs') && !stop.has(t));
  const phrase = words.filter((w) => !stop.has(w)).join(' ').trim();
  if (phrase.length > 4) terms.push(phrase);
  if (words.length >= 2) terms.push(`${words[0]} ${words[1]}`);
  return [...new Set(terms.filter((t) => t.length > 2))];
}

function buildBrandedQueryTablesFromGsc(gsc, clientName, limit = 5) {
  const currentQueries = gsc?.queries?.current;
  const previousQueries = gsc?.queries?.previous;
  // Prefer client-name split — matches historical behavior and avoids GSC isBranded
  // filters returning empty branded while non-branded looks "full".
  if (String(clientName || '').trim() && (currentQueries?.length || 0) > 0) {
    return {
      ...buildBrandedQueryTables(currentQueries, previousQueries, clientName, limit),
      source: 'client_name',
    };
  }
  const brandedCur = gsc?.branded_queries?.current;
  const brandedPrev = gsc?.branded_queries?.previous;
  const nonBrandedCur = gsc?.non_branded_queries?.current;
  const nonBrandedPrev = gsc?.non_branded_queries?.previous;
  if ((brandedCur?.length || 0) + (nonBrandedCur?.length || 0) > 0) {
    return {
      brandedTable: buildTopQueriesTable(brandedCur, brandedPrev, limit),
      nonBrandedTable: buildTopQueriesTable(nonBrandedCur, nonBrandedPrev, limit),
      source: 'gsc_api',
    };
  }
  return { ...buildBrandedQueryTables(currentQueries, previousQueries, clientName, limit), source: 'client_name' };
}

function isBrandedQuery(query, brandTerms) {
  const q = String(query || '').toLowerCase();
  if (!q || !brandTerms.length) return false;
  return brandTerms.some((term) => q.includes(term));
}

function buildBrandedQueryTables(currentQueries, previousQueries, clientName, limit = 5) {
  const brandTerms = deriveBrandTerms(clientName);
  const branded = [];
  const nonBranded = [];
  for (const q of currentQueries || []) {
    if (isBrandedQuery(q.query, brandTerms)) branded.push(q);
    else nonBranded.push(q);
  }
  return {
    brandedTable: buildTopQueriesTable(branded, previousQueries, limit),
    nonBrandedTable: buildTopQueriesTable(nonBranded, previousQueries, limit),
  };
}

export function buildSeoSlideDataFromApi(apiData, labels, compareOn, clientName = '') {
  const ga4 = apiData?.ga4 || {};
  const gsc = apiData?.gsc || {};
  const gbp = apiData?.gbp || {};
  const { currentLabel, previousLabel, periodLabel } = labels;

  const curChannel = ga4.channel?.current || [];
  const prevChannel = ga4.channel?.previous || [];

  let curOrganicAgg;
  let prevOrganicAgg;
  if (ga4.organic_summary?.current) {
    curOrganicAgg = organicAggFromSummary(ga4.organic_summary.current);
    prevOrganicAgg = organicAggFromSummary(ga4.organic_summary.previous);
  } else {
    const curOrganic = findChannelRow(curChannel, isOrganicSearchChannel);
    const prevOrganic = findChannelRow(prevChannel, isOrganicSearchChannel);
    curOrganicAgg = aggregateChannelRows([curOrganic]);
    prevOrganicAgg = aggregateChannelRows([prevOrganic]);
  }

  const curGsc = gscSummaryRow(gsc.summary?.current);
  const prevGsc = gscSummaryRow(gsc.summary?.previous);

  const gbpSummary = gbp.summary || {};
  const gbpPrev = gbp.previous_summary || {};

  const ga4StatBoxes = buildGa4ExecStatBoxes(curOrganicAgg, prevOrganicAgg, compareOn);
  const gscStatBoxes = buildGscStatBoxes(curGsc, prevGsc, compareOn);
  const gbpStatBoxes = buildGbpStatBoxes(gbpSummary, gbpPrev, compareOn);

  const slide11 = {
    ga4: {
      title: 'Google Analytics 4',
      statBoxes: ga4StatBoxes,
    },
    gsc: {
      title: 'Google Search Console',
      statBoxes: gscStatBoxes,
    },
    gbp: {
      title: 'Google Business Profile',
      statBoxes: gbpStatBoxes,
    },
    statBoxes: [
      {
        value: compareOn ? changeArrow(momChange(curOrganicAgg.sessions, prevOrganicAgg.sessions)).text : fI(curOrganicAgg.sessions),
        label: 'GA4 Organic Sessions',
        sub: compareOn ? `vs ${previousLabel}` : currentLabel,
      },
      {
        value: fI(curGsc.clicks),
        label: 'GSC Clicks',
        sub: compareOn ? `${previousLabel}: ${fI(prevGsc.clicks)} · ${changeArrow(momChange(curGsc.clicks, prevGsc.clicks)).text}` : currentLabel,
      },
      {
        value: fI(gbpSummary.direction_requests ?? gbpSummary.directions),
        label: 'GBP Directions',
        sub: compareOn && (gbpPrev.direction_requests ?? gbpPrev.directions)
          ? `${previousLabel}: ${fI(gbpPrev.direction_requests ?? gbpPrev.directions)}`
          : 'Strong local intent',
      },
      {
        value: fmtCompact(curGsc.impressions),
        label: 'GSC Impressions',
        sub: compareOn ? `${previousLabel}: ${fmtCompact(prevGsc.impressions)}` : '',
      },
    ],
    sections: {
      websiteAnalytics: compareOn
        ? `Organic channel — Users ${changeArrow(momChange(curOrganicAgg.users, prevOrganicAgg.users)).text}, Sessions ${changeArrow(momChange(curOrganicAgg.sessions, prevOrganicAgg.sessions)).text}, Pageviews ${changeArrow(momChange(curOrganicAgg.views, prevOrganicAgg.views)).text} vs ${previousLabel}.`
        : `Organic channel — ${fI(curOrganicAgg.users)} users, ${fI(curOrganicAgg.sessions)} sessions, ${fI(curOrganicAgg.views)} pageviews in ${currentLabel}.`,
      googleSearchConsole: compareOn
        ? `Clicks ${fI(curGsc.clicks)} (${changeArrow(momChange(curGsc.clicks, prevGsc.clicks)).text} vs ${previousLabel}), Impressions ${fmtCompact(curGsc.impressions)}, CTR ${fmtCtr(curGsc.ctr)}, Avg position ${fmtPosition(curGsc.position)}.`
        : `Clicks ${fI(curGsc.clicks)}, Impressions ${fmtCompact(curGsc.impressions)}, CTR ${fmtCtr(curGsc.ctr)}.`,
      gbpPerformance: compareOn
        ? `${fI(gbpSummary.direction_requests ?? gbpSummary.directions)} direction requests (${previousLabel}: ${fI(gbpPrev.direction_requests ?? gbpPrev.directions)}), ${fI(gbpSummary.call_clicks ?? gbpSummary.calls)} calls, ${fI(gbpSummary.website_clicks)} website clicks.`
        : `${fI(gbpSummary.direction_requests ?? gbpSummary.directions)} direction requests, ${fI(gbpSummary.call_clicks ?? gbpSummary.calls)} calls from GBP.`,
      webDevUpdates: 'Website updates and optimization in progress.',
      keywordsRanking: 'More keywords surfacing in Google Search; targeted terms actively being optimized.',
      nextSteps: 'Content creation, backlink strategy & AI-driven SEO to sustain continued growth.',
    },
    fetchErrors: {
      ga4: ga4.error || null,
      gsc: gsc.error || null,
      gbp: gbp.error || null,
    },
  };

  const slide13 = {
    statBoxes: [
      buildCompareStatBox(curOrganicAgg.users, prevOrganicAgg.users, `Total Users (${currentLabel})`, compareOn),
      buildCompareStatBox(curOrganicAgg.views, prevOrganicAgg.views, `Views (${currentLabel})`, compareOn),
      buildCompareStatBox(curOrganicAgg.engaged, prevOrganicAgg.engaged, `Engaged Sessions (${currentLabel})`, compareOn),
      buildCompareStatBox(curOrganicAgg.bounceRate, prevOrganicAgg.bounceRate, `Bounce Rate (${currentLabel})`, compareOn, formatBounceRate, true),
    ],
    table: buildOrganicComparisonTable(curOrganicAgg, prevOrganicAgg, compareOn),
    insight: compareOn
      ? `Organic Search bounce rate ${formatBounceRate(curOrganicAgg.bounceRate)} vs ${formatBounceRate(prevOrganicAgg.bounceRate)} in ${previousLabel}.`
      : '',
  };

  const slide14 = {
    compareOn,
    previous: {
      periodLabel: previousLabel,
      totalsLine: channelTotals(prevChannel),
      table: buildAllChannelsTable(prevChannel, DUAL_PERIOD_TABLE_ROWS),
      note: compareOn
        ? `Comparison period (${previousLabel}). Organic Search often has the lowest bounce rate.`
        : '',
    },
    current: {
      periodLabel: currentLabel,
      totalsLine: channelTotals(curChannel),
      table: buildAllChannelsTable(curChannel, DUAL_PERIOD_TABLE_ROWS),
      note: 'Organic Search visitors are typically the most engaged compared to Direct traffic.',
    },
  };

  const landingCur = ga4.landing_page?.current || ga4.page?.current || [];
  const landingPrev = ga4.landing_page?.previous || ga4.page?.previous || [];

  const slide15 = {
    compareOn,
    previous: {
      periodLabel: compareOn ? previousLabel : currentLabel,
      totalsLine: landingTotals(landingPrev),
      table: buildLandingPagesTable(landingPrev, DUAL_PERIOD_TABLE_ROWS),
    },
    current: {
      periodLabel: currentLabel,
      totalsLine: landingTotals(landingCur),
      table: buildLandingPagesTable(landingCur, DUAL_PERIOD_TABLE_ROWS),
    },
  };

  const geoCur = ga4.geo?.current || [];
  const geoPrev = ga4.geo?.previous || [];

  const slide16 = {
    compareOn,
    previous: {
      periodLabel: compareOn ? previousLabel : currentLabel,
      totalsLine: cityTotals(geoPrev),
      table: buildCitiesTable(geoPrev, DUAL_PERIOD_TABLE_ROWS),
    },
    current: {
      periodLabel: currentLabel,
      totalsLine: cityTotals(geoCur),
      table: buildCitiesTable(geoCur, DUAL_PERIOD_TABLE_ROWS),
    },
  };

  const querySplit = buildBrandedQueryTablesFromGsc(gsc, clientName, 5);
  const slide22 = {
    statBoxes: gscStatBoxes,
    insight: compareOn
      ? `Clicks ${changeArrow(momChange(curGsc.clicks, prevGsc.clicks)).text} and Impressions ${changeArrow(momChange(curGsc.impressions, prevGsc.impressions)).text} vs ${previousLabel}. Average position ${fmtPosition(curGsc.position)} vs ${fmtPosition(prevGsc.position)}.`
      : `Clicks ${fI(curGsc.clicks)}, Impressions ${fmtCompact(curGsc.impressions)}, CTR ${fmtCtr(curGsc.ctr)}.`,
    queriesTable: buildTopQueriesTable(gsc.queries?.current, gsc.queries?.previous, 5),
    brandedTable: querySplit.brandedTable,
    nonBrandedTable: querySplit.nonBrandedTable,
    notes: '',
  };

  const slide19 = {
    table: buildTopQueriesTable(gsc.queries?.current, gsc.queries?.previous, 20),
  };

  const locationRows = buildGbpLocationComparison(gbp, compareOn, currentLabel, previousLabel);

  const slide24 = {
    statBoxes: gbpStatBoxes,
    compareOn,
    currentLabel,
    previousLabel,
    locationRows,
    multiLocation: locationRows.length > 1,
    notes: {
      calls: compareOn
        ? `${fI(gbpSummary.call_clicks ?? gbpSummary.calls)} calls from GBP (${previousLabel}: ${fI(gbpPrev.call_clicks ?? gbpPrev.calls)}).`
        : 'Call volume reflects direct inquiry flow from Google Business Profile.',
      directions: compareOn
        ? `${fI(gbpSummary.direction_requests ?? gbpSummary.directions)} direction requests (${previousLabel}: ${fI(gbpPrev.direction_requests ?? gbpPrev.directions)}).`
        : `${fI(gbpSummary.direction_requests ?? gbpSummary.directions)} direction requests reflect local interest.`,
      website: compareOn
        ? `${fI(gbpSummary.website_clicks)} website clicks (${previousLabel}: ${fI(gbpPrev.website_clicks)}).`
        : `${fI(gbpSummary.website_clicks)} website clicks from GBP profile.`,
      summary: '',
    },
  };

  return {
    periodLabel,
    currentLabel,
    previousLabel,
    slide11,
    slide13,
    slide14,
    slide15,
    slide16,
    slide19,
    slide22,
    slide24,
    raw: { ga4, gsc, gbp },
  };
}

export function emptySeoSlideData(currentLabel, previousLabel, compareOn) {
  const periodLabel = compareOn && previousLabel
    ? `${currentLabel} vs ${previousLabel}`
    : currentLabel;
  const emptyTable = () => [{ page: '—', sessions: '0', activeUsers: '0', newUsers: '0', avgEngagement: '—' }];
  const emptyChannel = () => [{ channel: 'Organic Search', users: '0', newUsers: '0', engaged: '0', bounceRate: '—', views: '0', engagement: '—' }];
  return {
    periodLabel,
    currentLabel,
    previousLabel,
    slide11: {
      ga4: { title: 'Google Analytics 4', statBoxes: [] },
      gsc: { title: 'Google Search Console', statBoxes: [] },
      gbp: { title: 'Google Business Profile', statBoxes: [] },
      statBoxes: [
        { value: '—', label: 'GA4 Organic Sessions', sub: '' },
        { value: '—', label: 'GSC Clicks', sub: '' },
        { value: '—', label: 'GBP Directions', sub: '' },
        { value: '—', label: 'GSC Impressions', sub: '' },
      ],
      sections: {
        websiteAnalytics: '',
        webDevUpdates: '',
        googleSearchConsole: '',
        gbpPerformance: '',
        keywordsRanking: '',
        nextSteps: '',
      },
    },
    slide13: { statBoxes: [], table: [], insight: '' },
    slide14: { compareOn, previous: { periodLabel: previousLabel, totalsLine: {}, table: emptyChannel(), note: '' }, current: { periodLabel: currentLabel, totalsLine: {}, table: emptyChannel(), note: '' } },
    slide15: { compareOn, previous: { periodLabel: previousLabel, totalsLine: {}, table: emptyTable() }, current: { periodLabel: currentLabel, totalsLine: {}, table: emptyTable() } },
    slide16: { compareOn, previous: { periodLabel: previousLabel, totalsLine: {}, table: [] }, current: { periodLabel: currentLabel, totalsLine: {}, table: [] } },
    slide19: { table: [] },
    slide22: { statBoxes: [], insight: '', queriesTable: [], brandedTable: [], nonBrandedTable: [], notes: '' },
    slide24: {
      statBoxes: [],
      compareOn,
      locationRows: [],
      notes: { calls: '', directions: '', website: '', summary: '' },
    },
  };
}

/**
 * Fetch SEO marketing data via marketing-report-realtime V2 (seo-report-generate flow).
 * Requires client_id only — edge resolves GA4 property, GSC site, and GBP from DB.
 */
export async function fetchSeoMarketingData({
  clientId,
  agencyId = null,
  clientName: optionsClientName = '',
  dateFrom,
  dateTo,
  compareFrom,
  compareTo,
  compareOn = true,
}) {
  const currentLabel = formatPeriodShort(dateFrom);
  const previousLabel = compareOn ? formatPeriodShort(compareFrom) : '';
  const periodLabel = compareOn && previousLabel
    ? `${currentLabel} vs ${previousLabel}`
    : currentLabel;

  if (!clientId) {
    return { ...emptySeoSlideData(currentLabel, previousLabel, compareOn), error: 'No client linked to this report' };
  }

  let resolvedAgencyId = agencyId;
  let clientName = optionsClientName || '';
  const { data: clientRow } = await supabase
    .from('clients')
    .select('agency_id, name')
    .eq('id', clientId)
    .maybeSingle();
  if (!resolvedAgencyId) resolvedAgencyId = clientRow?.agency_id || null;
  if (!clientName) clientName = clientRow?.name || '';

  let apiError = null;
  let merged = { ga4: {}, gsc: {}, gbp: {} };
  let seoConfig = null;

  try {
    const result = await invokeMarketingReportRealtime({
      clientId,
      agencyId: resolvedAgencyId,
      dateFrom,
      dateTo,
      compareDateFrom: compareOn ? compareFrom : undefined,
      compareDateTo: compareOn ? compareTo : undefined,
      compareOn,
      services: ['ga4', 'gsc'],
    });
    seoConfig = result.seoConfig || null;
    if (!result.success) {
      apiError = result.error || 'marketing-report-realtime failed';
    } else if (result.normalized) {
      merged = {
        ...result.normalized,
        gbp: {},
      };
      if (merged.gsc && !merged.gsc.source) merged.gsc.source = 'api';
    }
    if (result.error) apiError = result.error;
  } catch (err) {
    apiError = err?.message || 'marketing-report-realtime failed';
    console.warn('[SEO] marketing-report-realtime:', apiError);
  }

  // GBP: gbp_performance table only (client-tagged accounts in Settings → matched to business_name).
  try {
    const [gbpPerf, gbpAccounts] = await Promise.all([
      fetchGbpFromGbpPerformance({
        clientId,
        agencyId: resolvedAgencyId,
        dateFrom,
        compareFrom: compareOn ? compareFrom : undefined,
        compareOn,
      }),
      fetchClientGbpAccounts(clientId),
    ]);

    const built = buildGbpPayloadFromSources({
      accounts: gbpAccounts,
      rawCurRows: gbpPerf?.rawCurRows || [],
      rawPrevRows: gbpPerf?.rawPrevRows || [],
    });

    if (built?.locations?.length) {
      if (import.meta.env?.DEV) {
        console.log('[SEO] GBP from gbp_performance', built.locations.map((l) => ({
          name: l.business_name,
          calls: l.calls,
          directions: l.directions,
        })));
      }
      merged = {
        ...merged,
        gbp: {
          ...built,
          summary: normalizeGbpSummary(built.summary),
          previous_summary: built.previous_summary
            ? normalizeGbpSummary(built.previous_summary)
            : null,
          source: 'gbp_performance',
        },
      };
    } else if ((gbpPerf?.rawCurRows || []).length === 0) {
      apiError = apiError || 'gbp_performance returned no rows for this month. Run migration 20260530120000_gbp_performance_read_policy.sql on Supabase if the table has data in the dashboard.';
    } else if (!gbpHasData(merged.gbp) && resolvedAgencyId) {
      const cfg = seoConfig || await resolveClientMarketingSeoConfig(clientId, resolvedAgencyId);
      const gbpDb = await fetchGbpFromDatabase({
        agencyId: resolvedAgencyId,
        clientId,
        gbpLocationId: cfg.gbpLocationId,
        dateFrom,
        dateTo,
        compareFrom: compareOn ? compareFrom : undefined,
        compareTo: compareOn ? compareTo : undefined,
        compareOn,
      });
      if (gbpHasData(gbpDb)) {
        merged = {
          ...merged,
          gbp: {
            ...gbpDb,
            summary: normalizeGbpSummary(gbpDb.summary),
            previous_summary: gbpDb.previous_summary
              ? normalizeGbpSummary(gbpDb.previous_summary)
              : null,
          },
        };
      }
    }
  } catch (err) {
    console.warn('[SEO] GBP gbp_performance:', err?.message);
  }

  if (merged.gbp) {
    merged.gbp = await enrichGbpWithClientAccounts(clientId, merged.gbp);
  }

  const hasGa4 = (
    merged.ga4?.channel?.current?.length
    || merged.ga4?.organic_summary?.current
    || merged.ga4?.landing_page?.current?.length
  );
  const hasData = hasGa4 || gscHasData(merged.gsc) || gbpHasData(merged.gbp);

  if (!hasData) {
    const hint = !seoConfig?.ga4PropertyId
      ? 'No GA4 property linked to this client in Settings.'
      : apiError || 'No SEO data returned for this date range. Check GSC site URL on the client and redeploy marketing-report-realtime.';
    return {
      ...emptySeoSlideData(currentLabel, previousLabel, compareOn),
      error: hint,
    };
  }

  return {
    ...buildSeoSlideDataFromApi(merged, { currentLabel, previousLabel, periodLabel }, compareOn, clientName),
    error: apiError,
    dataSources: {
      gsc: gscHasData(merged.gsc) ? (merged.gsc?.source || 'api') : null,
      gbp: gbpHasData(merged.gbp) ? (merged.gbp?.source || 'database') : null,
      ga4: hasGa4 ? 'api' : null,
    },
  };
}

