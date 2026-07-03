import React, { useEffect, useState } from 'react';
import { CsvUploader } from './CsvUploader';
import {
  DEFAULT_SEO_EXECUTIVE_SECTIONS,
  DEFAULT_SEO_WEBDEV_ITEMS,
  DEFAULT_SEO_NEXT_STEPS,
  DEFAULT_BACKLINKS_SUMMARY,
  DEFAULT_KEYWORD_TRACKER,
  DEFAULT_KEYWORD_SCREENSHOT,
  DEFAULT_BLOG_UPDATES,
  isSectionCompareOn,
  BACKLINKS_CSV_HEADERS,
  BACKLINKS_ANCHOR_CSV_HEADERS,
  csvToBacklinkStats,
  csvToBacklinkAnchors,
} from '../utils/monthlyReportHelpers';
import {
  fetchGoogleSheetCsvTable,
  isDirectImageUrl,
  parseGoogleSheetsUrl,
  resolveKeywordSheetUrl,
} from '../utils/googleSheetsEmbed';

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

const KEYWORD_INSIGHT_THEMES = [
  { colorClass: 'is-green', pptxColor: '15803D' },
  { colorClass: 'is-orange', pptxColor: 'B45309' },
  { colorClass: 'is-blue', pptxColor: '2563EB' },
  { colorClass: 'is-purple', pptxColor: '7C3AED' },
];

function ExecSummaryMetric({ box, showCompare = true }) {
  const hasCompare = showCompare && box?.previousValue != null && box?.comparePct != null;
  return (
    <div className="mr-slide-exec-metric">
      <div className="mr-slide-exec-metric-label">{box.label}</div>
      <div className="mr-slide-exec-metric-value">{box.value}</div>
      {box.detail ? <div className="mr-slide-exec-metric-detail">{box.detail}</div> : null}
      {hasCompare ? (
        <div className={`mr-slide-exec-metric-compare ${box.compareGood ? 'is-good' : 'is-bad'}`}>
          <span className="kpi-prev">vs {box.previousValue}</span>
          <span className="kpi-compare-arrow">{box.compareUp ? '▲' : '▼'}</span>
          <span className="kpi-compare-pct">{Math.abs(box.comparePct).toFixed(1)}%</span>
        </div>
      ) : box.sub ? (
        <div className="mr-slide-exec-metric-sub">{box.sub}</div>
      ) : null}
    </div>
  );
}

function ExecSummaryPlatformCard({ title, statBoxes, showCompare }) {
  return (
    <div className="mr-slide-exec-card">
      <div className="mr-slide-exec-card-head">{title}</div>
      <div className="mr-slide-exec-card-body">
        {(statBoxes || []).slice(0, 4).map((box, i) => (
          <ExecSummaryMetric key={i} box={box} showCompare={showCompare} />
        ))}
      </div>
    </div>
  );
}

function SeoCompareKpiCard({ box, className = '', showCompare = true }) {
  const hasCompare = showCompare && box?.previousValue != null && box?.comparePct != null;
  return (
    <div className={`mr-slide-kpi-card mr-slide-kpi-card--compare ${className}`.trim()}>
      <div className="mr-slide-kpi-label mr-slide-kpi-label--compare">{box.label}</div>
      <div className="mr-slide-kpi-value mr-slide-kpi-value--compare">{box.value}</div>
      {hasCompare ? (
        <div className={`kpi-compare ${box.compareGood ? 'kpi-compare-good' : 'kpi-compare-bad'}`}>
          <span className="kpi-prev">vs {box.previousValue}</span>
          <span className="kpi-compare-arrow">{box.compareUp ? '▲' : '▼'}</span>
          <span className="kpi-compare-pct">{Math.abs(box.comparePct).toFixed(1)}%</span>
        </div>
      ) : box.sub ? (
        <div className="mr-slide-kpi-sub">{box.sub}</div>
      ) : null}
    </div>
  );
}

function NotesBox({ title = 'Notes', children, green = true, compact = false }) {
  return (
    <div className={`mr-slide-insight-box${green ? '' : ' mr-slide-insight-box--neutral'}${compact ? ' mr-slide-insight-box--compact' : ''}`}>
      <div className="mr-slide-insight-title">{title}</div>
      {children ?? <p className="mr-slide-notes-placeholder">Add notes here…</p>}
    </div>
  );
}

function formatGbpNotesText(notes) {
  if (typeof notes === 'string') return notes;
  if (!notes || typeof notes !== 'object') return '';
  const n = notes;
  return [n.summary, n.calls, n.directions, n.website].filter(Boolean).join(' ');
}

function EditableText({ value, onChange, className, multiline, disabled, as = 'div' }) {
  if (as === 'textarea') {
    return (
      <textarea
        className={`${className || ''} mr-slide-editable-textarea`.trim()}
        value={value ?? ''}
        disabled={disabled}
        rows={multiline ? 3 : 2}
        onChange={(e) => onChange?.(e.target.value)}
      />
    );
  }
  return (
    <div
      className={`${className || ''} mr-slide-editable-text`.trim()}
      contentEditable={!disabled}
      suppressContentEditableWarning
      role="textbox"
      onBlur={(e) => onChange?.(e.currentTarget.innerText.replace(/\n/g, ' ').trim())}
    >
      {value ?? ''}
    </div>
  );
}

function SectionDivider({ title, subtitle }) {
  return (
    <div className="mr-slide-inner mr-slide-section">
      <div className="mr-slide-section-accent" />
      <h2 className="mr-slide-section-title mr-slide-section-title--seo">{title}</h2>
      <div className="mr-slide-section-rule" />
      <p className="mr-slide-section-sub mr-slide-section-sub--seo">{subtitle}</p>
    </div>
  );
}

function PeriodBlock({ label, children, className }) {
  if (!children) return null;
  return (
    <div className={`mr-seo-period-block${className ? ` ${className}` : ''}`}>
      {label ? <h5 className="mr-seo-period-tag">{label}</h5> : null}
      {children}
    </div>
  );
}

