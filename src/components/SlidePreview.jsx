import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { reportData } from '../data/reportData';
import { ReportPreviewContext, useReport, useReportPreview } from './reportPreviewContext';
import { useLogoForDarkBackground } from '../utils/loadImageDataUrl';
import '../styles/pptSlidePreview.css';

function EditableText({ value, onChange, className }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    if (ref.current && ref.current.innerText !== value) {
      ref.current.innerText = value;
    }
  }, []);

  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current && ref.current.innerText !== value) {
      ref.current.innerText = value;
    }
  }, [value]);

  const commit = (el) => onChange(el.innerText.replace(/\n/g, ' ').trim());

  return (
    <div
      ref={ref}
      className={`${className} ppt-editable-text`}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      onBlur={(e) => commit(e.currentTarget)}
      onInput={(e) => commit(e.currentTarget)}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
      }}
    />
  );
}

const FOOTER_TEXT = (month) =>
  `Red Castle Services | SEO & Digital Marketing Report | ${month}`;

function RedHeader({ title, right }) {
  return (
    <div className="ppt-red-bar ppt-red-bar--header">
      <h4>{title}</h4>
      {right ? <span className="ppt-header-right">{right}</span> : null}
    </div>
  );
}

function RedFooter() {
  const report = useReport();
  return (
    <div className="ppt-red-bar ppt-red-bar--footer">
      {FOOTER_TEXT(report.month)}
    </div>
  );
}

function RedSubBar({ children }) {
  return <div className="ppt-red-bar ppt-red-bar--sub">{children}</div>;
}

/** Editable green insight box (slides 1, 2, 3, 5, 6, 7) */
function SlideBottomInsight({ slideNum }) {
  const report = useReport();
  const { slideBottomInsightEditable, updateSlideBottomInsight } = useReportPreview();
  const key = String(slideNum);
  const text = report.slideBottomInsights?.[key] ?? '';

  return (
    <div className="ppt-insight-box ppt-slide-bottom-insight">
      {slideBottomInsightEditable && updateSlideBottomInsight ? (
        <EditableText
          className="ppt-insight-editable"
          value={text}
          onChange={(v) => updateSlideBottomInsight(slideNum, v)}
        />
      ) : (
        <div className="ppt-insight-text">{text || '\u00a0'}</div>
      )}
    </div>
  );
}

/** Slide 1 — client name + report month from UI selections */
function CoverSlide() {
  const report = useReport();
  const logoSrc = useLogoForDarkBackground(report.coverLogoUrl || '/rc-brand-logo.png');
  return (
    <div className="ppt-slide-inner ppt-cover">
      <div className="ppt-cover-body">
        <div className="ppt-cover-left">
        <div className="ppt-cover-services">SERVICES</div>
        <div className="ppt-cover-rule" />
        <div className="ppt-cover-month">{report.month}</div>
        <div className="ppt-cover-monthly">
          Monthly
          <br />
          Report
        </div>
      </div>
      <div className="ppt-cover-right">
        <div className="ppt-cover-logo">
          <img src={logoSrc} alt="Red Castle Services" className="ppt-cover-logo-img" />
        </div>
        <h2 className="ppt-cover-title">
          SEO &amp; Digital
          <br />
          Marketing
          <br />
          Updates
        </h2>
        <p className="ppt-cover-client">{report.client}</p>
        <div className="ppt-cover-divider" />
        <p className="ppt-cover-prepared">
          Prepared by {report.preparedBy} | {report.website}
        </p>
      </div>
      </div>
      <SlideBottomInsight slideNum={1} />
    </div>
  );
}

