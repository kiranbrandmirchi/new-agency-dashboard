import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabaseClient';
import { useMonthlyReport, getMonthRange } from '../hooks/useMonthlyReport';
import { MonthlySlideGrid } from '../components/MonthlySlidePreview';
import { DateRangePicker } from '../components/DatePicker';
import { generateMonthlyPdf, waitForPaint } from '../utils/generateMonthlyPdf';
import { generateMonthlyPptx } from '../utils/generateMonthlyPptx.js';
import { buildMonthlyExportData } from '../utils/buildMonthlyExportData';
import {
  parseSectionJson,
  getSectionText,
  DEFAULT_SLIDE2_SERVICES,
  DEFAULT_SLIDE10_PROGRESS,
  formatMonthLabel,
} from '../utils/monthlyReportHelpers';
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
  const [showPreview, setShowPreview] = useState(false);
  const [showGoogleSlidesHelp, setShowGoogleSlidesHelp] = useState(false);
  const [generatingFormat, setGeneratingFormat] = useState(null);
  const [exportMount, setExportMount] = useState(false);
  const [saving, setSaving] = useState(false);

  const [slide2, setSlide2] = useState(DEFAULT_SLIDE2_SERVICES);
  const [slide3, setSlide3] = useState({ rows: [], statBoxes: [] });
  const [slide8, setSlide8] = useState('');
  const [slide9data, setSlide9data] = useState([]);
  const [slide9notes, setSlide9notes] = useState('');
  const [slide10, setSlide10] = useState(DEFAULT_SLIDE10_PROGRESS);

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
    setSlide2(parseSectionJson(sections, 'slide2_services', DEFAULT_SLIDE2_SERVICES));
    setSlide3(parseSectionJson(sections, 'slide3_leads', slideData?.slide3Prefill || { rows: [], statBoxes: [] }));
    setSlide8(getSectionText(sections, 'slide8_insights', ''));
    setSlide9data(parseSectionJson(sections, 'slide9_auction_data', []));
    setSlide9notes(getSectionText(sections, 'slide9_auction_notes', ''));
    setSlide10(parseSectionJson(sections, 'slide10_progress', DEFAULT_SLIDE10_PROGRESS));
  }, [sections, slideData?.slide3Prefill]);

  useEffect(() => {
    if (!report?.client_id) return;
    supabase.from('client_platform_accounts')
      .select('id, platform_customer_id, account_name, platform')
      .eq('client_id', report.client_id).eq('is_active', true).order('account_name')
      .then(({ data }) => {
        setClientAccounts(data || []);
        const sel = {};
        (data || []).forEach((a) => {
          const acc = accounts.find((x) => x.platform_account_id === a.id);
          sel[a.id] = { included: accounts.length === 0 ? PLATFORMS.includes(a.platform) : !!acc, label: acc?.label || a.account_name || a.platform_customer_id };
        });
        setAccountSelections(sel);
      });
  }, [report?.client_id, accounts]);

  const clientName = report?.clients?.name || 'Client';
  const monthLabel = slideData?.currentLabel || formatMonthLabel(reportFrom || report?.report_month);
  const previousLabel = slideData?.previousLabel || formatMonthLabel(compareFrom);

  const buildExportPayload = useCallback(() => buildMonthlyExportData({
    report,
    agency,
    sections: [
      ...(sections || []).filter((s) => !['slide2_services', 'slide3_leads', 'slide8_insights', 'slide9_auction_data', 'slide9_auction_notes', 'slide10_progress'].includes(s.section_key)),
      { section_key: 'slide2_services', content: JSON.stringify(slide2) },
      { section_key: 'slide3_leads', content: JSON.stringify(slide3) },
      { section_key: 'slide8_insights', content: slide8 },
      { section_key: 'slide9_auction_data', content: JSON.stringify(slide9data) },
      { section_key: 'slide9_auction_notes', content: slide9notes },
      { section_key: 'slide10_progress', content: JSON.stringify(slide10) },
    ],
    slideData,
    currentLabel: monthLabel,
    previousLabel,
    reportFrom,
    compareFrom,
  }), [report, agency, sections, slide2, slide3, slide8, slide9data, slide9notes, slide10, slideData, monthLabel, previousLabel, reportFrom, compareFrom]);

  const handlers = useMemo(() => ({
    slide2, slide3, slide8, slide9data, slide9notes, slide10,
    onSlide2: (index, field, value) => setSlide2((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    }),
    onSlide3: setSlide3,
    onSlide8: setSlide8,
    onSlide9data: setSlide9data,
    onSlide9notes: setSlide9notes,
    onSlide10: setSlide10,
  }), [slide2, slide3, slide8, slide9data, slide9notes, slide10]);

  const handleSaveSections = useCallback(async () => {
    setSaving(true);
    try {
      await upsertSections([
        { section_key: 'slide2_services', title: 'Slide 2 Services', content: JSON.stringify(slide2) },
        { section_key: 'slide3_leads', title: 'Slide 3 Leads', content: JSON.stringify(slide3) },
        { section_key: 'slide8_insights', title: 'Slide 8 Insights', content: slide8 },
        { section_key: 'slide9_auction_data', title: 'Slide 9 Auction Data', content: JSON.stringify(slide9data) },
        { section_key: 'slide9_auction_notes', title: 'Slide 9 Auction Notes', content: slide9notes },
        { section_key: 'slide10_progress', title: 'Slide 10 Progress', content: JSON.stringify(slide10) },
      ]);
      showNotification('Slide edits saved');
    } catch (err) {
      showNotification(err?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }, [upsertSections, slide2, slide3, slide8, slide9data, slide9notes, slide10, showNotification]);

  const handleApply = useCallback(async () => {
    if (!reportFrom || !reportTo || !compareFrom || !compareTo) {
      showNotification('Set report and comparison date ranges');
      return;
    }
    try {
      const selected = Object.entries(accountSelections).filter(([, v]) => v.included)
        .map(([platformAccountId, v]) => ({ platform_account_id: platformAccountId, label: v.label }));
      const savedAccounts = await saveAccounts(selected.map((a, i) => ({ ...a, sort_order: i })));

      const ranges = { currentFrom: reportFrom, currentTo: reportTo, prevFrom: compareFrom, prevTo: compareTo };
      await fetchReportData(ranges, savedAccounts);

      if (slideData?.slide3Prefill && !getSectionText(sections, 'slide3_leads', '')) {
        setSlide3(slideData.slide3Prefill);
      }
      showNotification('Report data loaded');
      setTimeout(() => previewRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) {
      showNotification(err?.message || 'Failed to load data', 'error');
    }
  }, [accountSelections, saveAccounts, fetchReportData, reportFrom, reportTo, compareFrom, compareTo, sections, showNotification]);

  useEffect(() => {
    if (slideData?.slide3Prefill && !getSectionText(sections, 'slide3_leads', '')) {
      setSlide3(slideData.slide3Prefill);
    }
  }, [slideData?.slide3Prefill, sections]);

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
      await generateMonthlyPptx(payload, { clientName, monthLabel });
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
      await generateMonthlyPptx(buildExportPayload(), { clientName, monthLabel });
      setShowGoogleSlidesHelp(true);
      showNotification('Downloaded .pptx for Google Slides — see steps in the dialog');
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
            <button type="button" className="btn btn-outline btn-sm" onClick={handleExportGoogleSlides} disabled={!!generatingFormat} title="Downloads editable .pptx to import into Google Slides">
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
                  <p className="mr-config-dates-hint">
                    Report month uses the 1st through last day (e.g. Apr 1–30, 2026). Comparison is the prior full month (Mar 1–31, 2026).
                  </p>
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
                slideData={slideData}
                sections={sections}
                editable={!isPublished}
                handlers={handlers}
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
              slideData={slideData}
              sections={sections}
              editable={false}
              handlers={handlers}
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
              Google does not offer a direct &quot;.slides&quot; download from this app. The file you downloaded is an <strong>editable PowerPoint (.pptx)</strong> with real text and tables — import it into Google Slides to edit online in Drive.
            </p>
            <ol className="mr-gslides-steps">
              <li>Go to <a href="https://drive.google.com" target="_blank" rel="noreferrer">Google Drive</a> and sign in.</li>
              <li>Click <strong>New → File upload</strong> and choose the downloaded <code>.pptx</code> file.</li>
              <li>When upload finishes, right-click the file → <strong>Open with → Google Slides</strong>.</li>
              <li>Google Slides creates a copy you can edit and share. Formatting may need minor tweaks after import.</li>
            </ol>
            <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              <strong>PowerPoint vs Google Slides:</strong> &quot;Export PowerPoint&quot; and &quot;For Google Slides&quot; download the same editable file; the second option shows these import steps.
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
            slideData={slideData}
            sections={sections}
            editable={false}
            handlers={handlers}
          />
        </div>
      )}
    </div>
  );
}
