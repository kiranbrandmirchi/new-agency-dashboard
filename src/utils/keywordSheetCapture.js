import html2canvas from 'html2canvas';
import { waitForPaint } from './monthlySlideCapture';

const MIN_CAPTURE_W = 900;
const MAX_CAPTURE_W = 1300;
const MIN_CAPTURE_H = 400;
const MAX_CAPTURE_H = 980;
const MAX_CAPTURE_H_TOP20 = 1100;
const ROW_PX = 24;
const COL_PX = 92;

function measureCaptureSize(host) {
  const table = host.querySelector('table');
  const tableW = table?.scrollWidth || table?.offsetWidth || MIN_CAPTURE_W;
  const tableH = table?.scrollHeight || table?.offsetHeight || MIN_CAPTURE_H;
  const w = Math.min(MAX_CAPTURE_W, Math.max(MIN_CAPTURE_W, tableW + 32));
  const h = Math.min(MAX_CAPTURE_H, Math.max(MIN_CAPTURE_H, tableH + 24));
  return { w, h };
}

function resizeCaptureHost(host, w, h) {
  host.style.width = `${w}px`;
  host.style.height = `${h}px`;
  host.style.overflow = 'visible';
}

function captureDimensionsFromFormatted(formatted, { isTop20 = false } = {}) {
  const rowCount = formatted?.rowCount || formatted?.rows?.length || 0;
  const colCount = formatted?.colCount || Math.max(
    0,
    ...(formatted?.rows || []).map((r) => r.cells?.length || 0),
  );
  const maxH = isTop20 ? MAX_CAPTURE_H_TOP20 : MAX_CAPTURE_H;
  return {
    w: Math.min(MAX_CAPTURE_W, Math.max(MIN_CAPTURE_W, colCount * COL_PX + 32)),
    h: Math.min(maxH, Math.max(MIN_CAPTURE_H, rowCount * ROW_PX + 24)),
  };
}

function captureDimensionsFromTable(table, { isTop20 = false } = {}) {
  const allRows = table?.allRows?.length
    ? table.allRows
    : (table?.headers?.length ? [table.headers, ...(table.rows || [])] : (table?.rows || []));
  const colCount = Math.max(0, ...allRows.map((r) => r.length));
  const rowCount = allRows.length;
  const maxH = isTop20 ? MAX_CAPTURE_H_TOP20 : MAX_CAPTURE_H;
  return {
    w: Math.min(MAX_CAPTURE_W, Math.max(MIN_CAPTURE_W, colCount * COL_PX + 32)),
    h: Math.min(maxH, Math.max(MIN_CAPTURE_H, rowCount * ROW_PX + 24)),
  };
}

function applyCellStyle(el, style = {}) {
  if (style.backgroundColor) el.style.backgroundColor = style.backgroundColor;
  if (style.color) el.style.color = style.color;
  if (style.fontWeight) el.style.fontWeight = style.fontWeight;
  if (style.fontStyle) el.style.fontStyle = style.fontStyle;
  if (style.fontSize) el.style.fontSize = style.fontSize;
  else el.style.fontSize = '13px';
  if (style.textAlign) el.style.textAlign = style.textAlign;
  if (style.borderTop) el.style.borderTop = style.borderTop;
  if (style.borderRight) el.style.borderRight = style.borderRight;
  if (style.borderBottom) el.style.borderBottom = style.borderBottom;
  if (style.borderLeft) el.style.borderLeft = style.borderLeft;
}

function mountCaptureHost(frame, w, h) {
  const host = document.createElement('div');
  host.className = 'mr-keyword-sheet-capture-host';
  host.style.width = `${w}px`;
  host.style.height = `${h}px`;
  host.style.overflow = 'visible';
  host.appendChild(frame);
  document.body.appendChild(host);
  return host;
}

