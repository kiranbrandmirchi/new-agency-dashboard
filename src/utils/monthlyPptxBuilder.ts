import PptxGenJS from 'pptxgenjs';
import { buildReportFileName } from './reportFileName';
import { loadImageDataUrl } from './loadImageDataUrl';
import {
  COVER_LEFT_W_IN,
  COVER_RIGHT_W_IN,
  COVER_RIGHT_X_IN,
  SLIDE_H_IN,
  SLIDE_W_IN,
} from './slideDimensions';

/** Live monthly report export payload (from buildMonthlyExportData). */
export type MonthlyExportData = {
  client: string;
  month: string;
  preparedBy: string;
  website: string;
  coverLogoUrl: string;
  compareOn?: boolean;
  currentLabel: string;
  previousLabel: string;
  currentShortLabel: string;
  previousShortLabel: string;
  comparisonHeader: string;
  services: Array<{ icon: string; title: string; body: string }>;
  leadSummary: {
    rows: Array<{
      location: string;
      callCurrent: number;
      formsCurrent: number;
      chatCurrent: number;
      callPrevious: number;
      formsPrevious: number;
      chatPrevious: number;
    }>;
    statBoxes: Array<{ value: string; label: string }>;
    totalsSubBar: string;
  };
  sectionDivider: { title: string; subtitle: string };
  paidAdsOverall: {
    comparisonSubtitle: string;
    currentMonthLabel: string;
    previousMonthLabel: string;
    topStats: Array<{ label: string; value: string }>;
    table: Array<{ metric: string; current: string; previous: string; change: string; positive: boolean }>;
  };
  paidAdsFlorida: {
    current: { label: string; tag: string; users: string; sessions: string; views: string; cost: string; conversions: string; costLead: string };
    previous: { label: string; tag: string; users: string; sessions: string; views: string; cost: string; conversions: string; costLead: string };
    table: Array<{ metric: string; current: string; previous: string; change: string; status: string; positive: boolean }>;
  };
  searchOverview: { table: Array<{ metric: string; overall: string; paid: string; organic: string; paidPct: string; organicPct: string }> };
  topKeywords: { table: Array<{ keyword: string; cost: string; conversions: string }>; insight: string };
  auctionInsights: {
    table: Array<{ domain: string; impressionShare: string; overlapRate: string; posAbove: string; topPage: string; absTop: string; outranking: string }>;
    insights: string[];
  };
  campaignProgress: { overview: string; performance: string; metrics: string; goal: string };
};

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
  contentBg: 'FFFFFF',
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
const NOTES_BOX_H = 0.72;
const NOTES_GAP = 0.06;

type PptxSlide = ReturnType<PptxGenJS['addSlide']>;

const TABLE_X = 0.25;
const TABLE_W = 9.5;

const th = {
  fill: C.redBar,
  color: C.white,
  bold: true,
  fontSize: 9,
  align: 'center' as const,
  valign: 'middle' as const,
};
const td = { fontSize: 9, color: C.darkGray, fill: C.white, valign: 'middle' as const };
const tdCenter = { ...td, align: 'center' as const };
const border = { pt: 0.5, color: C.tableBorder };

type TableRow = Array<string | { text: string; options?: Record<string, unknown> }>;

/** Native PowerPoint table — clean borders, editable cells in PowerPoint. */
function addDataTable(
  slide: PptxSlide,
  rows: TableRow[],
  layout: {
    x?: number;
    y: number;
    w?: number;
    colW: number[];
    rowH?: number;
    border?: { pt?: number; color?: string };
  },
) {
  if (!rows?.length) return;
  slide.addTable(rows, {
    x: layout.x ?? TABLE_X,
    y: layout.y,
    w: layout.w ?? TABLE_W,
    colW: layout.colW,
    rowH: layout.rowH ?? 0.34,
    border: layout.border ?? border,
    fontSize: 9,
  });
}

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

