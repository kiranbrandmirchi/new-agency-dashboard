import PptxGenJS from 'pptxgenjs';
import type { ReportData } from '../data/reportData';
import { buildReportFileName } from './reportFileName';
import { loadImageDataUrl } from './loadImageDataUrl';
import { brandLabelFromPreparedBy } from './agencyBranding';
import {
  COVER_LEFT_W_IN,
  COVER_RIGHT_W_IN,
  COVER_RIGHT_X_IN,
  SLIDE_H_IN,
  SLIDE_W_IN,
} from './slideDimensions';

const COVER_LOGO_X = SLIDE_W_IN - 1.55;
const COVER_LOGO_Y = 0.34;
const COVER_LOGO_SIZE = 0.4;

/** Colors aligned with preview / reference deck */
const C = {
  darkBg: '1A1A1A',
  coverRed: 'C41E24',
  redBar: 'B91C1C',
  sectionMaroon: '801818',
  sectionAccent: 'A82828',
  salmon: 'F08080',
  white: 'FFFFFF',
  contentBg: 'ECECEC',
  darkGray: '333333',
  midGray: '666666',
  slate: '64748B',
  navy: '1E293B',
  green: '15803D',
  greenLight: 'ECFDF5',
  greenBorder: '86EFAC',
  redChange: 'DC2626',
  tableBorder: '333333',
  metricsHeadBg: 'E8EEF4',
  metricsHeadText: '1E3A5F',
  tabBlue: '2563EB',
  iconBlue: 'DBEAFE',
  iconGreen: 'DCFCE7',
  iconOrange: 'FFEDD5',
  iconPurple: 'F3E8FF',
};

const SLIDE_H = SLIDE_H_IN;
const HEADER_H = 0.39;
const FOOTER_H = 0.21;
const MAIN_Y = HEADER_H;
const MAIN_H = SLIDE_H - HEADER_H - FOOTER_H;
const FOOTER_Y = SLIDE_H - FOOTER_H;
const BOTTOM_INSIGHT_H = 1.2;
const BOTTOM_INSIGHT_Y = FOOTER_Y - BOTTOM_INSIGHT_H - 0.08;
const COVER_BOTTOM_INSIGHT_Y = SLIDE_H - BOTTOM_INSIGHT_H - 0.15;

type PptxSlide = ReturnType<PptxGenJS['addSlide']>;

const th = { fill: C.redBar, color: C.white, bold: true, fontSize: 9 };
const td = { fontSize: 9, color: C.darkGray, fill: C.white };
const tdCenter = { ...td, align: 'center' as const };
const border = { pt: 0.5, color: C.tableBorder };

function redHeader(slide: PptxSlide, title: string, right?: string) {
  slide.addShape('rect', { x: 0, y: 0, w: 10, h: HEADER_H, fill: { color: C.redBar } });
  slide.addText(title, {
    x: 0.2,
    y: 0.06,
    w: right ? 6.2 : 9.6,
    h: 0.38,
    fontSize: 13,
    bold: true,
    color: C.white,
    valign: 'middle',
  });
  if (right) {
    slide.addText(right, {
      x: 6.5,
      y: 0.08,
      w: 3.3,
      h: 0.34,
      fontSize: 10,
      color: C.white,
      align: 'right',
      valign: 'middle',
    });
  }
}

function redFooter(slide: PptxSlide, month: string, brandName = 'AGENCY') {
  slide.addShape('rect', { x: 0, y: FOOTER_Y, w: 10, h: FOOTER_H, fill: { color: C.redBar } });
  slide.addText(`${brandName} | SEO & Digital Marketing Report | ${month}`, {
    x: 0.2,
    y: FOOTER_Y + 0.05,
    w: 9.6,
    h: 0.2,
    fontSize: 8,
    color: C.white,
    italic: true,
  });
}

function redSubBar(slide: PptxSlide, text: string, y: number) {
  const h = 0.28;
  slide.addShape('rect', { x: 0, y, w: 10, h, fill: { color: C.redBar } });
  slide.addText(text, {
    x: 0.2,
    y: y + 0.04,
    w: 9.6,
    h: 0.22,
    fontSize: 10,
    bold: true,
    color: C.white,
  });
  return y + h;
}

