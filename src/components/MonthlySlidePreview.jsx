import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { CsvUploader } from './CsvUploader';
import { useLogoForDarkBackground } from '../utils/loadImageDataUrl';
import {
  parseSectionJson,
  getSectionText,
  DEFAULT_SLIDE2_SERVICES,
  getEnabledSlide2Services,
  normalizeSlide2Services,
  SLIDE2_SERVICE_OPTIONS,
  DEFAULT_SLIDE10_PROGRESS,
  AUCTION_COLUMNS,
  AUCTION_CSV_HEADERS,
  csvToAuctionRows,
  fU,
  fI,
} from '../utils/monthlyReportHelpers';
import '../styles/monthlySlidePreview.css';
import { SEO_SLIDE_DEFINITIONS, renderSeoSlide } from './MonthlySeoSlides';
import { parseGoogleSheetsUrl } from '../utils/googleSheetsEmbed';
import { normalizeAuctionSlideData } from '../utils/auctionInsightsSheet';
import { formatDisplayPeriodLabel } from '../utils/monthlyReportHelpers';

const BASE_SLIDE_DEFINITIONS = [
  { num: 1, title: 'Cover' },
  { num: 2, title: 'What We Are Managing' },
  { num: 3, title: 'Lead Summary' },
  { num: 4, title: 'Section Divider' },
  { num: 5, title: 'Paid Ads Performance' },
  { num: 6, title: 'Performance Overview' },
  { num: 7, title: 'Search Overview' },
  { num: 8, title: 'Top Keywords' },
  { num: 9, title: 'Auction Insights' },
  { num: 10, title: 'Campaign Progress & Next Steps' },
];

const SLIDE_DEFINITIONS = [...BASE_SLIDE_DEFINITIONS, ...SEO_SLIDE_DEFINITIONS];
const SLIDE_COUNT = SLIDE_DEFINITIONS.length;

function EditableText({ value, onChange, className, multiline, disabled, as = 'div' }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    if (as === 'textarea' && ref.current) ref.current.value = value ?? '';
    else if (ref.current && ref.current.innerText !== (value ?? '')) ref.current.innerText = value ?? '';
  }, []);

  useEffect(() => {
    if (disabled) return;
    if (as === 'textarea') {
      if (ref.current && document.activeElement !== ref.current && ref.current.value !== (value ?? '')) {
        ref.current.value = value ?? '';
      }
      return;
    }
    if (ref.current && document.activeElement !== ref.current && ref.current.innerText !== (value ?? '')) {
      ref.current.innerText = value ?? '';
    }
  }, [value, disabled, as]);

  if (as === 'textarea') {
    return (
      <textarea
        ref={ref}
        className={`${className || ''} mr-slide-editable-textarea`.trim()}
        defaultValue={value ?? ''}
        disabled={disabled}
        rows={multiline ? 4 : 2}
        onBlur={(e) => onChange?.(e.target.value)}
      />
    );
  }

  return (
    <div
      ref={ref}
      className={`${className || ''} mr-slide-editable-text`.trim()}
      contentEditable={!disabled}
      suppressContentEditableWarning
      role="textbox"
      onBlur={(e) => onChange?.(e.currentTarget.innerText.replace(/\n/g, ' ').trim())}
      onInput={(e) => onChange?.(e.currentTarget.innerText.replace(/\n/g, ' ').trim())}
      onPaste={(e) => {
        e.preventDefault();
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      }}
    />
  );
}

function Footer({ monthLabel }) {
  return (
    <div className="mr-slide-red-bar mr-slide-red-bar--footer">
      <span className="mr-slide-footer-brand">RED CASTLE SERVICES</span>
      <span className="mr-slide-footer-sep">|</span>
      <span className="mr-slide-footer-title">SEO &amp; DIGITAL MARKETING REPORT</span>
      <span className="mr-slide-footer-sep">|</span>
      <span>{monthLabel}</span>
    </div>
  );
}

