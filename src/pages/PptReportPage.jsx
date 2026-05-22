import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabaseClient';
import { buildReportDataForSelection, cloneReportServices } from '../data/reportData';
import { generatePptx } from '../utils/generatePptx';
import { generatePdf, waitForPaint } from '../utils/generatePdf';
import {
  emptyPaidAdsOverall,
  fetchPaidAdsOverallFromGads,
} from '../utils/fetchPptSlide5GadsData';
import { SlidePreviewGrid } from '../components/SlidePreviewGrid';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getMonthOptions() {
  const options = [];
  const now = new Date();
  for (let i = 0; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    options.push({
      value: `${y}-${m}-01`,
      label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    });
  }
  return options;
}

const MONTH_OPTIONS = getMonthOptions();

const DownloadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden style={{ marginRight: 6, verticalAlign: -2 }}>
    <path d="M12 3v12m0 0l4-4m-4 4L8 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const PdfIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden style={{ marginRight: 6, verticalAlign: -2 }}>
    <path d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.8" />
    <path d="M14 3v6h6" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export function PptReportPage() {
  const { agencyId, activeAgencyId } = useAuth();
  const { showNotification } = useApp();
  const effectiveAgencyId = activeAgencyId || agencyId;

  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(MONTH_OPTIONS[0]?.value || '');
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsError, setClientsError] = useState(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [generatingFormat, setGeneratingFormat] = useState(null);
  const [pdfExportMount, setPdfExportMount] = useState(false);
  /** Slide 2 service text — in-memory only, reset when client/month changes */
  const [slide2Services, setSlide2Services] = useState(null);
  /** Slide 5 — from gads_campaign_daily (session only) */
  const [paidAdsOverall, setPaidAdsOverall] = useState(null);
  const [slide5Loading, setSlide5Loading] = useState(false);
  const [pdfExportReport, setPdfExportReport] = useState(null);
  const previewRef = useRef(null);
  const pdfExportRef = useRef(null);

  const loadClients = useCallback(async () => {
    if (!effectiveAgencyId) {
      setClients([]);
      setClientsLoading(false);
      return;
    }
    setClientsLoading(true);
    setClientsError(null);
    const { data, error } = await supabase
      .from('clients')
      .select('id, name')
      .eq('agency_id', effectiveAgencyId)
      .order('name');
    if (error) {
      console.warn('[PptReport] clients error:', error);
      setClientsError(error.message || 'Failed to load clients');
      setClients([]);
    } else {
      setClients(data || []);
    }
    setClientsLoading(false);
  }, [effectiveAgencyId]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  useEffect(() => {
    if (!selectedClientId) {
      setPreviewVisible(false);
      setPaidAdsOverall(null);
    }
  }, [selectedClientId]);

  const selectedMonthLabel = MONTH_OPTIONS.find((o) => o.value === selectedMonth)?.label || selectedMonth;
  const selectedClientName = clients.find((c) => c.id === selectedClientId)?.name ?? '';

  const loadSlide5GadsData = useCallback(async () => {
    if (!selectedClientId || !selectedMonth) return null;
    setSlide5Loading(true);
    try {
      const data = await fetchPaidAdsOverallFromGads(
        selectedClientId,
        selectedMonth,
        selectedMonthLabel,
      );
      setPaidAdsOverall(data);
      return data;
    } catch (err) {
      console.warn('[PptReport] slide 5 gads_campaign_daily:', err);
      const fallback = emptyPaidAdsOverall(selectedMonthLabel, selectedMonth);
      setPaidAdsOverall(fallback);
      showNotification(err?.message || 'Could not load Google Ads data for slide 5');
      return fallback;
    } finally {
      setSlide5Loading(false);
    }
  }, [selectedClientId, selectedMonth, selectedMonthLabel, showNotification]);

  const baseReportData = useMemo(
    () => buildReportDataForSelection(selectedClientName, selectedMonthLabel, selectedMonth),
    [selectedClientName, selectedMonthLabel, selectedMonth],
  );

  useEffect(() => {
    setSlide2Services(cloneReportServices(baseReportData.services));
  }, [baseReportData]);

  const updateSlide2Service = useCallback((index, field, value) => {
    setSlide2Services((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }, []);

  const activeReportData = useMemo(
    () => ({
      ...baseReportData,
      services: slide2Services ?? baseReportData.services,
      paidAdsOverall: paidAdsOverall ?? baseReportData.paidAdsOverall,
    }),
    [baseReportData, slide2Services, paidAdsOverall],
  );

  const buildExportReportData = useCallback(
    async () => {
      const gads = await loadSlide5GadsData();
      return {
        ...baseReportData,
        services: slide2Services ?? baseReportData.services,
        paidAdsOverall: gads ?? paidAdsOverall ?? baseReportData.paidAdsOverall,
      };
    },
    [baseReportData, slide2Services, paidAdsOverall, loadSlide5GadsData],
  );

  const applyDisabled = !selectedClientId || !selectedMonth || slide5Loading;
  const downloadsDisabled = !selectedClientId || !selectedMonth || slide5Loading;

  const handleApply = async () => {
    if (!selectedClientId || !selectedMonth) return;
    await loadSlide5GadsData();
    setPreviewVisible(true);
    showNotification(`Preview loaded: ${selectedClientName} — ${selectedMonthLabel}`);
    setTimeout(() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleDownloadPpt = async () => {
    if (!selectedClientId || !selectedMonth) return;
    setGeneratingFormat('ppt');
    try {
      const exportData = await buildExportReportData();
      await generatePptx(exportData, {
        clientName: selectedClientName,
        monthLabel: selectedMonthLabel,
      });
      showNotification(`Downloaded: ${selectedClientName} — ${selectedMonthLabel}`);
    } catch (err) {
      console.warn('[PptReport] generatePptx error:', err);
      showNotification(err?.message || 'Failed to generate PowerPoint');
    } finally {
      setGeneratingFormat(null);
    }
  };

  const handleDownloadPdf = async () => {
    if (!selectedClientId || !selectedMonth) return;
    setGeneratingFormat('pdf');
    try {
      const exportData = await buildExportReportData();
      setPdfExportReport(exportData);
      setPdfExportMount(true);
      await waitForPaint();
      await sleep(500);
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      const container = pdfExportRef.current;
      const slideEls = container?.querySelectorAll('.ppt-slide-card');
      if (!slideEls?.length) {
        throw new Error('No slides available to export');
      }

      await generatePdf(Array.from(slideEls), {
        clientName: selectedClientName,
        monthLabel: selectedMonthLabel,
      });

      showNotification(`PDF downloaded: ${selectedClientName} — ${selectedMonthLabel}`);
    } catch (err) {
      console.warn('[PptReport] generatePdf error:', err);
      showNotification(err?.message || 'Failed to generate PDF');
    } finally {
      setGeneratingFormat(null);
      setPdfExportMount(false);
      setPdfExportReport(null);
    }
  };

  return (
    <div className="page-section active" id="page-ppt-report">
      <div className="page-content">
        <div className="page-title-bar">
          <h2>PPT Report Download</h2>
          <p>Download reports and exports from this area.</p>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>Reports</h3>
              <p className="panel-subtitle text-accent" style={{ marginTop: 4 }}>
                Choose a client and month to prepare a report download.
              </p>
            </div>
          </div>
          <div className="panel-body">
            <div className="gads-filter-row">
              <div className="gads-filter-group gads-fg-sm">
                <label>Clients List</label>
                <select
                  value={selectedClientId}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedClientId(value);
                    if (!value) setPreviewVisible(false);
                  }}
                  disabled={clientsLoading || !!clientsError}
                >
                  <option value="">
                    {clientsLoading ? 'Loading…' : clientsError ? 'Error loading clients' : 'Select a client'}
                  </option>
                  {!clientsLoading && !clientsError && clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {clientsError && (
                  <span style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>{clientsError}</span>
                )}
              </div>

              <div className="gads-filter-group gads-fg-sm">
                <label>Month</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                >
                  {MONTH_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div className="gads-filter-group gads-filter-actions">
                <label>Actions</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleApply}
                    disabled={applyDisabled}
                  >
                    {slide5Loading ? 'Loading…' : 'Apply'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={handleDownloadPpt}
                    disabled={downloadsDisabled || generatingFormat !== null}
                    title={downloadsDisabled ? 'Select a client first' : 'Download PowerPoint report'}
                  >
                    <DownloadIcon />
                    {generatingFormat === 'ppt' ? 'Generating…' : 'Download PPT'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={handleDownloadPdf}
                    disabled={downloadsDisabled || generatingFormat !== null}
                    style={{ color: downloadsDisabled ? undefined : '#dc2626', borderColor: downloadsDisabled ? undefined : '#dc2626' }}
                    title={downloadsDisabled ? 'Select a client first' : 'Download PDF report'}
                  >
                    <PdfIcon />
                    {generatingFormat === 'pdf' ? 'Generating PDF…' : 'Download PDF'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {previewVisible && selectedClientId && (
          <div ref={previewRef}>
            <SlidePreviewGrid
              clientName={selectedClientName}
              monthLabel={selectedMonthLabel}
              report={activeReportData}
              slide2Editable
              updateSlide2Service={updateSlide2Service}
              slide5Loading={slide5Loading}
            />
          </div>
        )}

        {pdfExportMount && selectedClientId && pdfExportReport && (
          <div ref={pdfExportRef} className="ppt-pdf-export-root" aria-hidden="true">
            <SlidePreviewGrid
              slidesOnly
              exportMode
              clientName={selectedClientName}
              monthLabel={selectedMonthLabel}
              report={pdfExportReport}
            />
          </div>
        )}
      </div>
    </div>
  );
}