function contentBackground(slide: PptxSlide) {
  slide.addShape('rect', {
    x: 0,
    y: MAIN_Y,
    w: 10,
    h: MAIN_H,
    fill: { color: C.contentBg },
  });
}

function addInsightBox(
  slide: PptxSlide,
  y: number,
  title: string | null,
  bullets: string[],
  options: { bulleted?: boolean } = {},
) {
  const { bulleted = true } = options;
  const h = title ? 1.35 : 1.2;
  slide.addShape('rect', {
    x: 0.35,
    y,
    w: 9.3,
    h,
    fill: { color: C.greenLight },
    line: { color: C.greenBorder, width: 1 },
  });
  let ty = y + 0.1;
  if (title) {
    slide.addText(title, {
      x: 0.5,
      y: ty,
      w: 9,
      h: 0.25,
      fontSize: 10,
      bold: true,
      color: C.green,
    });
    ty += 0.28;
  }
  bullets.forEach((text, i) => {
    slide.addText(bulleted ? `• ${text}` : text, {
      x: 0.5,
      y: ty + i * 0.42,
      w: 9,
      h: 0.4,
      fontSize: 9,
      color: C.midGray,
      lineSpacing: 12,
    });
  });
}

function getSlideBottomInsight(data: ReportData, slideNum: number): string {
  return data.slideBottomInsights?.[String(slideNum)]?.trim() ?? '';
}

function addSlideBottomInsight(slide: PptxSlide, data: ReportData, slideNum: number, y = BOTTOM_INSIGHT_Y) {
  const text = getSlideBottomInsight(data, slideNum);
  if (text) addInsightBox(slide, y, null, [text], { bulleted: false });
}

/** Slide 1 — Cover (34% red | 66% dark, matches preview layout) */
function addCoverSlide(pptx: PptxGenJS, data: ReportData, logoDataUrl: string | null) {
  const slide = pptx.addSlide();
  const leftPad = 0.35;
  const rightPad = COVER_RIGHT_X_IN + 0.15;

  slide.background = { color: C.darkBg };
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: COVER_LEFT_W_IN,
    h: SLIDE_H,
    fill: { color: C.coverRed },
  });

  // Left column — top metadata, "Monthly Report" anchored to bottom
  slide.addText('SERVICES', {
    x: leftPad,
    y: 0.38,
    w: COVER_LEFT_W_IN - leftPad * 2,
    h: 0.22,
    fontSize: 9,
    color: C.white,
    bold: true,
  });
  slide.addShape('rect', {
    x: leftPad,
    y: 0.62,
    w: 1.45,
    h: 0.03,
    fill: { color: C.white },
  });
  slide.addText(data.month, {
    x: leftPad,
    y: 0.72,
    w: COVER_LEFT_W_IN - leftPad * 2,
    h: 0.28,
    fontSize: 11,
    color: C.white,
  });
  slide.addText('Monthly\nReport', {
    x: leftPad,
    y: SLIDE_H - 1.05,
    w: COVER_LEFT_W_IN - leftPad * 2,
    h: 0.75,
    fontSize: 13,
    bold: true,
    color: C.white,
    lineSpacing: 14,
    valign: 'top',
  });

  // Right column — logo top-right, title, client, footer
  slide.addShape('rect', {
    x: COVER_LOGO_X,
    y: COVER_LOGO_Y,
    w: COVER_LOGO_SIZE,
    h: COVER_LOGO_SIZE,
    fill: { color: C.white },
  });
  if (logoDataUrl) {
    slide.addImage({
      data: logoDataUrl,
      x: COVER_LOGO_X,
      y: COVER_LOGO_Y,
      w: COVER_LOGO_SIZE,
      h: COVER_LOGO_SIZE,
    });
  }
  slide.addText(brandLabelFromPreparedBy(data.preparedBy).replace(/\s+/g, '\n'), {
    x: SLIDE_W_IN - 1.1,
    y: COVER_LOGO_Y,
    w: 1.05,
    h: 0.48,
    fontSize: 7,
    bold: true,
    color: C.white,
    lineSpacing: 10,
  });
  slide.addText('SEO & Digital\nMarketing\nUpdates', {
    x: rightPad,
    y: 0.72,
    w: COVER_RIGHT_W_IN - 0.35,
    h: 1.75,
    fontSize: 32,
    bold: true,
    color: C.white,
    lineSpacing: 22,
    valign: 'top',
  });
  slide.addText(data.client, {
    x: rightPad,
    y: 2.65,
    w: COVER_RIGHT_W_IN - 0.3,
    h: 0.38,
    fontSize: 16,
    bold: true,
    color: C.salmon,
  });
  slide.addShape('rect', {
    x: rightPad,
    y: SLIDE_H - 0.62,
    w: COVER_RIGHT_W_IN - 0.35,
    h: 0.015,
    fill: { color: C.midGray },
  });
  slide.addText(`Prepared by ${data.preparedBy} | ${data.website}`, {
    x: rightPad,
    y: SLIDE_H - 0.48,
    w: COVER_RIGHT_W_IN - 0.3,
    h: 0.28,
    fontSize: 9,
    color: '999999',
  });
  addSlideBottomInsight(slide, data, 1, COVER_BOTTOM_INSIGHT_Y);
}

