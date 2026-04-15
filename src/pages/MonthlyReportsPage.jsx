import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabaseClient';
import { MonthlyReportEditor } from './MonthlyReportEditor';

function getMonthOptions() {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    options.push({
      value: `${y}-${m}-01`,
      label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    });
  }
  return options;
}

const MONTH_OPTIONS = getMonthOptions();

export function MonthlyReportsPage() {
  const { agencyId, activeAgencyId, hasPermission } = useAuth();
  const { showNotification } = useApp();
  const effectiveAgencyId = activeAgencyId || agencyId;

  const [clients, setClients] = useState([]);
  const [reports, setReports] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(MONTH_OPTIONS[0]?.value || '');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editorReportId, setEditorReportId] = useState(null);

  const loadClients = useCallback(async () => {
    if (!effectiveAgencyId) return;
    const { data, error } = await supabase
      .from('clients')
      .select('id, name')
      .eq('agency_id', effectiveAgencyId)
      .order('name');
    if (error) {
      console.warn('[MonthlyReports] clients error:', error);
      setClients([]);
      return;
    }
    setClients(data || []);
    if (data?.length && !selectedClientId) setSelectedClientId(data[0].id);
  }, [effectiveAgencyId, selectedClientId]);

  const loadReports = useCallback(async () => {
    if (!effectiveAgencyId) return;
    setLoading(true);
    let query = supabase
      .from('monthly_reports')
      .select('id, agency_id, client_id, report_month, title, status, created_at, included_platforms, clients(name)')
      .eq('agency_id', effectiveAgencyId)
      .order('report_month', { ascending: false });
    if (selectedClientId) query = query.eq('client_id', selectedClientId);
    if (selectedMonth) query = query.eq('report_month', selectedMonth);
    const { data, error } = await query;
    if (error) {
      console.warn('[MonthlyReports] reports error:', error);
      setReports([]);
    } else {
      setReports(data || []);
    }
    setLoading(false);
  }, [effectiveAgencyId, selectedClientId, selectedMonth]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleCreateReport = async () => {
    if (!selectedClientId || !selectedMonth) {
      showNotification('Select a client and month');
      return;
    }
    if (!hasPermission('action.create_report')) {
      showNotification('You do not have permission to create reports');
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from('monthly_reports')
        .insert({
          agency_id: effectiveAgencyId,
          client_id: selectedClientId,
          report_month: selectedMonth,
          title: `${clients.find((c) => c.id === selectedClientId)?.name || 'Report'} - ${new Date(selectedMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
          status: 'draft',
        })
        .select('id')
        .single();
      if (error) throw error;
      showNotification('Report created');
      setEditorReportId(data.id);
      loadReports();
    } catch (err) {
      showNotification(err?.message || 'Failed to create report');
    } finally {
      setCreating(false);
    }
  };

  const handleOpenReport = (reportId) => {
    setEditorReportId(reportId);
  };

  const handleDuplicateReport = async (sourceReport, ev) => {
    ev.stopPropagation();
    if (!hasPermission('action.create_report')) {
      showNotification('You do not have permission to create reports');
      return;
    }
    const srcId = sourceReport.id;
    const d = new Date(sourceReport.report_month);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const reportMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
    const clientName = sourceReport.clients?.name || 'Report';
    const title = `${clientName} - ${next.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
    try {
      const { data: ins, error } = await supabase
        .from('monthly_reports')
        .insert({
          agency_id: sourceReport.agency_id,
          client_id: sourceReport.client_id,
          report_month: reportMonth,
          title,
          status: 'draft',
          included_platforms: sourceReport.included_platforms ?? [],
        })
        .select('id')
        .single();
      if (error) throw error;

      const { data: mras } = await supabase.from('monthly_report_accounts').select('*').eq('report_id', srcId);
      if (mras?.length) {
        await supabase.from('monthly_report_accounts').insert(
          mras.map((row, i) => ({
            report_id: ins.id,
            platform_account_id: row.platform_account_id,
            label: row.label,
            sort_order: row.sort_order ?? i,
          })),
        );
      }
      const { data: secs } = await supabase.from('monthly_report_sections').select('*').eq('report_id', srcId);
      if (secs?.length) {
        await supabase.from('monthly_report_sections').insert(
          secs.map((row, i) => ({
            report_id: ins.id,
            section_key: row.section_key,
            title: row.title,
            content: row.content,
            sort_order: row.sort_order ?? i,
          })),
        );
      }
      const { data: ups } = await supabase.from('monthly_report_uploads').select('*').eq('report_id', srcId);
      if (ups?.length) {
        for (const u of ups) {
          await supabase.from('monthly_report_uploads').insert({
            report_id: ins.id,
            upload_type: u.upload_type,
            platform_account_id: u.platform_account_id,
            label: u.label,
            data: u.data,
          });
        }
      }
      showNotification('Duplicated for next month');
      loadReports();
      setEditorReportId(ins.id);
    } catch (err) {
      showNotification(err?.message || 'Duplicate failed');
    }
  };

  const handleDeleteReport = async (reportId, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this report? This cannot be undone.')) return;
    try {
      const { error } = await supabase.from('monthly_reports').delete().eq('id', reportId);
      if (error) throw error;
      showNotification('Report deleted');
      loadReports();
    } catch (err) {
      showNotification(err?.message || 'Failed to delete report');
    }
  };

  const handleBackFromEditor = () => {
    setEditorReportId(null);
    loadReports();
  };

  if (editorReportId) {
    return (
      <MonthlyReportEditor
        reportId={editorReportId}
        onBack={handleBackFromEditor}
      />
    );
  }

  return (
    <div className="page-section active" id="page-monthly-reports">
      <div className="page-content">
        <div className="page-title-bar">
          <h2>Monthly Reports</h2>
          <p>Create and manage monthly performance reports for clients</p>
        </div>

        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-body">
            <div className="gads-filter-group" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
              <div>
                <label className="gads-filter-label">Client</label>
                <select
                  className="client-selector"
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  style={{ minWidth: 200 }}
                >
                  <option value="">All clients</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="gads-filter-label">Month</label>
                <select
                  className="client-selector"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  style={{ minWidth: 180 }}
                >
                  {MONTH_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCreateReport}
                disabled={creating || !selectedClientId || !selectedMonth}
              >
                {creating ? 'Creating…' : 'Create Report'}
              </button>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-body">
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Existing Reports</h3>
            {loading ? (
              <div className="gads-loading"><div className="gads-spinner" /> Loading…</div>
            ) : reports.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', margin: 0 }}>No reports found. Create one above.</p>
            ) : (
              <div className="table-wrapper">
                <table className="data-table gads-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Client</th>
                      <th>Month</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th style={{ width: 160 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((r) => (
                      <tr
                        key={r.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => handleOpenReport(r.id)}
                      >
                        <td>{r.title || 'Untitled'}</td>
                        <td>{r.clients?.name || '—'}</td>
                        <td>{r.report_month ? new Date(r.report_month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'}</td>
                        <td>
                          <span className={`badge ${r.status === 'published' ? 'badge-green' : 'badge-yellow'}`}>
                            {r.status}
                          </span>
                        </td>
                        <td>{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            style={{ fontSize: 11, padding: '2px 8px', marginRight: 6 }}
                            onClick={(e) => handleDuplicateReport(r, e)}
                          >
                            Duplicate
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            style={{ color: '#dc2626', fontSize: 11, padding: '2px 8px' }}
                            onClick={(e) => handleDeleteReport(r.id, e)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
