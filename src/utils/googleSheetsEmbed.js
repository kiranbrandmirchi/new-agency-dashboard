/** Parse a Google Sheets share/edit URL into embed + export endpoints. */
export function parseGoogleSheetsUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  const idMatch = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) return null;
  const spreadsheetId = idMatch[1];
  const gidMatch = raw.match(/[#?&]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : '0';
  return {
    spreadsheetId,
    gid,
    previewUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/preview?gid=${gid}&rm=minimal&widget=true&headers=true`,
    csvUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`,
    gvizCsvUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&gid=${gid}`,
    viewUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${gid}`,
  };
}

export function isGoogleSheetsUrl(url) {
  return /docs\.google\.com\/spreadsheets\/d\//.test(String(url || ''));
}

export function isDirectImageUrl(url) {
  const s = String(url || '').trim();
  if (!s || isGoogleSheetsUrl(s)) return false;
  return /^https?:\/\/.+\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(s)
    || /^data:image\//i.test(s);
}

/** Resolve keyword sheet URL from tracker + screenshot settings. */
export function resolveKeywordSheetUrl(tracker, screenshot) {
  const candidates = [
    screenshot?.sheetUrl,
    tracker?.sheetUrl,
    isGoogleSheetsUrl(screenshot?.imageUrl) ? screenshot.imageUrl : '',
  ];
  return candidates.find((u) => u && isGoogleSheetsUrl(u)) || '';
}

function parseCsvText(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      if (ch === '\r') i += 1;
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => String(c || '').trim()));
}

/** Fetch sheet values via Sheets API (works for private sheets when accessToken is provided). */
async function fetchGoogleSheetViaSheetsApi(url, accessToken) {
  const valuesPack = await fetchSheetValues(url, accessToken);
  if (!valuesPack) return null;

  const { parsed, values, used } = valuesPack;
  const rows = values
    .slice(0, used.endRow)
    .map((r) => r.map((c) => String(c ?? '')))
    .filter((r, ri, arr) => {
      const hasContent = r.some((c) => String(c || '').trim());
      if (hasContent) return true;
      // Keep blank spacer rows between Top 20 and All Locations sections
      const prevHas = ri > 0 && arr[ri - 1]?.some((c) => String(c || '').trim());
      const nextHas = ri < arr.length - 1 && arr.slice(ri + 1).some(
        (nr) => nr.some((c) => String(c || '').trim()),
      );
      return prevHas && nextHas;
    });

  if (!rows.length) return null;
  return {
    headers: rows[0],
    rows: rows.slice(1),
    allRows: rows,
    sourceUrl: parsed.viewUrl,
  };
}

/** Fetch sheet as CSV rows. Public sheets work without a token; pass accessToken for private sheets. */
export async function fetchGoogleSheetCsvTable(url, { accessToken } = {}) {
  const parsed = parseGoogleSheetsUrl(url);
  if (!parsed) return null;

  if (accessToken) {
    const viaApi = await fetchGoogleSheetViaSheetsApi(url, accessToken);
    if (viaApi?.allRows?.length || viaApi?.rows?.length) return viaApi;
  }

  const urls = [parsed.gvizCsvUrl, parsed.csvUrl];
  for (const fetchUrl of urls) {
    try {
      const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
      const res = await fetch(fetchUrl, { mode: 'cors', credentials: 'omit', headers });
      if (!res.ok) continue;
      const text = await res.text();
      if (text.includes('<!DOCTYPE') || text.includes('<html')) continue;
      const rows = parseCsvText(text);
      if (rows.length) {
        return { headers: rows[0], rows: rows.slice(1), allRows: rows, sourceUrl: parsed.viewUrl };
      }
    } catch {
      // try next endpoint
    }
  }
  return null;
}

function rgbaFromGoogleColor(c) {
  if (!c) return '';
  const r = Math.round((c.red ?? 0) * 255);
  const g = Math.round((c.green ?? 0) * 255);
  const b = Math.round((c.blue ?? 0) * 255);
  const a = c.alpha ?? 1;
  if (a < 0.05 && r === 0 && g === 0 && b === 0) return '';
  if (a < 1) return `rgba(${r},${g},${b},${a})`;
  return `rgb(${r},${g},${b})`;
}

function borderCss(side) {
  if (!side?.style || side.style === 'NONE') return '';
  const color = rgbaFromGoogleColor(side.color) || '#dadce0';
  const w = Math.max(1, Math.round((side.width?.magnitude ?? 1) / 1.5));
  const style = String(side.style || 'SOLID').toLowerCase().replace('_', '-');
  return `${w}px ${style} ${color}`;
}