/** Slide 2 — What We Are Managing */
function addContentSlide2(pptx: PptxGenJS, data: ReportData) {
  const slide = pptx.addSlide();
  redHeader(slide, 'What We Are Managing', data.client);
  contentBackground(slide);
  const cardH = 1.02;
  const gap = 0.09;
  const startY = MAIN_Y + 0.28;
  data.services.forEach((svc, i) => {
    const y = startY + i * (cardH + gap);
    slide.addShape('rect', { x: 0.35, y, w: 9.3, h: cardH, fill: { color: C.white } });
    slide.addShape('rect', { x: 0.35, y, w: 0.08, h: cardH, fill: { color: C.redBar } });
    slide.addText(svc.icon, { x: 0.55, y: y + 0.25, w: 0.45, h: 0.4, fontSize: 20 });
    slide.addText(svc.title, { x: 1.05, y: y + 0.15, w: 8.4, h: 0.3, fontSize: 12, bold: true, color: C.darkGray });
    slide.addText(svc.body, { x: 1.05, y: y + 0.48, w: 8.4, h: 0.75, fontSize: 10, color: C.slate, lineSpacing: 14 });
  });
  addSlideBottomInsight(slide, data, 2);
  redFooter(slide, data.month, brandLabelFromPreparedBy(data.preparedBy));
}

/** Slide 3 — Lead Summary */
function addLeadSummarySlide(pptx: PptxGenJS, data: ReportData) {
  const slide = pptx.addSlide();
  redHeader(slide, 'Overall Performance Overview – Lead Summary', data.leadSummary.comparisonHeader);
  contentBackground(slide);
  const r = data.leadSummary.tableRow;
  const cur = data.leadSummary.currentMonthName;
  const prev = data.leadSummary.previousMonthName;
  const tableRows = [
    [
      { text: 'Location', options: th },
      { text: `Call Leads (${cur})`, options: th },
      { text: `Contact Forms (${cur})`, options: th },
      { text: `Chat Widgets (${cur})`, options: th },
      { text: `Call Leads (${prev})`, options: th },
      { text: `Contact Forms (${prev})`, options: th },
      { text: `Chat Widgets (${prev})`, options: th },
    ],
    [
      { text: r.location, options: td },
      { text: String(r.callApril), options: { ...td, bold: true } },
      { text: String(r.formsApril), options: tdCenter },
      { text: String(r.chatApril), options: tdCenter },
      { text: String(r.callMar), options: tdCenter },
      { text: String(r.formsMar), options: tdCenter },
      { text: String(r.chatMar), options: tdCenter },
    ],
  ];
  slide.addTable(tableRows, {
    x: 0.25,
    y: MAIN_Y + 0.15,
    w: 9.5,
    colW: [0.95, 1.15, 1.3, 1.3, 1.15, 1.3, 1.3],
    border,
  });
  let y = redSubBar(slide, data.leadSummary.combinedTotalsLabel, MAIN_Y + 0.82);
  const boxW = 2.2;
  const boxGap = 0.12;
  const boxH = 0.88;
  const accents = [C.green, C.darkGray, C.darkGray, C.darkGray];
  const bgFills = [C.greenLight, 'F3F4F6', 'F3F4F6', 'F3F4F6'];
  const valColors = [C.green, C.darkGray, C.darkGray, C.darkGray];
  data.leadSummary.statBoxes.forEach((box, i) => {
    const x = 0.35 + i * (boxW + boxGap);
    slide.addShape('rect', { x, y: y + 0.08, w: boxW, h: boxH, fill: { color: bgFills[i] } });
    slide.addShape('rect', { x, y: y + 0.08, w: 0.1, h: boxH, fill: { color: accents[i] } });
    slide.addText(box.value, {
      x: x + 0.15,
      y: y + 0.2,
      w: boxW - 0.2,
      h: 0.45,
      fontSize: 26,
      bold: true,
      color: valColors[i],
      align: 'center',
    });
    slide.addText(box.label, {
      x: x + 0.12,
      y: y + 0.68,
      w: boxW - 0.15,
      h: 0.45,
      fontSize: 8,
      color: C.darkGray,
      align: 'center',
    });
    if (box.isPreviousMonth) {
      slide.addText('Previous month', {
        x: x + 0.12,
        y: y + 0.95,
        w: boxW - 0.15,
        h: 0.2,
        fontSize: 7,
        color: C.midGray,
        italic: true,
        align: 'center',
      });
    }
  });
  addSlideBottomInsight(slide, data, 3);
  redFooter(slide, data.month, brandLabelFromPreparedBy(data.preparedBy));
}
function addSectionSlide(pptx: PptxGenJS, data: ReportData) {
  const slide = pptx.addSlide();
  slide.background = { color: C.sectionMaroon };
  slide.addShape('rect', { x: 0, y: 0, w: 0.06, h: SLIDE_H, fill: { color: C.sectionAccent } });
  slide.addText(data.sectionDivider.title, {
    x: 0.35,
    y: SLIDE_H * 0.38,
    w: 9,
    h: 0.7,
    fontSize: 32,
    bold: true,
    color: C.white,
  });
  slide.addShape('rect', { x: 0.35, y: SLIDE_H * 0.55, w: 3.8, h: 0.03, fill: { color: C.sectionAccent } });
  slide.addText(data.sectionDivider.subtitle, {
    x: 0.35,
    y: SLIDE_H * 0.58,
    w: 9,
    h: 0.4,
    fontSize: 14,
    italic: true,
    color: C.white,
  });
}

