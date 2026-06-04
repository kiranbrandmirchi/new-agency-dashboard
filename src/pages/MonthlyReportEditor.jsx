import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabaseClient';
import { useMonthlyReport, getMonthRange } from '../hooks/useMonthlyReport';
import { MonthlySlideGrid } from '../components/MonthlySlidePreview';
import { DateRangePicker } from '../components/DatePicker';
import { generateMonthlyPdf, waitForPaint } from '../utils/generateMonthlyPdf';
import { generateMonthlyPptx, generateMonthlyPptxBlob } from '../utils/generateMonthlyPptx.js';
import { uploadMonthlyReportToGoogleDrive, requestGoogleDriveAccessToken, getCachedGoogleDriveAccessToken } from '../utils/googleDriveExport.js';
import { buildMonthlyExportData } from '../utils/buildMonthlyExportData';
import { resolveClientMarketingSeoConfig, fetchClientPlatformAccountsForReport } from '../utils/monthlyClientSeoConfig';
import {
  parseSectionJson,
  getSectionText,
  DEFAULT_SLIDE2_SERVICES,
  getEnabledSlide2Services,
  normalizeSlide2Services,
  SLIDE2_SERVICE_OPTIONS,
  DEFAULT_SLIDE10_PROGRESS,
  DEFAULT_SEO_EXECUTIVE_SECTIONS,
  DEFAULT_SEO_WEBDEV_ITEMS,
  DEFAULT_SEO_NEXT_STEPS,
  DEFAULT_BACKLINKS_SUMMARY,
  DEFAULT_COMPARE_SECTIONS,
  COMPARE_SECTION_OPTIONS,
  DEFAULT_KEYWORD_TRACKER,
  DEFAULT_KEYWORD_SCREENSHOT,
  DEFAULT_BLOG_UPDATES,
  formatMonthLabel,
} from '../utils/monthlyReportHelpers';
import {
  fetchAuctionInsightsComparison,
  normalizeAuctionSlideData,
  resolveAuctionSheetUrl,
  resolveAuctionSheetPreviousUrl,
} from '../utils/auctionInsightsSheet';
import '../styles/monthlySlidePreview.css';
import '../styles/monthlyReportEditor.css';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PLATFORMS = ['google_ads', 'ga4', 'ghl'];