/** Render plain CSV table (fallback) — section rows only, no duplicate title bar. */
export function renderKeywordSheetCaptureHost(table, { isTop20 = false } = {}) {
  const { w: estW, h: estH } = captureDimensionsFromTable(table, { isTop20 });

  const frame = document.createElement('div');
  frame.className = 'mr-keyword-sheet-capture-frame mr-keyword-sheet-capture-frame--plain';

  const scroll = document.createElement('div');
  scroll.className = 'mr-keyword-sheet-capture-scroll';

  const allRows = table?.allRows?.length
    ? table.allRows
    : (table?.headers?.length ? [table.headers, ...(table.rows || [])] : (table?.rows || []));

  const tableEl = document.createElement('table');
  tableEl.className = 'mr-keyword-sheet-capture-table mr-keyword-sheet-capture-table--readable';

  const tbody = document.createElement('tbody');
  allRows.forEach((row, ri) => {
    const tr = document.createElement('tr');
    const colCount = Math.max(
      allRows.reduce((m, r) => Math.max(m, r.length), 0),
      row.length,
    );
    for (let i = 0; i < colCount; i += 1) {
      const cell = document.createElement(ri === 0 || ri === 1 ? 'th' : 'td');
      cell.textContent = String(row[i] ?? '');
      tr.appendChild(cell);
    }
    tbody.appendChild(tr);
  });
  tableEl.appendChild(tbody);

  scroll.appendChild(tableEl);
  frame.appendChild(scroll);
  const host = mountCaptureHost(frame, estW, estH);
  const measured = measureCaptureSize(host);
  resizeCaptureHost(host, measured.w, measured.h);
  return host;
}

/** Render formatted grid from Sheets API (colors, bold, borders). */
export function renderFormattedKeywordSheetCaptureHost(formatted, { isTop20 = false } = {}) {
  const { w, h } = captureDimensionsFromFormatted(formatted, { isTop20 });

  const frame = document.createElement('div');
  frame.className = 'mr-keyword-sheet-capture-frame mr-keyword-sheet-capture-frame--plain';

  const scroll = document.createElement('div');
  scroll.className = 'mr-keyword-sheet-capture-scroll';

  const tableEl = document.createElement('table');
  tableEl.className = 'mr-keyword-sheet-capture-table mr-keyword-sheet-capture-table--formatted mr-keyword-sheet-capture-table--readable';
  tableEl.style.borderCollapse = 'collapse';

  (formatted?.rows || []).forEach((row) => {
    const tr = document.createElement('tr');
    (row.cells || []).forEach((cell) => {
      if (cell.skip) return;
      const el = document.createElement(cell.isHeader ? 'th' : 'td');
      el.textContent = String(cell.text ?? '');
      applyCellStyle(el, cell.style);
      if (cell.colspan > 1) el.colSpan = cell.colspan;
      if (cell.rowspan > 1) el.rowSpan = cell.rowspan;
      tr.appendChild(el);
    });
    if (tr.childNodes.length) tableEl.appendChild(tr);
  });

  scroll.appendChild(tableEl);
  frame.appendChild(scroll);
  const host = mountCaptureHost(frame, w, h);
  const measured = measureCaptureSize(host);
  resizeCaptureHost(host, measured.w, measured.h);
  return host;
}

async function captureHost(host) {
  const measured = measureCaptureSize(host);
  resizeCaptureHost(host, measured.w, measured.h);
  await waitForPaint();
  if (document.fonts?.ready) await document.fonts.ready;
  const w = host.offsetWidth || measured.w;
  const h = host.offsetHeight || measured.h;
  const canvas = await html2canvas(host, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    width: w,
    height: h,
    windowWidth: w,
    windowHeight: h,
    scrollX: 0,
    scrollY: 0,
  });
  return canvas.toDataURL('image/png');
}

export async function captureKeywordSheetImageDataUrl(table, options = {}) {
  if (!table?.rows?.length && !table?.headers?.length && !table?.allRows?.length) return '';
  const host = renderKeywordSheetCaptureHost(table, options);
  try {
    return await captureHost(host);
  } finally {
    document.body.removeChild(host);
  }
}