function Header({ title, right }) {
  return (
    <div className="mr-slide-red-bar mr-slide-red-bar--header">
      <h4>{title}</h4>
      {right ? <span className="mr-slide-header-right">{right}</span> : null}
    </div>
  );
}

function SubBar({ children }) {
  return <div className="mr-slide-red-bar mr-slide-red-bar--sub">{children}</div>;
}

function NotesBox({ title = 'Notes', children }) {
  return (
    <div className="mr-slide-insight-box">
      <div className="mr-slide-insight-title">{title}</div>
      {children ?? <p className="mr-slide-notes-placeholder">Add notes here…</p>}
    </div>
  );
}

function Slide1({ clientName, monthLabel, agency, coverLogoUrl }) {
  const preparedBy = agency?.agency_name || 'Red Castle Services';
  const website = (agency?.website_url || 'redcastleservices.com').replace(/^https?:\/\//, '');
  const logoSrc = useLogoForDarkBackground(coverLogoUrl || '/rc-logo-rcs.jpg');
  return (
    <div className="mr-slide-inner mr-slide-cover">
      <div className="mr-slide-cover-left">
        <div className="mr-slide-cover-left-inner">
          <div className="mr-slide-cover-brand">RED CASTLE SERVICES</div>
          <div className="mr-slide-cover-rule" />
          <div className="mr-slide-cover-month">{monthLabel}</div>
        </div>
        <div className="mr-slide-cover-monthly">Monthly<br />Report</div>
      </div>
      <div className="mr-slide-cover-right">
        <div className="mr-slide-cover-logo">
          <img src={logoSrc} alt="Red Castle Services" className="mr-slide-cover-logo-img" />
        </div>
        <h2 className="mr-slide-cover-title">SEO &amp; DIGITAL<br />MARKETING<br />UPDATES</h2>
        <p className="mr-slide-cover-client">{clientName}</p>
        <div className="mr-slide-cover-divider" />
        <p className="mr-slide-cover-prepared">Prepared by {preparedBy} | {website}</p>
      </div>
    </div>
  );
}

function Slide2({ services, editable, onChangeService, monthLabel, clientName }) {
  const visible = getEnabledSlide2Services(services);
  return (
    <div className="mr-slide-inner">
      <Header title="What We Are Managing" right={clientName} />
      <div className="mr-slide-main mr-slide-main--services">
        <div className={`mr-slide-service-cards${visible.length >= 4 ? ' mr-slide-service-cards--quad' : ''}`}>
          {visible.map((svc) => (
            <div key={svc.key} className="mr-slide-service-card">
              <span className="mr-slide-service-card-icon">{svc.icon}</span>
              <div className="mr-slide-service-card-text">
                {editable ? (
                  <>
                    <EditableText className="mr-slide-service-card-title" value={svc.title} onChange={(v) => onChangeService?.(svc.key, 'title', v)} />
                    <EditableText className="mr-slide-service-card-body" value={svc.body} onChange={(v) => onChangeService?.(svc.key, 'body', v)} />
                  </>
                ) : (
                  <>
                    <div className="mr-slide-service-card-title">{svc.title}</div>
                    <div className="mr-slide-service-card-body">{svc.body}</div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        <NotesBox />
      </div>
      <Footer monthLabel={monthLabel} />
    </div>
  );
}

function EditableCell({ value, onChange, disabled, className }) {
  if (disabled) return <td className={className}>{value ?? '—'}</td>;
  return (
    <td className={className}>
      <input type="text" className="mr-slide-cell-input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </td>
  );
}

function Slide3({ leadData, comparisonHeader, currentLabel, previousLabel, compareOn, editable, onChangeLead, monthLabel }) {
  const rows = leadData?.rows?.length ? leadData.rows : [{ location: '—', callCurrent: '', formsCurrent: '', chatCurrent: '', callPrevious: '', formsPrevious: '', chatPrevious: '' }];
  const boxes = leadData?.statBoxes || [];

  const updateRow = (idx, field, val) => {
    const next = { ...leadData, rows: [...rows] };
    next.rows[idx] = { ...next.rows[idx], [field]: val };
    onChangeLead?.(next);
  };

  const expectedBoxes = compareOn ? 4 : 2;
  const fallbackBoxes = [
    { value: String(rows.reduce((s, r) => s + Number(r.callCurrent || 0), 0)), label: `Total Call Leads (${currentLabel})` },
    { value: String(rows.reduce((s, r) => s + Number(r.formsCurrent || 0) + Number(r.chatCurrent || 0), 0)), label: `Total Forms and Chat Widgets (${currentLabel})` },
    ...(compareOn ? [
      { value: String(rows.reduce((s, r) => s + Number(r.callPrevious || 0), 0)), label: `Total Calls (${previousLabel})` },
      { value: String(rows.reduce((s, r) => s + Number(r.formsPrevious || 0) + Number(r.chatPrevious || 0), 0)), label: `Total Forms and Chat (${previousLabel})` },
    ] : []),
  ];
  const displayBoxes = boxes.length >= expectedBoxes ? boxes.slice(0, expectedBoxes) : fallbackBoxes;

  return (
    <div className="mr-slide-inner">
      <Header title="Overall Performance Overview – Lead Summary" right={comparisonHeader || (compareOn ? `${currentLabel} Vs ${previousLabel}` : currentLabel)} />
      <div className="mr-slide-main" style={{ padding: '10px 14px' }}>
        <div className="mr-slide-table-wrap mr-slide-table-wrap--lead">
          <table className="mr-slide-table">
            <thead>
              <tr>
                <th>Location</th>
                <th>Call Leads ({currentLabel})</th>
                <th>Contact Forms ({currentLabel})</th>
                <th>Chat Widgets ({currentLabel})</th>
                {compareOn && <th>Call Leads ({previousLabel})</th>}
                {compareOn && <th>Contact Forms ({previousLabel})</th>}
                {compareOn && <th>Chat Widgets ({previousLabel})</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <EditableCell value={r.location} onChange={(v) => updateRow(i, 'location', v)} disabled={!editable} />
                  <EditableCell value={r.callCurrent} onChange={(v) => updateRow(i, 'callCurrent', v)} disabled={!editable} className="num" />
                  <EditableCell value={r.formsCurrent} onChange={(v) => updateRow(i, 'formsCurrent', v)} disabled={!editable} />
                  <EditableCell value={r.chatCurrent} onChange={(v) => updateRow(i, 'chatCurrent', v)} disabled={!editable} />
                  {compareOn && <EditableCell value={r.callPrevious} onChange={(v) => updateRow(i, 'callPrevious', v)} disabled={!editable} />}
                  {compareOn && <EditableCell value={r.formsPrevious} onChange={(v) => updateRow(i, 'formsPrevious', v)} disabled={!editable} />}
                  {compareOn && <EditableCell value={r.chatPrevious} onChange={(v) => updateRow(i, 'chatPrevious', v)} disabled={!editable} />}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <SubBar>Combined Totals</SubBar>
        <div className="mr-slide-kpi-row mr-slide-kpi-row--spaced">
          {displayBoxes.map((box, i) => (
            <div key={i} className="mr-slide-kpi-card">
              <div className="mr-slide-kpi-accent mr-slide-kpi-accent--dark" />
              <div className="mr-slide-kpi-body">
                <div className="mr-slide-kpi-value mr-slide-kpi-value--dark">{box.value}</div>
                <div className="mr-slide-kpi-label">{box.label}</div>
              </div>
            </div>
          ))}
        </div>
        <NotesBox />
      </div>
      <Footer monthLabel={monthLabel} />
    </div>
  );
}

function Slide4({ monthLabel }) {
  return (
    <div className="mr-slide-inner mr-slide-section">
      <div className="mr-slide-section-accent" />
      <h2 className="mr-slide-section-title">Digital Update</h2>
      <div className="mr-slide-section-rule" />
      <p className="mr-slide-section-sub">Paid Ads Performance — {monthLabel}</p>
    </div>
  );
}

function Slide5({ data, compareOn, clientName, monthLabel }) {
  const d = data?.slide5 || {};
  const icons = ['$', '↗', '👥', '📈'];
  const circleClass = ['mr-slide-kpi-icon-circle--blue', 'mr-slide-kpi-icon-circle--green', 'mr-slide-kpi-icon-circle--orange', 'mr-slide-kpi-icon-circle--purple'];
  return (
    <div className="mr-slide-inner">
      <Header title="Paid Ads Performance" right={clientName} />
      <div className="mr-slide-main">
        {compareOn ? <p className="mr-slide-subtitle-muted">{d.comparisonSubtitle}</p> : null}
        <div className="mr-slide-kpi-icons">
          {(d.topStats || []).map((s, i) => (
            <div key={s.label} className="mr-slide-kpi-icon-card">
              <div className={`mr-slide-kpi-icon-circle ${circleClass[i] || ''}`}>{icons[i]}</div>
              <div>
                <div className="mr-slide-kpi-icon-label">{s.label}</div>
                <div className="mr-slide-kpi-icon-value">{s.value}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mr-slide-white-panel">
          <div className="mr-slide-header-with-tabs">
            <div className="mr-slide-white-panel-title">Detailed Cost &amp; Performance Breakdown</div>
            {compareOn ? (
              <div className="mr-slide-tab-pills">
                <span className="mr-slide-tab-pill mr-slide-tab-pill--active">{d.currentLabel}</span>
                <span className="mr-slide-tab-pill">{d.previousLabel}</span>
                <span className="mr-slide-tab-pill">Compare</span>
              </div>
            ) : null}
          </div>
          <div className="mr-slide-table-wrap" style={{ margin: 0 }}>
            <table className="mr-slide-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>{d.currentLabel}</th>
                  {compareOn && <th>{d.previousLabel}</th>}
                  {compareOn && <th>Change</th>}
                </tr>
              </thead>
              <tbody>
                {(d.table || []).map((row) => (
                  <tr key={row.metric}>
                    <td>{row.metric}</td>
                    <td>{row.current}</td>
                    {compareOn && <td>{row.previous}</td>}
                    {compareOn && <td className={row.positive ? 'pos' : 'neg'}>{row.change}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <NotesBox />
      </div>
      <Footer monthLabel={monthLabel} />
    </div>
  );
}

function MetricCard({ panel, titleColor }) {
  const items = [['Users', panel.users], ['Sessions', panel.sessions], ['Views', panel.views], ['Cost', panel.cost], ['Conversions', panel.conversions], ['Cost/Lead', panel.costLead]];
  return (
    <div className="mr-slide-metric-card">
      <div className="mr-slide-metric-card-head">
        <h5 className={titleColor}>{panel.label}</h5>
        <span className="tag">{panel.tag}</span>
      </div>
      <div className="mr-slide-metric-grid">
        {items.map(([label, val]) => (
          <div key={label} className="mr-slide-metric-cell">
            <div className={`v ${titleColor}`}>{val}</div>
            <div className="l">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Slide6({ data, compareOn, clientName, monthLabel }) {
  const d = data?.slide6 || {};
  return (
    <div className="mr-slide-inner">
      <Header title="Performance Overview" right={clientName} />
      <div className="mr-slide-main">
        <div className="mr-slide-metric-cards-row">
          {d.current && <MetricCard panel={d.current} titleColor="red" />}
          {compareOn && d.previous && <MetricCard panel={d.previous} titleColor="" />}
        </div>
        <div className="mr-slide-white-panel mr-slide-white-panel--compact">
          <div className="mr-slide-panel-title-sm">Detailed Performance Metrics</div>
          <div className="mr-slide-table-wrap" style={{ margin: 0 }}>
            <table className="mr-slide-table mr-slide-table--metrics">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>{d.current?.label}</th>
                  {compareOn && <th>{d.previous?.label}</th>}
                  {compareOn && <th>Change</th>}
                </tr>
              </thead>
              <tbody>
                {(d.table || []).map((row) => (
                  <tr key={row.metric}>
                    <td>{row.metric}</td>
                    <td>{row.current}</td>
                    {compareOn && <td>{row.previous}</td>}
                    {compareOn && <td className={`change-cell ${row.positive ? 'pos' : 'neg'}`}>{row.change}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <NotesBox />
      </div>
      <Footer monthLabel={monthLabel} />
    </div>
  );
}

function Slide7({ data, clientName, monthLabel }) {
  const table = data?.slide7?.table || [];
  return (
    <div className="mr-slide-inner">
      <Header title="Search Overview" right={clientName || 'GA4 Analytics'} />
      <div className="mr-slide-main" style={{ padding: '12px 14px' }}>
        <div className="mr-slide-table-wrap" style={{ margin: 0 }}>
          <table className="mr-slide-table">
            <thead>
              <tr>
                <th>Channel Metric</th>
                <th>Overall</th>
                <th>Paid Search</th>
                <th>Organic</th>
                <th>% Paid</th>
                <th>% Organic</th>
              </tr>
            </thead>
            <tbody>
              {table.map((row, i) => (
                <tr key={row.metric} className={i % 2 === 1 ? 'alt' : ''}>
                  <td>{row.metric}</td>
                  <td>{row.overall}</td>
                  <td>{row.paid}</td>
                  <td>{row.organic}</td>
                  <td>{row.paidPct}</td>
                  <td>{row.organicPct}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <NotesBox />
      </div>
      <Footer monthLabel={monthLabel} />
    </div>
  );
}

function Slide8({ data, insights, editable, onChangeInsights, clientName, monthLabel }) {
  const keywords = data?.slide8?.keywords || [];
  return (
    <div className="mr-slide-inner">
      <Header title="Top Keywords" right={clientName || 'Google Ads'} />
      <div className="mr-slide-main" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="mr-slide-table-wrap">
          <table className="mr-slide-table">
            <thead>
              <tr><th>Top Keyword</th><th>Cost</th><th>Conversions</th></tr>
            </thead>
            <tbody>
              {keywords.length ? keywords.map((row) => (
                <tr key={row.keyword_text || row.keyword}>
                  <td>{row.keyword_text || row.keyword}</td>
                  <td className="num">{fU(row.cost)}</td>
                  <td className="num">{fI(row.conversions)}</td>
                </tr>
              )) : (
                <tr><td colSpan={3} style={{ textAlign: 'center', color: '#888' }}>Apply report config to load keywords</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mr-slide-insight-box">
          <div className="mr-slide-insight-title">Keyword Insights</div>
          {editable ? (
            <EditableText as="textarea" className="mr-slide-insight-textarea" value={insights} onChange={onChangeInsights} multiline />
          ) : (
            <ul className="mr-slide-insight-list" style={{ listStyle: 'disc' }}>
              <li>{insights || 'Add keyword insights…'}</li>
            </ul>
          )}
        </div>
      </div>
      <Footer monthLabel={monthLabel} />
    </div>
  );
}

const EMPTY_AUCTION_ROW = Object.fromEntries(AUCTION_COLUMNS.map((c) => [c, '']));

function AuctionTable({ rows, editable, onChangeRows, compact }) {
  const displayRows = rows?.length ? rows : [EMPTY_AUCTION_ROW];
  const updateCell = (ri, col, val) => {
    onChangeRows?.(displayRows.map((r, i) => (i === ri ? { ...r, [col]: val } : r)));
  };

  return (
    <div className={`mr-slide-table-wrap mr-slide-table-wrap--auction${compact ? ' mr-slide-table-wrap--auction-compact' : ''}`}>
      <table className={`mr-slide-table mr-slide-table--auction${compact ? ' mr-slide-table--auction-compact' : ''}`}>
        <thead>
          <tr>
            <th>Domain</th>
            <th>Impression Share</th>
            <th>Overlap Rate</th>
            <th>Position Above Rate</th>
            <th>Top of Page Rate</th>
            <th>Abs. Top of Page Rate</th>
            <th>Outranking Share</th>
            {editable && <th />}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, ri) => (
            <tr key={`${row.domain}-${ri}`} className={String(row.domain || '').toLowerCase() === 'you' ? 'mr-slide-auction-you-row' : ''}>
              {AUCTION_COLUMNS.map((col) => (
                editable ? (
                  <td key={col}>
                    <input className="mr-slide-cell-input" value={row[col] ?? ''} onChange={(e) => updateCell(ri, col, e.target.value)} />
                  </td>
                ) : (
                  <td key={col} className={String(row.domain || '').toLowerCase() === 'you' && col === 'domain' ? 'mr-slide-auction-you-cell' : ''}>{row[col]}</td>
                )
              ))}
              {editable && (
                <td>
                  <button type="button" className="btn btn-outline btn-sm" style={{ fontSize: 9, padding: '1px 4px' }} onClick={() => onChangeRows?.(displayRows.filter((_, i) => i !== ri))}>×</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Slide9({
  auctionData,
  notes,
  editable,
  onChangeAuctionData,
  onChangeNotes,
  monthLabel,
  previousLabel,
  auctionSheetUrl,
  auctionSheetPreviousUrl,
  auctionSheetLoading,
  onAuctionSheetUrl,
  onAuctionSheetPreviousUrl,
  onReloadAuctionSheet,
}) {
  const data = normalizeAuctionSlideData(auctionData);
  const currentLabel = formatDisplayPeriodLabel(data.current.periodLabel, monthLabel);
  const prevLabel = formatDisplayPeriodLabel(data.previous.periodLabel, previousLabel || 'Previous month');
  const parsedCurrent = auctionSheetUrl ? parseGoogleSheetsUrl(auctionSheetUrl) : null;
  const parsedPrevious = auctionSheetPreviousUrl ? parseGoogleSheetsUrl(auctionSheetPreviousUrl) : null;

  const updatePeriodRows = (period, nextRows) => {
    onChangeAuctionData?.({ ...data, [period]: { ...data[period], rows: nextRows } });
  };

  return (
    <div className="mr-slide-inner">
      <Header title={`Google Ads Auction Insights  |  ${monthLabel}`} />
      <div className="mr-slide-main mr-slide-main--auction mr-slide-main--auction-dual">
        {editable && (
          <div className="mr-slide-auction-toolbar">
            <label className="mr-slide-auction-sheet-field">
              <span>Current month sheet (e.g. April)</span>
              <input
                type="url"
                className="form-control"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={auctionSheetUrl || ''}
                onChange={(e) => onAuctionSheetUrl?.(e.target.value.trim())}
              />
            </label>
            <label className="mr-slide-auction-sheet-field">
              <span>Previous month sheet (e.g. March)</span>
              <input
                type="url"
                className="form-control"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={auctionSheetPreviousUrl || ''}
                onChange={(e) => onAuctionSheetPreviousUrl?.(e.target.value.trim())}
              />
            </label>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={auctionSheetLoading}
              onClick={() => onReloadAuctionSheet?.()}
            >
              {auctionSheetLoading ? 'Loading…' : 'Reload from sheets'}
            </button>
            {parsedCurrent?.viewUrl ? (
              <a className="mr-slide-auction-sheet-link" href={parsedCurrent.viewUrl} target="_blank" rel="noreferrer">Open current</a>
            ) : null}
            {parsedPrevious?.viewUrl ? (
              <a className="mr-slide-auction-sheet-link" href={parsedPrevious.viewUrl} target="_blank" rel="noreferrer">Open previous</a>
            ) : null}
            <CsvUploader
              label=""
              value={[]}
              onChange={(csv) => updatePeriodRows('current', csvToAuctionRows(csv))}
              templateHeaders={AUCTION_CSV_HEADERS}
              templateFilename="auction_insights_template.csv"
            />
            <button type="button" className="btn btn-outline btn-sm" onClick={() => updatePeriodRows('current', [...data.current.rows, { ...EMPTY_AUCTION_ROW }])}>+ Row</button>
          </div>
        )}
        <div className="mr-slide-auction-period mr-slide-auction-period--current">
          <div className="mr-seo-period-tag">{currentLabel}</div>
          <AuctionTable
            rows={data.current.rows}
            editable={editable}
            onChangeRows={(rows) => updatePeriodRows('current', rows)}
            compact
          />
        </div>
        <div className="mr-slide-auction-period mr-slide-auction-period--compare">
          <div className="mr-seo-period-tag">{prevLabel}</div>
          <AuctionTable
            rows={data.previous.rows}
            editable={editable}
            onChangeRows={(rows) => updatePeriodRows('previous', rows)}
            compact
          />
        </div>
        <div className="mr-slide-insight-box mr-slide-insight-box--auction">
          <div className="mr-slide-insight-title">Auction Insight</div>
          {editable ? (
            <EditableText as="textarea" className="mr-slide-insight-textarea" value={notes} onChange={onChangeNotes} multiline />
          ) : (
            <ul className="mr-slide-insight-list">
              {(notes || '').split('\n').filter(Boolean).map((t) => <li key={t.slice(0, 40)}>{t}</li>)}
            </ul>
          )}
        </div>
      </div>
      <Footer monthLabel={monthLabel} />
    </div>
  );
}

function Slide10({ progress, editable, onChangeProgress, monthLabel }) {
  const p = progress || DEFAULT_SLIDE10_PROGRESS;
  const fields = ['overview', 'performance', 'metrics'];
  return (
    <div className="mr-slide-inner">
      <Header title="Campaign Progress & Next Steps" />
      <SubBar>Google Ads Performance Overview &amp; Key Priorities</SubBar>
      <div className="mr-slide-main">
        <div className="mr-slide-cols-3">
          {fields.map((key) => (
            <div key={key} className="mr-slide-col-card">
              {editable ? (
                <EditableText as="textarea" value={p[key]} onChange={(v) => onChangeProgress?.({ ...p, [key]: v })} multiline />
              ) : (
                p[key]
              )}
            </div>
          ))}
        </div>
        <div className="mr-slide-goal-box">
          <span className="goal-label">Goal: </span>
          {editable ? (
            <EditableText value={p.goal} onChange={(v) => onChangeProgress?.({ ...p, goal: v })} />
          ) : (
            p.goal
          )}
        </div>
        <NotesBox />
      </div>
      <Footer monthLabel={monthLabel} />
    </div>
  );
}

function renderSlide(num, props) {
  const { clientName, monthLabel, agency, slideData, sections, editable, handlers, seoHandlers, exportMode } = props;
  const compareOn = slideData?.compareOn !== false;
  const common = { monthLabel };
  const services = handlers.slide2 ?? normalizeSlide2Services(parseSectionJson(sections, 'slide2_services', DEFAULT_SLIDE2_SERVICES));
  const leadData = handlers.slide3 ?? parseSectionJson(sections, 'slide3_leads', slideData?.slide3Prefill || { rows: [], statBoxes: [] });
  const insights = handlers.slide8 ?? getSectionText(sections, 'slide8_insights', '');
  const auctionData = handlers.slide9data ?? parseSectionJson(sections, 'slide9_auction_data', []);
  const auctionNotes = handlers.slide9notes ?? getSectionText(sections, 'slide9_auction_notes', '');
  const progress = handlers.slide10 ?? parseSectionJson(sections, 'slide10_progress', DEFAULT_SLIDE10_PROGRESS);

  if (num >= 11) {
    return renderSeoSlide(num, {
      clientName,
      monthLabel,
      agency,
      slideData,
      seoHandlers,
      editable,
      compareOn,
      compareSections: slideData?.compareSections,
      exportMode,
    });
  }

  switch (num) {
    case 1: return <Slide1 clientName={clientName} monthLabel={monthLabel} agency={agency} coverLogoUrl={agency?.logo_url || '/rc-logo-rcs.jpg'} />;
    case 2: return <Slide2 services={services} editable={editable} onChangeService={handlers.onSlide2} clientName={clientName} {...common} />;
    case 3: return (
      <Slide3
        leadData={leadData}
        comparisonHeader={slideData?.comparisonHeader}
        currentLabel={slideData?.currentLabel || monthLabel}
        previousLabel={slideData?.previousLabel || ''}
        compareOn={compareOn}
        editable={editable}
        onChangeLead={handlers.onSlide3}
        {...common}
      />
    );
    case 4: return <Slide4 monthLabel={monthLabel} />;
    case 5: return <Slide5 data={slideData} compareOn={compareOn} clientName={clientName} monthLabel={monthLabel} />;
    case 6: return <Slide6 data={slideData} compareOn={compareOn} clientName={clientName} monthLabel={monthLabel} />;
    case 7: return <Slide7 data={slideData} clientName={clientName} monthLabel={monthLabel} />;
    case 8: return <Slide8 data={slideData} insights={insights} editable={editable} onChangeInsights={handlers.onSlide8} clientName={clientName} monthLabel={monthLabel} />;
    case 9: return (
      <Slide9
        auctionData={auctionData}
        notes={auctionNotes}
        editable={editable}
        onChangeAuctionData={handlers.onSlide9data}
        onChangeNotes={handlers.onSlide9notes}
        auctionSheetUrl={handlers.auctionSheetUrl}
        auctionSheetPreviousUrl={handlers.auctionSheetPreviousUrl}
        auctionSheetLoading={handlers.auctionSheetLoading}
        onAuctionSheetUrl={handlers.onAuctionSheetUrl}
        onAuctionSheetPreviousUrl={handlers.onAuctionSheetPreviousUrl}
        onReloadAuctionSheet={handlers.onReloadAuctionSheet}
        monthLabel={monthLabel}
        previousLabel={slideData?.previousLabel || ''}
      />
    );
    case 10: return <Slide10 progress={progress} editable={editable} onChangeProgress={handlers.onSlide10} monthLabel={monthLabel} />;
    default: return null;
  }
}

export function MonthlySlidePreview({
  slideNum,
  index = 0,
  exportMode = false,
  clientName,
  monthLabel,
  agency,
  slideData,
  sections,
  editable = false,
  handlers = {},
  seoHandlers = {},
}) {
  return (
    <div
      className={`mr-slide-card${exportMode ? ' mr-slide-card--export' : ''}`}
      style={exportMode ? undefined : { animationDelay: `${index * 80}ms` }}
      data-slide-num={slideNum}
    >
      {!exportMode && <span className="mr-slide-badge">Slide {slideNum} / {SLIDE_COUNT}</span>}
      {renderSlide(slideNum, { clientName, monthLabel, agency, slideData, sections, editable, handlers, seoHandlers, exportMode })}
    </div>
  );
}

export function MonthlySlideGrid({
  clientName,
  monthLabel,
  agency,
  slideData,
  sections,
  editable = false,
  handlers = {},
  seoHandlers = {},
  exportMode = false,
  slidesOnly = false,
}) {
  const grid = (
    <div className="mr-slide-preview-grid">
      {SLIDE_DEFINITIONS.map((slide, index) => (
        <MonthlySlidePreview
          key={slide.num}
          slideNum={slide.num}
          index={index}
          exportMode={exportMode}
          clientName={clientName}
          monthLabel={monthLabel}
          agency={agency}
          slideData={slideData}
          sections={sections}
          editable={editable}
          handlers={handlers}
          seoHandlers={seoHandlers}
        />
      ))}
    </div>
  );

  if (slidesOnly) return grid;

  return (
    <section className="mr-slide-preview-section">
      <div className="mr-slide-preview-header">
        <h3>{clientName} — {monthLabel} Slide Report</h3>
        <p>Red Castle branded slides with live Supabase data</p>
      </div>
      {grid}
    </section>
  );
}

export { SLIDE_DEFINITIONS, SLIDE_COUNT };