/** Slide 5 — Paid Ads Performance */
function addPaidAdsOverallSlide(pptx: PptxGenJS, data: ReportData) {
  const slide = pptx.addSlide();
  redHeader(slide, 'Paid Ads Performance', data.client);
  contentBackground(slide);
  const y0 = MAIN_Y + 0.12;
  slide.addText(data.paidAdsOverall.comparisonSubtitle, {
    x: 0.35,
    y: y0,
    w: 9,
    h: 0.22,
    fontSize: 9,
    color: C.slate,
  });
  const icons = ['$', '↗', '◎', '▲'];
  const iconFills = [C.iconBlue, C.iconGreen, C.iconOrange, C.iconPurple];
  const iconColors = ['1D4ED8', '15803D', 'C2410C', '7C3AED'];
  data.paidAdsOverall.topStats.forEach((s, i) => {
    const x = 0.35 + i * 2.35;
    const cy = y0 + 0.35;
    slide.addShape('rect', { x, y: cy, w: 2.15, h: 0.85, fill: { color: C.white }, line: { color: 'E5E7EB', width: 0.5 } });
    slide.addShape('ellipse', { x: x + 0.12, y: cy + 0.18, w: 0.42, h: 0.42, fill: { color: iconFills[i] } });
    slide.addText(icons[i], { x: x + 0.2, y: cy + 0.22, w: 0.3, h: 0.3, fontSize: 14, bold: true, color: iconColors[i], align: 'center' });
    slide.addText(s.label.toUpperCase(), { x: x + 0.58, y: cy + 0.12, w: 1.5, h: 0.2, fontSize: 7, color: C.slate });
    slide.addText(s.value, { x: x + 0.58, y: cy + 0.32, w: 1.5, h: 0.35, fontSize: 16, bold: true, color: C.navy });
  });
  const panelY = y0 + 1.02;
  slide.addShape('rect', { x: 0.35, y: panelY, w: 9.3, h: 1.92, fill: { color: C.white }, line: { color: 'E5E7EB', width: 0.5 } });
  slide.addText('Detailed Cost & Performance Breakdown', {
    x: 0.5,
    y: panelY + 0.1,
    w: 5.5,
    h: 0.28,
    fontSize: 10,
    bold: true,
    color: C.navy,
  });
  const { currentMonthLabel, previousMonthLabel } = data.paidAdsOverall;
  const pillY = panelY + 0.08;
  slide.addShape('rect', { x: 7.0, y: pillY, w: 1.05, h: 0.28, fill: { color: C.tabBlue } });
  slide.addText(currentMonthLabel, { x: 7.0, y: pillY + 0.04, w: 1.05, h: 0.22, fontSize: 7, color: C.white, align: 'center' });
  slide.addShape('rect', { x: 8.1, y: pillY, w: 1.05, h: 0.28, fill: { color: C.white }, line: { color: 'D1D5DB', width: 0.5 } });
  slide.addText(previousMonthLabel, { x: 8.1, y: pillY + 0.04, w: 1.05, h: 0.22, fontSize: 7, color: C.slate, align: 'center' });
  const tableRows = [
    [
      { text: 'Metric', options: th },
      { text: currentMonthLabel, options: th },
      { text: previousMonthLabel, options: th },
      { text: 'Change', options: th },
    ],
    ...data.paidAdsOverall.table.map((row) => [
      { text: row.metric, options: td },
      { text: row.current, options: tdCenter },
      { text: row.previous, options: tdCenter },
      {
        text: row.change,
        options: { fontSize: 9, bold: true, color: row.positive ? C.green : C.redChange, fill: C.white, align: 'center' },
      },
    ]),
  ];
  slide.addTable(tableRows, {
    x: 0.45,
    y: panelY + 0.45,
    w: 9.1,
    colW: [2.4, 2.2, 2.2, 2.3],
    border,
  });
  addSlideBottomInsight(slide, data, 5);
  redFooter(slide, data.month, brandLabelFromPreparedBy(data.preparedBy));
}

