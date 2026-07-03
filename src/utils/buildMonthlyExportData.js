import {
  parseSectionJson,
  getSectionText,
  DEFAULT_SLIDE2_SERVICES,
  DEFAULT_SEO_WEBDEV_ITEMS,
  getEnabledSlide2Services,
  normalizeSlide2Services,
  DEFAULT_SLIDE10_PROGRESS,
  fU,
  fI,
  formatMonthLabel,
  formatPeriodShort,
  formatDisplayPeriodLabel,
} from './monthlyReportHelpers';
import { resolveKeywordSheetUrl } from './googleSheetsEmbed';
import {
  normalizeAuctionSlideData,
  resolveAuctionSheetUrl,
  resolveAuctionSheetPreviousUrl,
} from './auctionInsightsSheet';

function mapAuctionTableRows(rows) {
  return (rows || []).map((r) => ({
    domain: r.domain || '',
    impressionShare: r.impressionShare || '',
    overlapRate: r.overlapRate || '',
    posAbove: r.posAbove || '',
    topPage: r.topPage || '',
    absTop: r.absTop || '',
    outranking: r.outranking || '',
  }));
}

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

function buildStatBoxes(rows, currentLabel, previousLabel, compareOn) {
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
  const base = [
    { value: String(totals.calls), label: `Total Call Leads (${currentLabel})` },
    { value: String(totals.forms + totals.chat), label: `Total Forms and Chat Widgets (${currentLabel})` },
  ];
  if (!compareOn) return base;
  return [
    ...base,
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
  coverLogoUrl: coverLogoUrlOverride,
  sections,
  slideData,
  currentLabel,
  previousLabel,
  reportFrom,
  compareFrom,
  compareOn,
  compareSections,
  seoManual,
}) {
  const clientName = report?.clients?.name || 'Client';
  const monthLabel = currentLabel || formatMonthLabel(report?.report_month);
  const prevLabel = previousLabel || 'Previous Period';
  const currentShortLabel = formatPeriodShort(reportFrom || report?.report_month);
  const previousShortLabel = formatPeriodShort(compareFrom) || formatPeriodShort(prevLabel);
  const cmpOn = compareOn !== undefined
    ? !!compareOn
    : (slideData?.compareOn !== undefined ? !!slideData.compareOn : true);
  const preparedBy = agency?.agency_name || 'Red Castle Services';
  const website = (agency?.website_url || 'redcastleservices.com').replace(/^https?:\/\//, '');

  const servicesRaw = parseSectionJson(sections, 'slide2_services', DEFAULT_SLIDE2_SERVICES);
  const services = getEnabledSlide2Services(servicesRaw);
  const leadData = parseSectionJson(sections, 'slide3_leads', slideData?.slide3Prefill || { rows: [], statBoxes: [] });
  const slide8Insights = getSectionText(sections, 'slide8_insights', '');
  const auctionRowsRaw = parseSectionJson(sections, 'slide9_auction_data', []);
  const auctionData = normalizeAuctionSlideData(auctionRowsRaw);
  const auctionNotes = getSectionText(sections, 'slide9_auction_notes', '');
  const auctionSheetUrl = resolveAuctionSheetUrl(
    getSectionText(sections, 'slide9_auction_sheet_url', ''),
    seoManual?.auctionSheetUrl || '',
  );
  const auctionSheetPreviousUrl = resolveAuctionSheetPreviousUrl(
    getSectionText(sections, 'slide9_auction_sheet_url_previous', ''),
    seoManual?.auctionSheetPreviousUrl || '',
  );
  const progressRaw = parseSectionJson(sections, 'slide10_progress', DEFAULT_SLIDE10_PROGRESS);
  const progress = { ...DEFAULT_SLIDE10_PROGRESS, ...(progressRaw && typeof progressRaw === 'object' ? progressRaw : {}) };
  const seoExecutiveRaw = parseSectionJson(sections, 'slide11_seo_executive', seoManual?.seoExecutiveSections || {});
  const keywordTrackerRaw = parseSectionJson(sections, 'slide20_keyword_tracker', seoManual?.keywordTracker || {});
  const keywordScreenshotRaw = parseSectionJson(sections, 'slide21_keyword_screenshot', seoManual?.keywordScreenshot || {});
  const keywordTracker = {
    ...(keywordTrackerRaw && typeof keywordTrackerRaw === 'object' ? keywordTrackerRaw : {}),
    ...(seoManual?.keywordTracker && typeof seoManual.keywordTracker === 'object' ? seoManual.keywordTracker : {}),
  };
  const keywordScreenshot = {
    ...(keywordScreenshotRaw && typeof keywordScreenshotRaw === 'object' ? keywordScreenshotRaw : {}),
    ...(seoManual?.keywordScreenshot && typeof seoManual.keywordScreenshot === 'object' ? seoManual.keywordScreenshot : {}),
  };
  const resolvedSheetUrl = resolveKeywordSheetUrl(keywordTracker, keywordScreenshot);
  const fromConfig = getSectionText(sections, 'seo_keyword_sheet_url', '');
  if (!resolvedSheetUrl && fromConfig) {
    keywordTracker.sheetUrl = fromConfig;
  } else if (resolvedSheetUrl && !keywordTracker.sheetUrl) {
    keywordTracker.sheetUrl = resolvedSheetUrl;
  }
  const compareSectionsRaw = parseSectionJson(sections, 'compare_sections', seoManual?.compareSections || {});
  const blogContentRaw = parseSectionJson(sections, 'slide30_blog_updates', parseSectionJson(sections, 'slide27_blog_content', seoManual?.blogUpdates || []));
  const gbpNotesRaw = (() => {
    const raw = parseSectionJson(sections, 'slide25_gbp_notes', seoManual?.gbpNotes ?? '');
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object') {
      return [raw.summary, raw.calls, raw.directions, raw.website].filter(Boolean).join(' ');
    }
    return typeof seoManual?.gbpNotes === 'string' ? seoManual.gbpNotes : '';
  })();
  const gscNotesRaw = getSectionText(sections, 'slide22_gsc_notes', seoManual?.gscNotes || '');
  const webDevRaw = parseSectionJson(sections, 'slide27_webdev', seoManual?.webDevItems || DEFAULT_SEO_WEBDEV_ITEMS);
  const backlinksRaw = parseSectionJson(sections, 'slide28_backlinks', seoManual?.backlinks || {});
  const seoNextStepsRaw = parseSectionJson(sections, 'slide30_seo_next_steps', seoManual?.seoNextSteps || []);

  const leadRows = (leadData.rows?.length ? leadData.rows : [{ location: clientName }]).map((r) =>
    normalizeLeadRow(r, clientName),
  );

  const statBoxes = (() => {
    const expected = cmpOn ? 4 : 2;
    if (Array.isArray(leadData.statBoxes) && leadData.statBoxes.length >= expected) {
      return leadData.statBoxes
        .slice(0, expected)
        .map((b) => ({ value: String(b.value ?? ''), label: String(b.label ?? '') }));
    }
    return buildStatBoxes(leadRows, currentShortLabel, previousShortLabel, cmpOn);
  })();

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
    coverLogoUrl: coverLogoUrlOverride || agency?.report_logo_url || '/rc-brand-logo.png',
    compareOn: cmpOn,
    compareSections: { ...(typeof compareSectionsRaw === 'object' && compareSectionsRaw ? compareSectionsRaw : {}), ...(compareSections && typeof compareSections === 'object' ? compareSections : {}) },
    currentLabel: monthLabel,
    previousLabel: cmpOn ? prevLabel : '',
    currentShortLabel,
    previousShortLabel: cmpOn ? previousShortLabel : '',
    comparisonHeader: cmpOn
      ? (slideData?.comparisonHeader || `${currentShortLabel} vs ${previousShortLabel}`)
      : currentShortLabel,
    services,
    leadSummary: {
      rows: leadRows,
      statBoxes,
      totalsSubBar: 'Combined Totals',
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
      current: {
        periodLabel: formatDisplayPeriodLabel(auctionData.current.periodLabel, currentShortLabel),
        table: mapAuctionTableRows(auctionData.current.rows),
      },
      previous: {
        periodLabel: formatDisplayPeriodLabel(auctionData.previous.periodLabel, cmpOn ? previousShortLabel : ''),
        table: mapAuctionTableRows(auctionData.previous.rows),
      },
      table: mapAuctionTableRows(auctionData.current.rows),
      insights: auctionNotes ? auctionNotes.split('\n').filter(Boolean) : [],
    },
    auctionSheetUrl,
    auctionSheetPreviousUrl,
    googleAdsCustomerId: seoManual?.googleAdsCustomerId || '',
    googleAdsCustomerIds: seoManual?.googleAdsCustomerIds || (seoManual?.googleAdsCustomerId ? [seoManual.googleAdsCustomerId] : []),
    campaignProgress: progress,
    seo: {
      ...(slideData?.seo || {}),
      compareOn: cmpOn,
      compareSections: {
        ...(typeof compareSectionsRaw === 'object' && compareSectionsRaw ? compareSectionsRaw : {}),
        ...(compareSections && typeof compareSections === 'object' ? compareSections : {}),
        ...(seoManual?.compareSections && typeof seoManual.compareSections === 'object' ? seoManual.compareSections : {}),
      },
      executiveSections: {
        ...((slideData?.seo?.slide11?.sections) || {}),
        ...(seoExecutiveRaw && typeof seoExecutiveRaw === 'object' ? seoExecutiveRaw : {}),
      },
      keywordTracker,
      keywordScreenshot,
      blogUpdates: Array.isArray(blogContentRaw) ? blogContentRaw.slice(0, 2) : [],
      gscNotes: gscNotesRaw,
      gbpNotes: gbpNotesRaw,
      webDevItems: Array.isArray(webDevRaw) && webDevRaw.length ? webDevRaw : DEFAULT_SEO_WEBDEV_ITEMS,
      backlinks: backlinksRaw,
      seoNextSteps: Array.isArray(seoNextStepsRaw) ? seoNextStepsRaw : [],
    },
  };
}
