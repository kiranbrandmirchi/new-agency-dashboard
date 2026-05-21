import React, { createContext, useContext } from 'react';
import { reportData } from '../data/reportData';

const ReportPreviewContext = createContext(reportData);

function useReport() {
  return useContext(ReportPreviewContext);
}
import '../styles/pptSlidePreview.css';

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

/** Slide 1 — client name + report month from UI selections */
function CoverSlide() {
  const report = useReport();
  return (
    <div className="ppt-slide-inner ppt-cover">
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
          <div className="ppt-cover-logo-icon">
            <img src={report.coverLogoUrl} alt="" />
          </div>
          <div className="ppt-cover-logo-text">
            RED CASTLE
            <span>SERVICES</span>
          </div>
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
  );
}

/** Slide 2 */
function ContentSlide2() {
  const report = useReport();
  return (
    <div className="ppt-slide-inner">
      <RedHeader title="What We Are Managing" right={report.client} />
      <div className="ppt-slide-main">
        <div className="ppt-service-cards">
          {reportData.services.map((svc) => (
            <div key={svc.title} className="ppt-service-card">
              <span className="ppt-service-card-icon">{svc.icon}</span>
              <div>
                <div className="ppt-service-card-title">{svc.title}</div>
                <div className="ppt-service-card-body">{svc.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <RedFooter />
    </div>
  );
}

/** Slide 3 */
function LeadSummarySlide() {
  const r = reportData.leadSummary.tableRow;
  const boxes = reportData.leadSummary.statBoxes;
  return (
    <div className="ppt-slide-inner">
      <RedHeader title="Overall Performance Overview – Lead Summary" right="April Vs March 2026" />
      <div className="ppt-slide-main ppt-slide-main--flush" style={{ padding: '10px 14px' }}>
        <div className="ppt-table-wrap">
          <table className="ppt-table">
            <thead>
              <tr>
                <th>Location</th>
                <th>Call Leads (April)</th>
                <th>Contact Forms (April)</th>
                <th>Chat Widgets (April)</th>
                <th>Call Leads (Mar)</th>
                <th>Contact Forms(Mar)</th>
                <th>Chat Widgets (Mar)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{r.location}</td>
                <td className="num">{r.callApril}</td>
                <td>{r.formsApril}</td>
                <td>{r.chatApril}</td>
                <td>{r.callMar}</td>
                <td>{r.formsMar}</td>
                <td>{r.chatMar}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <RedSubBar>Combined Totals – March 2026</RedSubBar>
        <div className="ppt-kpi-row">
          <div className="ppt-kpi-card ppt-kpi-card--green">
            <div className="ppt-kpi-accent ppt-kpi-accent--green" />
            <div className="ppt-kpi-body">
              <div className="ppt-kpi-value ppt-kpi-value--green">{boxes[0].value}</div>
              <div className="ppt-kpi-label">{boxes[0].label}</div>
            </div>
          </div>
          {boxes.slice(1).map((box) => (
            <div key={box.label} className="ppt-kpi-card">
              <div className="ppt-kpi-accent ppt-kpi-accent--dark" />
              <div className="ppt-kpi-body">
                <div className="ppt-kpi-value ppt-kpi-value--dark">{box.value}</div>
                <div className="ppt-kpi-label">{box.label}</div>
                {box.label.includes('(Mar)') && (
                  <div className="ppt-kpi-sublabel">Previous month</div>
                )}
              </div>
            </div>
          ))}
        </div>
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
      <div className="ppt-slide-main">
        <p className="ppt-subtitle-muted">March 2026 vs February 2026 cost and conversion analysis</p>
        <div className="ppt-kpi-icons">
          {reportData.paidAdsOverall.topStats.map((s, i) => (
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
              <span className="ppt-tab-pill ppt-tab-pill--active">April 2026</span>
              <span className="ppt-tab-pill">March 2026</span>
              <span className="ppt-tab-pill">Compare</span>
            </div>
          </div>
          <div className="ppt-table-wrap" style={{ margin: 0 }}>
            <table className="ppt-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>April 2026</th>
                  <th>March 2026</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {reportData.paidAdsOverall.table.map((row) => (
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
      <div className="ppt-slide-main">
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
                  <th>April 2026</th>
                  <th>March 2026</th>
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
      <div className="ppt-slide-main ppt-slide-main--flush" style={{ padding: '12px 14px' }}>
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

export function SlidePreview({ slide, index, exportMode = false, report = reportData }) {
  return (
    <ReportPreviewContext.Provider value={report}>
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
