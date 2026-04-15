import React from 'react';

const fU = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fI = (n) => Math.round(Number(n || 0)).toLocaleString('en-US');
const fP = (n) => Number(n || 0).toFixed(2) + '%';
const fDur = (sec) => { if (!sec || isNaN(sec)) return '—'; const m = Math.floor(sec / 60); const s = Math.floor(sec % 60); return `${m}m ${String(s).padStart(2, '0')}s`; };

function MomBadge({ value }) {
  if (value == null || isNaN(value)) return null;
  const cls = value > 0 ? 'rp-mom-up' : value < 0 ? 'rp-mom-down' : 'rp-mom-flat';
  const arrow = value > 0 ? '↑' : value < 0 ? '↓' : '—';
  return <span className={`rp-mom ${cls}`}>{arrow} {Math.abs(value).toFixed(1)}%</span>;
}

function KpiBox({ label, value, mom, accent }) {
  return (
    <div className="rp-kpi-box" style={{ borderTopColor: accent || '#4285F4' }}>
      <div className="rp-kpi-val">{value}</div>
      <div className="rp-kpi-lbl">{label} {mom != null && <MomBadge value={mom} />}</div>
    </div>
  );
}

function DataTable({ columns, rows, maxRows }) {
  const display = maxRows ? rows.slice(0, maxRows) : rows;
  return (
    <table className="rp-table">
      <thead>
        <tr>{columns.map((c, i) => <th key={i} className={c.align === 'r' ? 'text-right' : ''}>{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {display.map((r, i) => (
          <tr key={i}>{columns.map((c, j) => <td key={j} className={c.align === 'r' ? 'text-right' : ''}>{c.fmt ? c.fmt(c.val(r)) : c.val(r)}</td>)}</tr>
        ))}
        {display.length === 0 && <tr><td colSpan={columns.length} style={{ textAlign: 'center', color: '#999' }}>No data</td></tr>}
      </tbody>
    </table>
  );
}

function SectionNotes({ sections, prefix }) {
  const notes = (sections || []).filter((s) => s.section_key?.startsWith(prefix) && s.content);
  if (!notes.length) return null;
  return notes.map((s) => (
    <div key={s.id} className="rp-notes">
      {s.title && <h4>{s.title}</h4>}
      <div className="rp-notes-content">{s.content}</div>
    </div>
  ));
}

export function ReportPreview({ report, accounts, sections, uploads, platformData, overallKpis, momChanges, agency }) {
  const monthLabel = report?.report_month
    ? new Date(report.report_month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';
  const accent = agency?.primary_color || '#4285F4';
  const pd = Object.values(platformData || {});
  const gadsAccs = pd.filter((a) => a.platform === 'google_ads');
  const fbAccs = pd.filter((a) => a.platform === 'facebook');
  const redditAccs = pd.filter((a) => a.platform === 'reddit');
  const ga4Accs = pd.filter((a) => a.platform === 'ga4');
  const ghlAccs = pd.filter((a) => a.platform === 'ghl');

  const fmtGhlDuration = (sec) => {
    const s = Number(sec) || 0;
    if (!s) return '—';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  return (
    <div className="report-preview">
      <style>{`
        .report-preview { background:#fff; padding:48px 40px; max-width:900px; margin:0 auto; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#1a1a2e; font-size:13px; line-height:1.5; }
        .report-preview * { box-sizing:border-box; }
        .rp-cover { text-align:center; padding:60px 0 48px; border-bottom:3px solid ${accent}; margin-bottom:32px; }
        .rp-cover img { max-height:56px; margin-bottom:16px; }
        .rp-cover h1 { font-size:28px; margin:0 0 4px; color:#1a1a2e; }
        .rp-cover .rp-subtitle { font-size:16px; color:#666; margin:0 0 8px; }
        .rp-cover .rp-month { font-size:14px; color:#999; margin:0; }
        .rp-section { page-break-before:auto; margin-top:32px; }
        .rp-section-header { display:flex; align-items:center; gap:10px; margin-bottom:16px; padding-bottom:8px; border-bottom:2px solid ${accent}; }
        .rp-section-header h2 { font-size:18px; margin:0; color:${accent}; }
        .rp-section-icon { width:28px; height:28px; border-radius:6px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:12px; font-weight:700; flex-shrink:0; }
        .rp-kpi-row { display:flex; gap:12px; flex-wrap:wrap; margin:16px 0; }
        .rp-kpi-box { flex:1; min-width:110px; padding:12px 16px; background:#f8f9fa; border-radius:8px; border-top:3px solid #4285F4; }
        .rp-kpi-val { font-size:18px; font-weight:700; color:#1a1a2e; }
        .rp-kpi-lbl { font-size:11px; color:#666; margin-top:2px; }
        .rp-mom { display:inline-block; padding:1px 6px; border-radius:10px; font-size:10px; font-weight:600; margin-left:4px; }
        .rp-mom-up { background:#dcfce7; color:#16a34a; }
        .rp-mom-down { background:#fee2e2; color:#dc2626; }
        .rp-mom-flat { background:#f3f4f6; color:#6b7280; }
        .rp-table { width:100%; border-collapse:collapse; margin:12px 0; font-size:12px; }
        .rp-table th { background:#f1f5f9; font-weight:600; padding:8px 10px; text-align:left; border-bottom:2px solid #e2e8f0; font-size:11px; text-transform:uppercase; letter-spacing:0.3px; color:#475569; }
        .rp-table td { padding:7px 10px; border-bottom:1px solid #f1f5f9; }
        .rp-table tbody tr:nth-child(even) { background:#fafbfc; }
        .rp-table .text-right { text-align:right; }
        .rp-table .rp-total-row td { font-weight:700; border-top:2px solid #e2e8f0; background:#f8fafc; }
        .rp-notes { margin:12px 0; padding:12px 16px; background:#fffbeb; border-left:3px solid #f59e0b; border-radius:0 6px 6px 0; }
        .rp-notes h4 { margin:0 0 4px; font-size:13px; }
        .rp-notes-content { white-space:pre-wrap; line-height:1.6; color:#374151; }
        .rp-footer { margin-top:48px; text-align:center; padding-top:24px; border-top:1px solid #e5e7eb; font-size:11px; color:#9ca3af; }
        .rp-sub-header { font-size:14px; font-weight:600; margin:20px 0 8px; color:#374151; }
        @media print {
          .report-preview { position:relative !important; width:100% !important; box-shadow:none !important; }
          .rp-section { page-break-inside:avoid; }
        }
      `}</style>

      {/* Cover */}
      <div className="rp-cover">
        {report?.clients?.logo_url && <img src={report.clients.logo_url} alt="" style={{ maxHeight: 56, marginBottom: 16 }} />}
        {!report?.clients?.logo_url && agency?.logo_url && <img src={agency.logo_url} alt="" />}
        <h1>{report?.clients?.name || 'Client'}</h1>
        <p className="rp-subtitle">Monthly Performance Report</p>
        <p className="rp-month">{monthLabel}</p>
        {agency?.agency_name && <p style={{ margin: '16px 0 0', fontSize: 12, color: '#999' }}>Prepared by {agency.agency_name}</p>}
      </div>

      {/* Executive Summary */}
      <div className="rp-section">
        <div className="rp-section-header"><h2>Executive Summary</h2></div>
        <div className="rp-kpi-row">
          <KpiBox label="Total Ad Spend" value={fU(overallKpis?.cost)} mom={momChanges?.cost} accent={accent} />
          <KpiBox label="Total Clicks" value={fI(overallKpis?.clicks)} mom={momChanges?.clicks} accent={accent} />
          <KpiBox label="Total Impressions" value={fI(overallKpis?.impressions)} mom={momChanges?.impressions} accent="#6366f1" />
          <KpiBox label="Avg CPC" value={fU(overallKpis?.cpc)} accent="#8b5cf6" />
          <KpiBox label="Total Conversions" value={fI(overallKpis?.conversions)} mom={momChanges?.conversions} accent="#22c55e" />
          {overallKpis?.sessions > 0 && <KpiBox label="Website Sessions" value={fI(overallKpis.sessions)} mom={momChanges?.sessions} accent="#E37400" />}
        </div>
        <SectionNotes sections={sections} prefix="overall_highlights" />
      </div>

      {/* Google Ads */}
      {gadsAccs.length > 0 && (
        <div className="rp-section">
          <div className="rp-section-header">
            <div className="rp-section-icon" style={{ background: '#4285F4' }}>G</div>
            <h2>Google Ads</h2>
          </div>
          {gadsAccs.map((acc) => (
            <div key={acc.accountId}>
              <div className="rp-sub-header">{acc.label}</div>
              <div className="rp-kpi-row">
                <KpiBox label="Spend" value={fU(acc.kpis?.cost)} mom={acc.momChange?.cost} accent="#4285F4" />
                <KpiBox label="Clicks" value={fI(acc.kpis?.clicks)} mom={acc.momChange?.clicks} accent="#34A853" />
                <KpiBox label="Impressions" value={fI(acc.kpis?.impressions)} mom={acc.momChange?.impressions} accent="#FBBC05" />
                <KpiBox label="CTR" value={fP(acc.kpis?.ctr)} accent="#EA4335" />
                <KpiBox label="CPC" value={fU(acc.kpis?.cpc)} accent="#4285F4" />
                <KpiBox label="Conversions" value={fI(acc.kpis?.conversions)} mom={acc.momChange?.conversions} accent="#34A853" />
                <KpiBox label="Cost/Conv" value={fU(acc.kpis?.costPerConv)} accent="#EA4335" />
              </div>
              {acc.campaigns?.length > 0 && (
                <>
                  <div className="rp-sub-header">Campaigns</div>
                  <DataTable columns={[
                    { label: 'Campaign', val: (r) => r.campaign_name },
                    { label: 'Spend', val: (r) => r.cost, fmt: fU, align: 'r' },
                    { label: 'Clicks', val: (r) => r.clicks, fmt: fI, align: 'r' },
                    { label: 'Impr.', val: (r) => r.impressions, fmt: fI, align: 'r' },
                    { label: 'CTR', val: (r) => r.ctr, fmt: fP, align: 'r' },
                    { label: 'CPC', val: (r) => r.cpc, fmt: fU, align: 'r' },
                    { label: 'Conv.', val: (r) => r.conversions, fmt: fI, align: 'r' },
                  ]} rows={acc.campaigns} />
                </>
              )}
              {acc.keywords?.length > 0 && (
                <>
                  <div className="rp-sub-header">Top Keywords</div>
                  <DataTable columns={[
                    { label: 'Keyword', val: (r) => r.keyword_text },
                    { label: 'Cost', val: (r) => r.cost, fmt: fU, align: 'r' },
                    { label: 'Clicks', val: (r) => r.clicks, fmt: fI, align: 'r' },
                    { label: 'Conv.', val: (r) => r.conversions, fmt: fI, align: 'r' },
                    { label: 'CTR', val: (r) => r.ctr, fmt: fP, align: 'r' },
                  ]} rows={acc.keywords} />
                </>
              )}
              <SectionNotes sections={sections} prefix={`account_${acc.accountId}`} />
            </div>
          ))}
        </div>
      )}

      {/* Facebook / Meta */}
      {fbAccs.length > 0 && (
        <div className="rp-section">
          <div className="rp-section-header">
            <div className="rp-section-icon" style={{ background: '#1877F2' }}>f</div>
            <h2>Meta / Facebook Ads</h2>
          </div>
          {fbAccs.map((acc) => (
            <div key={acc.accountId}>
              <div className="rp-sub-header">{acc.label}</div>
              <div className="rp-kpi-row">
                <KpiBox label="Spend" value={fU(acc.kpis?.cost)} mom={acc.momChange?.cost} accent="#1877F2" />
                <KpiBox label="Impressions" value={fI(acc.kpis?.impressions)} mom={acc.momChange?.impressions} accent="#1877F2" />
                <KpiBox label="Reach" value={fI(acc.kpis?.reach)} mom={acc.momChange?.reach} accent="#42b72a" />
                <KpiBox label="Clicks" value={fI(acc.kpis?.clicks)} mom={acc.momChange?.clicks} accent="#1877F2" />
                <KpiBox label="CTR" value={fP(acc.kpis?.ctr)} accent="#1877F2" />
                <KpiBox label="CPC" value={fU(acc.kpis?.cpc)} accent="#1877F2" />
                <KpiBox label="Purchases" value={fI(acc.kpis?.purchase_count)} mom={acc.momChange?.purchase_count} accent="#42b72a" />
                <KpiBox label="Purchase Value" value={fU(acc.kpis?.purchase_value)} mom={acc.momChange?.purchase_value} accent="#42b72a" />
                <KpiBox label="ROAS" value={(acc.kpis?.roas || 0).toFixed(2) + 'x'} accent="#42b72a" />
                <KpiBox label="Leads" value={fI(acc.kpis?.lead_count)} mom={acc.momChange?.lead_count} accent="#1877F2" />
                <KpiBox label="CPL" value={fU(acc.kpis?.cpl)} accent="#1877F2" />
              </div>
              {acc.campaigns?.length > 0 && (
                <DataTable columns={[
                  { label: 'Campaign', val: (r) => r.campaign_name },
                  { label: 'Spend', val: (r) => r.cost, fmt: fU, align: 'r' },
                  { label: 'Impr.', val: (r) => r.impressions, fmt: fI, align: 'r' },
                  { label: 'Clicks', val: (r) => r.clicks, fmt: fI, align: 'r' },
                  { label: 'CTR', val: (r) => r.ctr, fmt: fP, align: 'r' },
                  { label: 'Reach', val: (r) => r.reach, fmt: fI, align: 'r' },
                  { label: 'Purchases', val: (r) => r.purchase_count, fmt: fI, align: 'r' },
                  { label: 'Purch. Value', val: (r) => r.purchase_value, fmt: fU, align: 'r' },
                  { label: 'ROAS', val: (r) => (r.roas || 0).toFixed(2) + 'x', align: 'r' },
                  { label: 'Leads', val: (r) => r.lead_count, fmt: fI, align: 'r' },
                ]} rows={acc.campaigns} />
              )}
              <SectionNotes sections={sections} prefix={`account_${acc.accountId}`} />
            </div>
          ))}
        </div>
      )}

      {/* Reddit */}
      {redditAccs.length > 0 && (
        <div className="rp-section">
          <div className="rp-section-header">
            <div className="rp-section-icon" style={{ background: '#FF4500' }}>R</div>
            <h2>Reddit Ads</h2>
          </div>
          {redditAccs.map((acc) => (
            <div key={acc.accountId}>
              <div className="rp-sub-header">{acc.label}</div>
              <div className="rp-kpi-row">
                <KpiBox label="Spend" value={fU(acc.kpis?.cost)} mom={acc.momChange?.cost} accent="#FF4500" />
                <KpiBox label="Impressions" value={fI(acc.kpis?.impressions)} mom={acc.momChange?.impressions} accent="#FF4500" />
                <KpiBox label="Clicks" value={fI(acc.kpis?.clicks)} mom={acc.momChange?.clicks} accent="#FF4500" />
                <KpiBox label="CTR" value={fP(acc.kpis?.ctr)} accent="#FF4500" />
                <KpiBox label="CPC" value={fU(acc.kpis?.cpc)} accent="#FF4500" />
                <KpiBox label="Reach" value={fI(acc.kpis?.reach)} accent="#FF6231" />
                <KpiBox label="Conversions" value={fI(acc.kpis?.conversions)} mom={acc.momChange?.conversions} accent="#FF6231" />
                <KpiBox label="Purch. Value" value={fU(acc.kpis?.purchase_value)} accent="#FF6231" />
              </div>
              {acc.campaigns?.length > 0 && (
                <DataTable columns={[
                  { label: 'Campaign', val: (r) => r.campaign_name },
                  { label: 'Spend', val: (r) => r.cost, fmt: fU, align: 'r' },
                  { label: 'Impr.', val: (r) => r.impressions, fmt: fI, align: 'r' },
                  { label: 'Clicks', val: (r) => r.clicks, fmt: fI, align: 'r' },
                  { label: 'CTR', val: (r) => r.ctr, fmt: fP, align: 'r' },
                  { label: 'Reach', val: (r) => r.reach, fmt: fI, align: 'r' },
                  { label: 'Conv.', val: (r) => r.conversions, fmt: fI, align: 'r' },
                  { label: 'Purch. Value', val: (r) => r.purchase_value, fmt: fU, align: 'r' },
                ]} rows={acc.campaigns} />
              )}
              <SectionNotes sections={sections} prefix={`account_${acc.accountId}`} />
            </div>
          ))}
        </div>
      )}

      {/* GA4 */}
      {ga4Accs.length > 0 && (
        <div className="rp-section">
          <div className="rp-section-header">
            <div className="rp-section-icon" style={{ background: 'linear-gradient(135deg,#E37400,#F9AB00)' }}>GA</div>
            <h2>Google Analytics (GA4)</h2>
          </div>
          {ga4Accs.map((acc) => {
            const g = acc.ga4 || {};
            return (
              <div key={acc.accountId}>
                <div className="rp-sub-header">{acc.label}</div>
                <div className="rp-kpi-row">
                  <KpiBox label="Total Users" value={fI(g.totalUsers)} mom={acc.momChange?.users} accent="#E37400" />
                  <KpiBox label="Sessions" value={fI(g.sessions)} mom={acc.momChange?.sessions} accent="#F9AB00" />
                  <KpiBox label="Page Views" value={fI(g.pageViews)} mom={acc.momChange?.pageViews} accent="#E37400" />
                  <KpiBox label="Pages/Session" value={(g.pagesPerSession || 0).toFixed(2)} accent="#F9AB00" />
                  <KpiBox label="Avg Duration" value={fDur(g.avgDuration)} accent="#E37400" />
                  <KpiBox label="Bounce Rate" value={fP(g.avgBounce)} accent="#ef4444" />
                  <KpiBox label="Engagement Rate" value={fP(g.avgEngagement)} accent="#22c55e" />
                  <KpiBox label="Conversions" value={fI(g.conversions)} mom={acc.momChange?.conversions} accent="#22c55e" />
                </div>

                {g.channelBreakdown?.length > 0 && (
                  <>
                    <div className="rp-sub-header">Channel Breakdown</div>
                    <DataTable columns={[
                      { label: 'Channel', val: (r) => r.channel_group },
                      { label: 'Users', val: (r) => r.total_users, fmt: fI, align: 'r' },
                      { label: '% of Users', val: (r) => r.pct_users, fmt: fP, align: 'r' },
                      { label: 'Sessions', val: (r) => r.sessions, fmt: fI, align: 'r' },
                      { label: 'Pageviews', val: (r) => r.page_views, fmt: fI, align: 'r' },
                      { label: 'Bounce Rate', val: (r) => r.bounce_rate, fmt: fP, align: 'r' },
                      { label: 'Engage Rate', val: (r) => r.engagement_rate, fmt: fP, align: 'r' },
                      { label: 'Conv.', val: (r) => r.conversions, fmt: fI, align: 'r' },
                    ]} rows={g.channelBreakdown} />
                  </>
                )}

                {g.topPages?.length > 0 && (
                  <>
                    <div className="rp-sub-header">Top Pages</div>
                    <DataTable columns={[
                      { label: 'Page Path', val: (r) => r.page_path },
                      { label: 'Page Title', val: (r) => r.page_title || '—' },
                      { label: 'Views', val: (r) => r.page_views, fmt: fI, align: 'r' },
                      { label: 'Users', val: (r) => r.total_users, fmt: fI, align: 'r' },
                    ]} rows={g.topPages} />
                  </>
                )}

                {g.topSources?.length > 0 && (
                  <>
                    <div className="rp-sub-header">Traffic Sources</div>
                    <DataTable columns={[
                      { label: 'Source / Medium', val: (r) => `${r.source} / ${r.medium}` },
                      { label: 'Users', val: (r) => r.total_users, fmt: fI, align: 'r' },
                      { label: 'Sessions', val: (r) => r.sessions, fmt: fI, align: 'r' },
                      { label: 'Conv.', val: (r) => r.conversions, fmt: fI, align: 'r' },
                    ]} rows={g.topSources} />
                  </>
                )}

                {g.deviceBreakdown?.length > 0 && (
                  <>
                    <div className="rp-sub-header">Device Breakdown</div>
                    <DataTable columns={[
                      { label: 'Device', val: (r) => r.device_category },
                      { label: 'Users', val: (r) => r.total_users, fmt: fI, align: 'r' },
                      { label: 'Sessions', val: (r) => r.sessions, fmt: fI, align: 'r' },
                    ]} rows={g.deviceBreakdown} />
                  </>
                )}

                {g.topEvents?.length > 0 && (
                  <>
                    <div className="rp-sub-header">Key Events</div>
                    <DataTable columns={[
                      { label: 'Event Name', val: (r) => r.event_name },
                      { label: 'Count', val: (r) => r.event_count, fmt: fI, align: 'r' },
                      { label: 'Value', val: (r) => r.event_value, fmt: fI, align: 'r' },
                    ]} rows={g.topEvents} />
                  </>
                )}

                {g.geoBreakdown?.length > 0 && (
                  <>
                    <div className="rp-sub-header">Geographic Breakdown</div>
                    <DataTable columns={[
                      { label: 'Country', val: (r) => r.country },
                      { label: 'Region', val: (r) => r.region || '—' },
                      { label: 'City', val: (r) => r.city || '—' },
                      { label: 'Users', val: (r) => r.total_users, fmt: fI, align: 'r' },
                      { label: 'Sessions', val: (r) => r.sessions, fmt: fI, align: 'r' },
                      { label: 'Conv.', val: (r) => r.conversions, fmt: fI, align: 'r' },
                    ]} rows={g.geoBreakdown} />
                  </>
                )}

                <SectionNotes sections={sections} prefix={`account_${acc.accountId}`} />
              </div>
            );
          })}
        </div>
      )}

      {/* GHL */}
      {ghlAccs.length > 0 && (
        <div className="rp-section">
          <div className="rp-section-header">
            <div className="rp-section-icon" style={{ background: '#28A745' }}>L</div>
            <h2>Lead generation (GHL)</h2>
          </div>
          {ghlAccs.map((acc) => {
            const h = acc.ghl || {};
            return (
              <div key={acc.accountId}>
                <div className="rp-sub-header">{acc.label}</div>
                <div className="rp-kpi-row">
                  <KpiBox label="Total calls" value={fI(h.totalCalls)} mom={acc.momChange?.calls} accent="#28A745" />
                  <KpiBox label="Form submissions" value={fI(h.totalForms)} accent="#28A745" />
                  <KpiBox label="Chat widget" value={fI(h.totalChat)} accent="#16a34a" />
                  <KpiBox label="First-time callers" value={fI(h.firstTime)} accent="#15803d" />
                  <KpiBox label="Call duration" value={fmtGhlDuration(h.totalDuration)} accent="#166534" />
                  <KpiBox label="Total leads" value={fI(h.totalLeads)} mom={acc.momChange?.forms} accent="#14532d" />
                </div>
                {h.attribution?.length > 0 && (
                  <>
                    <div className="rp-sub-header">Attribution (lead type)</div>
                    <DataTable
                      columns={[
                        { label: 'Lead type', val: (r) => r.type },
                        { label: 'Count', val: (r) => r.count, fmt: fI, align: 'r' },
                      ]}
                      rows={h.attribution}
                    />
                  </>
                )}
                <SectionNotes sections={sections} prefix={`account_${acc.accountId}`} />
              </div>
            );
          })}
        </div>
      )}

      {/* CSV uploads */}
      {uploads?.filter((u) => Array.isArray(u.data) && u.data.length > 0).map((u) => (
        <div key={u.id} className="rp-section">
          <div className="rp-sub-header">{u.label || u.upload_type}</div>
          <DataTable
            columns={Object.keys(u.data[0]).map((k) => ({ label: k, val: (r) => r[k] != null ? String(r[k]) : '' }))}
            rows={u.data}
            maxRows={30}
          />
          {u.data.length > 30 && <p style={{ fontSize: 11, color: '#999' }}>… and {u.data.length - 30} more rows</p>}
        </div>
      ))}

      {/* Recommendations */}
      <SectionNotes sections={sections} prefix="overall_recommendations" />

      {/* Footer */}
      <div className="rp-footer">
        <p>{agency?.agency_name || 'Agency'}{agency?.website_url ? ` | ${agency.website_url}` : ''}</p>
        <p>Report generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
      </div>
    </div>
  );
}
