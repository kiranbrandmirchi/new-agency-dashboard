/**
 * Maps monthly report export payload → ReportData shape for generatePptx().
 * Uses the same PPTX generator as PPT Reports (known working in browser).
 */

function summarizeLeadRows(rows, clientName) {
  if (!rows?.length) {
    return {
      location: clientName,
      callCurrent: 0,
      formsCurrent: 0,
      chatCurrent: 0,
      callPrevious: 0,
      formsPrevious: 0,
      chatPrevious: 0,
    };
  }
  if (rows.length === 1) return rows[0];
  return rows.reduce(
    (acc, r) => ({
      location: clientName,
      callCurrent: acc.callCurrent + Number(r.callCurrent || 0),
      formsCurrent: acc.formsCurrent + Number(r.formsCurrent || 0),
      chatCurrent: acc.chatCurrent + Number(r.chatCurrent || 0),
      callPrevious: acc.callPrevious + Number(r.callPrevious || 0),
      formsPrevious: acc.formsPrevious + Number(r.formsPrevious || 0),
      chatPrevious: acc.chatPrevious + Number(r.chatPrevious || 0),
    }),
    {
      location: clientName,
      callCurrent: 0,
      formsCurrent: 0,
      chatCurrent: 0,
      callPrevious: 0,
      formsPrevious: 0,
      chatPrevious: 0,
    },
  );
}

export function mapMonthlyExportToReportData(monthly) {
  const cur = monthly.currentShortLabel || monthly.currentLabel || monthly.month;
  const prev = monthly.previousShortLabel || monthly.previousLabel || 'Previous';
  const row = summarizeLeadRows(monthly.leadSummary?.rows, monthly.client);

  return {
    client: monthly.client || 'Client',
    location: row.location || monthly.client,
    month: monthly.month || cur,
    preparedBy: monthly.preparedBy || 'Red Castle Services',
    website: monthly.website || 'redcastleservices.com',
    coverLogoUrl: monthly.coverLogoUrl || '/rc-logo.png',
    services: Array.isArray(monthly.services) ? monthly.services : [],
    leadSummary: {
      tableRow: {
        location: row.location || monthly.client,
        callApril: row.callCurrent ?? 0,
        formsApril: row.formsCurrent ?? 0,
        chatApril: row.chatCurrent ?? 0,
        callMar: row.callPrevious ?? 0,
        formsMar: row.formsPrevious ?? 0,
        chatMar: row.chatPrevious ?? 0,
      },
      statBoxes: Array.isArray(monthly.leadSummary?.statBoxes) ? monthly.leadSummary.statBoxes : [],
    },
    sectionDivider: monthly.sectionDivider || { title: 'Digital Update', subtitle: `Paid Ads Performance — ${cur}` },
    paidAdsOverall: {
      comparisonSubtitle: monthly.paidAdsOverall?.comparisonSubtitle || `${cur} vs ${prev} cost and conversion analysis`,
      currentMonthLabel: monthly.paidAdsOverall?.currentMonthLabel || cur,
      previousMonthLabel: monthly.paidAdsOverall?.previousMonthLabel || prev,
      topStats: Array.isArray(monthly.paidAdsOverall?.topStats) ? monthly.paidAdsOverall.topStats : [],
      table: Array.isArray(monthly.paidAdsOverall?.table) ? monthly.paidAdsOverall.table : [],
    },
    paidAdsFlorida: monthly.paidAdsFlorida || {
      current: { label: cur, tag: 'Current', users: '0', sessions: '0', views: '0', cost: '$0', conversions: '0', costLead: '$0' },
      previous: { label: prev, tag: 'Previous', users: '0', sessions: '0', views: '0', cost: '$0', conversions: '0', costLead: '$0' },
      table: [],
    },
    searchOverview: { table: Array.isArray(monthly.searchOverview?.table) ? monthly.searchOverview.table : [] },
    topKeywords: {
      table: Array.isArray(monthly.topKeywords?.table) ? monthly.topKeywords.table : [],
      insight: monthly.topKeywords?.insight || '',
    },
    auctionInsights: {
      table: Array.isArray(monthly.auctionInsights?.table) ? monthly.auctionInsights.table : [],
      insights: Array.isArray(monthly.auctionInsights?.insights) ? monthly.auctionInsights.insights : [],
    },
    campaignProgress: monthly.campaignProgress || {
      overview: '',
      performance: '',
      metrics: '',
      goal: '',
    },
  };
}
