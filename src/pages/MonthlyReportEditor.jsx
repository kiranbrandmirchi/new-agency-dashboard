import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabaseClient';
import { useMonthlyReport } from '../hooks/useMonthlyReport';
import { CsvUploader } from '../components/CsvUploader';
import { ReportPreview } from '../components/ReportPreview';
import Chart from 'chart.js/auto';

const fU = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fI = (n) => Math.round(Number(n || 0)).toLocaleString('en-US');
const fP = (n) => Number(n || 0).toFixed(2) + '%';
const fDur = (sec) => { if (!sec || isNaN(sec)) return '—'; const m = Math.floor(sec / 60); const s = Math.floor(sec % 60); return `${m}m ${String(s).padStart(2, '0')}s`; };

const STEPS = ['accounts', 'data', 'uploads', 'notes', 'preview'];

const PLATFORM_COLORS = {
  google_ads: '#4285F4',
  facebook: '#1877F2',
  reddit: '#FF4500',
  tiktok: '#010101',
  ga4: '#E37400',
};

function NotesStep({ sections, accounts, saveSections, isPublished, showNotification }) {
  const [highlights, setHighlights] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [accountNotes, setAccountNotes] = useState({});
  useEffect(() => {
    const get = (key) => (sections || []).find((s) => s.section_key === key)?.content ?? '';
    setHighlights(get('overall_highlights'));
    setRecommendations(get('overall_recommendations'));
    const notes = {};
    (accounts || []).forEach((acc) => {
      notes[`${acc.id}_notes`] = get(`account_${acc.id}_notes`);
      notes[`${acc.id}_performance`] = get(`account_${acc.id}_performance`);
    });
    setAccountNotes(notes);
  }, [sections, accounts]);
  const handleSave = async () => {
    const newSections = [
      { section_key: 'overall_highlights', title: 'Highlights', content: highlights },
      { section_key: 'overall_recommendations', title: 'Recommendations', content: recommendations },
    ];
    (accounts || []).forEach((acc) => {
      const n = accountNotes[`${acc.id}_notes`];
      const p = accountNotes[`${acc.id}_performance`];
      if (n) newSections.push({ section_key: `account_${acc.id}_notes`, title: `${acc.label || 'Account'} — Notes`, content: n });
      if (p) newSections.push({ section_key: `account_${acc.id}_performance`, title: `${acc.label || 'Account'} — Performance`, content: p });
    });
    await saveSections(newSections.filter((s) => s.content));
    showNotification('Notes saved');
  };
  return (
    <div className="panel">
      <div className="panel-body">
        <h3 style={{ margin: '0 0 16px' }}>Custom Notes</h3>
        <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>Add highlights and recommendations. Supports markdown.</p>
        <div style={{ marginBottom: 16 }}>
          <label className="gads-filter-label">Overall Highlights</label>
          <textarea className="form-control" rows={4} placeholder="Overall performance highlights..." value={highlights} onChange={(e) => setHighlights(e.target.value)} disabled={isPublished} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label className="gads-filter-label">Recommendations</label>
          <textarea className="form-control" rows={4} placeholder="Key takeaways and recommendations..." value={recommendations} onChange={(e) => setRecommendations(e.target.value)} disabled={isPublished} />
        </div>
        {(accounts || []).map((acc) => (
          <div key={acc.id} style={{ marginBottom: 20, padding: 16, background: '#f8f9fa', borderRadius: 8 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>{acc.label || acc.client_platform_accounts?.account_name || 'Account'}</h4>
            <div style={{ marginBottom: 12 }}>
              <label className="gads-filter-label">Notes</label>
              <textarea className="form-control" rows={2} placeholder="Account-specific notes..." value={accountNotes[`${acc.id}_notes`] ?? ''} onChange={(e) => setAccountNotes((prev) => ({ ...prev, [`${acc.id}_notes`]: e.target.value }))} disabled={isPublished} />
            </div>
            <div>
              <label className="gads-filter-label">Performance</label>
              <textarea className="form-control" rows={2} placeholder="Performance notes..." value={accountNotes[`${acc.id}_performance`] ?? ''} onChange={(e) => setAccountNotes((prev) => ({ ...prev, [`${acc.id}_performance`]: e.target.value }))} disabled={isPublished} />
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={isPublished}>Save Notes</button>
      </div>
    </div>
  );
}

function DailySpendChart({ platformData }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!chartRef.current) return;
    if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; }

    const adAccounts = Object.values(platformData || {}).filter((a) => a.platform !== 'ga4' && a.daily?.length > 0);
    if (!adAccounts.length) return;

    const allDates = new Set();
    adAccounts.forEach((a) => a.daily.forEach((d) => allDates.add(d.date)));
    const labels = [...allDates].sort();

    const colors = ['#4285F4', '#1877F2', '#FF4500', '#22c55e', '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6'];
    const datasets = adAccounts.map((a, i) => {
      const byDate = new Map(a.daily.map((d) => [d.date, d.cost]));
      return {
        label: a.label,
        data: labels.map((d) => byDate.get(d) || 0),
        borderColor: PLATFORM_COLORS[a.platform] || colors[i % colors.length],
        backgroundColor: (PLATFORM_COLORS[a.platform] || colors[i % colors.length]) + '18',
        tension: 0.35, fill: false, borderWidth: 2,
      };
    });

    chartInstance.current = new Chart(chartRef.current, {
      type: 'line',
      data: { labels: labels.map((d) => { const p = d.split('-'); return `${parseInt(p[1])}/${parseInt(p[2])}`; }), datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: true, position: 'bottom' } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { beginAtZero: true, ticks: { font: { size: 10 }, callback: (v) => '$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'K' : v) } },
        },
      },
    });
    return () => { if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; } };
  }, [platformData]);

  return <div style={{ height: 300 }}><canvas ref={chartRef} /></div>;
}