/** Slide 6 — Performance Overview */
function addPaidAdsFloridaSlide(pptx: PptxGenJS, data: ReportData) {
  const slide = pptx.addSlide();
  redHeader(slide, 'Performance Overview', data.client);
  contentBackground(slide);

  const addMetricCard = (
    panel: typeof data.paidAdsFlorida.current,
    x: number,
    y: number,
    titleColor: string,
  ) => {
    const w = 4.45;
    const h = 1.18;
    slide.addShape('rect', { x, y, w, h, fill: { color: C.white }, line: { color: 'E5E7EB', width: 0.5 } });
    slide.addText(panel.label, { x: x + 0.12, y: y + 0.08, w: 2.2, h: 0.28, fontSize: 11, bold: true, color: titleColor });
    slide.addText(panel.tag, { x: x + 2.5, y: y + 0.1, w: 1.8, h: 0.25, fontSize: 8, color: C.slate, align: 'right' });
    const items = [
      ['Users', panel.users],
      ['Sessions', panel.sessions],
      ['Views', panel.views],
      ['Cost', panel.cost],
      ['Conversions', panel.conversions],
      ['Cost/Lead', panel.costLead],
    ];
    items.forEach((item, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const px = x + 0.12 + col * 1.42;
      const py = y + 0.42 + row * 0.52;
      slide.addText(item[1], { x: px, y: py, w: 1.35, h: 0.28, fontSize: 13, bold: true, color: titleColor });
      slide.addText(item[0], { x: px, y: py + 0.28, w: 1.35, h: 0.2, fontSize: 7, color: C.slate });
    });
  };

  const rowY = MAIN_Y + 0.15;
  addMetricCard(data.paidAdsFlorida.current, 0.35, rowY, C.redBar);
  addMetricCard(data.paidAdsFlorida.previous, 5.0, rowY, C.midGray);

  const panelY = rowY + 1.28;
  slide.addShape('rect', { x: 0.35, y: panelY, w: 9.3, h: 1.78, fill: { color: C.white }, line: { color: 'E5E7EB', width: 0.5 } });
  slide.addText('Detailed Performance Metrics', {
    x: 0.5,
    y: panelY + 0.08,
    w: 5,
    h: 0.25,
    fontSize: 10,
    bold: true,
    color: C.navy,
  });
  const mHead = { fill: C.metricsHeadBg, color: C.metricsHeadText, bold: true, fontSize: 9 };
  const { currentMonthLabel, previousMonthLabel } = data.paidAdsFlorida;
  const tableRows = [
    [
      { text: 'Metric', options: mHead },
      { text: currentMonthLabel, options: mHead },
      { text: previousMonthLabel, options: mHead },
      { text: 'Change', options: mHead },
      { text: 'Status', options: mHead },
    ],
    ...data.paidAdsFlorida.table.map((row) => [
      { text: row.metric, options: td },
      { text: row.current, options: tdCenter },
      { text: row.previous, options: tdCenter },
      { text: row.change, options: { fontSize: 9, bold: true, color: row.positive ? C.green : C.redChange, fill: C.white, align: 'center' } },
      { text: row.status, options: tdCenter },
    ]),
  ];
  slide.addTable(tableRows, {
    x: 0.45,
    y: panelY + 0.38,
    w: 9.1,
    colW: [1.9, 1.75, 1.75, 1.75, 1.75],
    border: { pt: 0.5, color: 'CCCCCC' },
  });
  addSlideBottomInsight(slide, data, 6);
  redFooter(slide, data.month, brandLabelFromPreparedBy(data.preparedBy));
}