export function Slide14AllChannelsCombined({ data, clientName, monthLabel, compareOn, showCompare }) {
  const d = data || {};
  const cmp = showCompare ?? compareOn;
  const renderBlock = (block) => {
    const t = block?.totalsLine || {};
    return (
      <>
        <TotalsLine parts={[['Users', t.users], ['New Users', t.newUsers], ['Engaged', t.engaged], ['Bounce', t.bounceRate], ['Views', t.views], ['Engagement', t.engagement]]} />
        <div className="mr-slide-table-wrap mr-slide-table-wrap--compact mr-slide-table-wrap--seo-dual mr-slide-table-wrap--fit">
          <table className="mr-slide-table mr-slide-table--compact mr-slide-table--seo-fit">
            <thead>
              <tr><th>Channel</th><th>Users</th><th>New</th><th>Eng.</th><th>Bounce</th><th>Views</th><th>Eng.</th></tr>
            </thead>
            <tbody>
              {(block?.table || []).map((row) => (
                <tr key={`${block.periodLabel}-${row.channel}`}>
                  <td className="mr-slide-cell-truncate">{row.channel}</td>
                  <td>{row.users}</td><td>{row.newUsers}</td><td>{row.engaged}</td>
                  <td>{row.bounceRate}</td><td>{row.views}</td><td>{row.engagement}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {block?.note ? <p className="mr-seo-period-note">{block.note}</p> : null}
      </>
    );
  };
  const title = cmp && d.previous?.periodLabel
    ? `GA4 — All Channels | ${d.previous.periodLabel} vs ${d.current?.periodLabel || ''}`
    : `GA4 — All Channels | ${d.current?.periodLabel || ''}`;
  return (
    <div className="mr-slide-inner">
      <Header title={title} right={clientName} />
      <div className="mr-slide-main mr-slide-main--seo-dual">
        <PeriodBlock label={cmp ? d.current?.periodLabel : null} className="mr-seo-period-block--current">
          {renderBlock(d.current)}
        </PeriodBlock>
        {cmp && d.previous?.table?.length ? (
          <PeriodBlock label={d.previous.periodLabel} className="mr-seo-period-block--compare">
            {renderBlock(d.previous)}
          </PeriodBlock>
        ) : null}
      </div>
      <Footer monthLabel={monthLabel} />
    </div>
  );
}

export function SlideLandingPagesCombined({ data, clientName, monthLabel, compareOn, showCompare }) {
  const d = data || {};
  const cmp = showCompare ?? compareOn;
  const renderBlock = (block) => {
    const t = block?.totalsLine || {};
    return (
      <>
        <TotalsLine parts={[['Sessions', t.sessions], ['Active Users', t.activeUsers], ['New Users', t.newUsers], ['Avg Engagement', t.avgEngagement]]} />
        <div className="mr-slide-table-wrap mr-slide-table-wrap--compact mr-slide-table-wrap--seo-dual mr-slide-table-wrap--fit">
          <table className="mr-slide-table mr-slide-table--compact mr-slide-table--seo-fit">
            <thead>
              <tr><th>Landing Page</th><th>Sess.</th><th>Active</th><th>New</th><th>Avg</th></tr>
            </thead>
            <tbody>
              {(block?.table || []).map((row, i) => (
                <tr key={`${block.periodLabel}-${i}`}>
                  <td className="mr-slide-cell-truncate" title={row.page}>{row.page}</td>
                  <td>{row.sessions}</td><td>{row.activeUsers}</td><td>{row.newUsers}</td><td>{row.avgEngagement}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  };
  return (
    <div className="mr-slide-inner">
      <Header title="GA4 — Top Landing Pages" right={clientName} />
      <div className="mr-slide-main mr-slide-main--seo-dual">
        <PeriodBlock label={cmp ? d.current?.periodLabel : null} className="mr-seo-period-block--current">
          {renderBlock(d.current)}
        </PeriodBlock>
        {cmp && d.previous?.table?.length ? (
          <PeriodBlock label={d.previous.periodLabel} className="mr-seo-period-block--compare">
            {renderBlock(d.previous)}
          </PeriodBlock>
        ) : null}
      </div>
      <Footer monthLabel={monthLabel} />
    </div>
  );
}

export function SlideTopCitiesCombined({ data, clientName, monthLabel, compareOn, showCompare }) {
  const d = data || {};
  const cmp = showCompare ?? compareOn;
  const renderBlock = (block) => {
    return (
      <>
        <div className="mr-slide-table-wrap mr-slide-table-wrap--compact mr-slide-table-wrap--seo-dual mr-slide-table-wrap--fit">
          <table className="mr-slide-table mr-slide-table--compact mr-slide-table--seo-fit">
            <thead>
              <tr><th>City</th><th>Views</th></tr>
            </thead>
            <tbody>
              {(block?.table || []).map((row, i) => (
                <tr key={`${block.periodLabel}-${i}`}>
                  <td className="mr-slide-cell-truncate">{row.city}</td>
                  <td>{row.views}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  };
  return (
    <div className="mr-slide-inner">
      <Header title="GA4 — Top Cities" right={clientName} />
      <div className="mr-slide-main mr-slide-main--seo-dual">
        <PeriodBlock label={cmp ? d.current?.periodLabel : null} className="mr-seo-period-block--current">
          {renderBlock(d.current)}
        </PeriodBlock>
        {cmp && d.previous?.table?.length ? (
          <PeriodBlock label={d.previous.periodLabel} className="mr-seo-period-block--compare">
            {renderBlock(d.previous)}
          </PeriodBlock>
        ) : null}
      </div>
      <Footer monthLabel={monthLabel} />
    </div>
  );
}

function TotalsLine({ parts }) {
  const items = (parts || []).filter(([, v]) => v != null && v !== '');
  if (!items.length) return null;
  return (
    <p className="mr-slide-totals-line">
      <strong>TOTAL</strong>
      {' | '}
      {items.map(([k, v], i) => (
        <span key={k}>{i ? '  |  ' : ''}{k}: {v}</span>
      ))}
    </p>
  );
}

export const SEO_SLIDE_DEFINITIONS = [
  { num: 11, title: 'SEO Executive Summary' },
  { num: 12, title: 'GA4 Section Divider' },
  { num: 13, title: 'GA4 Organic Channel' },
  { num: 14, title: 'GA4 All Channels' },
  { num: 15, title: 'GA4 Top Landing Pages' },
  { num: 16, title: 'GA4 Top Cities' },
  { num: 17, title: 'GSC Section Divider' },
  { num: 18, title: 'Google Search Console Summary' },
  { num: 19, title: 'Top 20 Search Queries' },
  { num: 20, title: 'GBP Section Divider' },
  { num: 21, title: 'Google Business Profile' },
  { num: 22, title: 'Keyword Tracker' },
  { num: 23, title: 'Keyword Rankings Table' },
  { num: 24, title: 'Web Dev Section Divider' },
  { num: 25, title: 'Web Development Updates' },
  { num: 26, title: 'SEO Next Steps Divider' },
  { num: 27, title: 'Next Steps & Commitment' },
  { num: 28, title: 'Backlinks Summary' },
  { num: 29, title: 'Blog Content Divider' },
  { num: 30, title: 'Blog Update 1' },
  { num: 31, title: 'Blog Update 2' },
  { num: 32, title: 'Thank You' },
];

export function Slide11SeoExecutive({ data, sections, editable, onChangeSections, clientName, monthLabel, periodLabel, showCompare }) {
  const s = { ...DEFAULT_SEO_EXECUTIVE_SECTIONS, ...(data?.sections || {}), ...(sections || {}) };
  const platformSections = [
    {
      key: 'websiteAnalytics',
      title: data?.ga4?.title || 'Google Analytics 4',
      statBoxes: data?.ga4?.statBoxes || [],
    },
    {
      key: 'googleSearchConsole',
      title: data?.gsc?.title || 'Google Search Console',
      statBoxes: data?.gsc?.statBoxes || [],
    },
    {
      key: 'gbpPerformance',
      title: data?.gbp?.title || 'Google Business Profile',
      statBoxes: data?.gbp?.statBoxes || [],
    },
  ];

  return (
    <div className="mr-slide-inner mr-slide-inner--exec">
      <Header title="Executive Summary" right={`${clientName} | ${monthLabel}`} />
      <div className="mr-slide-main mr-slide-main--seo-exec">
        <div className="mr-slide-seo-exec-platforms">
          {platformSections.map(({ key, title, statBoxes }) => (
            <ExecSummaryPlatformCard
              key={key}
              title={title}
              statBoxes={statBoxes}
              showCompare={showCompare}
            />
          ))}
        </div>
        <NotesBox compact>
          {editable ? (
            <EditableText as="textarea" value={s.notes} onChange={(v) => onChangeSections?.({ ...s, notes: v })} multiline />
          ) : s.notes ? (
            <p>{s.notes}</p>
          ) : null}
        </NotesBox>
      </div>
      <Footer monthLabel={monthLabel} />
    </div>
  );
}

export function Slide12Ga4Divider({ clientName, periodLabel }) {
  return <SectionDivider title="Google Analytics 4 Performance" subtitle={`${clientName} | ${periodLabel}`} />;
}

export function Slide13OrganicChannel({ data, clientName, monthLabel, compareOn, currentLabel, previousLabel, showCompare }) {
  const d = data || {};
  const cmp = showCompare ?? compareOn;
  return (
    <div className="mr-slide-inner">
      <Header title={`GA4 — Organic Channel${cmp ? ` | ${currentLabel} vs ${previousLabel}` : ''}`} right={clientName} />
      <div className="mr-slide-main">
        <div className="mr-slide-kpi-row mr-slide-kpi-row--spaced">
          {(d.statBoxes || []).map((box, i) => (
            <SeoCompareKpiCard key={i} box={box} showCompare={cmp} />
          ))}
        </div>
        <div className="mr-slide-table-wrap">
          <table className="mr-slide-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>{currentLabel}</th>
                {cmp && <th>{previousLabel}</th>}
                {cmp && <th>Change</th>}
              </tr>
            </thead>
            <tbody>
              {(d.table || []).map((row) => (
                <tr key={row.metric}>
                  <td>{row.metric}</td>
                  <td>{row.current}</td>
                  {cmp && <td>{row.previous}</td>}
                  {cmp && <td className={row.positive ? 'pos' : 'neg'}>{row.change}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {d.insight ? <p className="mr-slide-gsc-insight-line">{d.insight}</p> : null}
        <NotesBox compact />
      </div>
      <Footer monthLabel={monthLabel} />
    </div>
  );
}

export function Slide14AllChannels({ data, clientName, monthLabel, isComparison }) {
  const d = data || {};
  const t = d.totalsLine || {};
  return (
    <div className="mr-slide-inner">
      <Header title={`GA4 — All Channels | ${d.periodLabel || ''}`} right={clientName} />
      <div className="mr-slide-main">
        <TotalsLine parts={[['Users', t.users], ['New Users', t.newUsers], ['Engaged', t.engaged], ['Bounce', t.bounceRate], ['Views', t.views], ['Engagement', t.engagement]]} />
        <div className="mr-slide-table-wrap mr-slide-table-wrap--compact">
          <table className="mr-slide-table mr-slide-table--compact">
            <thead>
              <tr><th>Channel</th><th>Users</th><th>New Users</th><th>Eng. Sessions</th><th>Bounce</th><th>Views</th><th>Engagement</th></tr>
            </thead>
            <tbody>
              {(d.table || []).map((row) => (
                <tr key={row.channel}><td>{row.channel}</td><td>{row.users}</td><td>{row.newUsers}</td><td>{row.engaged}</td><td>{row.bounceRate}</td><td>{row.views}</td><td>{row.engagement}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {(d.observation || d.insight) ? <p className="mr-slide-gsc-insight-line">{d.observation || d.insight}</p> : null}
        <NotesBox compact />
      </div>
      <Footer monthLabel={monthLabel} />
    </div>
  );
}

export function Slide16OrganicDetail({ data, clientName, monthLabel, compareOn, currentLabel, previousLabel }) {
  const d = data || {};
  return (
    <div className="mr-slide-inner">
      <Header title={`GA4 — Organic Search Detail${compareOn ? ` | ${previousLabel} vs ${currentLabel}` : ''}`} right={clientName} />
      <div className="mr-slide-main">
        <div className="mr-slide-kpi-row mr-slide-kpi-row--wrap">
          {(d.statBoxes || []).map((box, i) => (
            <div key={i} className="mr-slide-kpi-card mr-slide-kpi-card--sm">
              <div className="mr-slide-kpi-value">{box.value}</div>
              <div className="mr-slide-kpi-label">{box.label}</div>
            </div>
          ))}
        </div>
        <div className="mr-slide-table-wrap">
          <table className="mr-slide-table mr-slide-table--compact">
            <thead>
              <tr><th>Source</th><th>Users</th><th>New Users</th><th>Sessions</th><th>Views</th><th>Bounce</th><th>Engagement</th></tr>
            </thead>
            <tbody>
              {(d.breakdownTable || []).map((row) => (
                <tr key={row.source}>
                  <td>{row.source}</td><td>{row.users}</td><td>{row.newUsers}</td><td>{row.sessions}</td><td>{row.views}</td><td>{row.bounceRate}</td><td>{row.engagement}</td>
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

export function SlideLandingPages({ data, clientName, monthLabel, titleSuffix }) {
  const d = data || {};
  const t = d.totalsLine || {};
  return (
    <div className="mr-slide-inner">
      <Header title={`GA4 — Top Landing Pages | ${d.periodLabel || titleSuffix || ''}`} right={clientName} />
      <div className="mr-slide-main">
        <TotalsLine parts={[['Sessions', t.sessions], ['Active Users', t.activeUsers], ['New Users', t.newUsers], ['Avg Engagement', t.avgEngagement]]} />
        <div className="mr-slide-table-wrap mr-slide-table-wrap--compact">
          <table className="mr-slide-table mr-slide-table--compact">
            <thead>
              <tr><th>Landing Page</th><th>Sessions</th><th>Active Users</th><th>New Users</th><th>Avg Engagement</th></tr>
            </thead>
            <tbody>
              {(d.table || []).map((row, i) => (
                <tr key={`${row.page}-${i}`}><td className="mr-slide-cell-truncate">{row.page}</td><td>{row.sessions}</td><td>{row.activeUsers}</td><td>{row.newUsers}</td><td>{row.avgEngagement}</td></tr>
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

export function SlideTopCities({ data, clientName, monthLabel }) {
  const d = data || {};
  const t = d.totalsLine || {};
  return (
    <div className="mr-slide-inner">
      <Header title={`GA4 — Top Cities | ${d.periodLabel || ''}`} right={clientName} />
      <div className="mr-slide-main">
        <TotalsLine parts={[['Views', t.views], ['Sessions', t.sessions], ['Engaged', t.engaged], ['Users', t.users], ['Bounce', t.bounceRate]]} />
        <div className="mr-slide-table-wrap mr-slide-table-wrap--compact">
          <table className="mr-slide-table mr-slide-table--compact">
            <thead>
              <tr><th>City</th><th>Views</th><th>Sessions</th><th>Eng. Sessions</th><th>Users</th><th>Engagement</th><th>Bounce</th></tr>
            </thead>
            <tbody>
              {(d.table || []).map((row, i) => (
                <tr key={`${row.city}-${i}`}><td>{row.city}</td><td>{row.views}</td><td>{row.sessions}</td><td>{row.engaged}</td><td>{row.users}</td><td>{row.engagement}</td><td>{row.bounceRate}</td></tr>
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

export function Slide21GscDivider({ clientName, periodLabel }) {
  return <SectionDivider title="Google Search Console & Rankings" subtitle={`${clientName} | ${periodLabel}`} />;
}

export function Slide22GscSummary({ data, clientName, monthLabel, compareOn, currentLabel, previousLabel, editable, onChangeNotes, showCompare }) {
  const d = data || {};
  const notes = d.notes ?? '';
  const cmp = showCompare ?? compareOn;
  return (
    <div className="mr-slide-inner">
      <Header title={`Google Search Console — Summary${cmp ? ` | ${currentLabel} vs ${previousLabel}` : ''}`} right={clientName} />
      <div className="mr-slide-main mr-slide-main--gsc">
        <div className="mr-slide-kpi-row mr-slide-kpi-row--spaced">
          {(d.statBoxes || []).map((box, i) => (
            <SeoCompareKpiCard key={i} box={box} showCompare={cmp} />
          ))}
        </div>
        {d.insight ? <p className="mr-slide-gsc-insight-line">{d.insight}</p> : null}
        <div className="mr-slide-gsc-dual-tables mr-slide-gsc-dual-tables--triple">
          <div className="mr-slide-gsc-table-block">
            <h5 className="mr-seo-period-tag">Top Queries</h5>
            <div className="mr-slide-table-wrap mr-slide-table-wrap--compact">
              <table className="mr-slide-table mr-slide-table--compact">
                <thead>
                  <tr><th>Query</th><th>{currentLabel}</th>{cmp && <th>{previousLabel}</th>}{cmp && <th>Δ</th>}</tr>
                </thead>
                <tbody>
                  {(d.queriesTable || []).map((row) => (
                    <tr key={row.query}>
                      <td className="mr-slide-cell-truncate">{row.query}</td>
                      <td>{row.currentClicks}</td>
                      {cmp && <td>{row.previousClicks}</td>}
                      {cmp && <td>{row.clickDiff}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mr-slide-gsc-table-block">
            <h5 className="mr-seo-period-tag">Branded Queries</h5>
            <div className="mr-slide-table-wrap mr-slide-table-wrap--compact">
              <table className="mr-slide-table mr-slide-table--compact">
                <thead>
                  <tr><th>Query</th><th>{currentLabel}</th>{cmp && <th>{previousLabel}</th>}{cmp && <th>Δ</th>}</tr>
                </thead>
                <tbody>
                  {(d.brandedTable || []).length ? (d.brandedTable || []).map((row) => (
                    <tr key={`b-${row.query}`}>
                      <td className="mr-slide-cell-truncate">{row.query}</td>
                      <td>{row.currentClicks}</td>
                      {cmp && <td>{row.previousClicks}</td>}
                      {cmp && <td>{row.clickDiff}</td>}
                    </tr>
                  )) : (
                    <tr><td colSpan={cmp ? 4 : 2}>No branded queries detected</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mr-slide-gsc-table-block">
            <h5 className="mr-seo-period-tag">Non-Branded Queries</h5>
            <div className="mr-slide-table-wrap mr-slide-table-wrap--compact">
              <table className="mr-slide-table mr-slide-table--compact">
                <thead>
                  <tr><th>Query</th><th>{currentLabel}</th>{cmp && <th>{previousLabel}</th>}{cmp && <th>Δ</th>}</tr>
                </thead>
                <tbody>
                  {(d.nonBrandedTable || []).length ? (d.nonBrandedTable || []).map((row) => (
                    <tr key={`nb-${row.query}`}>
                      <td className="mr-slide-cell-truncate">{row.query}</td>
                      <td>{row.currentClicks}</td>
                      {cmp && <td>{row.previousClicks}</td>}
                      {cmp && <td>{row.clickDiff}</td>}
                    </tr>
                  )) : (
                    <tr><td colSpan={cmp ? 4 : 2}>No non-branded queries detected</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <NotesBox compact>
          {editable ? (
            <EditableText as="textarea" value={notes} onChange={onChangeNotes} multiline />
          ) : notes ? (
            <p>{notes}</p>
          ) : null}
        </NotesBox>
      </div>
      <Footer monthLabel={monthLabel} />
    </div>
  );
}

export function Slide19Top20Queries({ data, clientName, monthLabel, compareOn, currentLabel, previousLabel, showCompare }) {
  const d = data || {};
  const cmp = showCompare ?? compareOn;
  const periodRight = cmp && previousLabel ? `${currentLabel} vs ${previousLabel}` : currentLabel;
  return (
    <div className="mr-slide-inner">
      <Header title={`Top 20 Keywords Providing Clicks — ${clientName}`} right={periodRight} />
      <div className="mr-slide-main mr-slide-main--top20">
        <div className="mr-slide-table-wrap">
          <table className="mr-slide-table mr-slide-table--top20">
            <thead>
              <tr>
                <th>Query</th>
                <th>{currentLabel} Clicks</th>
                {cmp && <th>{previousLabel} Clicks</th>}
                <th>{currentLabel} Impr.</th>
                {cmp && <th>{previousLabel} Impr.</th>}
              </tr>
            </thead>
            <tbody>
              {(d.table || []).length ? (d.table || []).map((row) => (
                <tr key={row.query}>
                  <td className="mr-slide-cell-truncate">{row.query}</td>
                  <td className="mr-slide-top20-clicks">{row.currentClicks}</td>
                  {cmp && <td>{row.previousClicks}</td>}
                  <td>{row.currentImpr}</td>
                  {cmp && <td>{row.previousImpr}</td>}
                </tr>
              )) : (
                <tr><td colSpan={cmp ? 5 : 3}>No query data available</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <Footer monthLabel={monthLabel} />
    </div>
  );
}

export function Slide20KeywordTracker({ tracker, resolvedSheetUrl, editable, onChangeTracker, clientName, monthLabel }) {
  const t = { ...DEFAULT_KEYWORD_TRACKER, ...(tracker || {}) };
  const displayUrl = resolvedSheetUrl || t.sheetUrl || '';
  const insights = t.insights?.length ? t.insights : DEFAULT_KEYWORD_TRACKER.insights;
  const updateInsight = (i, field, val) => onChangeTracker?.({
    ...t,
    insights: insights.map((item, j) => (j === i ? { ...item, [field]: val } : item)),
  });

  return (
    <div className="mr-slide-inner">
      <Header title={`Keywords Ranking — ${clientName}`} right="SEO Rankings" />
      <div className="mr-slide-main mr-slide-main--keyword-tracker">
        <div className="mr-slide-keyword-tracker-banner">
          <span className="mr-slide-keyword-tracker-icon" aria-hidden>📋</span>
          <span className="mr-slide-keyword-tracker-label">Keyword Tracker:</span>
          {editable ? (
            <input
              className="mr-slide-keyword-tracker-input"
              type="url"
              placeholder="https://docs.google.com/spreadsheets/..."
              value={t.sheetUrl || ''}
              onChange={(e) => onChangeTracker?.({ ...t, sheetUrl: e.target.value })}
            />
          ) : displayUrl ? (
            <a className="mr-slide-keyword-tracker-link" href={displayUrl} target="_blank" rel="noreferrer">{displayUrl}</a>
          ) : (
            <span className="mr-slide-keyword-tracker-empty">Add Google Sheet URL in report settings</span>
          )}
        </div>
        <div className="mr-slide-keyword-insights-grid">
          {insights.map((item, i) => (
            <div key={i} className="mr-slide-keyword-insight-card">
              <div className={`mr-slide-keyword-insight-head ${KEYWORD_INSIGHT_THEMES[i]?.colorClass || ''}`}>
                <span className="mr-slide-keyword-insight-icon" aria-hidden>{item.icon || '•'}</span>
                {editable ? (
                  <EditableText value={item.title} onChange={(v) => updateInsight(i, 'title', v)} />
                ) : (
                  <strong>{item.title}</strong>
                )}
              </div>
              {editable ? (
                <EditableText as="textarea" value={item.body} onChange={(v) => updateInsight(i, 'body', v)} multiline />
              ) : (
                <p>{item.body}</p>
              )}
            </div>
          ))}
        </div>
      </div>
      <Footer monthLabel={monthLabel} />
    </div>
  );
}

export function Slide21KeywordScreenshot({
  screenshot,
  trackerSheetUrl,
  editable,
  onChangeScreenshot,
  clientName,
  monthLabel,
  exportMode = false,
}) {
  const s = { ...DEFAULT_KEYWORD_SCREENSHOT, ...(screenshot || {}) };
  const sheetUrl = resolveKeywordSheetUrl({ sheetUrl: trackerSheetUrl }, s);
  const parsed = parseGoogleSheetsUrl(sheetUrl);
  const imageUrl = isDirectImageUrl(s.imageUrl) ? s.imageUrl : '';
  const [sheetTable, setSheetTable] = useState(null);
  const [formattedSheet, setFormattedSheet] = useState(null);
  const [sheetLoadError, setSheetLoadError] = useState(false);

  useEffect(() => {
    if (!parsed?.spreadsheetId) {
      setSheetTable(null);
      setFormattedSheet(null);
      setSheetLoadError(false);
      return undefined;
    }
    let cancelled = false;
    setSheetLoadError(false);
    const load = async () => {
      let accessToken = '';
      try {
        const { getCachedGoogleDriveAccessToken } = await import('../utils/googleDriveExport');
        accessToken = getCachedGoogleDriveAccessToken();
      } catch {
        /* ignore */
      }
      if (exportMode && accessToken) {
        const { fetchKeywordSheetSections, fetchGoogleSheetFormattedGrid } = await import('../utils/googleSheetsEmbed');
        const sections = await fetchKeywordSheetSections(sheetUrl, accessToken);
        const primary = sections.find((s) => s.key === 'top20') || sections[0];
        if (primary) {
          const formatted = await fetchGoogleSheetFormattedGrid(sheetUrl, accessToken, { section: primary });
          if (!cancelled && formatted?.rows?.length) {
            setFormattedSheet(formatted);
            setSheetTable(null);
            return;
          }
        }
      }
      if (!cancelled) setFormattedSheet(null);
      const table = await fetchGoogleSheetCsvTable(sheetUrl, { accessToken: accessToken || undefined });
      if (!cancelled) setSheetTable(table);
    };
    load().catch(() => {
      if (!cancelled) setSheetLoadError(true);
    });
    return () => { cancelled = true; };
  }, [sheetUrl, parsed?.spreadsheetId, exportMode]);

  const showIframe = parsed && !exportMode && !imageUrl;
  const showFormattedTable = exportMode && formattedSheet?.rows?.length;
  const showSheetTable = parsed && !showFormattedTable && sheetTable?.rows?.length && (exportMode || !showIframe);
  const headers = sheetTable?.headers || [];
  const bodyRows = sheetTable?.rows || [];

  return (
    <div className="mr-slide-inner">
      <Header title={`Keywords Ranking — ${clientName}`} right={s.subtitle || 'SEO Rankings'} />
      <div className="mr-slide-main mr-slide-main--keyword-screenshot">
        {editable && (
          <p className="mr-slide-sheet-hint">
            {trackerSheetUrl
              ? 'Live preview loads from the Keyword Tracker sheet on slide 22. Override below if needed.'
              : 'Add the Keyword Tracker Google Sheet URL on slide 22, or paste a direct screenshot image URL here.'}
          </p>
        )}
        {editable && (
          <label className="mr-slide-screenshot-url-field">
            Sheet URL override (optional)
            <input
              className="form-control"
              type="url"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={s.sheetUrl || ''}
              onChange={(e) => onChangeScreenshot?.({ ...s, sheetUrl: e.target.value })}
            />
          </label>
        )}
        {editable && (
          <label className="mr-slide-screenshot-url-field">
            Screenshot image URL (optional — PNG/JPG hosted link)
            <input
              className="form-control"
              type="url"
              placeholder="https://..."
              value={isDirectImageUrl(s.imageUrl) ? s.imageUrl : ''}
              onChange={(e) => onChangeScreenshot?.({ ...s, imageUrl: e.target.value })}
            />
          </label>
        )}
        <div className={`mr-slide-screenshot-placeholder${
          imageUrl || showIframe || showFormattedTable || showSheetTable ? ' mr-slide-screenshot-placeholder--has-image' : ''
        }`}>
          {imageUrl ? (
            <img src={imageUrl} alt="Keyword rankings screenshot" className="mr-slide-screenshot-img" />
          ) : showIframe ? (
            <div className="mr-slide-sheet-embed">
              <iframe
                title="Keyword rankings sheet preview"
                src={parsed.previewUrl}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </div>
          ) : showFormattedTable ? (
            <div className="mr-slide-sheet-table-wrap">
              <table className="mr-slide-table mr-slide-table--sheet-export mr-slide-table--formatted">
                <tbody>
                  {formattedSheet.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.cells.map((cell, ci) => {
                        const CellTag = cell.isHeader ? 'th' : 'td';
                        return (
                          <CellTag
                            key={ci}
                            colSpan={cell.colspan > 1 ? cell.colspan : undefined}
                            rowSpan={cell.rowspan > 1 ? cell.rowspan : undefined}
                            style={cell.style || undefined}
                          >
                            {cell.text}
                          </CellTag>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : showSheetTable ? (
            <div className="mr-slide-sheet-table-wrap">
              <table className="mr-slide-table mr-slide-table--sheet-export">
                <thead>
                  <tr>
                    {headers.map((h, i) => (
                      <th key={i}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bodyRows.map((row, ri) => (
                    <tr key={ri}>
                      {headers.map((_, ci) => (
                        <td key={ci}>{row[ci] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : parsed && sheetLoadError ? (
            <div className="mr-slide-sheet-fallback">
              <p>Could not load sheet data for export. The live preview may still work in the editor.</p>
              <a href={parsed.viewUrl} target="_blank" rel="noreferrer">Open keyword sheet</a>
            </div>
          ) : parsed ? (
            <div className="mr-slide-sheet-loading">Loading keyword sheet preview…</div>
          ) : (
            <p>{s.caption || DEFAULT_KEYWORD_SCREENSHOT.caption}</p>
          )}
        </div>
      </div>
      <Footer monthLabel={monthLabel} />
    </div>
  );
}

export function Slide24GbpDivider({ clientName, periodLabel }) {
  return <SectionDivider title="Google Business Profile & Local SEO" subtitle={`${clientName} | ${periodLabel}`} />;
}

export function Slide25Gbp({ data, notes, editable, onChangeNotes, clientName, monthLabel, compareOn, currentLabel, previousLabel, showCompare }) {
  const d = data || {};
  const noteText = formatGbpNotesText(notes || d.notes || '');
  const locationRows = d.locationRows || [];
  const cmp = showCompare ?? compareOn ?? d.compareOn;

  return (
    <div className="mr-slide-inner">
      <Header title="Google Business Profile — Performance" right={clientName} />
      <div className="mr-slide-main mr-slide-main--gbp">
        <div className="mr-slide-kpi-row mr-slide-kpi-row--spaced">
          {(d.statBoxes || []).map((box, i) => (
            <SeoCompareKpiCard key={i} box={box} showCompare={cmp} />
          ))}
        </div>
        <div className={`mr-slide-gbp-locations${
          locationRows.length > 2
            ? ' mr-slide-gbp-locations--triple'
            : locationRows.length > 1
              ? ' mr-slide-gbp-locations--multi'
              : ''
        }`}>
          {locationRows.map((loc) => (
            <div key={loc.name} className="mr-slide-gbp-location">
              <h5 className="mr-seo-period-tag">{loc.name}</h5>
              <div className="mr-slide-table-wrap mr-slide-table-wrap--compact">
                <table className="mr-slide-table mr-slide-table--compact">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>{currentLabel || d.currentLabel || 'Current'}</th>
                      {cmp && <th>{previousLabel || d.previousLabel || 'Previous'}</th>}
                      {cmp && <th>Chg</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(loc.table || []).map((row) => (
                      <tr key={row.metric}>
                        <td>{row.metric}</td>
                        <td>{row.current}</td>
                        {cmp && <td>{row.previous}</td>}
                        {cmp && <td>{row.change}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
        <NotesBox compact>
          {editable ? (
            <EditableText as="textarea" value={noteText} onChange={onChangeNotes} multiline />
          ) : noteText ? (
            <p>{noteText}</p>
          ) : null}
        </NotesBox>
      </div>
      <Footer monthLabel={monthLabel} />
    </div>
  );
}

export function Slide26WebDevDivider({ clientName, periodLabel }) {
  return <SectionDivider title="Web Dev, Social Media & Backlinks" subtitle={`${clientName} | ${periodLabel}`} />;
}

export function Slide27WebDev({ items, editable, onChangeItems, clientName, monthLabel, periodLabel }) {
  const list = items?.length ? items : DEFAULT_SEO_WEBDEV_ITEMS;
  return (
    <div className="mr-slide-inner">
      <Header title="Web Development Updates" right={`${clientName} | ${periodLabel || monthLabel}`} />
      <div className="mr-slide-main mr-slide-webdev-grid">
        {list.map((item, i) => (
          <div key={i} className="mr-slide-webdev-card">
            <div className="mr-slide-webdev-num">{item.num}</div>
            {editable ? (
              <>
                <EditableText value={item.title} onChange={(v) => onChangeItems?.(list.map((x, j) => (j === i ? { ...x, title: v } : x)))} />
                <EditableText as="textarea" value={item.body} onChange={(v) => onChangeItems?.(list.map((x, j) => (j === i ? { ...x, body: v } : x)))} multiline />
              </>
            ) : (
              <>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </>
            )}
          </div>
        ))}
      </div>
      <Footer monthLabel={monthLabel} />
    </div>
  );
}

export function Slide28Backlinks({ data, editable, onChangeData, clientName, monthLabel, periodLabel }) {
  const d = { ...DEFAULT_BACKLINKS_SUMMARY, ...(data || {}) };
  const updateStat = (i, field, val) => onChangeData?.({
    ...d,
    linkStats: d.linkStats.map((s, j) => (j === i ? { ...s, [field]: val } : s)),
  });
  const updateAnchor = (i, field, val) => onChangeData?.({
    ...d,
    topAnchors: d.topAnchors.map((s, j) => (j === i ? { ...s, [field]: val } : s)),
  });

  return (
    <div className="mr-slide-inner">
      <Header title="Backlinks — Summary" right={`${clientName} | ${periodLabel || monthLabel}`} />
      <div className="mr-slide-main">
        {editable && (
          <div className="mr-slide-auction-toolbar">
            <CsvUploader label="Link stats CSV" value={[]} onChange={(csv) => onChangeData?.({ ...d, linkStats: csvToBacklinkStats(csv) })} templateHeaders={BACKLINKS_CSV_HEADERS} templateFilename="backlinks_stats_template.csv" />
            <CsvUploader label="Anchors CSV" value={[]} onChange={(csv) => onChangeData?.({ ...d, topAnchors: csvToBacklinkAnchors(csv) })} templateHeaders={BACKLINKS_ANCHOR_CSV_HEADERS} templateFilename="backlinks_anchors_template.csv" />
          </div>
        )}
        <div className="mr-slide-kpi-row">
          {['totalBacklinks', 'referringDomains', 'trustFlow', 'citationFlow'].map((key) => (
            <div key={key} className="mr-slide-kpi-card">
              {editable ? (
                <input className="mr-slide-cell-input mr-slide-kpi-input" value={d[key]} onChange={(e) => onChangeData?.({ ...d, [key]: e.target.value })} />
              ) : (
                <div className="mr-slide-kpi-value">{d[key] || '—'}</div>
              )}
              <div className="mr-slide-kpi-label">{key.replace(/([A-Z])/g, ' $1').trim()}</div>
            </div>
          ))}
        </div>
        <div className="mr-slide-table-wrap">
          <table className="mr-slide-table mr-slide-table--compact">
            <thead><tr><th>Metric</th><th>Count</th></tr></thead>
            <tbody>
              {(d.linkStats || []).map((row, i) => (
                <tr key={i}>
                  <td>{editable ? <input className="mr-slide-cell-input" value={row.metric} onChange={(e) => updateStat(i, 'metric', e.target.value)} /> : row.metric}</td>
                  <td>{editable ? <input className="mr-slide-cell-input" value={row.count} onChange={(e) => updateStat(i, 'count', e.target.value)} /> : row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mr-slide-table-wrap">
          <table className="mr-slide-table mr-slide-table--compact">
            <thead><tr><th>Anchor Text</th><th>Domains</th></tr></thead>
            <tbody>
              {(d.topAnchors || []).map((row, i) => (
                <tr key={i}>
                  <td>{editable ? <input className="mr-slide-cell-input" value={row.anchor} onChange={(e) => updateAnchor(i, 'anchor', e.target.value)} /> : row.anchor}</td>
                  <td>{editable ? <input className="mr-slide-cell-input" value={row.domains} onChange={(e) => updateAnchor(i, 'domains', e.target.value)} /> : row.domains}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <NotesBox title="Backlink Insight">
          {editable ? <EditableText as="textarea" value={d.insight} onChange={(v) => onChangeData?.({ ...d, insight: v })} multiline /> : (d.insight || 'Upload backlink data manually.')}
        </NotesBox>
      </div>
      <Footer monthLabel={monthLabel} />
    </div>
  );
}

export function Slide29SeoNextDivider({ clientName, periodLabel }) {
  return <SectionDivider title="Next Steps & Action Plan" subtitle={`${clientName} | ${periodLabel}`} />;
}

export function Slide30SeoNextSteps({ items, editable, onChangeItems, clientName, monthLabel, periodLabel }) {
  const list = items?.length ? items : DEFAULT_SEO_NEXT_STEPS;
  return (
    <div className="mr-slide-inner">
      <Header title={`Next Steps & Commitment to Growth — ${clientName}`} right="Looking Ahead" />
      <div className="mr-slide-main mr-slide-next-steps-grid">
        {list.map((item, i) => (
          <div key={i} className="mr-slide-next-step-card">
            <div className="mr-slide-next-step-head">
              <span className="mr-slide-next-step-icon" aria-hidden>{item.icon || '•'}</span>
              {editable ? (
                <EditableText className="mr-slide-next-step-title" value={item.title} onChange={(v) => onChangeItems?.(list.map((x, j) => (j === i ? { ...x, title: v } : x)))} />
              ) : (
                <strong className="mr-slide-next-step-title">{item.title}</strong>
              )}
            </div>
            {editable ? (
              <EditableText as="textarea" className="mr-slide-next-step-body" value={item.body} onChange={(v) => onChangeItems?.(list.map((x, j) => (j === i ? { ...x, body: v } : x)))} multiline />
            ) : (
              <p className="mr-slide-next-step-body">{item.body}</p>
            )}
          </div>
        ))}
      </div>
      <Footer monthLabel={monthLabel} />
    </div>
  );
}

export function SlideBlogDivider({ clientName, monthLabel }) {
  return <SectionDivider title="Blog Content" subtitle={`${clientName} | ${monthLabel}`} />;
}

export function SlideBlogUpdate({ post, editable, onChangePost, clientName, monthLabel }) {
  const p = { ...DEFAULT_BLOG_UPDATES[0], ...(post || {}) };
  const themes = p.keyThemes?.length ? p.keyThemes : [''];
  const updateTheme = (i, val) => onChangePost?.({
    ...p,
    keyThemes: themes.map((t, j) => (j === i ? val : t)),
  });

  return (
    <div className="mr-slide-inner">
      <Header title={`Blog Update — ${monthLabel}`} right={`${clientName} | ${monthLabel}`} />
      <div className="mr-slide-main mr-slide-main--blog-update">
        <div className="mr-slide-blog-post-title-bar">
          {editable ? (
            <EditableText className="mr-slide-blog-post-title-text" value={p.title} onChange={(v) => onChangePost?.({ ...p, title: v })} />
          ) : (
            <h3 className="mr-slide-blog-post-title-text">{p.title}</h3>
          )}
        </div>
        <div className="mr-slide-blog-overview-card">
          <h4 className="mr-slide-blog-overview-heading">Overview</h4>
          {editable ? (
            <EditableText as="textarea" className="mr-slide-blog-overview-body" value={p.overview} onChange={(v) => onChangePost?.({ ...p, overview: v })} multiline />
          ) : (
            <p className="mr-slide-blog-overview-body">{p.overview}</p>
          )}
        </div>
        <div className="mr-slide-blog-themes-section">
          <h4 className="mr-slide-blog-themes-heading">Key Themes Covered</h4>
          <div className="mr-slide-blog-theme-rows">
            {themes.map((theme, i) => (
              <div key={i} className="mr-slide-blog-theme-row">
                <span className="mr-slide-blog-theme-num">{i + 1}.</span>
                {editable ? (
                  <EditableText className="mr-slide-blog-theme-text" value={theme} onChange={(v) => updateTheme(i, v)} />
                ) : (
                  <span className="mr-slide-blog-theme-text">{theme}</span>
                )}
              </div>
            ))}
          </div>
          {editable && (
            <button type="button" className="btn btn-outline btn-sm mr-slide-blog-add-theme" onClick={() => onChangePost?.({ ...p, keyThemes: [...themes, ''] })}>+ Theme</button>
          )}
        </div>
        <div className="mr-slide-blog-goal-box">
          <span className="mr-slide-blog-goal-label">Goal:</span>
          {editable ? (
            <EditableText as="textarea" className="mr-slide-blog-goal-body" value={p.goal} onChange={(v) => onChangePost?.({ ...p, goal: v })} multiline />
          ) : (
            <span className="mr-slide-blog-goal-body">{p.goal}</span>
          )}
        </div>
      </div>
      <Footer monthLabel={monthLabel} />
    </div>
  );
}

export function Slide31ThankYou({ clientName, monthLabel, periodLabel, agency, clientWebsite }) {
  const preparedBy = agency?.agency_name || 'Red Castle Services';
  const website = (agency?.website_url || 'redcastleservices.com').replace(/^https?:\/\//, '');
  return (
    <div className="mr-slide-inner mr-slide-cover mr-slide-thankyou">
      <h2 className="mr-slide-thankyou-title">Thank You!</h2>
      <p>We value your trust and are dedicated to achieving long-term growth.</p>
      <div className="mr-slide-thankyou-meta">
        <p><strong>Client:</strong> {clientName}</p>
        <p><strong>Period:</strong> {periodLabel || monthLabel}</p>
        <p><strong>Prepared by:</strong> {preparedBy}</p>
        <p><strong>Website:</strong> {website}</p>
        {clientWebsite ? <p><strong>Client site:</strong> {clientWebsite}</p> : null}
      </div>
    </div>
  );
}

export function renderSeoSlide(num, props) {
  const {
    clientName, monthLabel, agency, slideData, seoHandlers, editable, compareOn, compareSections, exportMode,
  } = props;
  const seo = slideData?.seo || {};
  const periodLabel = seo.periodLabel || monthLabel;
  const currentLabel = seo.currentLabel || slideData?.currentLabel || monthLabel;
  const previousLabel = seo.previousLabel || slideData?.previousLabel || '';
  const sections = compareSections || slideData?.compareSections || {};
  const cmp = (key) => isSectionCompareOn(compareOn, sections, key);

  switch (num) {
    case 11:
      return (
        <Slide11SeoExecutive
          data={seo.slide11}
          sections={seoHandlers?.seoExecutiveSections}
          editable={editable}
          onChangeSections={seoHandlers?.onSeoExecutiveSections}
          clientName={clientName}
          monthLabel={monthLabel}
          periodLabel={periodLabel}
          showCompare={cmp('executiveSummary')}
        />
      );
    case 12:
      return <Slide12Ga4Divider clientName={clientName} periodLabel={periodLabel} />;
    case 13:
      return (
        <Slide13OrganicChannel
          data={seo.slide13}
          clientName={clientName}
          monthLabel={monthLabel}
          compareOn={compareOn}
          currentLabel={currentLabel}
          previousLabel={previousLabel}
          showCompare={cmp('ga4Organic')}
        />
      );
    case 14:
      return (
        <Slide14AllChannelsCombined
          data={seo.slide14}
          clientName={clientName}
          monthLabel={monthLabel}
          compareOn={compareOn}
          showCompare={cmp('ga4AllChannels')}
        />
      );
    case 15:
      return (
        <SlideLandingPagesCombined
          data={seo.slide15}
          clientName={clientName}
          monthLabel={monthLabel}
          compareOn={compareOn}
          showCompare={cmp('ga4LandingPages')}
        />
      );
    case 16:
      return (
        <SlideTopCitiesCombined
          data={seo.slide16}
          clientName={clientName}
          monthLabel={monthLabel}
          compareOn={compareOn}
          showCompare={cmp('ga4TopCities')}
        />
      );
    case 17:
      return <Slide21GscDivider clientName={clientName} periodLabel={periodLabel} />;
    case 18:
      return (
        <Slide22GscSummary
          data={{ ...seo.slide22, notes: seoHandlers?.gscNotes ?? seo.slide22?.notes }}
          clientName={clientName}
          monthLabel={monthLabel}
          compareOn={compareOn}
          currentLabel={currentLabel}
          previousLabel={previousLabel}
          editable={editable}
          onChangeNotes={seoHandlers?.onGscNotes}
          showCompare={cmp('gscSummary')}
        />
      );
    case 19:
      return (
        <Slide19Top20Queries
          data={seo.slide19}
          clientName={clientName}
          monthLabel={monthLabel}
          compareOn={compareOn}
          currentLabel={currentLabel}
          previousLabel={previousLabel}
          showCompare={cmp('top20Queries')}
        />
      );
    case 20:
      return <Slide24GbpDivider clientName={clientName} periodLabel={periodLabel} />;
    case 21:
      return (
        <Slide25Gbp
          data={seo.slide24}
          notes={seoHandlers?.gbpNotes}
          editable={editable}
          onChangeNotes={seoHandlers?.onGbpNotes}
          clientName={clientName}
          monthLabel={monthLabel}
          compareOn={compareOn}
          currentLabel={currentLabel}
          previousLabel={previousLabel}
          showCompare={cmp('gbp')}
        />
      );
    case 22:
      return (
        <Slide20KeywordTracker
          tracker={seoHandlers?.keywordTracker}
          resolvedSheetUrl={resolveKeywordSheetUrl(seoHandlers?.keywordTracker, seoHandlers?.keywordScreenshot)}
          editable={editable}
          onChangeTracker={seoHandlers?.onKeywordTracker}
          clientName={clientName}
          monthLabel={monthLabel}
        />
      );
    case 23:
      return (
        <Slide21KeywordScreenshot
          screenshot={seoHandlers?.keywordScreenshot}
          trackerSheetUrl={seoHandlers?.keywordTracker?.sheetUrl}
          editable={editable}
          onChangeScreenshot={seoHandlers?.onKeywordScreenshot}
          clientName={clientName}
          monthLabel={monthLabel}
          exportMode={exportMode}
        />
      );
    case 24:
      return <Slide26WebDevDivider clientName={clientName} periodLabel={periodLabel} />;
    case 25:
      return (
        <Slide27WebDev
          items={seoHandlers?.webDevItems}
          editable={editable}
          onChangeItems={seoHandlers?.onWebDevItems}
          clientName={clientName}
          monthLabel={monthLabel}
          periodLabel={periodLabel}
        />
      );
    case 26:
      return <Slide29SeoNextDivider clientName={clientName} periodLabel={periodLabel} />;
    case 27:
      return (
        <Slide30SeoNextSteps
          items={seoHandlers?.seoNextSteps}
          editable={editable}
          onChangeItems={seoHandlers?.onSeoNextSteps}
          clientName={clientName}
          monthLabel={monthLabel}
          periodLabel={periodLabel}
        />
      );
    case 28:
      return (
        <Slide28Backlinks
          data={seoHandlers?.backlinks}
          editable={editable}
          onChangeData={seoHandlers?.onBacklinks}
          clientName={clientName}
          monthLabel={monthLabel}
          periodLabel={periodLabel}
        />
      );
    case 29:
      return <SlideBlogDivider clientName={clientName} monthLabel={monthLabel} />;
    case 30:
      return (
        <SlideBlogUpdate
          post={seoHandlers?.blogUpdates?.[0]}
          editable={editable}
          onChangePost={(v) => seoHandlers?.onBlogUpdates?.(0, v)}
          clientName={clientName}
          monthLabel={monthLabel}
        />
      );
    case 31:
      return (
        <SlideBlogUpdate
          post={seoHandlers?.blogUpdates?.[1]}
          editable={editable}
          onChangePost={(v) => seoHandlers?.onBlogUpdates?.(1, v)}
          clientName={clientName}
          monthLabel={monthLabel}
        />
      );
    case 32:
      return (
        <Slide31ThankYou
          clientName={clientName}
          monthLabel={monthLabel}
          periodLabel={periodLabel}
          agency={agency}
          clientWebsite={seoHandlers?.clientWebsite}
        />
      );
    default:
      return null;
  }
}
