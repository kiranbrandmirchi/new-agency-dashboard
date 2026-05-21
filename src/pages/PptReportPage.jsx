import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabaseClient';

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

  const selectedMonthLabel = MONTH_OPTIONS.find((o) => o.value === selectedMonth)?.label || selectedMonth;

  const handleApply = () => {
    console.log('[PptReport] Apply', { clientId: selectedClientId, month: selectedMonth });
    showNotification(
      selectedClientId
        ? `Applied: ${clients.find((c) => c.id === selectedClientId)?.name || selectedClientId} — ${selectedMonthLabel}`
        : 'Select a client first',
    );
  };

  const handleDownloadPpt = () => {
    // TODO: Wire up PPT export API / storage download when backend is ready.
    console.log('Download PPT', { clientId: selectedClientId, month: selectedMonth });
  };

  const handleDownloadPdf = () => {
    // TODO: Wire up PDF export API / storage download when backend is ready.
    console.log('Download PDF', { clientId: selectedClientId, month: selectedMonth });
  };

  const downloadsDisabled = !selectedClientId;

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
                  onChange={(e) => setSelectedClientId(e.target.value)}
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
                  <button type="button" className="btn btn-primary btn-sm" onClick={handleApply}>
                    Apply
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={handleDownloadPpt}
                    disabled={downloadsDisabled}
                    title={downloadsDisabled ? 'Select a client first' : 'Download PowerPoint report'}
                  >
                    <DownloadIcon />
                    Download PPT
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={handleDownloadPdf}
                    disabled={downloadsDisabled}
                    style={{ color: downloadsDisabled ? undefined : '#dc2626', borderColor: downloadsDisabled ? undefined : '#dc2626' }}
                    title={downloadsDisabled ? 'Select a client first' : 'Download PDF report'}
                  >
                    <PdfIcon />
                    Download PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