export async function captureFormattedKeywordSheetImageDataUrl(formatted, options = {}) {
  if (!formatted?.rows?.length) return '';
  const host = renderFormattedKeywordSheetCaptureHost(formatted, options);
  try {
    return await captureHost(host);
  } finally {
    document.body.removeChild(host);
  }
}

async function captureSectionSnapshot(sheetUrl, accessToken, section, clientTitle) {
  const {
    fetchGoogleSheetExportPng,
    fetchGoogleSheetFormattedGrid,
  } = await import('./googleSheetsEmbed');

  const slideTitle = section.key === 'top20'
    ? clientTitle
    : `${clientTitle} — ${section.label || section.title}`;

  const formatted = await fetchGoogleSheetFormattedGrid(sheetUrl, accessToken, { section });
  const isTop20 = section.key === 'top20';
  if (formatted?.rows?.length) {
    const imageDataUrl = await captureFormattedKeywordSheetImageDataUrl(formatted, { isTop20 });
    if (imageDataUrl) {
      return {
        key: section.key,
        label: section.label || section.title,
        title: slideTitle,
        imageDataUrl,
        source: 'formatted-grid',
      };
    }
  }

  const pngExport = await fetchGoogleSheetExportPng(sheetUrl, accessToken, {}, section);
  if (pngExport?.imageDataUrl) {
    return {
      key: section.key,
      label: section.label || section.title,
      title: slideTitle,
      imageDataUrl: pngExport.imageDataUrl,
      range: pngExport.range,
      source: 'png-export',
    };
  }

  return null;
}

/** Build readable section snapshots — Top 20 first, then All Locations chunks. */
export async function buildKeywordSheetSnapshotImage(sheetUrl, accessToken, clientTitle = 'Keyword Rankings') {
  if (!sheetUrl) {
    return { imageDataUrl: '', snapshots: [], formatted: null, table: null };
  }

  if (accessToken) {
    const { fetchKeywordSheetSections } = await import('./googleSheetsEmbed');
    const sections = await fetchKeywordSheetSections(sheetUrl, accessToken);
    const snapshots = [];

    for (const section of sections) {
      const snap = await captureSectionSnapshot(sheetUrl, accessToken, section, clientTitle);
      if (snap?.imageDataUrl) snapshots.push(snap);
    }

    if (snapshots.length) {
      return {
        imageDataUrl: snapshots[0].imageDataUrl,
        snapshots,
        formatted: null,
        table: null,
      };
    }
  }

  const { fetchGoogleSheetCsvTable, fetchKeywordSheetSections } = await import('./googleSheetsEmbed');
  const sections = accessToken
    ? await fetchKeywordSheetSections(sheetUrl, accessToken)
    : [];
  const primarySection = sections.find((s) => s.key === 'top20') || sections[0];

  const table = await fetchGoogleSheetCsvTable(sheetUrl, { accessToken: accessToken || undefined });
  if (table?.allRows?.length || table?.rows?.length || table?.headers?.length) {
    let rows = table.allRows || (table.headers?.length ? [table.headers, ...table.rows] : table.rows);
    if (primarySection) {
      rows = rows.slice(primarySection.startRow, primarySection.endRow + 1)
        .map((r) => r.slice(primarySection.startCol, primarySection.endCol + 1));
    }
    const sectionTable = { allRows: rows, headers: [], rows: [] };
    const isTop20 = primarySection?.key === 'top20';
    const imageDataUrl = await captureKeywordSheetImageDataUrl(sectionTable, { isTop20 });
    const snap = imageDataUrl ? [{
      key: primarySection?.key || 'summary',
      label: primarySection?.label || 'Keyword Rankings',
      title: clientTitle,
      imageDataUrl,
      source: 'csv-table',
    }] : [];
    return {
      imageDataUrl: snap[0]?.imageDataUrl || '',
      snapshots: snap,
      formatted: null,
      table: sectionTable,
    };
  }

  return { imageDataUrl: '', snapshots: [], formatted: null, table: null };
}
