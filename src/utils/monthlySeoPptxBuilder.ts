import type PptxGenJS from 'pptxgenjs';
import { SLIDE_H_IN } from './slideDimensions';
import { isDirectImageUrl, parseGoogleSheetsUrl, resolveKeywordSheetUrl } from './googleSheetsEmbed';
import { formatDisplayPeriodLabel } from './monthlyReportHelpers';

const SLIDE_H = SLIDE_H_IN;
const HEADER_H = 0.39;
const FOOTER_H = 0.21;
const FOOTER_Y = SLIDE_H - FOOTER_H;

const C = {
  redBar: 'B91C1C',
  sectionMaroon: '801818',
  sectionAccent: 'A82828',
  white: 'FFFFFF',
  darkGray: '333333',
  slate: '64748B',
  greenLight: 'ECFDF5',
  greenBorder: '86EFAC',
  green: '15803D',
  tableBorder: '333333',
};

type PptxSlide = ReturnType<PptxGenJS['addSlide']>;
type TableRow = Array<string | { text: string; options?: Record<string, unknown> }>;

const SLIDE_BORDER = { pt: 1, color: '333333' };
const CARD_BORDER = { pt: 1, color: 'CBD5E1' };

function redHeader(slide: PptxSlide, title: string, right?: string) {
  slide.addShape('rect', { x: 0, y: 0, w: 10, h: HEADER_H, fill: { color: C.redBar } });
  slide.addText(title, { x: 0.2, y: 0.05, w: right ? 6.4 : 9.6, h: 0.38, fontSize: 13, bold: true, color: C.white, valign: 'middle' });
  if (right) slide.addText(right, { x: 6.5, y: 0.07, w: 3.3, h: 0.34, fontSize: 10, color: C.white, align: 'right', valign: 'middle' });
}

function redFooter(slide: PptxSlide, month: string) {
  slide.addShape('rect', { x: 0, y: FOOTER_Y, w: 10, h: FOOTER_H, fill: { color: C.redBar } });
  slide.addText([
    { text: 'RED CASTLE SERVICES', options: { bold: true, fontSize: 10 } },
    { text: ' | SEO & DIGITAL MARKETING REPORT | ', options: { fontSize: 9 } },
    { text: month, options: { fontSize: 9 } },
  ], { x: 0.2, y: FOOTER_Y + 0.04, w: 9.6, h: 0.2, color: C.white, valign: 'middle' });
}

function sectionSlide(pptx: PptxGenJS, title: string, subtitle: string) {
  const slide = pptx.addSlide();
  slide.background = { color: C.sectionMaroon };
  slide.addShape('rect', { x: 0, y: 0, w: 0.06, h: SLIDE_H, fill: { color: C.sectionAccent } });
  slide.addText(title, { x: 0.35, y: SLIDE_H * 0.38, w: 9, h: 0.8, fontSize: 28, bold: true, color: C.white });
  slide.addShape('rect', { x: 0.35, y: SLIDE_H * 0.55, w: 3.8, h: 0.03, fill: { color: C.sectionAccent } });
  slide.addText(subtitle, { x: 0.35, y: SLIDE_H * 0.58, w: 9, h: 0.4, fontSize: 14, color: C.white });
}

function addTable(slide: PptxSlide, rows: TableRow[], y: number, colW: number[], rowH = 0.32, fontSize = 9) {
  if (!rows.length) return;
  slide.addTable(rows, { x: 0.22, y, w: 9.56, colW, rowH, border: SLIDE_BORDER, fontSize });
}

/** Draw divider + gap before a compare (previous) period block. */
function addComparePeriodDivider(slide: PptxSlide, y: number): number {
  slide.addShape('line', {
    x: 0.28,
    y: y + PERIOD_COMPARE_DIVIDER_Y,
    w: 9.44,
    h: 0,
    line: { color: 'CBD5E1', width: 1 },
  });
  return y + PERIOD_COMPARE_BLOCK_GAP;
}

function addPeriodBlockLabel(slide: PptxSlide, label: string, y: number, color = C.redBar): number {
  slide.addText(label, {
    x: 0.3,
    y,
    w: 9.4,
    h: PERIOD_LABEL_H,
    fontSize: 10,
    bold: true,
    color,
  });
  return y + PERIOD_LABEL_H + PERIOD_LABEL_TABLE_GAP;
}

const th = { fill: C.redBar, color: C.white, bold: true, fontSize: 9, align: 'center' as const, valign: 'middle' as const };
const td = { fontSize: 9, color: C.darkGray, fill: C.white, valign: 'middle' as const };

type StatBox = {
  value: string;
  label: string;
  sub?: string;
  previousValue?: string | null;
  comparePct?: number | null;
  compareUp?: boolean;
  compareGood?: boolean;
};
type PlatformBlock = { title?: string; statBoxes?: StatBox[] };

type CompareSections = Record<string, boolean | undefined>;

function sectionCompareOn(globalCompareOn: boolean, compareSections: CompareSections | undefined, key: string): boolean {
  if (!globalCompareOn) return false;
  if (!compareSections) return true;
  return compareSections[key] !== false;
}

const NOTES_BOX_H = 0.38;
const NOTES_GAP = 0.08;
/** Spacing between dual-period blocks (Apr above / Mar below) — matches preview divider gap */
const PERIOD_COMPARE_DIVIDER_Y = 0.02;
const PERIOD_COMPARE_BLOCK_GAP = 0.22;
const PERIOD_LABEL_TABLE_GAP = 0.22;
const PERIOD_LABEL_H = 0.2;
const TABLE_BLOCK_BUFFER = 0.16;
const PAGE_CELL_MAX = 46;
const PERIOD_COMPARE_LABEL_COLOR = '64748B';

function resolvePeriodLabel(raw: string | undefined, shortLabel: string, fallback: string) {
  return formatDisplayPeriodLabel(raw, '') || shortLabel || fallback;
}