/** Slide 2 — service card title/body editable in preview (session only) */
function ContentSlide2() {
  const report = useReport();
  const { slide2Editable, updateSlide2Service } = useReportPreview();

  return (
    <div className="ppt-slide-inner">
      <RedHeader title="What We Are Managing" right={report.client} />
      <div className="ppt-slide-main ppt-slide-main--with-insight">
        <div className="ppt-service-cards">
          {report.services.map((svc, index) => (
            <div key={index} className="ppt-service-card">
              <span className="ppt-service-card-icon">{svc.icon}</span>
              <div className="ppt-service-card-text">
                {slide2Editable && updateSlide2Service ? (
                  <>
                    <EditableText
                      className="ppt-service-card-title"
                      value={svc.title}
                      onChange={(v) => updateSlide2Service(index, 'title', v)}
                    />
                    <EditableText
                      className="ppt-service-card-body"
                      value={svc.body}
                      onChange={(v) => updateSlide2Service(index, 'body', v)}
                    />
                  </>
                ) : (
                  <>
                    <div className="ppt-service-card-title">{svc.title}</div>
                    <div className="ppt-service-card-body">{svc.body}</div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        <SlideBottomInsight slideNum={2} />
      </div>
      <RedFooter />
    </div>
  );
}

/** Slide 3 — location + lead counts editable in preview (session only) */
function LeadSummarySlide() {
  const report = useReport();
  const { slide3Editable, updateSlide3TableRow, updateSlide3StatBox } = useReportPreview();
  const r = report.leadSummary.tableRow;
  const boxes = report.leadSummary.statBoxes;

  const renderTableCell = (field, className = '') => {
    const display = String(r[field] ?? '');
    if (slide3Editable && updateSlide3TableRow) {
      return (
        <EditableText
          className={`ppt-table-editable ${className}`.trim()}
          value={display}
          onChange={(v) => updateSlide3TableRow(field, v)}
        />
      );
    }
    return display;
  };

  const renderStatValue = (index, box, valueClass) => {
    if (slide3Editable && updateSlide3StatBox) {
      return (
        <EditableText
          className={`ppt-kpi-value ${valueClass} ppt-kpi-editable-value`}
          value={box.value}
          onChange={(v) => updateSlide3StatBox(index, v)}
        />
      );
    }
    return <div className={`ppt-kpi-value ${valueClass}`}>{box.value}</div>;
  };

  return (
    <div className="ppt-slide-inner">
      <RedHeader
        title="Overall Performance Overview – Lead Summary"
        right={report.leadSummary.comparisonHeader}
      />
      <div className="ppt-slide-main ppt-slide-main--flush ppt-slide-main--with-insight" style={{ padding: '10px 14px' }}>
        <div className="ppt-table-wrap">
          <table className="ppt-table">
            <thead>
              <tr>
                <th>Location</th>
                <th>Call Leads ({report.leadSummary.currentMonthName})</th>
                <th>Contact Forms ({report.leadSummary.currentMonthName})</th>
                <th>Chat Widgets ({report.leadSummary.currentMonthName})</th>
                <th>Call Leads ({report.leadSummary.previousMonthName})</th>
                <th>Contact Forms ({report.leadSummary.previousMonthName})</th>
                <th>Chat Widgets ({report.leadSummary.previousMonthName})</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{renderTableCell('location')}</td>
                <td className="num">{renderTableCell('callApril', 'num')}</td>
                <td>{renderTableCell('formsApril')}</td>
                <td>{renderTableCell('chatApril')}</td>
                <td>{renderTableCell('callMar')}</td>
                <td>{renderTableCell('formsMar')}</td>
                <td>{renderTableCell('chatMar')}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <RedSubBar>{report.leadSummary.combinedTotalsLabel}</RedSubBar>
        <div className="ppt-kpi-row">
          {boxes.map((box, index) => {
            const isGreen = index === 0;
            return (
              <div
                key={index}
                className={isGreen ? 'ppt-kpi-card ppt-kpi-card--green' : 'ppt-kpi-card'}
              >
                <div
                  className={`ppt-kpi-accent ${isGreen ? 'ppt-kpi-accent--green' : 'ppt-kpi-accent--dark'}`}
                />
                <div className="ppt-kpi-body">
                  {renderStatValue(
                    index,
                    box,
                    isGreen ? 'ppt-kpi-value--green' : 'ppt-kpi-value--dark',
                  )}
                  <div className="ppt-kpi-label">{box.label}</div>
                  {box.isPreviousMonth && (
                    <div className="ppt-kpi-sublabel">Previous month</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <SlideBottomInsight slideNum={3} />
      </div>
      <RedFooter />
    </div>
  );
}

/** Slide 4 */
function SectionSlide() {
  const report = useReport();
  return (
    <div className="ppt-slide-inner ppt-section">
      <div className="ppt-section-accent" />
      <h2 className="ppt-section-title">{report.sectionDivider.title}</h2>
      <div className="ppt-section-rule" />
      <p className="ppt-section-sub">{report.sectionDivider.subtitle}</p>
    </div>
  );
}

/** Slide 5 */
function PaidAdsOverallSlide() {
  const report = useReport();
  const icons = ['$', '↗', '👥', '📈'];
  const circleClass = [
    'ppt-kpi-icon-circle--blue',
    'ppt-kpi-icon-circle--green',
    'ppt-kpi-icon-circle--orange',
    'ppt-kpi-icon-circle--purple',
  ];
  return (
    <div className="ppt-slide-inner">
      <RedHeader title="Paid Ads Performance" right={report.client} />
      <div className="ppt-slide-main ppt-slide-main--with-insight">
        <p className="ppt-subtitle-muted">{report.paidAdsOverall.comparisonSubtitle}</p>
        <div className="ppt-kpi-icons">
          {report.paidAdsOverall.topStats.map((s, i) => (
            <div key={s.label} className="ppt-kpi-icon-card">
              <div className={`ppt-kpi-icon-circle ${circleClass[i]}`}>{icons[i]}</div>
              <div>
                <div className="ppt-kpi-icon-label">{s.label}</div>
                <div className="ppt-kpi-icon-value">{s.value}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="ppt-white-panel">
          <div className="ppt-header-with-tabs">
            <div className="ppt-white-panel-title">Detailed Cost &amp; Performance Breakdown</div>
            <div className="ppt-tab-pills">
              <span className="ppt-tab-pill ppt-tab-pill--active">{report.paidAdsOverall.currentMonthLabel}</span>
              <span className="ppt-tab-pill">{report.paidAdsOverall.previousMonthLabel}</span>
              <span className="ppt-tab-pill">Compare</span>
            </div>
          </div>
          <div className="ppt-table-wrap" style={{ margin: 0 }}>
            <table className="ppt-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>{report.paidAdsOverall.currentMonthLabel}</th>
                  <th>{report.paidAdsOverall.previousMonthLabel}</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {report.paidAdsOverall.table.map((row) => (
                  <tr key={row.metric}>
                    <td>{row.metric}</td>
                    <td>{row.current}</td>
                    <td>{row.previous}</td>
                    <td className={row.positive ? 'pos' : 'neg'}>{row.change}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <SlideBottomInsight slideNum={5} />
      </div>
      <RedFooter />
    </div>
  );
}

function MetricCard({ panel, titleColor }) {
  const items = [
    ['Users', panel.users],
    ['Sessions', panel.sessions],
    ['Views', panel.views],
    ['Cost', panel.cost],
    ['Conversions', panel.conversions],
    ['Cost/Lead', panel.costLead],
  ];
  return (
    <div className="ppt-metric-card">
      <div className="ppt-metric-card-head">
        <h5 className={titleColor}>{panel.label}</h5>
        <span className="tag">{panel.tag}</span>
      </div>
      <div className="ppt-metric-grid">
        {items.map(([label, val]) => (
          <div key={label} className="ppt-metric-cell">
            <div className={`v ${titleColor}`}>{val}</div>
            <div className="l">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Slide 6 */
function PaidAdsFloridaSlide() {
  const report = useReport();
  const d = report.paidAdsFlorida;
  return (
    <div className="ppt-slide-inner">
      <RedHeader title="Performance Overview" right={report.client} />
      <div className="ppt-slide-main ppt-slide-main--with-insight">
        <div className="ppt-metric-cards-row">
          <MetricCard panel={d.current} titleColor="red" />
          <MetricCard panel={d.previous} titleColor="" />
        </div>
        <div className="ppt-white-panel" style={{ flex: 1 }}>
          <div className="ppt-panel-title-sm">Detailed Performance Metrics</div>
          <div className="ppt-table-wrap" style={{ margin: 0 }}>
            <table className="ppt-table ppt-table--metrics">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>{d.currentMonthLabel}</th>
                  <th>{d.previousMonthLabel}</th>
                  <th>Change</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {d.table.map((row) => (
                  <tr key={row.metric}>
                    <td>{row.metric}</td>
                    <td>{row.current}</td>
                    <td>{row.previous}</td>
                    <td className={row.positive ? 'pos' : 'neg'}>{row.change}</td>
                    <td>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <SlideBottomInsight slideNum={6} />
      </div>
      <RedFooter />
    </div>
  );
}

/** Slide 7 */
function SearchOverviewSlide() {
  return (
    <div className="ppt-slide-inner">
      <RedHeader title="Search Overview – Florida" right="GA4 Analytics" />
      <div className="ppt-slide-main ppt-slide-main--flush ppt-slide-main--with-insight" style={{ padding: '12px 14px' }}>
        <div className="ppt-table-wrap" style={{ flex: 1, margin: 0 }}>
          <table className="ppt-table">
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
              {reportData.searchOverview.table.map((row, i) => (
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
        <SlideBottomInsight slideNum={7} />
      </div>
      <RedFooter />
    </div>
  );
}

/** Slide 8 */
function TopKeywordsSlide() {
  return (
    <div className="ppt-slide-inner">
      <RedHeader title="Top Keywords – Florida" right="Google Ads" />
      <div className="ppt-slide-main" style={{ display: 'flex', flexDirection: 'column' }}>
        <span className="ppt-fl-tag">FLORIDA</span>
        <div className="ppt-table-wrap">
          <table className="ppt-table">
            <thead>
              <tr>
                <th>Top Keyword</th>
                <th>Cost</th>
                <th>Conversions</th>
              </tr>
            </thead>
            <tbody>
              {reportData.topKeywords.table.map((row) => (
                <tr key={row.keyword}>
                  <td>{row.keyword}</td>
                  <td className="num">{row.cost}</td>
                  <td className="num">{row.conversions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ppt-insight-box">
          <ul className="ppt-insight-list" style={{ listStyle: 'disc' }}>
            <li>{reportData.topKeywords.insight}</li>
          </ul>
        </div>
      </div>
      <RedFooter />
    </div>
  );
}

/** Slide 9 */
function AuctionInsightsSlide() {
  return (
    <div className="ppt-slide-inner">
      <RedHeader title="Google Ads Auction Insights  |  April 2026" />
      <div className="ppt-slide-main" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="ppt-table-wrap">
          <table className="ppt-table" style={{ fontSize: '7px' }}>
            <thead>
              <tr>
                <th>Domain</th>
                <th>Impression Share</th>
                <th>Overlap Rate</th>
                <th>Position Above Rate</th>
                <th>Top of Page Rate</th>
                <th>Abs. Top of Page Rate</th>
                <th>Outranking Share</th>
              </tr>
            </thead>
            <tbody>
              {reportData.auctionInsights.table.map((row, i) => (
                <tr key={row.domain} className={i === 0 ? 'alt' : ''}>
                  <td style={{ fontWeight: i === 0 ? 700 : 400 }}>{row.domain}</td>
                  <td>{row.impressionShare}</td>
                  <td>{row.overlapRate}</td>
                  <td>{row.posAbove}</td>
                  <td>{row.topPage}</td>
                  <td>{row.absTop}</td>
                  <td>{row.outranking}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ppt-insight-box">
          <div className="ppt-insight-title">Auction Insight</div>
          <ul className="ppt-insight-list">
            {reportData.auctionInsights.insights.map((t) => (
              <li key={t.slice(0, 48)}>{t}</li>
            ))}
          </ul>
        </div>
      </div>
      <RedFooter />
    </div>
  );
}

/** Slide 10 */
function CampaignProgressSlide() {
  const cp = reportData.campaignProgress;
  return (
    <div className="ppt-slide-inner">
      <RedHeader title="Campaign Progress & Next Steps" />
      <RedSubBar>Google Ads Performance Overview &amp; Key Priorities</RedSubBar>
      <div className="ppt-slide-main">
        <div className="ppt-cols-3">
          <div className="ppt-col-card">{cp.overview}</div>
          <div className="ppt-col-card">{cp.performance}</div>
          <div className="ppt-col-card">{cp.metrics}</div>
        </div>
        <div className="ppt-goal-box">
          <span className="goal-label">Goal: </span>
          {cp.goal}
        </div>
      </div>
      <RedFooter />
    </div>
  );
}

function renderSlideContent(num) {
  switch (num) {
    case 1: return <CoverSlide />;
    case 2: return <ContentSlide2 />;
    case 3: return <LeadSummarySlide />;
    case 4: return <SectionSlide />;
    case 5: return <PaidAdsOverallSlide />;
    case 6: return <PaidAdsFloridaSlide />;
    case 7: return <SearchOverviewSlide />;
    case 8: return <TopKeywordsSlide />;
    case 9: return <AuctionInsightsSlide />;
    case 10: return <CampaignProgressSlide />;
    default: return null;
  }
}

export function SlidePreview({
  slide,
  index,
  exportMode = false,
  report = reportData,
  slide2Editable = false,
  updateSlide2Service,
  slide3Editable = false,
  updateSlide3TableRow,
  updateSlide3StatBox,
  slideBottomInsightEditable = false,
  updateSlideBottomInsight,
}) {
  const contextValue = {
    report,
    slide2Editable: slide2Editable && !exportMode,
    updateSlide2Service: slide2Editable && !exportMode ? updateSlide2Service : undefined,
    slide3Editable: slide3Editable && !exportMode,
    updateSlide3TableRow: slide3Editable && !exportMode ? updateSlide3TableRow : undefined,
    updateSlide3StatBox: slide3Editable && !exportMode ? updateSlide3StatBox : undefined,
    slideBottomInsightEditable: slideBottomInsightEditable && !exportMode,
    updateSlideBottomInsight:
      slideBottomInsightEditable && !exportMode ? updateSlideBottomInsight : undefined,
  };

  return (
    <ReportPreviewContext.Provider value={contextValue}>
      <div
        className={`ppt-slide-card${exportMode ? ' ppt-slide-card--export' : ''}`}
        style={exportMode ? undefined : { animationDelay: `${index * 80}ms` }}
        aria-label={`Slide ${slide.num}: ${slide.title}`}
      >
        {!exportMode && (
          <span className="ppt-slide-badge">Slide {slide.num} / 10</span>
        )}
        {renderSlideContent(slide.num)}
      </div>
    </ReportPreviewContext.Provider>
  );
}