export function MonthlyReportEditor({ reportId, onBack }) {
  const { hasPermission, agencyId, activeAgencyId } = useAuth();
  const { showNotification } = useApp();
  const effectiveAgencyId = activeAgencyId || agencyId;

  const {
    report, accounts, sections, uploads, platformData, overallKpis, momChanges,
    loading, error, loadReport, saveReport, saveAccounts, saveSections, saveUpload,
    createUpload, updateUpload, deleteUpload, publishReport,
  } = useMonthlyReport(reportId);

  const [step, setStep] = useState('accounts');
  const [clientAccounts, setClientAccounts] = useState([]);
  const [accountSelections, setAccountSelections] = useState({});
  const [agency, setAgency] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (report?.status === 'published') {
      setStep('preview');
    }
  }, [report?.id, report?.status]);

  useEffect(() => {
    if (effectiveAgencyId) {
      supabase.from('agencies').select('*').eq('id', effectiveAgencyId).single().then(({ data }) => setAgency(data));
    }
  }, [effectiveAgencyId]);

  useEffect(() => {
    if (report?.client_id) {
      supabase.from('client_platform_accounts').select('id, platform_customer_id, account_name, platform')
        .eq('client_id', report.client_id).eq('is_active', true).order('account_name')
        .then(({ data }) => {
          setClientAccounts(data || []);
          const sel = {};
          (data || []).forEach((a) => {
            const acc = accounts.find((x) => x.platform_account_id === a.id);
            sel[a.id] = { included: accounts.length === 0 ? true : !!acc, label: acc?.label || a.account_name || a.platform_customer_id };
          });
          setAccountSelections(sel);
        });
    }
  }, [report?.client_id, accounts]);

  const handleSaveAccounts = useCallback(async () => {
    const selected = Object.entries(accountSelections).filter(([, v]) => v.included)
      .map(([platformAccountId, v]) => ({ platform_account_id: platformAccountId, label: v.label }));
    await saveAccounts(selected.map((a, i) => ({ ...a, sort_order: i })));
    showNotification('Accounts saved');
    loadReport();
  }, [accountSelections, saveAccounts, loadReport, showNotification]);

  const handlePublish = useCallback(async () => {
    if (!hasPermission('action.publish_report')) { showNotification('You do not have permission to publish'); return; }
    try {
      await publishReport();
      showNotification('Report published');
    } catch (err) {
      showNotification(err?.message || 'Publish failed');
    }
  }, [hasPermission, publishReport, showNotification]);

  const handleExportPdf = useCallback(() => {
    if (step !== 'preview') {
      setStep('preview');
      setShowPreview(false);
      requestAnimationFrame(() => {
        setTimeout(() => window.print(), 350);
      });
      return;
    }
    window.print();
  }, [step]);

  if (loading && !report) {
    return <div className="page-section active"><div className="page-content"><div className="gads-loading"><div className="gads-spinner" /> Loading report…</div></div></div>;
  }
  if (error || !report) {
    return <div className="page-section active"><div className="page-content"><div className="admin-message error">{error || 'Report not found'}</div><button type="button" className="btn btn-outline" onClick={onBack}>← Back</button></div></div>;
  }

  const monthLabel = report.report_month ? new Date(report.report_month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '';
  const isPublished = report.status === 'published';

  const pd = Object.values(platformData || {});
  const gadsAccs = pd.filter((a) => a.platform === 'google_ads');
  const fbAccs = pd.filter((a) => a.platform === 'facebook');
  const redditAccs = pd.filter((a) => a.platform === 'reddit');
  const tiktokAccs = pd.filter((a) => a.platform === 'tiktok');
  const ga4Accs = pd.filter((a) => a.platform === 'ga4');
  const ghlAccs = pd.filter((a) => a.platform === 'ghl');

  const fmtGhlDur = (sec) => {
    const s = Number(sec) || 0;
    if (!s) return '—';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="page-section active" id="page-monthly-report-editor">
      <div className="page-content" style={{ display: 'flex', gap: 24, minHeight: 600 }}>
        <aside style={{ width: 200, flexShrink: 0, borderRight: '1px solid #eee', paddingRight: 16 }}>
          <button type="button" className="btn btn-outline btn-sm" style={{ marginBottom: 16 }} onClick={onBack}>← Back</button>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {STEPS.map((s) => (
              <button key={s} type="button" className={`btn btn-sm ${step === s ? 'btn-primary' : 'btn-outline'}`} style={{ textAlign: 'left', justifyContent: 'flex-start' }} onClick={() => setStep(s)}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </nav>
          <div style={{ marginTop: 24 }}>
            <button type="button" className="btn btn-outline btn-sm" style={{ width: '100%', marginBottom: 8 }} onClick={() => setShowPreview(true)}>Preview</button>
            <button type="button" className="btn btn-outline btn-sm" style={{ width: '100%', marginBottom: 8 }} onClick={handleExportPdf}>Export PDF</button>
            {isPublished ? (
              <div className="badge badge-green" style={{ width: '100%', textAlign: 'center', padding: '8px 0', display: 'block' }}>Published</div>
            ) : hasPermission('action.publish_report') ? (
              <button type="button" className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={handlePublish}>Publish</button>
            ) : null}
          </div>
        </aside>

        <main style={{ flex: 1, minWidth: 0 }}>
          <div className="page-title-bar" style={{ marginBottom: 24, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ margin: 0 }}>{report.title || 'Monthly Report'}</h2>
              <p style={{ margin: '4px 0 0' }}>{report.clients?.name} — {monthLabel}</p>
            </div>
            {isPublished && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className="badge badge-green">Read-only</span>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowPreview(true)}>Preview</button>
                <button type="button" className="btn btn-outline btn-sm" onClick={handleExportPdf}>Export PDF</button>
              </div>
            )}
          </div>

          {/* ACCOUNTS */}
          {step === 'accounts' && (
            <div className="panel"><div className="panel-body">
              <h3 style={{ margin: '0 0 16px' }}>Select Accounts</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>Choose which platform accounts to include and set display labels.</p>
              {clientAccounts.length === 0 ? <p>No platform accounts found for this client.</p> : (
                <>
                  {clientAccounts.map((a) => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <input type="checkbox" checked={accountSelections[a.id]?.included ?? false}
                        onChange={(e) => setAccountSelections((prev) => ({ ...prev, [a.id]: { ...prev[a.id], included: e.target.checked } }))} disabled={isPublished} />
                      <input type="text" className="form-control" placeholder="Label" value={accountSelections[a.id]?.label ?? ''}
                        onChange={(e) => setAccountSelections((prev) => ({ ...prev, [a.id]: { ...prev[a.id], label: e.target.value } }))} disabled={isPublished} style={{ flex: 1, maxWidth: 300 }} />
                      <span className="admin-platform-badge">{a.platform}</span>
                    </div>
                  ))}
                  <button type="button" className="btn btn-primary" onClick={handleSaveAccounts} disabled={isPublished}>Save Accounts</button>
                </>
              )}
            </div></div>
          )}

          {/* DATA */}
          {step === 'data' && (
            <div>
              {/* Overall KPIs */}
              <div className="panel" style={{ marginBottom: 24 }}><div className="panel-body">
                <h3 style={{ margin: '0 0 16px' }}>Executive Summary</h3>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div className="kpi-card"><span className="kpi-value">{fU(overallKpis?.cost)}</span><span className="kpi-label">Ad Spend</span></div>
                  <div className="kpi-card"><span className="kpi-value">{fI(overallKpis?.clicks)}</span><span className="kpi-label">Clicks</span></div>
                  <div className="kpi-card"><span className="kpi-value">{fI(overallKpis?.impressions)}</span><span className="kpi-label">Impressions</span></div>
                  <div className="kpi-card"><span className="kpi-value">{fU(overallKpis?.cpc)}</span><span className="kpi-label">Avg CPC</span></div>
                  <div className="kpi-card"><span className="kpi-value">{fI(overallKpis?.conversions)}</span><span className="kpi-label">Conversions</span></div>
                  {overallKpis?.sessions > 0 && <div className="kpi-card"><span className="kpi-value">{fI(overallKpis.sessions)}</span><span className="kpi-label">Sessions (GA4)</span></div>}
                </div>
              </div></div>

              {/* Daily spend chart */}
              {pd.some((a) => a.platform !== 'ga4' && a.daily?.length > 0) && (
                <div className="panel" style={{ marginBottom: 24 }}><div className="panel-body">
                  <h4 style={{ margin: '0 0 12px' }}>Daily Ad Spend</h4>
                  <DailySpendChart platformData={platformData} />
                </div></div>
              )}

              {/* Google Ads */}
              {gadsAccs.length > 0 && (
                <div className="panel" style={{ marginBottom: 24 }}><div className="panel-body">
                  <h3 style={{ margin: '0 0 16px', color: '#4285F4' }}>Google Ads</h3>
                  {gadsAccs.map((acc) => (
                    <div key={acc.accountId} style={{ marginBottom: 24 }}>
                      <h4 style={{ marginBottom: 8 }}>{acc.label}</h4>
                      <div className="table-wrapper">
                        <table className="data-table gads-table">
                          <thead><tr><th>Campaign</th><th className="text-right">Spend</th><th className="text-right">Clicks</th><th className="text-right">Impr.</th><th className="text-right">CTR</th><th className="text-right">CPC</th><th className="text-right">Conv.</th></tr></thead>
                          <tbody>
                            {(acc.campaigns || []).map((c, i) => (
                              <tr key={i}><td>{c.campaign_name}</td><td className="text-right">{fU(c.cost)}</td><td className="text-right">{fI(c.clicks)}</td><td className="text-right">{fI(c.impressions)}</td><td className="text-right">{fP(c.ctr)}</td><td className="text-right">{fU(c.cpc)}</td><td className="text-right">{fI(c.conversions)}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {acc.keywords?.length > 0 && (
                        <div style={{ marginTop: 12 }}>
                          <h5>Top Keywords</h5>
                          <table className="data-table gads-table">
                            <thead><tr><th>Keyword</th><th className="text-right">Cost</th><th className="text-right">Clicks</th><th className="text-right">Conv.</th><th className="text-right">CTR</th></tr></thead>
                            <tbody>{acc.keywords.map((kw, i) => <tr key={i}><td>{kw.keyword_text}</td><td className="text-right">{fU(kw.cost)}</td><td className="text-right">{fI(kw.clicks)}</td><td className="text-right">{fI(kw.conversions)}</td><td className="text-right">{fP(kw.ctr)}</td></tr>)}</tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div></div>
              )}

              {/* Facebook */}
              {fbAccs.length > 0 && (
                <div className="panel" style={{ marginBottom: 24 }}><div className="panel-body">
                  <h3 style={{ margin: '0 0 16px', color: '#1877F2' }}>Meta / Facebook Ads</h3>
                  {fbAccs.map((acc) => (
                    <div key={acc.accountId} style={{ marginBottom: 24 }}>
                      <h4 style={{ marginBottom: 8 }}>{acc.label}</h4>
                      <div className="table-wrapper">
                        <table className="data-table gads-table" style={{ fontSize: 12 }}>
                          <thead><tr><th>Campaign</th><th className="text-right">Spend</th><th className="text-right">Impr.</th><th className="text-right">Clicks</th><th className="text-right">CTR</th><th className="text-right">Reach</th><th className="text-right">Purch.</th><th className="text-right">Purch. Value</th><th className="text-right">ROAS</th><th className="text-right">Leads</th></tr></thead>
                          <tbody>
                            {(acc.campaigns || []).map((c, i) => (
                              <tr key={i}><td>{c.campaign_name}</td><td className="text-right">{fU(c.cost)}</td><td className="text-right">{fI(c.impressions)}</td><td className="text-right">{fI(c.clicks)}</td><td className="text-right">{fP(c.ctr)}</td><td className="text-right">{fI(c.reach)}</td><td className="text-right">{fI(c.purchase_count)}</td><td className="text-right">{fU(c.purchase_value)}</td><td className="text-right">{(c.roas || 0).toFixed(2)}x</td><td className="text-right">{fI(c.lead_count)}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div></div>
              )}

              {/* Reddit */}
              {redditAccs.length > 0 && (
                <div className="panel" style={{ marginBottom: 24 }}><div className="panel-body">
                  <h3 style={{ margin: '0 0 16px', color: '#FF4500' }}>Reddit Ads</h3>
                  {redditAccs.map((acc) => (
                    <div key={acc.accountId} style={{ marginBottom: 24 }}>
                      <h4 style={{ marginBottom: 8 }}>{acc.label}</h4>
                      <div className="table-wrapper">
                        <table className="data-table gads-table">
                          <thead><tr><th>Campaign</th><th className="text-right">Spend</th><th className="text-right">Impr.</th><th className="text-right">Clicks</th><th className="text-right">CTR</th><th className="text-right">Reach</th><th className="text-right">Conv.</th><th className="text-right">Purch. Value</th></tr></thead>
                          <tbody>
                            {(acc.campaigns || []).map((c, i) => (
                              <tr key={i}><td>{c.campaign_name}</td><td className="text-right">{fU(c.cost)}</td><td className="text-right">{fI(c.impressions)}</td><td className="text-right">{fI(c.clicks)}</td><td className="text-right">{fP(c.ctr)}</td><td className="text-right">{fI(c.reach)}</td><td className="text-right">{fI(c.conversions)}</td><td className="text-right">{fU(c.purchase_value)}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div></div>
              )}

              {tiktokAccs.length > 0 && (
                <div className="panel" style={{ marginBottom: 24 }}><div className="panel-body">
                  <h3 style={{ margin: '0 0 16px', color: '#010101' }}>TikTok Ads</h3>
                  {tiktokAccs.map((acc) => (
                    <div key={acc.accountId} style={{ marginBottom: 24 }}>
                      <h4 style={{ marginBottom: 8 }}>{acc.label}</h4>
                      <div className="table-wrapper">
                        <table className="data-table gads-table">
                          <thead><tr><th>Campaign</th><th className="text-right">Spend</th><th className="text-right">Impr.</th><th className="text-right">Clicks</th><th className="text-right">CTR</th><th className="text-right">Reach</th><th className="text-right">Conv.</th><th className="text-right">Purch. Value</th></tr></thead>
                          <tbody>
                            {(acc.campaigns || []).map((c, i) => (
                              <tr key={i}><td>{c.campaign_name}</td><td className="text-right">{fU(c.cost)}</td><td className="text-right">{fI(c.impressions)}</td><td className="text-right">{fI(c.clicks)}</td><td className="text-right">{fP(c.ctr)}</td><td className="text-right">{fI(c.reach)}</td><td className="text-right">{fI(c.conversions)}</td><td className="text-right">{fU(c.purchase_value)}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div></div>
              )}

              {/* GA4 */}
              {ga4Accs.length > 0 && (
                <div className="panel" style={{ marginBottom: 24 }}><div className="panel-body">
                  <h3 style={{ margin: '0 0 16px', color: '#E37400' }}>GA4 / Web Analytics</h3>
                  {ga4Accs.map((acc) => {
                    const g = acc.ga4 || {};
                    return (
                      <div key={acc.accountId} style={{ marginBottom: 24 }}>
                        <h4 style={{ marginBottom: 8 }}>{acc.label}</h4>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                          <div className="kpi-card"><span className="kpi-value">{fI(g.totalUsers)}</span><span className="kpi-label">Users</span></div>
                          <div className="kpi-card"><span className="kpi-value">{fI(g.sessions)}</span><span className="kpi-label">Sessions</span></div>
                          <div className="kpi-card"><span className="kpi-value">{fI(g.pageViews)}</span><span className="kpi-label">Pageviews</span></div>
                          <div className="kpi-card"><span className="kpi-value">{fP(g.avgBounce)}</span><span className="kpi-label">Bounce Rate</span></div>
                          <div className="kpi-card"><span className="kpi-value">{fDur(g.avgDuration)}</span><span className="kpi-label">Avg Duration</span></div>
                          <div className="kpi-card"><span className="kpi-value">{fI(g.conversions)}</span><span className="kpi-label">Conversions</span></div>
                        </div>

                        {g.channelBreakdown?.length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <h5>Channel Breakdown</h5>
                            <table className="data-table gads-table" style={{ fontSize: 12 }}>
                              <thead><tr><th>Channel</th><th className="text-right">Users</th><th className="text-right">% Users</th><th className="text-right">Sessions</th><th className="text-right">Pageviews</th><th className="text-right">Bounce Rate</th><th className="text-right">Conv.</th></tr></thead>
                              <tbody>{g.channelBreakdown.map((c, i) => <tr key={i}><td>{c.channel_group}</td><td className="text-right">{fI(c.total_users)}</td><td className="text-right">{fP(c.pct_users)}</td><td className="text-right">{fI(c.sessions)}</td><td className="text-right">{fI(c.page_views)}</td><td className="text-right">{fP(c.bounce_rate)}</td><td className="text-right">{fI(c.conversions)}</td></tr>)}</tbody>
                            </table>
                          </div>
                        )}

                        {g.topPages?.length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <h5>Top Pages</h5>
                            <table className="data-table gads-table" style={{ fontSize: 12 }}>
                              <thead><tr><th>Page Path</th><th>Title</th><th className="text-right">Views</th><th className="text-right">Users</th></tr></thead>
                              <tbody>{g.topPages.map((p, i) => <tr key={i}><td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.page_path}</td><td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.page_title || '—'}</td><td className="text-right">{fI(p.page_views)}</td><td className="text-right">{fI(p.total_users)}</td></tr>)}</tbody>
                            </table>
                          </div>
                        )}

                        {g.topSources?.length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <h5>Traffic Sources</h5>
                            <table className="data-table gads-table" style={{ fontSize: 12 }}>
                              <thead><tr><th>Source / Medium</th><th className="text-right">Users</th><th className="text-right">Sessions</th><th className="text-right">Conv.</th></tr></thead>
                              <tbody>{g.topSources.map((s, i) => <tr key={i}><td>{s.source} / {s.medium}</td><td className="text-right">{fI(s.total_users)}</td><td className="text-right">{fI(s.sessions)}</td><td className="text-right">{fI(s.conversions)}</td></tr>)}</tbody>
                            </table>
                          </div>
                        )}

                        {g.geoBreakdown?.length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <h5>Geographic Breakdown</h5>
                            <table className="data-table gads-table" style={{ fontSize: 12 }}>
                              <thead><tr><th>Country</th><th>Region</th><th>City</th><th className="text-right">Users</th><th className="text-right">Sessions</th><th className="text-right">Conv.</th></tr></thead>
                              <tbody>{g.geoBreakdown.map((r, i) => <tr key={i}><td>{r.country}</td><td>{r.region || '—'}</td><td>{r.city || '—'}</td><td className="text-right">{fI(r.total_users)}</td><td className="text-right">{fI(r.sessions)}</td><td className="text-right">{fI(r.conversions)}</td></tr>)}</tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div></div>
              )}

              {ghlAccs.length > 0 && (
                <div className="panel" style={{ marginBottom: 24 }}><div className="panel-body">
                  <h3 style={{ margin: '0 0 16px', color: '#28A745' }}>GHL leads</h3>
                  {ghlAccs.map((acc) => {
                    const h = acc.ghl || {};
                    return (
                      <div key={acc.accountId} style={{ marginBottom: 24 }}>
                        <h4 style={{ marginBottom: 8 }}>{acc.label}</h4>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                          <div className="kpi-card"><span className="kpi-value">{fI(h.totalCalls)}</span><span className="kpi-label">Calls</span></div>
                          <div className="kpi-card"><span className="kpi-value">{fI(h.totalForms)}</span><span className="kpi-label">Forms</span></div>
                          <div className="kpi-card"><span className="kpi-value">{fI(h.totalChat)}</span><span className="kpi-label">Chat</span></div>
                          <div className="kpi-card"><span className="kpi-value">{fI(h.firstTime)}</span><span className="kpi-label">First-time</span></div>
                          <div className="kpi-card"><span className="kpi-value">{fmtGhlDur(h.totalDuration)}</span><span className="kpi-label">Duration</span></div>
                          <div className="kpi-card"><span className="kpi-value">{fI(h.totalLeads)}</span><span className="kpi-label">Total leads</span></div>
                        </div>
                        {h.attribution?.length > 0 && (
                          <table className="data-table gads-table" style={{ fontSize: 12 }}>
                            <thead><tr><th>Lead type</th><th className="text-right">Count</th></tr></thead>
                            <tbody>{h.attribution.map((row, i) => <tr key={i}><td>{row.type}</td><td className="text-right">{fI(row.count)}</td></tr>)}</tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                </div></div>
              )}
            </div>
          )}

          {/* UPLOADS */}
          {step === 'uploads' && (
            <div className="panel"><div className="panel-body">
              <h3 style={{ margin: '0 0 16px' }}>CSV Uploads</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>Upload GA4, Auction Insights, or custom CSV data.</p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                {['ga4', 'auction_insights', 'custom'].map((t) => (
                  <button key={t} type="button" className="btn btn-outline btn-sm" onClick={async () => { try { await createUpload(t, null, t === 'ga4' ? 'GA4 Data' : t === 'auction_insights' ? 'Auction Insights' : 'Custom Data'); showNotification('Upload slot added'); } catch (e) { showNotification(e?.message || 'Failed', 'error'); } }} disabled={isPublished}>
                    + {t === 'ga4' ? 'GA4' : t === 'auction_insights' ? 'Auction Insights' : 'Custom'}
                  </button>
                ))}
              </div>
              {(uploads || []).map((u) => (
                <div key={u.id} style={{ marginBottom: 24, padding: 16, border: '1px solid #e5e7eb', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
                    <input type="text" className="form-control" placeholder="Table label/title" value={u.label || ''} onChange={(e) => updateUpload(u.id, { label: e.target.value })} disabled={isPublished} style={{ maxWidth: 280 }} />
                    <select className="form-control" value={u.platform_account_id || 'overall'} onChange={(e) => updateUpload(u.id, { platform_account_id: e.target.value === 'overall' ? null : e.target.value })} disabled={isPublished} style={{ maxWidth: 200 }}>
                      <option value="overall">Overall</option>
                      {(accounts || []).map((acc) => <option key={acc.id} value={acc.platform_account_id}>{acc.label || 'Account'}</option>)}
                    </select>
                    {!isPublished && <button type="button" className="btn btn-outline btn-sm" style={{ color: '#dc2626' }} onClick={async () => { try { await deleteUpload(u.id); showNotification('Removed'); } catch (e) { showNotification(e?.message || 'Failed', 'error'); } }}>Remove</button>}
                  </div>
                  <CsvUploader label="" value={Array.isArray(u.data) ? u.data : []} onChange={async (rows) => { try { await saveUpload(u.id, rows); showNotification('CSV saved'); } catch (e) { showNotification(e?.message || 'Failed', 'error'); } }} disabled={isPublished} />
                  {Array.isArray(u.data) && u.data.length > 0 && (
                    <div style={{ marginTop: 12, overflowX: 'auto' }}>
                      <table className="data-table gads-table" style={{ fontSize: 12 }}>
                        <thead><tr>{Object.keys(u.data[0]).map((k) => <th key={k}>{k}</th>)}</tr></thead>
                        <tbody>{u.data.slice(0, 5).map((row, i) => <tr key={i}>{Object.values(row).map((v, j) => <td key={j}>{String(v ?? '')}</td>)}</tr>)}</tbody>
                      </table>
                      {u.data.length > 5 && <p style={{ fontSize: 11, color: '#666', marginTop: 4 }}>… and {u.data.length - 5} more rows</p>}
                    </div>
                  )}
                </div>
              ))}
            </div></div>
          )}

          {/* NOTES */}
          {step === 'notes' && <NotesStep sections={sections} accounts={accounts} saveSections={saveSections} isPublished={isPublished} showNotification={showNotification} />}

          {/* PREVIEW */}
          {step === 'preview' && <ReportPreview report={report} accounts={accounts} sections={sections} uploads={uploads} platformData={platformData} overallKpis={overallKpis} momChanges={momChanges} agency={agency} />}
        </main>
      </div>

      {showPreview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, overflow: 'auto', padding: 24 }} onClick={() => setShowPreview(false)}>
          <div style={{ background: '#fff', maxWidth: 900, margin: '0 auto', padding: 24, borderRadius: 8 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3>Report Preview</h3>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowPreview(false)}>Close</button>
            </div>
            <ReportPreview report={report} accounts={accounts} sections={sections} uploads={uploads} platformData={platformData} overallKpis={overallKpis} momChanges={momChanges} agency={agency} />
          </div>
        </div>
      )}
    </div>
  );
}