/** Slide 7 — Search Overview */
function addSearchOverviewSlide(pptx: PptxGenJS, data: ReportData) {
  const slide = pptx.addSlide();
  redHeader(slide, 'Search Overview – Florida', 'GA4 Analytics');
  contentBackground(slide);
  const tableRows = [
    [
      { text: 'Channel Metric', options: th },
      { text: 'Overall', options: th },
      { text: 'Paid Search', options: th },
      { text: 'Organic', options: th },
      { text: '% Paid', options: th },
      { text: '% Organic', options: th },
    ],
    ...data.searchOverview.table.map((row, i) => {
      const fill = i % 2 === 0 ? C.white : 'F5F5F5';
      const cell = (t: string) => ({ text: t, options: { fontSize: 9, color: C.darkGray, fill, align: 'center' as const } });
      return [cell(row.metric), cell(row.overall), cell(row.paid), cell(row.organic), cell(row.paidPct), cell(row.organicPct)];
    }),
  ];
  slide.addTable(tableRows, {
    x: 0.25,
    y: MAIN_Y + 0.2,
    w: 9.5,
    colW: [2.0, 1.3, 1.3, 1.3, 1.2, 1.2],
    border,
  });
  addSlideBottomInsight(slide, data, 7);
  redFooter(slide, data.month, brandLabelFromPreparedBy(data.preparedBy));
}

/** Slide 8 — Top Keywords */
function addTopKeywordsSlide(pptx: PptxGenJS, data: ReportData) {
  const slide = pptx.addSlide();
  redHeader(slide, 'Top Keywords – Florida', 'Google Ads');
  contentBackground(slide);
  slide.addShape('rect', { x: 0.35, y: MAIN_Y + 0.12, w: 0.95, h: 0.28, fill: { color: C.redBar } });
  slide.addText('FLORIDA', {
    x: 0.35,
    y: MAIN_Y + 0.15,
    w: 0.95,
    h: 0.24,
    fontSize: 9,
    bold: true,
    color: C.white,
    align: 'center',
  });
  const tableRows = [
    [
      { text: 'Top Keyword', options: th },
      { text: 'Cost', options: th },
      { text: 'Conversions', options: th },
    ],
    ...data.topKeywords.table.map((row) => [
      { text: row.keyword, options: { ...td, align: 'left' } },
      { text: row.cost, options: { ...td, align: 'right', bold: true } },
      { text: row.conversions, options: { ...td, align: 'right', bold: true } },
    ]),
  ];
  slide.addTable(tableRows, {
    x: 0.35,
    y: MAIN_Y + 0.48,
    w: 9.3,
    colW: [5.4, 1.95, 1.95],
    border,
  });
  addInsightBox(slide, MAIN_Y + 1.62, null, [data.topKeywords.insight]);
  redFooter(slide, data.month, brandLabelFromPreparedBy(data.preparedBy));
}