export function MonthlyReportEditor({ reportId, onBack }) {
  const { hasPermission, agencyId, activeAgencyId } = useAuth();
  const { showNotification } = useApp();
  const effectiveAgencyId = activeAgencyId || agencyId;

  const {
    report, accounts, sections, slideData, dateRanges, loading, dataLoading, error,
    dataApplied, loadReport, fetchReportData, saveAccounts, upsertSections, publishReport,
  } = useMonthlyReport(reportId);

  const [agency, setAgency] = useState(null);
  const [clients, setClients] = useState([]);
  const [clientAccounts, setClientAccounts] = useState([]);
  const [accountSelections, setAccountSelections] = useState({});
  const [reportFrom, setReportFrom] = useState('');
  const [reportTo, setReportTo] = useState('');
  const [compareFrom, setCompareFrom] = useState('');
  const [compareTo, setCompareTo] = useState('');
  const [datePreset, setDatePreset] = useState('custom');
  const [compareOn, setCompareOn] = useState(true);
  const [compareSections, setCompareSections] = useState(DEFAULT_COMPARE_SECTIONS);
  const [showPreview, setShowPreview] = useState(false);
  const [showGoogleSlidesHelp, setShowGoogleSlidesHelp] = useState(false);
  const [googleSlidesLink, setGoogleSlidesLink] = useState('');
  const [generatingFormat, setGeneratingFormat] = useState(null);
  const [exportMount, setExportMount] = useState(false);
  const [saving, setSaving] = useState(false);

  const [slide2, setSlide2] = useState(() => normalizeSlide2Services(DEFAULT_SLIDE2_SERVICES));
  const [slide3, setSlide3] = useState({ rows: [], statBoxes: [] });
  const [slide8, setSlide8] = useState('');
  const [slide9data, setSlide9data] = useState(() => normalizeAuctionSlideData(null));
  const [slide9notes, setSlide9notes] = useState('');
  const [auctionSheetUrl, setAuctionSheetUrl] = useState('');
  const [auctionSheetPreviousUrl, setAuctionSheetPreviousUrl] = useState('');
  const [auctionSheetLoading, setAuctionSheetLoading] = useState(false);
  const [slide10, setSlide10] = useState(DEFAULT_SLIDE10_PROGRESS);
  const [gscSiteUrl, setGscSiteUrl] = useState('');
  const [gbpLocationId, setGbpLocationId] = useState('');
  const [seoExecutiveSections, setSeoExecutiveSections] = useState(DEFAULT_SEO_EXECUTIVE_SECTIONS);
  const [keywordTracker, setKeywordTracker] = useState(DEFAULT_KEYWORD_TRACKER);
  const [keywordScreenshot, setKeywordScreenshot] = useState(DEFAULT_KEYWORD_SCREENSHOT);
  const [gbpNotes, setGbpNotes] = useState('');
  const [gscNotes, setGscNotes] = useState('');
  const [webDevItems, setWebDevItems] = useState(DEFAULT_SEO_WEBDEV_ITEMS);
  const [backlinks, setBacklinks] = useState(DEFAULT_BACKLINKS_SUMMARY);
  const [seoNextSteps, setSeoNextSteps] = useState(DEFAULT_SEO_NEXT_STEPS);
  const [blogUpdates, setBlogUpdates] = useState(DEFAULT_BLOG_UPDATES);

  const previewRef = useRef(null);
  const exportRef = useRef(null);

  const isPublished = report?.status === 'published';

  useEffect(() => {
    if (effectiveAgencyId) {
      supabase.from('agencies').select('*').eq('id', effectiveAgencyId).single().then(({ data }) => setAgency(data));
      supabase.from('clients').select('id, name').eq('agency_id', effectiveAgencyId).order('name').then(({ data }) => setClients(data || []));
    }
  }, [effectiveAgencyId]);

  useEffect(() => {
    const ranges = dateRanges?.currentFrom
      ? dateRanges
      : report?.report_month
        ? getMonthRange(report.report_month)
        : null;
    if (!ranges?.currentFrom) return;
    setReportFrom(ranges.currentFrom);
    setReportTo(ranges.currentTo);
    setCompareFrom(ranges.prevFrom);
    setCompareTo(ranges.prevTo);
    setDatePreset('custom');
    setCompareOn(true);
  }, [report?.report_month, dateRanges?.currentFrom, dateRanges?.currentTo, dateRanges?.prevFrom, dateRanges?.prevTo]);

  const handleDatePickerApply = useCallback(({ preset, dateFrom, dateTo, compareOn: cmp, compareFrom: cf, compareTo: ct }) => {
    setDatePreset(preset || 'custom');
    setReportFrom(dateFrom || '');
    setReportTo(dateTo || '');
    setCompareOn(!!cmp);
    setCompareFrom(cf || '');
    setCompareTo(ct || '');
  }, []);

  useEffect(() => {
    if ((sections || []).some((s) => s.section_key === 'slide2_services')) {
      setSlide2(normalizeSlide2Services(parseSectionJson(sections, 'slide2_services', DEFAULT_SLIDE2_SERVICES)));
    }
    const savedSlide3 = parseSectionJson(sections, 'slide3_leads', null);
    if (savedSlide3?.rows?.length || savedSlide3?.statBoxes?.length) {
      setSlide3(savedSlide3);
    } else if (slideData?.slide3Prefill) {
      setSlide3(slideData.slide3Prefill);
    }
    setSlide8(getSectionText(sections, 'slide8_insights', ''));
    setSlide9data(normalizeAuctionSlideData(parseSectionJson(sections, 'slide9_auction_data', [])));
    setSlide9notes(getSectionText(sections, 'slide9_auction_notes', ''));
    setAuctionSheetUrl(getSectionText(sections, 'slide9_auction_sheet_url', resolveAuctionSheetUrl('', '')));
    setAuctionSheetPreviousUrl(getSectionText(sections, 'slide9_auction_sheet_url_previous', resolveAuctionSheetPreviousUrl('', '')));
    setSlide10(parseSectionJson(sections, 'slide10_progress', DEFAULT_SLIDE10_PROGRESS));
    setSeoExecutiveSections(parseSectionJson(sections, 'slide11_seo_executive', DEFAULT_SEO_EXECUTIVE_SECTIONS));
    if ((sections || []).some((s) => s.section_key === 'compare_sections')) {
      setCompareSections({ ...DEFAULT_COMPARE_SECTIONS, ...parseSectionJson(sections, 'compare_sections', DEFAULT_COMPARE_SECTIONS) });
    }
    setKeywordTracker((prev) => {
      const fromSection = parseSectionJson(sections, 'slide20_keyword_tracker', DEFAULT_KEYWORD_TRACKER);
      const fromConfig = getSectionText(sections, 'seo_keyword_sheet_url', '');
      return {
        ...DEFAULT_KEYWORD_TRACKER,
        ...fromSection,
        sheetUrl: fromSection.sheetUrl || fromConfig || prev.sheetUrl || '',
      };
    });
    setKeywordScreenshot(parseSectionJson(sections, 'slide21_keyword_screenshot', DEFAULT_KEYWORD_SCREENSHOT));
    const gbpRaw = parseSectionJson(sections, 'slide25_gbp_notes', '');
    if (typeof gbpRaw === 'string') setGbpNotes(gbpRaw);
    else if (gbpRaw && typeof gbpRaw === 'object') {
      setGbpNotes([gbpRaw.summary, gbpRaw.calls, gbpRaw.directions, gbpRaw.website].filter(Boolean).join(' '));
    } else setGbpNotes('');
    setGscNotes(getSectionText(sections, 'slide22_gsc_notes', ''));
    setWebDevItems(parseSectionJson(sections, 'slide27_webdev', DEFAULT_SEO_WEBDEV_ITEMS));
    setBacklinks(parseSectionJson(sections, 'slide28_backlinks', DEFAULT_BACKLINKS_SUMMARY));
    setSeoNextSteps(parseSectionJson(sections, 'slide30_seo_next_steps', DEFAULT_SEO_NEXT_STEPS));
    const blogRaw = parseSectionJson(sections, 'slide27_blog_content', parseSectionJson(sections, 'slide30_blog_updates', DEFAULT_BLOG_UPDATES));
    setBlogUpdates(Array.isArray(blogRaw) ? blogRaw.slice(0, 2) : DEFAULT_BLOG_UPDATES);
  }, [sections, slideData?.slide3Prefill]);

  useEffect(() => {
    if (!report?.client_id) {
      setGscSiteUrl('');
      setGbpLocationId('');
      return;
    }
    resolveClientMarketingSeoConfig(report.client_id, effectiveAgencyId).then((cfg) => {
      const fromSectionGsc = getSectionText(sections, 'seo_gsc_site_url', '');
      const fromSectionGbp = getSectionText(sections, 'seo_gbp_location_id', '');
      setGscSiteUrl(fromSectionGsc || cfg.gscSiteUrl || '');
      const gbpIds = cfg.gbpLocationIds?.length ? cfg.gbpLocationIds : (cfg.gbpLocationId ? [cfg.gbpLocationId] : []);
      setGbpLocationId(fromSectionGbp || (gbpIds.length > 1 ? `${gbpIds.length} locations` : gbpIds[0] || ''));
    });
  }, [report?.client_id, effectiveAgencyId, sections]);

  useEffect(() => {
    if (!report?.client_id) return;
    fetchClientPlatformAccountsForReport(report.client_id).then((data) => {
      setClientAccounts(data);
      const sel = {};
      (data || []).forEach((a) => {
        const acc = accounts.find((x) => x.platform_account_id === a.id);
        const defaultInclude = PLATFORMS.includes(a.platform) || ['gsc', 'search_console', 'gbp', 'gmb'].includes(a.platform);
        sel[a.id] = {
          included: accounts.length === 0 ? defaultInclude : !!acc,
          label: acc?.label || a.account_name || a.platform_customer_id,
        };
      });
      setAccountSelections(sel);
    });
  }, [report?.client_id, accounts]);

  const clientName = report?.clients?.name || 'Client';
  const monthLabel = slideData?.currentLabel || formatMonthLabel(reportFrom || report?.report_month);
  const previousLabel = slideData?.previousLabel || formatMonthLabel(compareFrom);

  const googleAdsCustomerIds = useMemo(() => {
    const fromReport = (accounts || [])
      .filter((a) => a.client_platform_accounts?.platform === 'google_ads')
      .map((a) => a.client_platform_accounts.platform_customer_id)
      .filter(Boolean);
    const fromClient = (clientAccounts || [])
      .filter((a) => a.platform === 'google_ads')
      .map((a) => a.platform_customer_id)
      .filter(Boolean);
    return [...new Set([...fromReport, ...fromClient].map((id) => String(id).trim()).filter(Boolean))];
  }, [accounts, clientAccounts]);

  const googleAdsCustomerId = googleAdsCustomerIds[0] || '';

  const loadAuctionFromSheets = useCallback(async ({ silent = false } = {}) => {
    const currentUrl = resolveAuctionSheetUrl('', auctionSheetUrl);
    const previousUrl = resolveAuctionSheetPreviousUrl('', auctionSheetPreviousUrl);
    if (!currentUrl || !clientName) return normalizeAuctionSlideData(null);
    setAuctionSheetLoading(true);
    try {
      const accessToken = getCachedGoogleDriveAccessToken();
      const result = await fetchAuctionInsightsComparison(
        currentUrl,
        previousUrl,
        clientName,
        { accessToken, customerIds: googleAdsCustomerIds },
      );
      const nextData = {
        current: { periodLabel: result.current.periodLabel, rows: result.current.rows },
        previous: { periodLabel: result.previous.periodLabel, rows: result.previous.rows },
      };
      if (result.current.rows.length || result.previous.rows.length) {
        setSlide9data(nextData);
        const idNote = googleAdsCustomerIds.length
          ? ` (Customer ID ${googleAdsCustomerIds.join(', ')})`
          : '';
        const curCount = result.current.rows.length;
        const prevCount = result.previous.rows.length;
        if (!silent) {
          showNotification(
            `Auction insights loaded — current: ${curCount} rows, previous: ${prevCount} rows${idNote}`,
          );
        }
      } else if (!silent) {
        showNotification(result.error || 'No auction data found for this client in the sheet', 'error');
      }
      return nextData;
    } catch (err) {
      if (!silent) showNotification(err?.message || 'Failed to load auction sheet', 'error');
      return normalizeAuctionSlideData(null);
    } finally {
      setAuctionSheetLoading(false);
    }
  }, [clientName, googleAdsCustomerIds, auctionSheetUrl, auctionSheetPreviousUrl, showNotification]);

  const buildExportPayload = useCallback(() => buildMonthlyExportData({
    report,
    agency,
    sections: [
      ...(sections || []).filter((s) => ![
        'slide2_services', 'slide3_leads', 'slide8_insights', 'slide9_auction_data', 'slide9_auction_notes', 'slide9_auction_sheet_url', 'slide9_auction_sheet_url_previous', 'slide10_progress',
        'slide11_seo_executive', 'slide22_gsc_notes', 'slide20_keyword_tracker', 'slide21_keyword_screenshot', 'slide25_gbp_notes', 'slide27_webdev', 'slide28_backlinks', 'slide30_seo_next_steps', 'slide27_blog_content', 'compare_sections',
        'seo_gsc_site_url', 'seo_gbp_location_id', 'seo_keyword_sheet_url',
      ].includes(s.section_key)),
      { section_key: 'slide2_services', content: JSON.stringify(slide2) },
      { section_key: 'slide3_leads', content: JSON.stringify(slide3) },
      { section_key: 'slide8_insights', content: slide8 },
      { section_key: 'slide9_auction_data', content: JSON.stringify(slide9data) },
      { section_key: 'slide9_auction_notes', content: slide9notes },
      { section_key: 'slide9_auction_sheet_url', content: auctionSheetUrl },
      { section_key: 'slide9_auction_sheet_url_previous', content: auctionSheetPreviousUrl },
      { section_key: 'slide10_progress', content: JSON.stringify(slide10) },
      { section_key: 'slide11_seo_executive', content: JSON.stringify(seoExecutiveSections) },
      { section_key: 'compare_sections', content: JSON.stringify(compareSections) },
      { section_key: 'slide22_gsc_notes', content: gscNotes },
      { section_key: 'slide20_keyword_tracker', content: JSON.stringify(keywordTracker) },
      { section_key: 'slide21_keyword_screenshot', content: JSON.stringify(keywordScreenshot) },
      { section_key: 'slide25_gbp_notes', content: gbpNotes },
      { section_key: 'slide27_webdev', content: JSON.stringify(webDevItems) },
      { section_key: 'slide28_backlinks', content: JSON.stringify(backlinks) },
      { section_key: 'slide30_seo_next_steps', content: JSON.stringify(seoNextSteps) },
      { section_key: 'slide30_blog_updates', content: JSON.stringify(blogUpdates) },
      { section_key: 'seo_gsc_site_url', content: gscSiteUrl },
      { section_key: 'seo_gbp_location_id', content: gbpLocationId },
      { section_key: 'seo_keyword_sheet_url', content: keywordTracker.sheetUrl || '' },
    ],
    slideData,
    currentLabel: monthLabel,
    previousLabel,
    reportFrom,
    compareFrom,
    compareOn,
    compareSections,
    seoManual: {
      seoExecutiveSections,
      keywordTracker,
      keywordScreenshot,
      gbpNotes,
      gscNotes,
      webDevItems,
      backlinks,
      seoNextSteps,
      blogUpdates,
      auctionSheetUrl,
      auctionSheetPreviousUrl,
      googleAdsCustomerId,
      googleAdsCustomerIds,
    },
  }), [report, agency, sections, slide2, slide3, slide8, slide9data, slide9notes, slide10, seoExecutiveSections, compareSections, keywordTracker, keywordScreenshot, gbpNotes, gscNotes, webDevItems, backlinks, seoNextSteps, blogUpdates, gscSiteUrl, gbpLocationId, slideData, monthLabel, previousLabel, reportFrom, compareFrom, compareOn, auctionSheetUrl, auctionSheetPreviousUrl, googleAdsCustomerId, googleAdsCustomerIds]);

  const handlers = useMemo(() => ({
    slide2, slide3, slide8, slide9data, slide9notes, slide10,
    auctionSheetUrl,
    auctionSheetPreviousUrl,
    auctionSheetLoading,
    onAuctionSheetUrl: setAuctionSheetUrl,
    onAuctionSheetPreviousUrl: setAuctionSheetPreviousUrl,
    onReloadAuctionSheet: () => loadAuctionFromSheets(),
    onSlide2: (key, field, value) => setSlide2((prev) => prev.map((s) => (s.key === key ? { ...s, [field]: value } : s))),
    onSlide2Enabled: (key, enabled) => setSlide2((prev) => prev.map((s) => (s.key === key ? { ...s, enabled } : s))),
    onSlide3: setSlide3,
    onSlide8: setSlide8,
    onSlide9data: setSlide9data,
    onSlide9notes: setSlide9notes,
    onSlide10: setSlide10,
  }), [slide2, slide3, slide8, slide9data, slide9notes, slide10, auctionSheetUrl, auctionSheetPreviousUrl, auctionSheetLoading, loadAuctionFromSheets]);

  const seoHandlers = useMemo(() => ({
    seoExecutiveSections,
    keywordTracker,
    keywordScreenshot,
    gbpNotes,
    gscNotes,
    webDevItems,
    backlinks,
    seoNextSteps,
    blogUpdates,
    clientWebsite: gscSiteUrl.replace(/^sc-domain:/, '').replace(/\/$/, ''),
    onSeoExecutiveSections: setSeoExecutiveSections,
    onKeywordTracker: setKeywordTracker,
    onKeywordScreenshot: setKeywordScreenshot,
    onGbpNotes: setGbpNotes,
    onGscNotes: setGscNotes,
    onWebDevItems: setWebDevItems,
    onBacklinks: setBacklinks,
    onSeoNextSteps: setSeoNextSteps,
    onBlogUpdates: (index, post) => setBlogUpdates((prev) => {
      const next = [...prev];
      next[index] = post;
      return next;
    }),
  }), [seoExecutiveSections, keywordTracker, keywordScreenshot, gbpNotes, gscNotes, webDevItems, backlinks, seoNextSteps, blogUpdates, gscSiteUrl]);

  const enrichedSlideData = useMemo(() => ({
    ...slideData,
    compareOn,
    compareSections,
  }), [slideData, compareOn, compareSections]);

  const handleSaveSections = useCallback(async () => {
    setSaving(true);
    try {
      await upsertSections([
        { section_key: 'slide2_services', title: 'Slide 2 Services', content: JSON.stringify(slide2) },
        { section_key: 'slide3_leads', title: 'Slide 3 Leads', content: JSON.stringify(slide3) },
        { section_key: 'slide8_insights', title: 'Slide 8 Insights', content: slide8 },
        { section_key: 'slide9_auction_data', title: 'Slide 9 Auction Data', content: JSON.stringify(slide9data) },
        { section_key: 'slide9_auction_notes', title: 'Slide 9 Auction Notes', content: slide9notes },
        { section_key: 'slide9_auction_sheet_url', title: 'Auction insights sheet URL (current)', content: auctionSheetUrl },
        { section_key: 'slide9_auction_sheet_url_previous', title: 'Auction insights sheet URL (previous)', content: auctionSheetPreviousUrl },
        { section_key: 'slide10_progress', title: 'Slide 10 Progress', content: JSON.stringify(slide10) },
        { section_key: 'slide11_seo_executive', title: 'Slide 11 SEO Executive', content: JSON.stringify(seoExecutiveSections) },
        { section_key: 'compare_sections', title: 'Compare Sections', content: JSON.stringify(compareSections) },
        { section_key: 'slide20_keyword_tracker', title: 'Keyword Tracker', content: JSON.stringify(keywordTracker) },
        { section_key: 'slide21_keyword_screenshot', title: 'Keyword Screenshot', content: JSON.stringify(keywordScreenshot) },
        { section_key: 'slide22_gsc_notes', title: 'Slide 22 GSC Notes', content: gscNotes },
        { section_key: 'slide25_gbp_notes', title: 'Slide 25 GBP Notes', content: gbpNotes },
        { section_key: 'slide27_webdev', title: 'Slide 27 Web Dev', content: JSON.stringify(webDevItems) },
        { section_key: 'slide28_backlinks', title: 'Slide 28 Backlinks', content: JSON.stringify(backlinks) },
        { section_key: 'slide30_seo_next_steps', title: 'Slide 30 SEO Next Steps', content: JSON.stringify(seoNextSteps) },
        { section_key: 'slide30_blog_updates', title: 'Blog Updates', content: JSON.stringify(blogUpdates) },
        { section_key: 'seo_gsc_site_url', title: 'GSC Site URL', content: gscSiteUrl },
        { section_key: 'seo_gbp_location_id', title: 'GBP Location ID', content: gbpLocationId },
        { section_key: 'seo_keyword_sheet_url', title: 'Keyword sheet URL', content: keywordTracker.sheetUrl || '' },
      ]);
      showNotification('Slide edits saved');
    } catch (err) {
      showNotification(err?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }, [upsertSections, slide2, slide3, slide8, slide9data, slide9notes, slide10, seoExecutiveSections, compareSections, keywordTracker, keywordScreenshot, gbpNotes, gscNotes, webDevItems, backlinks, seoNextSteps, blogUpdates, gscSiteUrl, gbpLocationId, auctionSheetUrl, auctionSheetPreviousUrl, showNotification]);

  const handleApply = useCallback(async () => {
    if (!reportFrom || !reportTo) {
      showNotification('Set report date range');
      return;
    }
    if (compareOn && (!compareFrom || !compareTo)) {
      showNotification('Set comparison date range or turn comparison off');
      return;
    }
    try {
      await upsertSections([
        { section_key: 'slide2_services', title: 'Slide 2 Services', content: JSON.stringify(slide2) },
        { section_key: 'compare_sections', title: 'Compare Sections', content: JSON.stringify(compareSections) },
        { section_key: 'seo_keyword_sheet_url', title: 'Keyword sheet URL', content: keywordTracker.sheetUrl || '' },
        { section_key: 'slide20_keyword_tracker', title: 'Keyword Tracker', content: JSON.stringify(keywordTracker) },
        { section_key: 'slide9_auction_sheet_url', title: 'Auction insights sheet URL (current)', content: auctionSheetUrl },
        { section_key: 'slide9_auction_sheet_url_previous', title: 'Auction insights sheet URL (previous)', content: auctionSheetPreviousUrl },
      ]);

      let selected = Object.entries(accountSelections).filter(([, v]) => v.included)
        .map(([platformAccountId, v]) => ({ platform_account_id: platformAccountId, label: v.label }));

      if (!selected.length && report?.client_id) {
        const clientAccts = await fetchClientPlatformAccountsForReport(report.client_id);
        selected = clientAccts
          .filter((a) => PLATFORMS.includes(a.platform))
          .map((a, i) => ({
            platform_account_id: a.id,
            label: a.account_name || a.platform_customer_id,
            sort_order: i,
          }));
        if (!selected.length) {
          showNotification('No Google Ads / GA4 / GHL accounts linked to this client in Settings → Admin → Clients', 'error');
          return;
        }
        showNotification('Using all platform accounts linked to this client');
      }

      const savedAccounts = await saveAccounts(selected.map((a, i) => ({ ...a, sort_order: i })));

      const ranges = {
        currentFrom: reportFrom,
        currentTo: reportTo,
        prevFrom: compareOn ? compareFrom : reportFrom,
        prevTo: compareOn ? compareTo : reportTo,
      };
      await fetchReportData(ranges, savedAccounts, {
        compareOn,
        clientId: report.client_id,
        clientName,
      });

      if (slideData?.slide3Prefill && !getSectionText(sections, 'slide3_leads', '')) {
        setSlide3(slideData.slide3Prefill);
      }
      if (auctionSheetUrl || resolveAuctionSheetUrl('', '')) {
        await loadAuctionFromSheets({ silent: false });
      }
      showNotification(`Report data loaded${compareOn ? '' : ' (no comparison)'}`);
      setTimeout(() => previewRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) {
      showNotification(err?.message || 'Failed to load data', 'error');
    }
  }, [accountSelections, saveAccounts, fetchReportData, report, reportFrom, reportTo, compareOn, compareFrom, compareTo, sections, showNotification, slideData?.slide3Prefill, upsertSections, keywordTracker, auctionSheetUrl, auctionSheetPreviousUrl, loadAuctionFromSheets, clientName, slide2, compareSections]);

  useEffect(() => {
    if (slideData?.slide3Prefill && !getSectionText(sections, 'slide3_leads', '')) {
      setSlide3(slideData.slide3Prefill);
    }
  }, [slideData?.slide3Prefill, sections]);

  useEffect(() => {
    if (slideData?.seo?.slide11?.sections && !getSectionText(sections, 'slide11_seo_executive', '')) {
      setSeoExecutiveSections((prev) => ({ ...prev, ...slideData.seo.slide11.sections }));
    }
    if (slideData?.seo?.slide24?.notes && !getSectionText(sections, 'slide25_gbp_notes', '')) {
      const n = slideData.seo.slide24.notes;
      setGbpNotes(typeof n === 'string' ? n : [n.summary, n.calls, n.directions, n.website].filter(Boolean).join(' '));
    }
    if (slideData?.seo?.slide22?.notes && !getSectionText(sections, 'slide22_gsc_notes', '')) {
      setGscNotes(slideData.seo.slide22.notes);
    }
  }, [slideData?.seo, sections]);

  const getSlideElementsForExport = useCallback(async () => {
    if (!dataApplied && !isPublished) {
      throw new Error('Apply report configuration and load slides before exporting');
    }
    setExportMount(true);
    await waitForPaint();
    await sleep(500);
    if (document.fonts?.ready) await document.fonts.ready;
    const slideEls = exportRef.current?.querySelectorAll('.mr-slide-card');
    if (!slideEls?.length) throw new Error('No slides available to export');
    return Array.from(slideEls);
  }, [dataApplied, isPublished]);

  const handleExportPpt = useCallback(async () => {
    setGeneratingFormat('ppt');
    try {
      if (!report) throw new Error('Report not loaded');
      if (!reportFrom || !reportTo) throw new Error('Set report date range before exporting');
      if (!dataApplied && !isPublished) {
        showNotification('Tip: Apply & Load Slides first for live metrics in the deck', 5000);
      }
      const payload = buildExportPayload();
      const googleAccessToken = getCachedGoogleDriveAccessToken();
      await generateMonthlyPptx(payload, { clientName, monthLabel, googleAccessToken });
      showNotification(`PowerPoint downloaded: ${clientName} — ${monthLabel}`);
    } catch (err) {
      console.error('[MonthlyReport] PPT export failed', err);
      const msg = err?.message || String(err) || 'PPT export failed';
      showNotification(msg, 8000);
    } finally {
      setGeneratingFormat(null);
    }
  }, [buildExportPayload, report, reportFrom, reportTo, dataApplied, isPublished, clientName, monthLabel, showNotification]);

  const handleExportGoogleSlides = useCallback(async () => {
    setGeneratingFormat('gslides');
    try {
      if (!report) throw new Error('Report not loaded');
      if (!reportFrom || !reportTo) throw new Error('Set report date range before exporting');
      let accessToken = await requestGoogleDriveAccessToken();
      const payload = buildExportPayload();
      const { resolveKeywordSheetUrl, fetchGoogleSheetFormattedGrid, fetchGoogleSheetCsvTable } = await import('../utils/googleSheetsEmbed');
      const sheetUrl = resolveKeywordSheetUrl(payload.seo?.keywordTracker, payload.seo?.keywordScreenshot);
      if (sheetUrl) {
        const { fetchGoogleSheetExportPng, fetchGoogleSheetFormattedGrid, fetchGoogleSheetCsvTable } = await import('../utils/googleSheetsEmbed');
        let ok = await fetchGoogleSheetExportPng(sheetUrl, accessToken);
        if (!ok?.imageDataUrl) {
          ok = await fetchGoogleSheetFormattedGrid(sheetUrl, accessToken);
        }
        if (!ok?.rows?.length && !ok?.imageDataUrl) {
          ok = await fetchGoogleSheetCsvTable(sheetUrl, { accessToken });
        }
        if (!ok?.rows?.length && !ok?.imageDataUrl) {
          accessToken = await requestGoogleDriveAccessToken({ forceSignIn: true });
          await fetchGoogleSheetExportPng(sheetUrl, accessToken)
            || await fetchGoogleSheetFormattedGrid(sheetUrl, accessToken)
            || await fetchGoogleSheetCsvTable(sheetUrl, { accessToken });
        }
      }
      const blob = await generateMonthlyPptxBlob(payload, { clientName, monthLabel, googleAccessToken: accessToken });
      if (!blob) throw new Error('Failed to generate presentation file');

      try {
        const uploaded = await uploadMonthlyReportToGoogleDrive({
          blob,
          clientName,
          monthLabel,
          accessToken,
        });
        setGoogleSlidesLink(uploaded.webViewLink || '');
        setShowGoogleSlidesHelp(true);
        if (uploaded.webViewLink) {
          window.open(uploaded.webViewLink, '_blank', 'noopener,noreferrer');
        }
        showNotification(`Uploaded to Google Slides: ${uploaded.fileName || clientName}`);
      } catch (driveErr) {
        console.warn('[MonthlyReport] Drive upload failed, falling back to download', driveErr);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${clientName} — ${monthLabel}.pptx`;
        a.click();
        URL.revokeObjectURL(url);
        setGoogleSlidesLink('');
        setShowGoogleSlidesHelp(true);
        showNotification(
          driveErr?.message || 'Drive upload failed — downloaded .pptx instead. Reconnect Google in Settings for Drive access.',
          10000,
        );
      }
    } catch (err) {
      console.error('[MonthlyReport] Google Slides export failed', err);
      showNotification(err?.message || 'Export failed', 6000);
    } finally {
      setGeneratingFormat(null);
    }
  }, [buildExportPayload, report, reportFrom, reportTo, clientName, monthLabel, showNotification]);

  const handleExportPdf = useCallback(async () => {
    setGeneratingFormat('pdf');
    try {
      const slideEls = await getSlideElementsForExport();
      await generateMonthlyPdf(slideEls, { clientName, monthLabel });
      showNotification(`PDF downloaded: ${clientName} — ${monthLabel}`);
    } catch (err) {
      console.error('[MonthlyReport] PDF export failed', err);
      showNotification(err?.message || 'PDF export failed', 6000);
    } finally {
      setGeneratingFormat(null);
      setExportMount(false);
    }
  }, [getSlideElementsForExport, clientName, monthLabel, showNotification]);

  const handlePrint = () => window.print();

  const handlePublish = useCallback(async () => {
    if (!hasPermission('action.publish_report')) { showNotification('No permission to publish'); return; }
    try {
      await handleSaveSections();
      await publishReport();
      showNotification('Report published');
    } catch (err) {
      showNotification(err?.message || 'Publish failed', 'error');
    }
  }, [hasPermission, handleSaveSections, publishReport, showNotification]);

  if (loading && !report) {
    return (
      <div className="page-section active">
        <div className="page-content"><div className="gads-loading"><div className="gads-spinner" /> Loading report…</div></div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="page-section active">
        <div className="page-content">
          <div className="admin-message error">{error || 'Report not found'}</div>
          <button type="button" className="btn btn-outline" onClick={onBack}>← Back</button>
        </div>
      </div>
    );
  }

  const accountsByPlatform = PLATFORMS.reduce((acc, p) => {
    acc[p] = clientAccounts.filter((a) => a.platform === p);
    return acc;
  }, {});

  return (
    <div className="page-section active mr-editor" id="page-monthly-report-editor">
      <div className="page-content mr-editor-layout">
        <aside className="mr-editor-sidebar">
          <button type="button" className="btn btn-outline btn-sm mr-editor-back" onClick={onBack}>← Back</button>
          <div className="mr-editor-actions">
            {!isPublished && (
              <button type="button" className="btn btn-primary btn-sm" onClick={handleSaveSections} disabled={saving}>
                {saving ? 'Saving…' : 'Save Edits'}
              </button>
            )}
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowPreview(true)}>Preview</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={handleExportPdf} disabled={!!generatingFormat}>Export PDF</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={handleExportPpt} disabled={!!generatingFormat}>
              {generatingFormat === 'ppt' ? 'Exporting…' : 'Export PowerPoint'}
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={handleExportGoogleSlides} disabled={!!generatingFormat} title="Sign in with agency Google account and upload to Drive as Google Slides">
              {generatingFormat === 'gslides' ? 'Exporting…' : 'For Google Slides'}
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={handlePrint}>Print</button>
            {isPublished ? (
              <span className="badge badge-green">Published</span>
            ) : hasPermission('action.publish_report') ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={handlePublish}>Publish</button>
            ) : null}
          </div>
        </aside>

        <main className="mr-editor-main">
          <div className="page-title-bar mr-editor-title">
            <div>
              <h2>{report.title || 'Monthly Report'}</h2>
              <p>{clientName} — {monthLabel}{isPublished && <span className="badge badge-green" style={{ marginLeft: 8 }}>Read-only</span>}</p>
            </div>
          </div>

          <div className="panel mr-config-bar">
            <div className="panel-body">
              <h3>Report configuration</h3>
              <div className="mr-config-top">
                <div className="mr-config-client">
                  <label>Client</label>
                  <select className="mr-config-select" value={report.client_id} disabled={isPublished} onChange={async (e) => {
                    await supabase.from('monthly_reports').update({ client_id: e.target.value }).eq('id', reportId);
                    loadReport();
                  }}>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="mr-config-dates">
                  <label>Report period &amp; comparison</label>
                  <DateRangePicker
                    blockLayout
                    compareCalendarMonth
                    dropdownAlign="left"
                    preset={datePreset}
                    dateFrom={reportFrom}
                    dateTo={reportTo}
                    compareOn={compareOn}
                    compareFrom={compareFrom}
                    compareTo={compareTo}
                    onApply={handleDatePickerApply}
                  />
                  <div className="mr-compare-toggle-row">
                    <label className="mr-compare-toggle">
                      <input
                        type="checkbox"
                        checked={compareOn}
                        disabled={isPublished}
                        onChange={(e) => setCompareOn(e.target.checked)}
                      />
                      <span>Include comparison period in slides</span>
                    </label>
                    <span className={`badge ${compareOn ? 'badge-green' : 'badge-muted'}`}>
                      Comparison: {compareOn ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <p className="mr-config-dates-hint">
                    Report month uses the 1st through last day (e.g. Apr 1–30, 2026). When comparison is on, the prior full month is used by default. Uncheck sections below to hide comparison columns on specific slides only.
                  </p>
                  {compareOn ? (
                    <div className="mr-compare-sections">
                      <p className="mr-compare-sections-label">Show comparison data on:</p>
                      <div className="mr-compare-sections-grid">
                        {COMPARE_SECTION_OPTIONS.map(({ key, label }) => (
                          <label key={key} className="mr-compare-section-option">
                            <input
                              type="checkbox"
                              checked={compareSections[key] !== false}
                              disabled={isPublished}
                              onChange={(e) => setCompareSections((prev) => ({ ...prev, [key]: e.target.checked }))}
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="mr-slide2-services-config">
                    <p className="mr-compare-sections-label">Slide 2 — What We Are Managing (include services):</p>
                    <div className="mr-compare-sections-grid">
                      {SLIDE2_SERVICE_OPTIONS.map(({ key, label }) => {
                        const svc = slide2.find((s) => s.key === key);
                        return (
                          <label key={key} className="mr-compare-section-option">
                            <input
                              type="checkbox"
                              checked={svc?.enabled !== false}
                              disabled={isPublished}
                              onChange={(e) => setSlide2((prev) => prev.map((s) => (
                                s.key === key ? { ...s, enabled: e.target.checked } : s
                              )))}
                            />
                            <span>{label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mr-account-selectors">
                {PLATFORMS.map((platform) => (
                  <div key={platform} className="mr-account-group">
                    <label className="gads-filter-label">{platform.replace('_', ' ').toUpperCase()}</label>
                    {(accountsByPlatform[platform] || []).length === 0 ? (
                      <p className="mr-no-accounts">No accounts</p>
                    ) : (
                      accountsByPlatform[platform].map((a) => (
                        <label key={a.id} className="mr-account-row">
                          <input type="checkbox" checked={accountSelections[a.id]?.included ?? false} disabled={isPublished}
                            onChange={(e) => setAccountSelections((prev) => ({ ...prev, [a.id]: { ...prev[a.id], included: e.target.checked } }))} />
                          <input type="text" className="form-control" placeholder="Label" value={accountSelections[a.id]?.label ?? ''} disabled={isPublished}
                            onChange={(e) => setAccountSelections((prev) => ({ ...prev, [a.id]: { ...prev[a.id], label: e.target.value } }))} />
                        </label>
                      ))
                    )}
                  </div>
                ))}
              </div>

              <div className="mr-seo-config panel" style={{ marginTop: 16 }}>
                <div className="panel-body">
                  <h3>SEO data (from client settings)</h3>
                  <p className="mr-config-dates-hint">
                    GSC and GBP are read from accounts linked to this client in <strong>Settings → Platforms</strong> or <strong>Admin → Clients</strong> (GA4 property, GSC site URL, GBP location ID on the account row). SEO slides use your report date range, not a fixed quarter.
                  </p>
                  <div className="mr-seo-config-fields mr-seo-config-fields--readonly">
                    <label>
                      Search Console site
                      <input type="text" className="form-control" readOnly value={gscSiteUrl || '— Not set on client — add GSC URL as platform_customer_id on a gsc account row'} />
                    </label>
                    <label>
                      GBP location
                      <input type="text" className="form-control" readOnly value={gbpLocationId || '— Loaded from gmb_insights_daily using tagged GBP account names (no location ID required)'} />
                    </label>
                    <label>
                      Google Ads customer ID (for auction sheet filter)
                      <input
                        type="text"
                        className="form-control"
                        readOnly
                        value={googleAdsCustomerIds.length ? googleAdsCustomerIds.join(', ') : '— Link google_ads account to this client in Admin'}
                      />
                    </label>
                    <label>
                      Auction insights sheet URL (current month)
                      <input
                        type="url"
                        className="form-control"
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                        value={auctionSheetUrl}
                        disabled={isPublished}
                        onChange={(e) => setAuctionSheetUrl(e.target.value.trim())}
                      />
                    </label>
                    <label>
                      Auction insights sheet URL (previous month)
                      <input
                        type="url"
                        className="form-control"
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                        value={auctionSheetPreviousUrl}
                        disabled={isPublished}
                        onChange={(e) => setAuctionSheetPreviousUrl(e.target.value.trim())}
                      />
                    </label>
                    <label>
                      Keyword tracker sheet URL
                      <input
                        type="url"
                        className="form-control"
                        placeholder="https://docs.google.com/spreadsheets/..."
                        value={keywordTracker.sheetUrl || ''}
                        disabled={isPublished}
                        onChange={(e) => setKeywordTracker((prev) => ({ ...prev, sheetUrl: e.target.value.trim() }))}
                      />
                    </label>
                  </div>
                  {!isPublished && (
                    <p className="mr-config-dates-hint" style={{ marginTop: 8 }}>
                      Saved when you click <strong>Apply &amp; Load Slides</strong> or <strong>Save slide edits</strong>.
                      Auction rows are filtered by the client&apos;s <strong>Google Ads Customer ID</strong> column in the sheet (e.g. 100-268-3889). Current month loads from the first URL; previous month from the second (April above, March below on slide 9).
                    </p>
                  )}
                  {!isPublished && (
                    <p className="mr-config-dates-hint" style={{ marginTop: 8 }}>
                      To override for this report only, save custom values under slide edits (section keys) or add <code>gsc</code> / <code>gbp</code> platform rows on the client in Admin.
                    </p>
                  )}
                </div>
              </div>

              {!isPublished && (
                <button type="button" className="btn btn-primary" onClick={handleApply} disabled={dataLoading} style={{ marginTop: 12 }}>
                  {dataLoading ? 'Loading data…' : 'Apply & Load Slides'}
                </button>
              )}
            </div>
          </div>

          <div ref={previewRef}>
            {!dataApplied && !isPublished ? (
              <div className="panel"><div className="panel-body"><p style={{ color: 'var(--text-muted)' }}>Configure accounts and date ranges, then click Apply to load slide data.</p></div></div>
            ) : (
              <MonthlySlideGrid
                clientName={clientName}
                monthLabel={monthLabel}
                agency={agency}
                slideData={enrichedSlideData}
                sections={sections}
                editable={!isPublished}
                handlers={handlers}
                seoHandlers={seoHandlers}
              />
            )}
          </div>
        </main>
      </div>

      {showPreview && (
        <div className="mr-preview-modal" onClick={() => setShowPreview(false)}>
          <div className="mr-preview-modal-inner" onClick={(e) => e.stopPropagation()}>
            <div className="mr-preview-modal-head">
              <h3>Full Screen Preview</h3>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowPreview(false)}>Close</button>
            </div>
            <MonthlySlideGrid
              clientName={clientName}
              monthLabel={monthLabel}
              agency={agency}
              slideData={enrichedSlideData}
              sections={sections}
              editable={false}
              handlers={handlers}
              seoHandlers={seoHandlers}
            />
          </div>
        </div>
      )}

      {showGoogleSlidesHelp && (
        <div className="mr-preview-modal" onClick={() => setShowGoogleSlidesHelp(false)}>
          <div className="mr-preview-modal-inner mr-gslides-help" onClick={(e) => e.stopPropagation()}>
            <div className="mr-preview-modal-head">
              <h3>Open in Google Slides</h3>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowGoogleSlidesHelp(false)}>Close</button>
            </div>
            <p style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontSize: 14 }}>
              {googleSlidesLink ? (
                <>
                  Your report was uploaded to Google Drive as <strong>Google Slides</strong>.
                  {' '}<a href={googleSlidesLink} target="_blank" rel="noreferrer">Open presentation</a>
                  {' '}— keyword rankings (Top 20 and All Locations) are embedded automatically from your sheet URL.
                  Slide 22 includes a clickable link to the live Google Sheet.
                </>
              ) : (
                <>
                  Automatic Drive upload failed or Google is not connected with Drive access.
                  The <strong>.pptx</strong> was downloaded — import it manually, or reconnect Google in Settings
                  (Admin → Google / GA4) to enable direct upload to your reports folder.
                </>
              )}
            </p>
            {!googleSlidesLink && (
            <ol className="mr-gslides-steps">
              <li>Go to <a href="https://drive.google.com" target="_blank" rel="noreferrer">Google Drive</a> and sign in.</li>
              <li>Click <strong>New → File upload</strong> and choose the downloaded <code>.pptx</code> file.</li>
              <li>When upload finishes, right-click the file → <strong>Open with → Google Slides</strong>.</li>
              <li>Google Slides creates a copy you can edit and share. Formatting may need minor tweaks after import.</li>
            </ol>
            )}
            <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              <strong>Setup:</strong> Add <code>VITE_GOOGLE_CLIENT_ID</code> and optional{' '}
              <code>VITE_GOOGLE_DRIVE_REPORTS_FOLDER_ID</code> to <code>.env</code>.
              All users should choose the same agency Google account in the sign-in popup.
              The OAuth client ID is public by design; never put the client <em>secret</em> in the frontend.
            </p>
          </div>
        </div>
      )}

      {exportMount && (
        <div ref={exportRef} className="mr-slide-pdf-export-root" aria-hidden>
          <MonthlySlideGrid
            slidesOnly
            exportMode
            clientName={clientName}
            monthLabel={monthLabel}
            agency={agency}
            slideData={enrichedSlideData}
            sections={sections}
            editable={false}
            handlers={handlers}
            seoHandlers={seoHandlers}
          />
        </div>
      )}
    </div>
  );
}