function truncateSlideCell(text: string, max = PAGE_CELL_MAX) {
  const t = String(text || '').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Keep +/-NN.N% on one line in narrow GBP table cells. */
function formatCompactPctChange(raw: string) {
  const s = String(raw || '').trim();
  const m = s.match(/^([+-−]?)(\d+(?:\.\d+)?)\s*%?$/);
  if (m) {
    const sign = m[1] === '−' || m[1] === '-' ? '-' : (m[1] === '+' ? '+' : '');
    const n = parseFloat(m[2]);
    if (Number.isFinite(n)) return `${sign}${Math.abs(n).toFixed(1)}%`;
  }
  return s.replace(/\s+%/g, '%');
}

function gbpChangeCell(text: string, compact = false) {
  const label = compact ? formatCompactPctChange(text) : String(text || '');
  return {
    text: label,
    options: {
      fontSize: compact ? 7 : 8,
      color: C.darkGray,
      fill: C.white,
      align: 'center' as const,
      valign: 'middle' as const,
      shrinkText: true,
    },
  };
}

function gbpTableColWidths(innerW: number, showCompare: boolean, locationCount: number) {
  if (!showCompare) return [innerW * 0.55, innerW * 0.45];
  if (locationCount >= 3) {
    return [innerW * 0.28, innerW * 0.24, innerW * 0.24, innerW * 0.24];
  }
  return [innerW * 0.32, innerW * 0.24, innerW * 0.24, innerW * 0.2];
}

function advanceAfterTable(y: number, rowH: number, rowCount: number, wrapBonus = 0) {
  return y + rowH * rowCount + wrapBonus + TABLE_BLOCK_BUFFER;
}

function calcDualPeriodRowH(
  topY: number,
  bottomY: number,
  periodCount: number,
  dataRowsPerPeriod: number,
  compareDividerCount: number,
) {
  const labelOverhead = periodCount * (PERIOD_LABEL_H + PERIOD_LABEL_TABLE_GAP);
  const dividerOverhead = compareDividerCount * (PERIOD_COMPARE_BLOCK_GAP + 0.06);
  const bufferOverhead = periodCount * TABLE_BLOCK_BUFFER;
  const totalRows = periodCount * (dataRowsPerPeriod + 1);
  const avail = bottomY - topY - labelOverhead - dividerOverhead - bufferOverhead;
  if (avail <= 0 || totalRows <= 0) return 0.17;
  return Math.max(0.14, Math.min(0.19, avail / totalRows));
}

function bottomNotesY(): number {
  return FOOTER_Y - NOTES_BOX_H - NOTES_GAP;
}

function contentBottomY(): number {
  return bottomNotesY() - 0.06;
}

function addCompactNotesBox(slide: PptxSlide, body?: string) {
  const y = bottomNotesY();
  slide.addShape('rect', {
    x: 0.28,
    y,
    w: 9.44,
    h: NOTES_BOX_H,
    fill: { color: C.greenLight },
    line: { color: C.greenBorder, width: 1 },
  });
  slide.addText('Notes', {
    x: 0.42,
    y: y + 0.04,
    w: 9,
    h: 0.14,
    fontSize: 10,
    bold: true,
    color: C.green,
  });
  const text = String(body || '').trim();
  slide.addText(text || 'Add notes here…', {
    x: 0.42,
    y: y + 0.18,
    w: 9,
    h: 0.16,
    fontSize: 9,
    color: text ? C.slate : '888888',
    italic: !text,
  });
}

function addCompareKpiCard(
  slide: PptxSlide,
  box: StatBox,
  x: number,
  y: number,
  w: number,
  h = 0.62,
  showCompare = true,
) {
  slide.addShape('rect', {
    x,
    y,
    w,
    h,
    fill: { color: C.white },
    line: { color: 'E5E7EB', width: 0.5 },
  });
  slide.addText(String(box.label || '').toUpperCase(), {
    x: x + 0.06,
    y: y + 0.05,
    w: w - 0.12,
    h: 0.12,
    fontSize: 7,
    color: C.slate,
  });
  slide.addText(box.value, {
    x: x + 0.06,
    y: y + 0.16,
    w: w - 0.12,
    h: 0.22,
    fontSize: 14,
    bold: true,
    color: C.darkGray,
  });
  const hasCompare = showCompare && box.previousValue != null && box.comparePct != null;
  if (hasCompare) {
    const good = box.compareGood ? C.green : 'C41920';
    const arrow = box.compareUp ? '▲' : '▼';
    slide.addText(`vs ${box.previousValue}  ${arrow} ${Math.abs(box.comparePct || 0).toFixed(1)}%`, {
      x: x + 0.06,
      y: y + 0.4,
      w: w - 0.12,
      h: 0.16,
      fontSize: 7.5,
      color: good,
    });
  } else if (box.sub) {
    slide.addText(box.sub, {
      x: x + 0.06,
      y: y + 0.4,
      w: w - 0.12,
      h: 0.16,
      fontSize: 7.5,
      color: C.slate,
    });
  }
}

function addCompareKpiRow(
  slide: PptxSlide,
  boxes: StatBox[],
  x: number,
  y: number,
  totalW: number,
  cardH = 0.68,
  showCompare = true,
) {
  const items = boxes.slice(0, 4);
  const gap = 0.1;
  const cardW = (totalW - gap * (items.length - 1)) / items.length;
  items.forEach((box, i) => {
    addCompareKpiCard(slide, box, x + i * (cardW + gap), y, cardW, cardH, showCompare);
  });
}

function addExecMetric(
  slide: PptxSlide,
  box: StatBox,
  x: number,
  y: number,
  w: number,
  metricH: number,
  showCompare = true,
) {
  slide.addText(String(box.label || '').toUpperCase(), {
    x: x + 0.04,
    y,
    w: w - 0.08,
    h: 0.16,
    fontSize: 9,
    color: C.slate,
  });
  slide.addText(box.value, {
    x: x + 0.04,
    y: y + 0.16,
    w: w - 0.08,
    h: 0.34,
    fontSize: 24,
    bold: true,
    color: C.darkGray,
  });
  let compareY = y + 0.5;
  const detail = (box as StatBox & { detail?: string }).detail;
  if (detail) {
    slide.addText(detail, {
      x: x + 0.04,
      y: compareY,
      w: w - 0.08,
      h: 0.12,
      fontSize: 8,
      color: C.slate,
      italic: true,
    });
    compareY += 0.12;
  }
  const hasCompare = showCompare && box.previousValue != null && box.comparePct != null;
  if (hasCompare) {
    const good = box.compareGood ? C.green : 'C41920';
    const arrow = box.compareUp ? '▲' : '▼';
    slide.addText(`vs ${box.previousValue}  ${arrow} ${Math.abs(box.comparePct || 0).toFixed(1)}%`, {
      x: x + 0.04,
      y: compareY,
      w: w - 0.08,
      h: Math.max(0.16, metricH - (compareY - y) - 0.04),
      fontSize: 10,
      color: good,
    });
  } else if (box.sub) {
    slide.addText(box.sub, {
      x: x + 0.04,
      y: compareY,
      w: w - 0.08,
      h: Math.max(0.16, metricH - (compareY - y) - 0.04),
      fontSize: 9,
      color: C.slate,
    });
  }
}

function addPlatformColumn(
  slide: PptxSlide,
  title: string,
  statBoxes: StatBox[],
  x: number,
  y: number,
  w: number,
  showCompare = true,
) {
  const cardH = bottomNotesY() - 0.08 - y;
  const headerH = 0.36;
  slide.addShape('rect', {
    x,
    y,
    w,
    h: cardH,
    fill: { color: C.white },
    line: SLIDE_BORDER,
  });
  slide.addShape('rect', {
    x,
    y,
    w,
    h: headerH,
    fill: { color: C.redBar },
  });
  slide.addText(title, {
    x: x + 0.04,
    y: y + 0.07,
    w: w - 0.08,
    h: headerH - 0.1,
    fontSize: 11,
    bold: true,
    color: C.white,
    align: 'center',
    valign: 'middle',
  });
  const boxes = statBoxes.slice(0, 4);
  const bodyH = cardH - headerH;
  const metricH = boxes.length ? bodyH / boxes.length : bodyH;
  boxes.forEach((box, i) => {
    addExecMetric(slide, box, x + 0.06, y + headerH + i * metricH + 0.02, w - 0.12, metricH, showCompare);
  });
}

const KEYWORD_INSIGHT_COLORS = ['15803D', 'B45309', '2563EB', '7C3AED'];

const DEFAULT_KEYWORD_INSIGHTS = [
  { icon: '✅', title: 'Strong Rankings', body: 'Ranking well on almost all targeted keywords within primary service areas and nearby locations.' },
  { icon: '🔧', title: 'In Progress', body: "Some keywords not yet on Google's 1st page — actively optimizing content, metadata, and internal links." },
  { icon: '🎯', title: 'Local Strategy', body: 'Geo-targeted content performing well across primary markets and surrounding areas.' },
  { icon: '📈', title: 'Visibility Growth', body: 'Impressions demonstrate extensive reach; position improvements signal growing authority.' },
];

/** Append SEO slides (11–27) to an existing monthly deck — mirrors MonthlySeoSlides preview layout. */
export function addSeoSlidesToPptx(pptx: PptxGenJS, data: Record<string, unknown>) {
  const month = String(data.month || '');
  const client = String(data.client || '');
  const seo = (data.seo || {}) as Record<string, unknown>;
  const periodLabel = String(seo.periodLabel || month);
  const currentLabel = String(seo.currentLabel || month);
  const previousLabel = String(seo.previousLabel || '');
  const currentShortLabel = String(data.currentShortLabel || currentLabel);
  const previousShortLabel = String(data.previousShortLabel || previousLabel);
  const compareOn = seo.compareOn !== false && !!previousLabel;
  const compareSections = (data.compareSections || seo.compareSections || {}) as CompareSections;
  const cmp = (key: string) => sectionCompareOn(compareOn, compareSections, key);
  const executiveSections = (seo.executiveSections || {}) as Record<string, string>;
  const gscNotes = String(seo.gscNotes || '');
  const gbpNotes = String(seo.gbpNotes || '');
  const keywordTracker = (seo.keywordTracker || {}) as { sheetUrl?: string; insights?: Array<{ icon?: string; title?: string; body?: string }> };
  const keywordScreenshot = (seo.keywordScreenshot || {}) as { imageUrl?: string; caption?: string };
  const blogUpdates = (seo.blogUpdates || []) as Array<{ title?: string; overview?: string; keyThemes?: string[]; goal?: string }>;

  // 11 Executive summary — GA4 | GSC | GBP columns (matches preview)
  {
    const s11 = (seo.slide11 || {}) as {
      ga4?: PlatformBlock;
      gsc?: PlatformBlock;
      gbp?: PlatformBlock;
    };
    const slide = pptx.addSlide();
    redHeader(slide, 'Executive Summary', `${client} | ${month}`);
    slide.addShape('rect', { x: 0, y: HEADER_H, w: 10, h: SLIDE_H - HEADER_H - FOOTER_H, fill: { color: 'EEF1F4' } });
    const cols: Array<{ key: string; block?: PlatformBlock; title: string }> = [
      { key: 'websiteAnalytics', block: s11.ga4, title: s11.ga4?.title || 'Google Analytics 4' },
      { key: 'googleSearchConsole', block: s11.gsc, title: s11.gsc?.title || 'Google Search Console' },
      { key: 'gbpPerformance', block: s11.gbp, title: s11.gbp?.title || 'Google Business Profile' },
    ];
    cols.forEach((col, i) => {
      addPlatformColumn(
        slide,
        col.title,
        col.block?.statBoxes || [],
        0.18 + i * 3.22,
        0.44,
        3.12,
        cmp('executiveSummary'),
      );
    });
    addCompactNotesBox(slide, executiveSections.notes);
    redFooter(slide, month);
  }

  sectionSlide(pptx, 'Google Analytics 4 Performance', `${client} | ${periodLabel}`);

  // 13 Organic channel — stat boxes + table + insight (matches preview)
  {
    const s13 = (seo.slide13 || {}) as {
      statBoxes?: StatBox[];
      table?: Array<{ metric: string; current: string; previous: string; change: string }>;
      insight?: string;
    };
    const slide = pptx.addSlide();
    const showCmp = cmp('ga4Organic');
    redHeader(slide, `GA4 — Organic Channel${showCmp ? ` | ${currentLabel} vs ${previousLabel}` : ''}`, client);
    slide.addShape('rect', { x: 0, y: HEADER_H, w: 10, h: SLIDE_H - HEADER_H - FOOTER_H, fill: { color: C.white } });
    addCompareKpiRow(slide, s13.statBoxes || [], 0.35, 0.48, 9.3, 0.68, showCmp);
    const rows: TableRow[] = [[
      { text: 'Metric', options: th },
      { text: currentLabel, options: th },
      ...(showCmp ? [{ text: previousLabel, options: th }, { text: 'Change', options: th }] : []),
    ]];
    (s13.table || []).forEach((r) => {
      rows.push(showCmp
        ? [r.metric, r.current, r.previous, r.change]
        : [r.metric, r.current]);
    });
    addTable(slide, rows, 1.28, showCmp ? [2.5, 2.3, 2.3, 2.4] : [4, 5.5], 0.24);
    if (s13.insight) {
      slide.addText(s13.insight, { x: 0.35, y: contentBottomY() - 0.36, w: 9.3, h: 0.2, fontSize: 7, color: C.slate, valign: 'top' });
    }
    addCompactNotesBox(slide);
    redFooter(slide, month);
  }

  // 14 All channels (both periods)
  {
    const combined = (seo.slide14 || {}) as {
      compareOn?: boolean;
      previous?: { periodLabel?: string; table?: Array<{ channel: string; users: string; views: string; bounceRate: string }> };
      current?: { periodLabel?: string; table?: Array<{ channel: string; users: string; views: string; bounceRate: string }> };
    };
    const slide = pptx.addSlide();
    redHeader(slide, 'GA4 — All Channels', client);
    slide.addShape('rect', { x: 0, y: HEADER_H, w: 10, h: SLIDE_H - HEADER_H - FOOTER_H, fill: { color: C.white } });
    const showCompare = cmp('ga4AllChannels') && combined.compareOn && !!combined.previous?.table?.length;
    const maxDataRows = 5;
    const periodCount = (combined.current?.table?.length ? 1 : 0) + (showCompare ? 1 : 0);
    const dualRowH = calcDualPeriodRowH(0.48, bottomNotesY() - 0.04, Math.max(periodCount, 1), maxDataRows, showCompare ? 1 : 0);
    let y = 0.48;
    let isSecondPeriod = false;
    const addChannelTable = (label: string, table: Array<{ channel: string; users: string; views: string; bounceRate: string }> | undefined) => {
      if (!table?.length) return;
      if (isSecondPeriod) y = addComparePeriodDivider(slide, y);
      y = addPeriodBlockLabel(slide, label, y, isSecondPeriod ? PERIOD_COMPARE_LABEL_COLOR : C.redBar);
      isSecondPeriod = true;
      const dataRows = table.slice(0, maxDataRows);
      const rows: TableRow[] = [[{ text: 'Channel', options: th }, { text: 'Users', options: th }, { text: 'Views', options: th }, { text: 'Bounce', options: th }]];
      dataRows.forEach((r) => rows.push([truncateSlideCell(r.channel, 32), r.users, r.views, r.bounceRate]));
      const rowCount = dataRows.length + 1;
      addTable(slide, rows, y, [3.5, 2, 2, 2], dualRowH, 8);
      y = advanceAfterTable(y, dualRowH, rowCount);
    };
    addChannelTable(resolvePeriodLabel(combined.current?.periodLabel, currentShortLabel, 'Current'), combined.current?.table);
    if (showCompare) addChannelTable(resolvePeriodLabel(combined.previous?.periodLabel, previousShortLabel, 'Previous'), combined.previous?.table);
    addCompactNotesBox(slide);
    redFooter(slide, month);
  }

  // 15 Landing pages (both periods)
  {
    const combined = (seo.slide15 || {}) as {
      compareOn?: boolean;
      previous?: { periodLabel?: string; table?: Array<{ page: string; sessions: string }> };
      current?: { periodLabel?: string; table?: Array<{ page: string; sessions: string }> };
    };
    const slide = pptx.addSlide();
    redHeader(slide, 'GA4 — Top Landing Pages', client);
    slide.addShape('rect', { x: 0, y: HEADER_H, w: 10, h: SLIDE_H - HEADER_H - FOOTER_H, fill: { color: C.white } });
    const showCompare = cmp('ga4LandingPages') && combined.compareOn && !!combined.previous?.table?.length;
    const maxDataRows = 5;
    const periodCount = (combined.current?.table?.length ? 1 : 0) + (showCompare ? 1 : 0);
    const dualRowH = calcDualPeriodRowH(0.48, bottomNotesY() - 0.04, Math.max(periodCount, 1), maxDataRows, showCompare ? 1 : 0);
    let y = 0.48;
    let isSecondPeriod = false;
    const addLanding = (label: string, table: Array<{ page: string; sessions: string }> | undefined) => {
      if (!table?.length) return;
      if (isSecondPeriod) y = addComparePeriodDivider(slide, y);
      y = addPeriodBlockLabel(slide, label, y, isSecondPeriod ? PERIOD_COMPARE_LABEL_COLOR : C.redBar);
      isSecondPeriod = true;
      const dataRows = table.slice(0, maxDataRows);
      const rows: TableRow[] = [[{ text: 'Page', options: th }, { text: 'Sessions', options: th }]];
      dataRows.forEach((r) => rows.push([truncateSlideCell(r.page, PAGE_CELL_MAX), r.sessions]));
      const wrapBonus = dataRows.filter((r) => String(r.page || '').length > 36).length * dualRowH * 0.25;
      const rowCount = dataRows.length + 1;
      addTable(slide, rows, y, [7, 2.5], dualRowH, 7.5);
      y = advanceAfterTable(y, dualRowH, rowCount, wrapBonus);
    };
    addLanding(resolvePeriodLabel(combined.current?.periodLabel, currentShortLabel, 'Current'), combined.current?.table);
    if (showCompare) addLanding(resolvePeriodLabel(combined.previous?.periodLabel, previousShortLabel, 'Previous'), combined.previous?.table);
    addCompactNotesBox(slide);
    redFooter(slide, month);
  }

  // 16 Top cities (both periods)
  {
    const combined = (seo.slide16 || {}) as {
      compareOn?: boolean;
      previous?: { periodLabel?: string; table?: Array<{ city: string; views: string }> };
      current?: { periodLabel?: string; table?: Array<{ city: string; views: string }> };
    };
    const slide = pptx.addSlide();
    redHeader(slide, 'GA4 — Top Cities', client);
    slide.addShape('rect', { x: 0, y: HEADER_H, w: 10, h: SLIDE_H - HEADER_H - FOOTER_H, fill: { color: C.white } });
    const showCompare = cmp('ga4TopCities') && combined.compareOn && !!combined.previous?.table?.length;
    const maxDataRows = 5;
    const periodCount = (combined.current?.table?.length ? 1 : 0) + (showCompare ? 1 : 0);
    const dualRowH = calcDualPeriodRowH(0.48, bottomNotesY() - 0.04, Math.max(periodCount, 1), maxDataRows, showCompare ? 1 : 0);
    let y = 0.48;
    let isSecondPeriod = false;
    const addCities = (label: string, table: Array<{ city: string; views: string }> | undefined) => {
      if (!table?.length) return;
      if (isSecondPeriod) y = addComparePeriodDivider(slide, y);
      y = addPeriodBlockLabel(slide, label, y, isSecondPeriod ? PERIOD_COMPARE_LABEL_COLOR : C.redBar);
      isSecondPeriod = true;
      const dataRows = table.slice(0, maxDataRows);
      const rows: TableRow[] = [[{ text: 'City', options: th }, { text: 'Views', options: th }]];
      dataRows.forEach((r) => rows.push([truncateSlideCell(r.city, 36), r.views]));
      const rowCount = dataRows.length + 1;
      addTable(slide, rows, y, [7, 2.5], dualRowH, 8);
      y = advanceAfterTable(y, dualRowH, rowCount);
    };
    addCities(resolvePeriodLabel(combined.current?.periodLabel, currentShortLabel, 'Current'), combined.current?.table);
    if (showCompare) addCities(resolvePeriodLabel(combined.previous?.periodLabel, previousShortLabel, 'Previous'), combined.previous?.table);
    addCompactNotesBox(slide);
    redFooter(slide, month);
  }

  sectionSlide(pptx, 'Google Search Console & Rankings', `${client} | ${periodLabel}`);

  // 22 GSC summary — stat boxes, queries + pages, notes (matches preview)
  {
    const s22 = (seo.slide22 || {}) as {
      statBoxes?: StatBox[];
      insight?: string;
      queriesTable?: Array<{ query: string; currentClicks: string; previousClicks: string; clickDiff?: string }>;
      brandedTable?: Array<{ query: string; currentClicks: string; previousClicks: string; clickDiff?: string }>;
      nonBrandedTable?: Array<{ query: string; currentClicks: string; previousClicks: string; clickDiff?: string }>;
    };
    const slide = pptx.addSlide();
    const showCmp = cmp('gscSummary');
    redHeader(slide, `Google Search Console — Summary${showCmp ? ` | ${currentLabel} vs ${previousLabel}` : ''}`, client);
    slide.addShape('rect', { x: 0, y: HEADER_H, w: 10, h: SLIDE_H - HEADER_H - FOOTER_H, fill: { color: C.white } });
    addCompareKpiRow(slide, s22.statBoxes || [], 0.35, 0.48, 9.3, 0.66, showCmp);
    if (s22.insight) {
      slide.addText(s22.insight, { x: 0.35, y: 1.2, w: 9.3, h: 0.18, fontSize: 7, color: C.slate, valign: 'top' });
    }
    const tableY = s22.insight ? 1.38 : 1.22;
    const tableBottom = bottomNotesY() - 0.08;
    const qColW = showCmp ? [1.35, 0.55, 0.55, 0.35] : [2.0, 0.85];
    const renderQueryBlock = (
      label: string,
      x: number,
      w: number,
      rows: Array<{ query: string; currentClicks: string; previousClicks: string; clickDiff?: string }> | undefined,
      emptyMsg: string,
    ) => {
      slide.addShape('rect', { x, y: tableY, w, h: tableBottom - tableY, fill: { color: C.white }, line: { color: 'E5E7EB', width: 0.5 } });
      slide.addText(label, { x: x + 0.06, y: tableY + 0.04, w: w - 0.12, h: 0.14, fontSize: 7, bold: true, color: C.redBar });
      const tableRows: TableRow[] = [[
        { text: 'Query', options: th },
        { text: currentLabel, options: th },
        ...(showCmp ? [{ text: previousLabel, options: th }, { text: 'Δ', options: th }] : []),
      ]];
      (rows || []).slice(0, 5).forEach((r) => {
        tableRows.push(showCmp
          ? [r.query, r.currentClicks, r.previousClicks, r.clickDiff || '']
          : [r.query, r.currentClicks]);
      });
      if (!(rows || []).length) {
        tableRows.push([emptyMsg, '—', ...(showCmp ? ['—', '—'] : [])]);
      }
      slide.addTable(tableRows, { x: x + 0.04, y: tableY + 0.2, w: w - 0.08, colW: qColW, rowH: 0.19, border: SLIDE_BORDER, fontSize: 8 });
    };
    renderQueryBlock('Top Queries', 0.2, 3.05, s22.queriesTable, 'No query data');
    renderQueryBlock('Branded Queries', 3.35, 3.05, s22.brandedTable, 'No branded queries');
    renderQueryBlock('Non-Branded Queries', 6.5, 3.05, s22.nonBrandedTable, 'No non-branded queries');
    addCompactNotesBox(slide, gscNotes || String((s22 as { notes?: string }).notes || ''));
    redFooter(slide, month);
  }

  // 19 Top 20 search queries (after GSC)
  {
    const s19 = (seo.slide19 || {}) as {
      table?: Array<{ query: string; currentClicks: string; previousClicks: string; currentImpr: string; previousImpr: string }>;
    };
    const showCmp = cmp('top20Queries');
    const slide = pptx.addSlide();
    const headerRight = showCmp && previousShortLabel
      ? `${currentShortLabel} vs ${previousShortLabel}`
      : currentShortLabel;
    redHeader(slide, `Top 20 Keywords Providing Clicks — ${client}`, headerRight);
    slide.addShape('rect', { x: 0, y: HEADER_H, w: 10, h: SLIDE_H - HEADER_H - FOOTER_H, fill: { color: C.white } });
    const thSmall = { ...th, fontSize: 7.5 };
    const tdSmall = { ...td, fontSize: 7.5 };
    const tdSmallGreen = { ...tdSmall, bold: true, color: C.green };
    const rows: TableRow[] = [[
      { text: 'Query', options: thSmall },
      { text: `${currentShortLabel} Clicks`, options: thSmall },
      ...(showCmp ? [{ text: `${previousShortLabel} Clicks`, options: thSmall }] : []),
      { text: `${currentShortLabel} Impr.`, options: thSmall },
      ...(showCmp ? [{ text: `${previousShortLabel} Impr.`, options: thSmall }] : []),
    ]];
    (s19.table || []).slice(0, 20).forEach((r, i) => {
      const fill = i % 2 ? 'F8FAFC' : C.white;
      const greenClick = { text: r.currentClicks, options: { ...tdSmallGreen, fill } };
      const cell = (t: string) => ({ text: t, options: { ...tdSmall, fill } });
      rows.push(showCmp
        ? [cell(r.query), greenClick, cell(r.previousClicks), cell(r.currentImpr), cell(r.previousImpr)]
        : [cell(r.query), greenClick, cell(r.currentImpr)]);
    });
    if (!(s19.table || []).length) {
      rows.push(['No query data', '—', ...(showCmp ? ['—', '—', '—'] : ['—'])]);
    }
    const tableTop = 0.44;
    const tableBottom = FOOTER_Y - 0.04;
    const totalRows = Math.max(rows.length, 1);
    const rowH = Math.max(0.155, Math.min(0.19, (tableBottom - tableTop) / totalRows));
    slide.addTable(rows, {
      x: 0.22,
      y: tableTop,
      w: 9.56,
      colW: showCmp ? [3.15, 1.15, 1.15, 1.15, 1.15] : [4.4, 1.45, 3.7],
      rowH,
      border: SLIDE_BORDER,
      fontSize: 7.5,
    });
    redFooter(slide, month);
  }

  // 20–21 GBP (after Top 20)
  sectionSlide(pptx, 'Google Business Profile & Local SEO', `${client} | ${periodLabel}`);

  {
    const s24 = (seo.slide24 || {}) as {
      statBoxes?: StatBox[];
      locationRows?: Array<{
        name: string;
        table?: Array<{ metric: string; current: string; previous: string; change: string }>;
      }>;
      currentLabel?: string;
      previousLabel?: string;
    };
    const slide = pptx.addSlide();
    const showCmp = cmp('gbp');
    redHeader(slide, 'Google Business Profile — Performance', client);
    slide.addShape('rect', { x: 0, y: HEADER_H, w: 10, h: SLIDE_H - HEADER_H - FOOTER_H, fill: { color: C.white } });
    addCompareKpiRow(slide, s24.statBoxes || [], 0.35, 0.48, 9.3, 0.66, showCmp);
    const locRows = s24.locationRows || [];
    const locLabel = s24.currentLabel || currentShortLabel;
    const locPrev = s24.previousLabel || previousShortLabel;
    const locBlockTop = 1.24;
    const locBlockBottom = bottomNotesY() - 0.08;
    const locNameTopPad = 0.1;
    const locNameH = 0.28;
    const locNameTableGap = 0.14;
    locRows.forEach((loc, locIdx) => {
      const cols = locRows.length;
      const gap = cols >= 3 ? 0.12 : 0.14;
      const totalW = 9.56;
      const colW = cols >= 2 ? (totalW - gap * (cols - 1)) / cols : totalW;
      const x = 0.22 + locIdx * (colW + gap);
      const boxTop = locBlockTop;
      const boxH = locBlockBottom - locBlockTop;
      slide.addShape('rect', {
        x,
        y: boxTop,
        w: colW,
        h: boxH,
        fill: { color: C.white },
        line: SLIDE_BORDER,
      });
      slide.addText(loc.name, {
        x: x + 0.08,
        y: boxTop + locNameTopPad,
        w: colW - 0.16,
        h: locNameH,
        fontSize: cols >= 3 ? 7.5 : 8.5,
        bold: true,
        color: 'B45309',
        valign: 'top',
      });
      const tableTop = boxTop + locNameTopPad + locNameH + locNameTableGap;
      const tableAvailH = boxTop + boxH - tableTop - 0.08;
      const metricCount = Math.max((loc.table || []).length, 1);
      const locRowH = Math.max(0.17, Math.min(cols >= 3 ? 0.19 : 0.22, tableAvailH / (metricCount + 1)));
      const innerTableW = colW - 0.12;
      const tableColW = gbpTableColWidths(innerTableW, showCmp, cols);
      const tRows: TableRow[] = [[
        { text: 'Metric', options: th },
        { text: locLabel, options: th },
        ...(showCmp ? [{ text: locPrev, options: th }, { text: 'Chg', options: th }] : []),
      ]];
      (loc.table || []).forEach((r) => {
        tRows.push(showCmp
          ? [r.metric, r.current, r.previous, gbpChangeCell(r.change, cols >= 3)]
          : [r.metric, r.current]);
      });
      slide.addTable(tRows, {
        x: x + 0.06,
        y: tableTop,
        w: innerTableW,
        colW: tableColW,
        rowH: locRowH,
        border: SLIDE_BORDER,
        fontSize: cols >= 3 ? 7.5 : 8.5,
      });
    });
    addCompactNotesBox(slide, gbpNotes);
    redFooter(slide, month);
  }

  // 22 Keyword tracker + insights (Neulife slide 17)
  {
    const sheetUrl = resolveKeywordSheetUrl(keywordTracker, keywordScreenshot);
    const parsed = parseGoogleSheetsUrl(sheetUrl);
    const slide = pptx.addSlide();
    redHeader(slide, `Keywords Ranking — ${client}`, 'SEO Rankings');
    slide.addShape('rect', { x: 0, y: HEADER_H, w: 10, h: SLIDE_H - HEADER_H - FOOTER_H, fill: { color: C.white } });
    const bannerH = 0.44;
    slide.addShape('rect', {
      x: 0.22,
      y: 0.5,
      w: 9.56,
      h: bannerH,
      fill: { color: C.white },
      line: { color: C.redBar, width: 1 },
    });
    slide.addText([
      { text: '📋  Keyword Tracker:  ', options: { bold: true, color: C.redBar, fontSize: 12 } },
      parsed?.viewUrl
        ? { text: sheetUrl, options: { hyperlink: { url: parsed.viewUrl }, color: '2563EB', fontSize: 10.5, underline: true } }
        : { text: sheetUrl || 'Add Google Sheet URL in report settings', options: { color: sheetUrl ? '2563EB' : C.slate, fontSize: 11, underline: !!sheetUrl } },
    ], { x: 0.36, y: 0.62, w: 9.28, h: 0.22, valign: 'middle' });
    const insights = (keywordTracker.insights?.length ? keywordTracker.insights : DEFAULT_KEYWORD_INSIGHTS).slice(0, 4);
    const gridTop = 1.06;
    const gridGap = 0.12;
    const gridBottom = FOOTER_Y - 0.08;
    const rowH = (gridBottom - gridTop - gridGap) / 2;
    const colW = 4.62;
    insights.forEach((item, i) => {
      const x = 0.22 + (i % 2) * (colW + gridGap);
      const y = gridTop + Math.floor(i / 2) * (rowH + gridGap);
      const titleColor = KEYWORD_INSIGHT_COLORS[i] || C.darkGray;
      slide.addShape('rect', { x, y, w: colW, h: rowH, fill: { color: C.white }, line: SLIDE_BORDER });
      slide.addText(`${item.icon || '•'}  ${item.title || ''}`, {
        x: x + 0.16,
        y: y + 0.18,
        w: colW - 0.32,
        h: 0.28,
        fontSize: 14,
        bold: true,
        color: titleColor,
      });
      slide.addText(String(item.body || ''), {
        x: x + 0.16,
        y: y + 0.48,
        w: colW - 0.32,
        h: rowH - 0.62,
        fontSize: 11.5,
        color: C.slate,
        valign: 'top',
        lineSpacing: 16,
      });
    });
    redFooter(slide, month);
  }

  // 23+ Keyword rankings — one readable slide per sheet section (Top 20, All Locations, …)
  {
    const sheetUrl = resolveKeywordSheetUrl(keywordTracker, keywordScreenshot);
    const parsed = parseGoogleSheetsUrl(sheetUrl);
    const imageUrl = isDirectImageUrl(keywordScreenshot.imageUrl) ? keywordScreenshot.imageUrl : '';
    const snapshots = (seo as { keywordSheetSnapshots?: Array<{ key?: string; label?: string; title?: string; imageDataUrl?: string }> }).keywordSheetSnapshots || [];
    const legacyImage = String((seo as { keywordSheetImageDataUrl?: string }).keywordSheetImageDataUrl || '');

    const slidesToRender = snapshots.length
      ? snapshots
      : (legacyImage || imageUrl
        ? [{ key: 'summary', label: 'Keyword Rankings', title: `Keywords Ranking — ${client}`, imageDataUrl: imageUrl || legacyImage }]
        : []);

    const addKeywordRankingSlide = (snap: { title?: string; label?: string; imageDataUrl?: string }, isFirst: boolean) => {
      const slide = pptx.addSlide();
      const headerTitle = snap.title || (isFirst ? `Keywords Ranking — ${client}` : `Keywords Ranking — ${snap.label || client}`);
      redHeader(slide, headerTitle, String(keywordScreenshot.subtitle || 'SEO Rankings'));
      slide.addShape('rect', { x: 0, y: HEADER_H, w: 10, h: SLIDE_H - HEADER_H - FOOTER_H, fill: { color: C.white } });
      const boxTop = 0.55;
      const boxBottom = contentBottomY() - 0.05;
      const boxH = boxBottom - boxTop;

      if (snap.imageDataUrl) {
        const frameX = 0.15;
        const frameY = boxTop;
        const frameW = 9.7;
        const frameH = boxH;
        const inset = 0.06;
        const imgW = frameW - inset * 2;
        const imgH = frameH - inset * 2;
        slide.addShape('rect', {
          x: frameX,
          y: frameY,
          w: frameW,
          h: frameH,
          fill: { color: C.white },
          line: CARD_BORDER,
        });
        slide.addImage({
          data: snap.imageDataUrl.startsWith('data:') ? snap.imageDataUrl : undefined,
          path: snap.imageDataUrl.startsWith('data:') ? undefined : snap.imageDataUrl,
          x: frameX + inset,
          y: frameY + inset,
          w: imgW,
          h: imgH,
          sizing: { type: 'contain', w: imgW, h: imgH },
        });
      } else if (parsed?.viewUrl) {
        slide.addShape('rect', {
          x: 0.35,
          y: boxTop,
          w: 9.3,
          h: boxH,
          fill: { color: 'F8FAFC' },
          line: { color: 'CBD5E1', width: 1 },
        });
        slide.addText([
          { text: 'Keyword Rankings Sheet\n\n', options: { bold: true, fontSize: 11, color: C.darkGray } },
          { text: 'Could not embed sheet snapshot — sign in with the Google account that owns the sheet and export again.', options: { fontSize: 10, color: C.slate } },
        ], { x: 0.5, y: boxTop + 0.35, w: 9, h: 0.8, align: 'center' });
        slide.addText([
          { text: 'Open Keyword Tracker Sheet', options: { hyperlink: { url: parsed.viewUrl }, color: '2563EB', underline: true, fontSize: 10 } },
        ], { x: 0.5, y: boxTop + 1.2, w: 9, h: 0.3, align: 'center' });
      } else {
        slide.addShape('rect', {
          x: 0.35,
          y: boxTop,
          w: 9.3,
          h: boxH,
          fill: { color: 'F8FAFC' },
          line: { color: 'CBD5E1', width: 1, dashType: 'dash' },
        });
        slide.addText(keywordScreenshot.caption || 'Add Keyword Tracker sheet URL on slide 22.', {
          x: 0.5,
          y: 2.2,
          w: 9,
          h: 0.5,
          fontSize: 11,
          color: C.slate,
          align: 'center',
          italic: true,
        });
      }
      redFooter(slide, month);
    };

    if (slidesToRender.length) {
      slidesToRender.forEach((snap, idx) => addKeywordRankingSlide(snap, idx === 0));
    } else {
      addKeywordRankingSlide({ title: `Keywords Ranking — ${client}` }, true);
    }
  }

  sectionSlide(pptx, 'Web Dev, Social Media & Backlinks', `${client} | ${periodLabel}`);

  // 25 Web dev updates
  {
    const items = (seo.webDevItems || []) as Array<{ num: string; title: string; body: string }>;
    const slide = pptx.addSlide();
    redHeader(slide, 'Web Development Updates', `${client} | ${periodLabel}`);
    slide.addShape('rect', { x: 0, y: HEADER_H, w: 10, h: SLIDE_H - HEADER_H - FOOTER_H, fill: { color: C.white } });
    items.slice(0, 4).forEach((item, i) => {
      const x = 0.35 + (i % 2) * 4.85;
      const y = 0.55 + Math.floor(i / 2) * 1.55;
      slide.addShape('rect', { x, y, w: 4.55, h: 1.35, fill: { color: C.white }, line: CARD_BORDER });
      slide.addText(item.num, { x: x + 0.12, y: y + 0.1, w: 0.5, h: 0.28, fontSize: 17, bold: true, color: C.redBar });
      slide.addText(item.title, { x: x + 0.55, y: y + 0.12, w: 3.85, h: 0.25, fontSize: 11, bold: true, color: C.darkGray });
      slide.addText(item.body, { x: x + 0.12, y: y + 0.42, w: 4.3, h: 0.82, fontSize: 9, color: C.slate, valign: 'top' });
    });
    addCompactNotesBox(slide);
    redFooter(slide, month);
  }

  sectionSlide(pptx, 'Next Steps & Action Plan', `${client} | ${periodLabel}`);

  // 27 Next steps — 6 cards (Neulife slide 19)
  {
    const items = (seo.seoNextSteps || []) as Array<{ icon?: string; title: string; body: string }>;
    const slide = pptx.addSlide();
    redHeader(slide, `Next Steps & Commitment to Growth — ${client}`, 'Looking Ahead');
    slide.addShape('rect', { x: 0, y: HEADER_H, w: 10, h: SLIDE_H - HEADER_H - FOOTER_H, fill: { color: C.white } });
    items.slice(0, 6).forEach((item, i) => {
      const x = 0.35 + (i % 2) * 4.85;
      const y = 0.52 + Math.floor(i / 2) * 1.42;
      slide.addShape('rect', { x, y, w: 4.55, h: 1.22, fill: { color: C.white }, line: { color: 'E5E7EB', width: 0.5 } });
      slide.addShape('rect', { x, y, w: 4.55, h: 0.04, fill: { color: C.redBar } });
      slide.addText(`${item.icon || '•'}  ${item.title}`, { x: x + 0.12, y: y + 0.1, w: 4.3, h: 0.22, fontSize: 9, bold: true, color: C.darkGray });
      slide.addText(item.body, { x: x + 0.12, y: y + 0.34, w: 4.3, h: 0.78, fontSize: 7.5, color: C.slate, valign: 'top' });
    });
    redFooter(slide, month);
  }

  // 28 Backlinks (Neulife slide 20)
  {
    const bl = (seo.backlinks || {}) as { totalBacklinks?: string; referringDomains?: string; insight?: string };
    const slide = pptx.addSlide();
    redHeader(slide, 'Backlinks — Summary', client);
    slide.addShape('rect', { x: 0, y: HEADER_H, w: 10, h: SLIDE_H - HEADER_H - FOOTER_H, fill: { color: C.white } });
    slide.addText(`Total Backlinks: ${bl.totalBacklinks || '—'}    Referring Domains: ${bl.referringDomains || '—'}`, { x: 0.35, y: 0.55, w: 9.3, h: 0.3, fontSize: 10, color: C.darkGray });
    if (bl.insight) {
      slide.addText(String(bl.insight), { x: 0.35, y: 1.0, w: 9.3, h: 0.8, fontSize: 9, color: C.slate, valign: 'top' });
    }
    addCompactNotesBox(slide);
    redFooter(slide, month);
  }

  sectionSlide(pptx, 'Blog Content', `${client} | ${month}`);

  // 30–31 Blog updates (Neulife slides 22–23)
  blogUpdates.slice(0, 2).forEach((post) => {
    const slide = pptx.addSlide();
    redHeader(slide, `Blog Update — ${month}`, `${client} | ${month}`);
    const bodyTop = HEADER_H;
    const bodyH = SLIDE_H - HEADER_H - FOOTER_H;
    slide.addShape('rect', { x: 0, y: bodyTop, w: 10, h: bodyH, fill: { color: 'EEF1F4' } });

    const padX = 0.22;
    const contentW = 9.56;
    let y = bodyTop + 0.12;

    slide.addShape('rect', { x: padX, y, w: contentW, h: 0.46, fill: { color: C.redBar } });
    slide.addText(String(post.title || 'Blog Post Title'), {
      x: padX + 0.14,
      y: y + 0.1,
      w: contentW - 0.28,
      h: 0.28,
      fontSize: 12,
      bold: true,
      color: C.white,
      valign: 'middle',
    });
    y += 0.56;

    slide.addShape('rect', { x: padX, y, w: contentW, h: 0.72, fill: { color: C.white }, line: SLIDE_BORDER });
    slide.addShape('rect', { x: padX, y, w: 0.06, h: 0.72, fill: { color: '2563EB' } });
    slide.addText('Overview', { x: padX + 0.16, y: y + 0.08, w: 2, h: 0.16, fontSize: 11, bold: true, color: '2563EB' });
    slide.addText(String(post.overview || ''), {
      x: padX + 0.16,
      y: y + 0.26,
      w: contentW - 0.32,
      h: 0.4,
      fontSize: 10,
      color: C.slate,
      valign: 'top',
      lineSpacing: 14,
    });
    y += 0.82;

    slide.addText('Key Themes Covered', { x: padX, y, w: contentW, h: 0.18, fontSize: 11, bold: true, color: C.redBar });
    y += 0.22;

    const themes = (post.keyThemes || []).filter(Boolean);
    const themeRowH = 0.34;
    themes.forEach((theme, i) => {
      slide.addShape('rect', { x: padX, y, w: contentW, h: themeRowH, fill: { color: C.white }, line: SLIDE_BORDER });
      slide.addText(`${i + 1}.  ${theme}`, {
        x: padX + 0.14,
        y: y + 0.08,
        w: contentW - 0.28,
        h: themeRowH - 0.12,
        fontSize: 10,
        color: C.darkGray,
        valign: 'middle',
      });
      y += themeRowH + 0.08;
    });
    if (!themes.length) {
      slide.addShape('rect', { x: padX, y, w: contentW, h: themeRowH, fill: { color: C.white }, line: SLIDE_BORDER });
      slide.addText('1.  Key theme or section 1', { x: padX + 0.14, y: y + 0.08, w: contentW - 0.28, h: themeRowH - 0.12, fontSize: 10, color: C.slate });
      y += themeRowH + 0.08;
    }

    y += 0.06;
    const goalH = Math.max(0.5, FOOTER_Y - y - 0.1);
    slide.addShape('rect', { x: padX, y, w: contentW, h: goalH, fill: { color: 'ECFDF5' }, line: { color: '86EFAC', width: 1 } });
    slide.addText([
      { text: 'Goal: ', options: { bold: true, fontSize: 10, color: C.green } },
      { text: String(post.goal || ''), options: { fontSize: 10, color: C.green } },
    ], { x: padX + 0.14, y: y + 0.1, w: contentW - 0.28, h: goalH - 0.16, valign: 'top', lineSpacing: 14 });

    redFooter(slide, month);
  });

  // Thank you
  {
    const slide = pptx.addSlide();
    slide.background = { color: C.sectionMaroon };
    slide.addText('Thank You!', { x: 0.5, y: 1.6, w: 9, h: 0.8, fontSize: 36, bold: true, color: C.white, align: 'center' });
    slide.addText(`Client: ${client}\nPeriod: ${periodLabel}\nPrepared by: Red Castle Services`, { x: 0.5, y: 2.6, w: 9, h: 1.5, fontSize: 12, color: C.white, align: 'center' });
  }
}