/** Slide 9 — Auction Insights */
function addAuctionInsightsSlide(pptx: PptxGenJS, data: ReportData) {
  const slide = pptx.addSlide();
  redHeader(slide, 'Google Ads Auction Insights  |  April 2026');
  contentBackground(slide);
  const headerOpts = { ...th, fontSize: 8 };
  const tableRows = [
    [
      { text: 'Domain', options: headerOpts },
      { text: 'Impression Share', options: headerOpts },
      { text: 'Overlap Rate', options: headerOpts },
      { text: 'Position Above Rate', options: headerOpts },
      { text: 'Top of Page Rate', options: headerOpts },
      { text: 'Abs. Top of Page Rate', options: headerOpts },
      { text: 'Outranking Share', options: headerOpts },
    ],
    ...data.auctionInsights.table.map((row, i) => {
      const fill = i === 0 ? C.greenLight : C.white;
      const cell = (t: string, bold = false) => ({
        text: t,
        options: { fontSize: 8, color: C.darkGray, fill, align: 'center' as const, bold },
      });
      return [
        cell(row.domain, i === 0),
        cell(row.impressionShare),
        cell(row.overlapRate),
        cell(row.posAbove),
        cell(row.topPage),
        cell(row.absTop),
        cell(row.outranking),
      ];
    }),
  ];
  slide.addTable(tableRows, {
    x: 0.2,
    y: MAIN_Y + 0.15,
    w: 9.6,
    colW: [1.45, 1.15, 1.05, 1.3, 1.15, 1.3, 1.15],
    border,
  });
  addInsightBox(slide, MAIN_Y + 1.18, 'Auction Insight', data.auctionInsights.insights);
  redFooter(slide, data.month, brandLabelFromPreparedBy(data.preparedBy));
}

/** Slide 10 — Campaign Progress */
function addCampaignProgressSlide(pptx: PptxGenJS, data: ReportData) {
  const slide = pptx.addSlide();
  redHeader(slide, 'Campaign Progress & Next Steps');
  let y = redSubBar(slide, 'Google Ads Performance Overview & Key Priorities', HEADER_H);
  contentBackground(slide);
  const cp = data.campaignProgress;
  const colW = 2.95;
  const colY = y + 0.15;
  const colH = 2.15;
  [cp.overview, cp.performance, cp.metrics].forEach((text, i) => {
    const x = 0.35 + i * (colW + 0.12);
    slide.addShape('rect', { x, y: colY, w: colW, h: colH, fill: { color: C.white }, line: { color: 'E5E7EB', width: 0.5 } });
    slide.addText(text, {
      x: x + 0.1,
      y: colY + 0.1,
      w: colW - 0.15,
      h: colH - 0.15,
      fontSize: 9,
      color: C.slate,
      lineSpacing: 13,
      valign: 'top',
    });
  });
  const goalY = colY + colH + 0.12;
  slide.addShape('rect', {
    x: 0.35,
    y: goalY,
    w: 9.3,
    h: 0.75,
    fill: { color: C.greenLight },
    line: { color: C.greenBorder, width: 1 },
  });
  slide.addText('Goal:', { x: 0.5, y: goalY + 0.12, w: 0.6, h: 0.25, fontSize: 10, bold: true, color: C.green });
  slide.addText(cp.goal, {
    x: 1.05,
    y: goalY + 0.12,
    w: 8.5,
    h: 0.55,
    fontSize: 9,
    color: C.slate,
    lineSpacing: 12,
  });
  redFooter(slide, data.month, brandLabelFromPreparedBy(data.preparedBy));
}

export type GeneratePptxOptions = {
  /** Display name from Clients List dropdown */
  clientName: string;
  /** Display label from Month dropdown (e.g. "April 2026") */
  monthLabel: string;
};

/** @deprecated Use buildReportFileName(clientName, monthLabel, 'pptx') */
export function buildPptxFileName(clientName: string, monthLabel: string): string {
  return buildReportFileName(clientName, monthLabel, 'pptx');
}

export async function generatePptx(data: ReportData, options: GeneratePptxOptions): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';

  const logoDataUrl = await loadImageDataUrl(data.coverLogoUrl ?? '/brand-logo.png');

  addCoverSlide(pptx, data, logoDataUrl);
  addContentSlide2(pptx, data);
  addLeadSummarySlide(pptx, data);
  addSectionSlide(pptx, data);
  addPaidAdsOverallSlide(pptx, data);
  addPaidAdsFloridaSlide(pptx, data);
  addSearchOverviewSlide(pptx, data);
  addTopKeywordsSlide(pptx, data);
  addAuctionInsightsSlide(pptx, data);
  addCampaignProgressSlide(pptx, data);

  await pptx.writeFile({
    fileName: buildReportFileName(options.clientName, options.monthLabel, 'pptx'),
  });
}