function cellStyleFromFormat(fmt) {
  if (!fmt) return {};
  const style = {};
  const bg = rgbaFromGoogleColor(fmt.backgroundColor);
  const tf = fmt.textFormat || {};
  const fg = rgbaFromGoogleColor(tf.foregroundColor);
  if (bg) style.backgroundColor = bg;
  if (fg) style.color = fg;
  if (tf.bold) style.fontWeight = 'bold';
  if (tf.italic) style.fontStyle = 'italic';
  if (tf.fontSize) style.fontSize = `${Math.max(8, Math.round(tf.fontSize))}px`;
  const align = String(fmt.horizontalAlignment || '').toLowerCase();
  if (align === 'center' || align === 'right' || align === 'left') style.textAlign = align;
  const borders = fmt.borders || {};
  const top = borderCss(borders.top);
  const right = borderCss(borders.right);
  const bottom = borderCss(borders.bottom);
  const left = borderCss(borders.left);
  if (top) style.borderTop = top;
  if (right) style.borderRight = right;
  if (bottom) style.borderBottom = bottom;
  if (left) style.borderLeft = left;
  return style;
}

function columnIndexToLetter(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const DEFAULT_MAX_ROWS = 300;
const DEFAULT_MAX_COLS = 60;

function resolveFetchBounds(sheetMeta, options = {}) {
  const rowCap = Math.min(options.maxRows ?? DEFAULT_MAX_ROWS, sheetMeta?.rowCount || DEFAULT_MAX_ROWS, 500);
  const colCap = Math.min(options.maxCols ?? DEFAULT_MAX_COLS, sheetMeta?.columnCount || DEFAULT_MAX_COLS, 60);
  return { maxRows: rowCap, maxCols: colCap };
}

function detectUsedBounds(values, maxRows, maxCols) {
  let lastRow = 0;
  let lastCol = 0;
  for (let ri = 0; ri < Math.min(values.length, maxRows); ri += 1) {
    const row = values[ri] || [];
    for (let ci = 0; ci < Math.min(row.length, maxCols); ci += 1) {
      if (String(row[ci] ?? '').trim()) {
        lastRow = Math.max(lastRow, ri);
        lastCol = Math.max(lastCol, ci);
      }
    }
  }
  return {
    lastRow: Math.max(lastRow, 0),
    lastCol: Math.max(lastCol, 0),
    endRow: Math.min(maxRows, lastRow + 2),
    endCol: Math.min(maxCols, lastCol + 2),
  };
}

/** Max cols/rows per snapshot so text stays readable on a 16:9 slide. */
/** Max cols per Top 20 snapshot (~5 location pairs + keyword col). */
const TOP20_MAX_COLS = 11;
const READABLE_MAX_COLS = 14;
const READABLE_MAX_ROWS = 26;

function rowHasContent(values, ri) {
  return (values[ri] || []).some((c) => String(c ?? '').trim());
}

function rowText(values, ri) {
  return (values[ri] || []).map((c) => String(c ?? '').trim()).join(' ').toLowerCase();
}

function colBoundsForRows(values, startRow, endRow, maxCols) {
  let lastCol = 0;
  for (let ri = startRow; ri <= endRow; ri += 1) {
    const row = values[ri] || [];
    for (let ci = 0; ci < Math.min(row.length, maxCols); ci += 1) {
      if (String(row[ci] ?? '').trim()) lastCol = Math.max(lastCol, ci);
    }
  }
  return lastCol;
}

function boundsToA1(bounds) {
  const sc = columnIndexToLetter(bounds.startCol);
  const ec = columnIndexToLetter(bounds.endCol);
  return `${sc}${bounds.startRow + 1}:${ec}${bounds.endRow + 1}`;
}

/**
 * Split sheet into readable export sections (Top 20, All Locations chunks).
 * Avoids shrinking the entire sheet onto one unreadable slide.
 */
export function detectKeywordSheetSections(values, maxRows, maxCols) {
  const sections = [];
  let top20Row = -1;
  let allLocRow = -1;

  for (let ri = 0; ri < Math.min(values.length, maxRows); ri += 1) {
    const txt = rowText(values, ri);
    const c0 = String(values[ri]?.[0] ?? '').trim().toLowerCase();
    if (top20Row < 0 && (/top\s*20|top\s*twenty|top20/.test(txt) || /^top\s*20/.test(c0))) {
      top20Row = ri;
    }
    if (/all\s*locations/.test(txt) || /^all\s*locations/.test(c0)) {
      allLocRow = ri;
    }
  }

  if (top20Row >= 0) {
    let endRow = allLocRow > top20Row ? allLocRow - 1 : top20Row + READABLE_MAX_ROWS;
    endRow = Math.min(endRow, values.length - 1);
    while (endRow > top20Row && !rowHasContent(values, endRow)) endRow -= 1;
    const lastCol = colBoundsForRows(values, top20Row, endRow, maxCols);
    sections.push({
      key: 'top20',
      title: 'Top 20',
      label: 'Top 20 Keywords',
      startRow: top20Row,
      endRow,
      startCol: 0,
      endCol: Math.min(lastCol, TOP20_MAX_COLS),
    });
  }

  if (allLocRow >= 0) {
    let endRow = values.length - 1;
    while (endRow > allLocRow && !rowHasContent(values, endRow)) endRow -= 1;
    const lastCol = colBoundsForRows(values, allLocRow, endRow, maxCols);
    const chunkWidth = READABLE_MAX_COLS;
    let chunkStart = 0;
    let part = 1;
    while (chunkStart <= lastCol) {
      const chunkEnd = Math.min(chunkStart + chunkWidth, lastCol);
      sections.push({
        key: part === 1 ? 'allLocations' : `allLocations_${part}`,
        title: part === 1 ? 'All Locations' : `All Locations (${part})`,
        label: part === 1 ? 'All Locations' : `All Locations (part ${part})`,
        startRow: allLocRow,
        endRow,
        startCol: chunkStart,
        endCol: chunkEnd,
      });
      if (chunkEnd >= lastCol) break;
      chunkStart = chunkEnd + 1;
      part += 1;
    }
  }

  if (!sections.length) {
    const used = detectUsedBounds(values, maxRows, maxCols);
    sections.push({
      key: 'summary',
      title: 'Keyword Rankings',
      label: 'Keyword Rankings',
      startRow: 0,
      endRow: Math.min(used.lastRow, READABLE_MAX_ROWS),
      startCol: 0,
      endCol: Math.min(used.lastCol, READABLE_MAX_COLS),
    });
  }

  return sections;
}

export async function fetchKeywordSheetSections(url, accessToken, options = {}) {
  const valuesPack = await fetchSheetValues(url, accessToken, options);
  if (!valuesPack) return [];
  return detectKeywordSheetSections(valuesPack.values, valuesPack.maxRows, valuesPack.maxCols);
}

async function fetchSheetValues(url, accessToken, bounds) {
  const parsed = parseGoogleSheetsUrl(url);
  if (!parsed || !accessToken) return null;

  const sheetMeta = await resolveSheetMeta(parsed, accessToken);
  if (!sheetMeta) return null;

  const { maxRows, maxCols } = resolveFetchBounds(sheetMeta, bounds);
  const endCol = columnIndexToLetter(maxCols - 1);
  const safeTitle = sheetMeta.title.replace(/'/g, "''");
  const range = encodeURIComponent(`'${safeTitle}'!A1:${endCol}${maxRows}`);
  const valuesRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${parsed.spreadsheetId}/values/${range}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const valuesData = await valuesRes.json();
  if (!valuesRes.ok || !valuesData.values?.length) return null;

  return {
    parsed,
    sheetMeta,
    values: valuesData.values,
    used: detectUsedBounds(valuesData.values, maxRows, maxCols),
    maxRows,
    maxCols,
  };
}

/** Export a sheet range as PNG via Google (preserves colors and conditional formatting). */
export async function fetchGoogleSheetExportPng(url, accessToken, options = {}, section = null) {
  const valuesPack = await fetchSheetValues(url, accessToken, options);
  if (!valuesPack) return null;

  const { parsed, used } = valuesPack;
  const bounds = section || {
    startRow: 0,
    endRow: Math.max(used.endRow - 1, 0),
    startCol: 0,
    endCol: Math.max(used.endCol - 1, 0),
  };
  const range = boundsToA1(bounds);
  const exportUrl = `https://docs.google.com/spreadsheets/d/${parsed.spreadsheetId}/export?format=png&gid=${parsed.gid}&range=${encodeURIComponent(range)}&scale=3`;

  const res = await fetch(exportUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) return null;

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  if (!dataUrl.startsWith('data:image/')) return null;
  return { imageDataUrl: dataUrl, sourceUrl: parsed.viewUrl, range, section: bounds };
}

async function resolveSheetMeta(parsed, accessToken) {
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${parsed.spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const meta = await metaRes.json();
  if (!metaRes.ok) return null;

  let sheet = meta.sheets?.[0];
  if (parsed.gid && meta.sheets?.length) {
    const match = meta.sheets.find(
      (s) => String(s.properties?.sheetId) === String(parsed.gid),
    );
    if (match) sheet = match;
  }
  if (!sheet) return null;

  const gp = sheet.properties?.gridProperties || {};
  return {
    title: sheet.properties?.title || 'Sheet1',
    rowCount: gp.rowCount || 100,
    columnCount: gp.columnCount || 20,
  };
}

async function resolveSheetTitle(parsed, accessToken) {
  const meta = await resolveSheetMeta(parsed, accessToken);
  return meta?.title || null;
}

function buildMergeMaps(merges, maxRows, maxCols) {
  const skip = new Set();
  const anchor = new Map();
  for (const m of merges || []) {
    const rs = m.startRowIndex ?? 0;
    const re = m.endRowIndex ?? rs + 1;
    const cs = m.startColumnIndex ?? 0;
    const ce = m.endColumnIndex ?? cs + 1;
    if (rs >= maxRows || cs >= maxCols) continue;
    anchor.set(`${rs},${cs}`, {
      colspan: Math.min(ce, maxCols) - cs,
      rowspan: Math.min(re, maxRows) - rs,
    });
    for (let r = rs; r < Math.min(re, maxRows); r += 1) {
      for (let c = cs; c < Math.min(ce, maxCols); c += 1) {
        if (r !== rs || c !== cs) skip.add(`${r},${c}`);
      }
    }
  }
  return { skip, anchor };
}

/**
 * Fetch sheet grid with cell formatting (background colors, fonts, borders, merges).
 * Pass options.section for a readable subset (Top 20 block, etc.).
 */
export async function fetchGoogleSheetFormattedGrid(url, accessToken, options = {}) {
  const parsed = parseGoogleSheetsUrl(url);
  if (!parsed || !accessToken) return null;

  const valuesPack = await fetchSheetValues(url, accessToken, options);
  if (!valuesPack) return null;

  const { sheetMeta, used, maxRows, maxCols } = valuesPack;
  const section = options.section || null;
  const rowOffset = section?.startRow ?? 0;
  const colOffset = section?.startCol ?? 0;
  const fetchRows = section
    ? section.endRow + 1
    : Math.min(maxRows, Math.max(used.endRow, 1));
  const fetchCols = section
    ? section.endCol + 1
    : Math.min(maxCols, Math.max(used.endCol, 1));

  const safeTitle = sheetMeta.title.replace(/'/g, "''");
  const startCol = columnIndexToLetter(section?.startCol ?? 0);
  const endCol = columnIndexToLetter(fetchCols - 1);
  const startRow = (section?.startRow ?? 0) + 1;
  const a1 = section
    ? `'${safeTitle}'!${startCol}${startRow}:${endCol}${fetchRows}`
    : `'${safeTitle}'!A1:${endCol}${fetchRows}`;
  const range = encodeURIComponent(a1);

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${parsed.spreadsheetId}?ranges=${range}&includeGridData=true&fields=sheets(merges,data(rowData(values(formattedValue,effectiveFormat))))`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = await res.json();
  if (!res.ok || !data.sheets?.[0]?.data?.[0]?.rowData) return null;

  const sheet = data.sheets[0];
  const rowData = sheet.data[0].rowData || [];
  const mergeRowCap = (section?.endRow ?? used.lastRow) + 1;
  const mergeColCap = (section?.endCol ?? used.lastCol) + 1;
  const { skip, anchor } = buildMergeMaps(sheet.merges, mergeRowCap, mergeColCap);

  const sliceStartRow = section?.startRow ?? 0;
  const sliceEndRow = section ? section.endRow : used.lastRow;
  const sliceStartCol = section?.startCol ?? 0;
  const sliceEndCol = section ? section.endCol : used.lastCol;

  const colLimit = Math.max(sliceEndCol - sliceStartCol + 1, 1);
  const rowLimit = Math.max(sliceEndRow - sliceStartRow + 1, 1);
  const rows = [];
  for (let ri = 0; ri < rowLimit; ri += 1) {
    const values = rowData[ri]?.values || [];
    const cells = [];

    for (let ci = 0; ci < colLimit; ci += 1) {
      const absR = ri + rowOffset;
      const absC = ci + colOffset;
      if (skip.has(`${absR},${absC}`)) continue;
      const cell = values[ci] || {};
      const merge = anchor.get(`${absR},${absC}`);
      const isSectionHeader = /^(top\s*20|all\s*locations|keyword|location|rank)/i.test(String(cell.formattedValue ?? '').trim());
      cells.push({
        text: cell.formattedValue ?? '',
        style: cellStyleFromFormat(cell.effectiveFormat),
        isHeader: ri === 0 || isSectionHeader,
        colspan: merge?.colspan > 1 ? merge.colspan : 1,
        rowspan: merge?.rowspan > 1 ? merge.rowspan : 1,
      });
    }

    if (cells.length) rows.push({ cells });
  }

  if (!rows.length) return null;
  return {
    rows,
    sourceUrl: parsed.viewUrl,
    sheetTitle: sheetMeta.title,
    rowCount: rows.length,
    colCount: colLimit,
    section: section || null,
    sectionLabel: section?.label || '',
  };
}
