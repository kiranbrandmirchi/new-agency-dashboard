import {
  parseSectionJson,
  getSectionText,
  DEFAULT_SLIDE2_SERVICES,
  DEFAULT_SLIDE10_PROGRESS,
  fU,
  fI,
  formatMonthLabel,
  formatPeriodShort,
} from './monthlyReportHelpers';

/**
 * @typedef {Object} MonthlyExportData
 * @property {string} client
 * @property {string} month
 * @property {string} preparedBy
 * @property {string} website
 * @property {string} coverLogoUrl
 * @property {string} currentLabel
 * @property {string} previousLabel
 * @property {string} comparisonHeader
 */

function normalizeLeadRow(row, clientName) {
  return {
    location: row?.location || clientName,
    callCurrent: Number(row?.callCurrent ?? row?.callApril ?? 0),
    formsCurrent: Number(row?.formsCurrent ?? row?.formsApril ?? 0),
    chatCurrent: Number(row?.chatCurrent ?? row?.chatApril ?? 0),
    callPrevious: Number(row?.callPrevious ?? row?.callMar ?? 0),
    formsPrevious: Number(row?.formsPrevious ?? row?.formsMar ?? 0),
    chatPrevious: Number(row?.chatPrevious ?? row?.chatMar ?? 0),
  };
}

function buildStatBoxes(rows, previousLabel) {
  const totals = rows.reduce(
    (acc, r) => ({
      calls: acc.calls + r.callCurrent,
      forms: acc.forms + r.formsCurrent,
      chat: acc.chat + r.chatCurrent,
      prevCalls: acc.prevCalls + r.callPrevious,
      prevForms: acc.prevForms + r.formsPrevious,
      prevChat: acc.prevChat + r.chatPrevious,
    }),
    { calls: 0, forms: 0, chat: 0, prevCalls: 0, prevForms: 0, prevChat: 0 },
  );
  return [
    { value: String(totals.calls), label: 'Total Call Leads' },
    { value: String(totals.forms + totals.chat), label: 'Total Forms and Chat Widgets' },
    { value: String(totals.prevCalls), label: `Total Calls (${previousLabel})` },
    { value: String(totals.prevForms + totals.prevChat), label: `Forms & Chat (${previousLabel})` },
  ];
}

/**
 * Build export payload for generateMonthlyPptx (no hardcoded sample data).
 */
export function buildMonthlyExportData({
  report,
  agency,
  sections,
  slideData,
  currentLabel,
  previousLabel,
  reportFrom,
  compareFrom,
}) {
  const clientName = report?.clients?.name || 'Client';
  const monthLabel = currentLabel || formatMonthLabel(report?.report_month);
  const prevLabel = previousLabel || 'Previous Period';
  const currentShortLabel = formatPeriodShort(reportFrom || report?.report_month);
  const previousShortLabel = formatPeriodShort(compareFrom) || formatPeriodShort(prevLabel);
  const preparedBy = agency?.agency_name || 'Red Castle Services';
  const website = (agency?.website_url || 'redcastleservices.com').replace(/^https?:\/\//, '');

  const servicesRaw = parseSectionJson(sections, 'slide2_services', DEFAULT_SLIDE2_SERVICES);
  const services = Array.isArray(servicesRaw) && servicesRaw.length ? servicesRaw : DEFAULT_SLIDE2_SERVICES;
  const leadData = parseSectionJson(sections, 'slide3_leads', slideData?.slide3Prefill || { rows: [], statBoxes: [] });
  const slide8Insights = getSectionText(sections, 'slide8_insights', '');
  const auctionRowsRaw = parseSectionJson(sections, 'slide9_auction_data', []);
  const auctionRows = Array.isArray(auctionRowsRaw) ? auctionRowsRaw : [];
  const auctionNotes = getSectionText(sections, 'slide9_auction_notes', '');
  const progressRaw = parseSectionJson(sections, 'slide10_progress', DEFAULT_SLIDE10_PROGRESS);
  const progress = { ...DEFAULT_SLIDE10_PROGRESS, ...(progressRaw && typeof progressRaw === 'object' ? progressRaw : {}) };

  const leadRows = (leadData.rows?.length ? leadData.rows : [{ location: clientName }]).map((r) =>
    normalizeLeadRow(r, clientName),
  );

  const statBoxes = leadData.statBoxes?.length >= 4
    ? leadData.statBoxes.map((b) => ({ value: String(b.value ?? ''), label: String(b.label ?? '') }))
    : buildStatBoxes(leadRows, previousShortLabel);

  const s5 = slideData?.slide5 || {};
  const s6 = slideData?.slide6 || {};
  const s7 = slideData?.slide7 || { table: [] };
  const s8 = slideData?.slide8 || { keywords: [] };

  const emptyPanel = (label, tag) => ({
    label,
    tag,
    users: '0',
    sessions: '0',
    views: '0',
    cost: fU(0),
    conversions: '0',
    costLead: fU(0),
  });

  return {
    client: clientName,
    month: monthLabel,
    preparedBy,
    website,
    coverLogoUrl: agency?.logo_url || '/rc-logo.png',
    currentLabel: monthLabel,
    previousLabel: prevLabel,
    currentShortLabel,
    previousShortLabel,
    comparisonHeader: slideData?.comparisonHeader || `${currentShortLabel} vs ${previousShortLabel}`,
    services,
    leadSummary: {
      rows: leadRows,
      statBoxes,
      totalsSubBar: `Combined Totals – ${prevLabel}`,
    },
    sectionDivider: {
      title: 'Digital Update',
      subtitle: `Paid Ads Performance — ${monthLabel}`,
    },
    paidAdsOverall: {
      comparisonSubtitle: s5.comparisonSubtitle || `${currentShortLabel} vs ${previousShortLabel} cost and conversion analysis`,
      currentMonthLabel: s5.currentLabel || currentShortLabel,
      previousMonthLabel: s5.previousLabel || previousShortLabel,
      topStats: Array.isArray(s5.topStats) && s5.topStats.length
        ? s5.topStats
        : [
            { label: 'Total Cost', value: fU(0) },
            { label: 'Total Clicks', value: fI(0) },
            { label: 'Conversions', value: fI(0) },
            { label: 'Cost/Lead', value: fU(0) },
          ],
      table: Array.isArray(s5.table) ? s5.table : [],
    },
    paidAdsFlorida: {
      current: s6.current || emptyPanel(currentShortLabel, 'Current Month'),
      previous: s6.previous || emptyPanel(previousShortLabel, 'Previous Month'),
      table: Array.isArray(s6.table) ? s6.table : [],
    },
    searchOverview: { table: Array.isArray(s7.table) ? s7.table : [] },
    topKeywords: {
      table: (s8.keywords || []).map((k) => ({
        keyword: k.keyword_text || k.keyword || '—',
        cost: fU(k.cost),
        conversions: fI(k.conversions),
      })),
      insight: slide8Insights || '',
    },
    auctionInsights: {
      table: (auctionRows || []).map((r) => ({
        domain: r.domain || '',
        impressionShare: r.impressionShare || '',
        overlapRate: r.overlapRate || '',
        posAbove: r.posAbove || '',
        topPage: r.topPage || '',
        absTop: r.absTop || '',
        outranking: r.outranking || '',
      })),
      insights: auctionNotes ? auctionNotes.split('\n').filter(Boolean) : [],
    },
    campaignProgress: progress,
  };
}