function redFooter(slide: PptxSlide, month: string) {
  slide.addShape('rect', { x: 0, y: FOOTER_Y, w: 10, h: FOOTER_H, fill: { color: C.redBar } });
  slide.addText(`Red Castle Services | SEO & Digital Marketing Report | ${month}`, {
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

function bottomNotesY(): number {
  return FOOTER_Y - NOTES_BOX_H - NOTES_GAP;
}

/** Green notes area pinned above the footer on every content slide. */
function addBottomNotesBox(
  slide: PptxSlide,
  title: string,
  lines: string[],
  fallback = 'Add notes here.',
) {
  const y = bottomNotesY();
  const h = NOTES_BOX_H;
  slide.addShape('rect', {
    x: 0.35,
    y,
    w: 9.3,
    h,
    fill: { color: C.greenLight },
    line: { color: C.greenBorder, width: 1 },
  });
  slide.addText(title, {
    x: 0.5,
    y: y + 0.06,
    w: 9,
    h: 0.2,
    fontSize: 10,
    bold: true,
    color: C.green,
  });
  const cleaned = (lines || []).map((t) => String(t).trim()).filter(Boolean);
  const body = cleaned.length
    ? cleaned.map((t) => (t.startsWith('•') ? t : `• ${t}`)).join('\n')
    : fallback;
  slide.addText(body, {
    x: 0.5,
    y: y + 0.28,
    w: 9,
    h: h - 0.32,
    fontSize: 9,
    color: C.midGray,
    valign: 'top',
    lineSpacing: 11,
  });
}

function tableBottomY(startY: number, dataRowCount: number, rowH: number, headerH = 0.34): number {
  return startY + headerH + dataRowCount * rowH;
}

/** Slide 1 — Cover (34% red | 66% dark, matches preview layout) */
function addCoverSlide(pptx: PptxGenJS, data: MonthlyExportData, logoDataUrl: string | null) {
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
  slide.addText('RED CASTLE\nSERVICES', {
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
}

/** Slide 2 — What We Are Managing */
function addContentSlide2(pptx: PptxGenJS, data: MonthlyExportData) {
  const slide = pptx.addSlide();
  redHeader(slide, 'What We Are Managing', data.client);
  contentBackground(slide);
  const cardH = 1.02;
  const gap = 0.09;
  const startY = MAIN_Y + 0.28;
  const services = Array.isArray(data.services) ? data.services : [];
  services.forEach((svc, i) => {
    const y = startY + i * (cardH + gap);
    slide.addShape('rect', { x: 0.35, y, w: 9.3, h: cardH, fill: { color: C.white } });
    slide.addShape('rect', { x: 0.35, y, w: 0.08, h: cardH, fill: { color: C.redBar } });
    slide.addText(svc.icon, { x: 0.55, y: y + 0.25, w: 0.45, h: 0.4, fontSize: 20 });
    slide.addText(svc.title, { x: 1.05, y: y + 0.15, w: 8.4, h: 0.3, fontSize: 12, bold: true, color: C.darkGray });
    slide.addText(svc.body, { x: 1.05, y: y + 0.48, w: 8.4, h: 0.75, fontSize: 10, color: C.slate, lineSpacing: 14 });
  });
  addBottomNotesBox(slide, 'Notes', [], 'Service scope and campaign notes.');
  redFooter(slide, data.month);
}

/** Slide 3 — Lead Summary */
function addLeadSummarySlide(pptx: PptxGenJS, data: MonthlyExportData) {
  const slide = pptx.addSlide();
  const compareOn = data.compareOn !== false;
  const cur = data.currentShortLabel || data.currentLabel;
  const prev = data.previousShortLabel || data.previousLabel;
  redHeader(slide, 'Overall Performance Overview – Lead Summary', data.comparisonHeader);
  contentBackground(slide);
  const rows = data.leadSummary.rows?.length ? data.leadSummary.rows : [{
    location: data.client, callCurrent: 0, formsCurrent: 0, chatCurrent: 0, callPrevious: 0, formsPrevious: 0, chatPrevious: 0,
  }];
  const thSm = { ...th, fontSize: 8 };
  const headerCells = compareOn ? [
    { text: 'Location', options: th },
    { text: `Calls (${cur})`, options: thSm },
    { text: `Forms (${cur})`, options: thSm },
    { text: `Chat (${cur})`, options: thSm },
    { text: `Calls (${prev})`, options: thSm },
    { text: `Forms (${prev})`, options: thSm },
    { text: `Chat (${prev})`, options: thSm },
  ] : [
    { text: 'Location', options: th },
    { text: `Calls (${cur})`, options: thSm },
    { text: `Forms (${cur})`, options: thSm },
    { text: `Chat (${cur})`, options: thSm },
  ];
  const tableRows = [
    headerCells,
    ...rows.map((r, i) => {
      const base = [
        { text: r.location, options: { ...td, align: 'left', fontSize: 8 } },
        { text: String(r.callCurrent), options: { ...td, bold: i === 0 } },
        { text: String(r.formsCurrent), options: tdCenter },
        { text: String(r.chatCurrent), options: tdCenter },
      ];
      if (!compareOn) return base;
      return [
        ...base,
        { text: String(r.callPrevious), options: tdCenter },
        { text: String(r.formsPrevious), options: tdCenter },
        { text: String(r.chatPrevious), options: tdCenter },
      ];
    }),
  ];
  const tableY = MAIN_Y + 0.1;
  const rowCount = rows.length;
  const tableRowH = 0.3;
  const colW = compareOn
    ? [1.55, 1.15, 1.2, 1.15, 1.15, 1.2, 1.15]
    : [3.6, 2.0, 2.0, 1.9];
  addDataTable(slide, tableRows, {
    y: tableY,
    colW,
    rowH: tableRowH,
    border,
  });
  let y = redSubBar(
    slide,
    data.leadSummary.totalsSubBar || 'Combined Totals',
    tableBottomY(tableY, rowCount, tableRowH) + 0.22,
  );
  const expectedBoxes = compareOn ? 4 : 2;
  const statBoxes = (Array.isArray(data.leadSummary.statBoxes) ? data.leadSummary.statBoxes : []).slice(0, expectedBoxes);
  const boxGap = 0.12;
  const totalGap = boxGap * (statBoxes.length - 1 || 0);
  const boxW = statBoxes.length ? (9.3 - totalGap) / statBoxes.length : 2.15;
  const boxH = 0.72;
  const boxesY = y + 0.16;
  statBoxes.forEach((box, i) => {
    const x = 0.35 + i * (boxW + boxGap);
    slide.addShape('rect', { x, y: boxesY, w: boxW, h: boxH, fill: { color: 'F3F4F6' } });
    slide.addShape('rect', { x, y: boxesY, w: 0.1, h: boxH, fill: { color: C.darkGray } });
    slide.addText(box.value, {
      x: x + 0.15,
      y: boxesY + 0.08,
      w: boxW - 0.2,
      h: 0.36,
      fontSize: 22,
      bold: true,
      color: C.darkGray,
      align: 'center',
    });
    slide.addText(box.label, {
      x: x + 0.12,
      y: boxesY + 0.46,
      w: boxW - 0.15,
      h: 0.24,
      fontSize: 8,
      color: C.darkGray,
      align: 'center',
      valign: 'top',
    });
  });
  addBottomNotesBox(slide, 'Notes', [], 'Lead summary notes and call-tracking highlights.');
  redFooter(slide, data.month);
}

/** Slide 4 — Section divider */
function addSectionSlide(pptx: PptxGenJS, data: MonthlyExportData) {
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
function addPaidAdsOverallSlide(pptx: PptxGenJS, data: MonthlyExportData) {
  const slide = pptx.addSlide();
  const compareOn = data.compareOn !== false;
  redHeader(slide, 'Paid Ads Performance', data.client);
  contentBackground(slide);
  const y0 = MAIN_Y + 0.12;
  if (compareOn) {
    slide.addText(data.paidAdsOverall.comparisonSubtitle, {
      x: 0.35,
      y: y0,
      w: 9,
      h: 0.22,
      fontSize: 9,
      color: C.slate,
    });
  }
  const icons = ['$', '↗', '◎', '▲'];
  const iconFills = [C.iconBlue, C.iconGreen, C.iconOrange, C.iconPurple];
  const iconColors = ['1D4ED8', '15803D', 'C2410C', '7C3AED'];
  const topStats = Array.isArray(data.paidAdsOverall.topStats) ? data.paidAdsOverall.topStats : [];
  topStats.forEach((s, i) => {
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
  if (compareOn) {
    const pillY = panelY + 0.08;
    slide.addShape('rect', { x: 7.0, y: pillY, w: 1.05, h: 0.28, fill: { color: C.tabBlue } });
    slide.addText(currentMonthLabel, { x: 7.0, y: pillY + 0.04, w: 1.05, h: 0.22, fontSize: 7, color: C.white, align: 'center' });
    slide.addShape('rect', { x: 8.1, y: pillY, w: 1.05, h: 0.28, fill: { color: C.white }, line: { color: 'D1D5DB', width: 0.5 } });
    slide.addText(previousMonthLabel, { x: 8.1, y: pillY + 0.04, w: 1.05, h: 0.22, fontSize: 7, color: C.slate, align: 'center' });
  }
  const tableData = Array.isArray(data.paidAdsOverall.table) ? data.paidAdsOverall.table : [];
  const headerRow = compareOn
    ? [
        { text: 'Metric', options: th },
        { text: currentMonthLabel, options: th },
        { text: previousMonthLabel, options: th },
        { text: 'Change', options: th },
      ]
    : [
        { text: 'Metric', options: th },
        { text: currentMonthLabel, options: th },
      ];
  const tableRows = [
    headerRow,
    ...tableData.map((row) => {
      const base = [
        { text: row.metric, options: td },
        { text: row.current, options: tdCenter },
      ];
      if (!compareOn) return base;
      return [
        ...base,
        { text: row.previous, options: tdCenter },
        {
          text: row.change,
          options: { ...tdCenter, bold: true, color: row.positive ? C.green : C.redChange },
        },
      ];
    }),
  ];
  addDataTable(slide, tableRows, {
    x: 0.45,
    y: panelY + 0.45,
    w: 9.1,
    colW: compareOn ? [2.4, 2.2, 2.2, 2.3] : [4.55, 4.55],
    rowH: 0.3,
    border,
  });
  addBottomNotesBox(slide, 'Notes', [], 'Paid ads performance notes and recommendations.');
  redFooter(slide, data.month);
}

/** Slide 6 — Performance Overview */
function addPaidAdsFloridaSlide(pptx: PptxGenJS, data: MonthlyExportData) {
  const slide = pptx.addSlide();
  const compareOn = data.compareOn !== false;
  redHeader(slide, 'Performance Overview', data.client);
  contentBackground(slide);

  const addMetricCard = (
    panel: typeof data.paidAdsFlorida.current,
    x: number,
    y: number,
    w: number,
    titleColor: string,
  ) => {
    const h = 1.28;
    slide.addShape('rect', { x, y, w, h, fill: { color: C.white }, line: { color: 'E5E7EB', width: 0.5 } });
    slide.addText(panel.label, { x: x + 0.12, y: y + 0.08, w: 2.2, h: 0.28, fontSize: 11, bold: true, color: titleColor });
    slide.addText(panel.tag, { x: x + (w - 1.9), y: y + 0.1, w: 1.8, h: 0.25, fontSize: 8, color: C.slate, align: 'right' });
    const items = [
      ['Users', panel.users],
      ['Sessions', panel.sessions],
      ['Views', panel.views],
      ['Cost', panel.cost],
      ['Conversions', panel.conversions],
      ['Cost/Lead', panel.costLead],
    ];
    const colW = (w - 0.24) / 3;
    items.forEach((item, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const px = x + 0.12 + col * colW;
      const py = y + 0.4 + row * 0.44;
      slide.addText(item[1], { x: px, y: py, w: colW - 0.05, h: 0.24, fontSize: 11, bold: true, color: titleColor });
      slide.addText(item[0], { x: px, y: py + 0.24, w: colW - 0.05, h: 0.18, fontSize: 7, color: C.slate });
    });
  };

  const rowY = MAIN_Y + 0.1;
  const cardH = 1.28;
  if (compareOn) {
    addMetricCard(data.paidAdsFlorida.current, 0.35, rowY, 4.45, C.redBar);
    addMetricCard(data.paidAdsFlorida.previous, 5.0, rowY, 4.45, C.midGray);
  } else {
    addMetricCard(data.paidAdsFlorida.current, 0.35, rowY, 9.1, C.redBar);
  }

  const metrics = Array.isArray(data.paidAdsFlorida.table) ? data.paidAdsFlorida.table : [];
  const tableRowH = 0.25;
  const panelY = rowY + cardH + 0.1;
  const panelInnerH = 0.34 + metrics.length * tableRowH + 0.12;
  const panelH = 0.34 + panelInnerH;
  slide.addShape('rect', { x: 0.35, y: panelY, w: 9.3, h: panelH, fill: { color: C.white }, line: { color: 'E5E7EB', width: 0.5 } });
  slide.addText('Detailed Performance Metrics', {
    x: 0.5,
    y: panelY + 0.08,
    w: 5,
    h: 0.25,
    fontSize: 10,
    bold: true,
    color: C.navy,
  });
  const mHead = {
    fill: C.metricsHeadBg,
    color: C.metricsHeadText,
    bold: true,
    fontSize: 9,
    align: 'center' as const,
    valign: 'middle' as const,
  };
  const curLabel = data.paidAdsFlorida.current.label;
  const prevLabel = data.paidAdsFlorida.previous.label;
  const headerCells = compareOn
    ? [
        { text: 'Metric', options: mHead },
        { text: curLabel, options: mHead },
        { text: prevLabel, options: mHead },
        { text: 'Change', options: mHead },
      ]
    : [
        { text: 'Metric', options: mHead },
        { text: curLabel, options: mHead },
      ];
  const metricsBorder = { pt: 0.5, color: 'CCCCCC' };
  const tableRows = [
    headerCells,
    ...metrics.map((row) => {
      const base = [
        { text: row.metric, options: td },
        { text: row.current, options: tdCenter },
      ];
      if (!compareOn) return base;
      return [
        ...base,
        { text: row.previous, options: tdCenter },
        {
          text: row.change,
          options: { ...tdCenter, bold: true, color: row.positive ? C.green : C.redChange },
        },
      ];
    }),
  ];
  addDataTable(slide, tableRows, {
    x: 0.45,
    y: panelY + 0.36,
    w: 9.1,
    colW: compareOn ? [2.3, 2.3, 2.3, 2.2] : [4.55, 4.55],
    rowH: tableRowH,
    border: metricsBorder,
  });
  addBottomNotesBox(slide, 'Notes', [], 'Performance trends and recommendations.');
  redFooter(slide, data.month);
}

/** Slide 7 — Search Overview */
function addSearchOverviewSlide(pptx: PptxGenJS, data: MonthlyExportData) {
  const slide = pptx.addSlide();
  redHeader(slide, 'Search Overview', data.client);
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
    ...(Array.isArray(data.searchOverview.table) ? data.searchOverview.table : []).map((row, i) => {
      const fill = i % 2 === 0 ? C.white : 'F5F5F5';
      const cell = (t: string) => ({ text: t, options: { fontSize: 9, color: C.darkGray, fill, align: 'center' as const } });
      return [cell(row.metric), cell(row.overall), cell(row.paid), cell(row.organic), cell(row.paidPct), cell(row.organicPct)];
    }),
  ];
  addDataTable(slide, tableRows, {
    y: MAIN_Y + 0.12,
    colW: [2.0, 1.3, 1.3, 1.3, 1.2, 1.2],
    rowH: 0.3,
    border,
  });
  addBottomNotesBox(slide, 'Notes', [], 'Search channel insights and organic vs paid trends.');
  redFooter(slide, data.month);
}

/** Slide 8 — Top Keywords */
function addTopKeywordsSlide(pptx: PptxGenJS, data: MonthlyExportData) {
  const slide = pptx.addSlide();
  redHeader(slide, 'Top Keywords', data.client);
  contentBackground(slide);
  const tableRows = [
    [
      { text: 'Top Keyword', options: th },
      { text: 'Cost', options: th },
      { text: 'Conversions', options: th },
    ],
    ...(Array.isArray(data.topKeywords.table) ? data.topKeywords.table : []).map((row) => [
      { text: row.keyword, options: { ...td, align: 'left' } },
      { text: row.cost, options: { ...td, align: 'right', bold: true } },
      { text: row.conversions, options: { ...td, align: 'right', bold: true } },
    ]),
  ];
  const kwRowH = 0.28;
  const kwTableY = MAIN_Y + 0.12;
  addDataTable(slide, tableRows, {
    x: 0.35,
    y: kwTableY,
    w: 9.3,
    colW: [5.4, 1.95, 1.95],
    rowH: kwRowH,
    border,
  });
  const insightText = data.topKeywords.insight?.trim() || '';
  addBottomNotesBox(
    slide,
    'Keyword Insights',
    insightText ? [insightText] : [],
    'Add keyword insights in the report editor.',
  );
  redFooter(slide, data.month);
}

/** Slide 9 — Auction Insights */
function addAuctionInsightsSlide(pptx: PptxGenJS, data: MonthlyExportData) {
  const slide = pptx.addSlide();
  redHeader(slide, `Google Ads Auction Insights  |  ${data.month}`);
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
    ...(Array.isArray(data.auctionInsights.table) ? data.auctionInsights.table : []).map((row, i) => {
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
  const auctionRows = Array.isArray(data.auctionInsights.table) ? data.auctionInsights.table : [];
  const auctionRowH = 0.26;
  addDataTable(slide, tableRows, {
    x: 0.2,
    y: MAIN_Y + 0.1,
    w: 9.6,
    colW: [1.45, 1.15, 1.05, 1.3, 1.15, 1.3, 1.15],
    rowH: auctionRowH,
    border,
  });
  const insights = Array.isArray(data.auctionInsights.insights) ? data.auctionInsights.insights : [];
  addBottomNotesBox(
    slide,
    'Auction Insight',
    insights,
    'Add auction insights in the report editor.',
  );
  redFooter(slide, data.month);
}

/** Slide 10 — Campaign Progress */
function addCampaignProgressSlide(pptx: PptxGenJS, data: MonthlyExportData) {
  const slide = pptx.addSlide();
  redHeader(slide, 'Campaign Progress & Next Steps');
  let y = redSubBar(slide, 'Google Ads Performance Overview & Key Priorities', HEADER_H);
  contentBackground(slide);
  const cp = data.campaignProgress || {};
  const colW = 2.95;
  const colY = y + 0.12;
  const colH = 1.55;
  const columns = [
    String(cp.overview ?? ''),
    String(cp.performance ?? ''),
    String(cp.metrics ?? ''),
  ];
  columns.forEach((text, i) => {
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
  const goalY = colY + colH + 0.1;
  const goalH = 0.58;
  slide.addShape('rect', {
    x: 0.35,
    y: goalY,
    w: 9.3,
    h: goalH,
    fill: { color: C.greenLight },
    line: { color: C.greenBorder, width: 1 },
  });
  slide.addText('Goal:', { x: 0.5, y: goalY + 0.1, w: 0.6, h: 0.22, fontSize: 10, bold: true, color: C.green });
  slide.addText(String(cp.goal ?? ''), {
    x: 1.05,
    y: goalY + 0.1,
    w: 8.5,
    h: goalH - 0.15,
    fontSize: 9,
    color: C.slate,
    lineSpacing: 12,
    valign: 'top',
  });
  addBottomNotesBox(slide, 'Notes', [], 'Campaign progress notes and follow-up items.');
  redFooter(slide, data.month);
}

export type GenerateMonthlyPptxOptions = {
  clientName: string;
  monthLabel: string;
};

/** Build native PowerPoint slides (editable text boxes & tables in PowerPoint). */
export async function buildEditableMonthlyPptx(
  data: MonthlyExportData,
  options: GenerateMonthlyPptxOptions,
): Promise<void> {
  const PptxCtor = (PptxGenJS as unknown as { default?: typeof PptxGenJS }).default ?? PptxGenJS;
  const pptx = new PptxCtor();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'Red Castle Services';
  pptx.title = `${options.clientName} — ${options.monthLabel}`;

  const logoDataUrl = await loadImageDataUrl(data.coverLogoUrl ?? '/rc-logo.png');

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
