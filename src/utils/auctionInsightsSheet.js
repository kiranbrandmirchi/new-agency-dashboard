import { fetchGoogleSheetCsvTable, parseGoogleSheetsUrl } from './googleSheetsEmbed';
import { formatDisplayPeriodLabel } from './monthlyReportHelpers';

/** Shared agency auction insights workbook (all clients on one tab). */
export const DEFAULT_AUCTION_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1DAFz1PKErha7J5xITKeEEba46Avnh2y0gW4lSqlYXLc/edit?gid=1910190295#gid=1910190295';

/** Previous month auction insights workbook (March and earlier). */
export const DEFAULT_AUCTION_SHEET_PREVIOUS_URL =
  'https://docs.google.com/spreadsheets/d/1uWBm3SJPa0ZoCotVWtXTi72cIUCS5Lc-7vrd0NXVbEk/edit?gid=1905742276#gid=1905742276';

const COL = {
  accountName: ['account name'],
  customerId: ['customer id'],
  domain: ['display url domain', 'display url'],
  impressionShare: ['search impr. share', 'impression share'],
  overlapRate: ['search overlap rate', 'overlap rate'],
  posAbove: ['position above rate'],
  topPage: ['top of page rate'],
  absTop: ['abs. top of page rate', 'absolute top of page rate'],
  outranking: ['search outranking share', 'outranking share'],
};

function normText(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s-]/g, '');
}

function normCustomerId(s) {
  return String(s || '').replace(/\D/g, '');
}

/** Normalize Google Ads customer id — sheet uses 100-268-3889, DB may store either format. */
export function normalizeGoogleAdsCustomerId(id) {
  return normCustomerId(id);
}

function customerIdMatches(rowCustomerId, customerIds) {
  if (!rowCustomerId || !customerIds?.length) return false;
  const rowNorm = normCustomerId(rowCustomerId);
  return customerIds.some((id) => normCustomerId(id) === rowNorm);
}

function colIndex(headers, aliases) {
  const h = headers.map((x) => normText(x));
  for (let i = 0; i < h.length; i += 1) {
    const cell = h[i];
    if (aliases.some((a) => {
      const na = normText(a);
      return cell === na || cell.includes(na) || na.includes(cell);
    })) return i;
  }
  return -1;
}

function findHeaderRow(allRows) {
  for (let i = 0; i < Math.min(allRows.length, 8); i += 1) {
    const row = allRows[i] || [];
    const joined = row.map((c) => normText(c)).join('|');
    if (joined.includes('account name') && (joined.includes('display url') || joined.includes('customer id'))) return i;
  }
  return -1;
}

function accountMatches(sheetAccount, clientName) {
  const a = normText(sheetAccount);
  const c = normText(clientName);
  if (!a || !c) return false;
  if (a === c) return true;
  if (a.includes(c) || c.includes(a)) return true;
  const cWords = c.split(' ').filter(Boolean);
  if (cWords.length >= 2 && cWords.every((w) => a.includes(w))) return true;
  return false;
}

function cellVal(row, idx) {
  if (idx < 0) return '';
  const v = String(row[idx] ?? '').trim();
  if (!v || v === '--' || v === '—') return '—';
  return v;
}

function parseShareNum(s) {
  const t = String(s || '').replace(/[,%<>]/g, '').trim();
  if (!t || t === '—') return -1;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : -1;
}

function sortAuctionRows(rows) {
  const you = [];
  const rest = [];
  rows.forEach((r) => {
    if (String(r.domain || '').trim().toLowerCase() === 'you') you.push(r);
    else rest.push(r);
  });
  rest.sort((a, b) => parseShareNum(b.impressionShare) - parseShareNum(a.impressionShare));
  return [...you, ...rest];
}

/**
 * Parse auction insights rows for one client from a multi-client Google Sheet export.
 * Sheet format: row 1 title, row 2 date range, row 3 headers, row 4+ data.
 */
export function parseAuctionInsightsFromSheet(table, clientName, { customerId = '', customerIds = [], maxRows = 0 } = {}) {
  const ids = [
    ...new Set(
      [...(customerIds || []), customerId]
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    ),
  ];

  if (!table?.allRows?.length && !table?.rows?.length && !table?.headers?.length) {
    return { rows: [], periodLabel: '', customerIds: ids };
  }
  if (!ids.length && !clientName) return { rows: [], periodLabel: '', customerIds: ids };

  const allRows = table.allRows?.length
    ? table.allRows
    : (table.headers?.length ? [table.headers, ...(table.rows || [])] : (table.rows || []));

  if (!allRows.length) return { rows: [], periodLabel: '', customerIds: ids };

  let periodLabel = '';
  for (let i = 0; i < Math.min(3, allRows.length); i += 1) {
    const first = String(allRows[i]?.[0] || '').trim();
    if (/\d{4}/.test(first) && /[-–]/.test(first)) {
      periodLabel = formatDisplayPeriodLabel(first, '');
      if (periodLabel) break;
    }
  }

  const headerIdx = findHeaderRow(allRows);
  if (headerIdx < 0) return { rows: [], periodLabel: '', customerIds: ids };

  const headers = allRows[headerIdx];
  const idx = {
    accountName: colIndex(headers, COL.accountName),
    customerId: colIndex(headers, COL.customerId),
    domain: colIndex(headers, COL.domain),
    impressionShare: colIndex(headers, COL.impressionShare),
    overlapRate: colIndex(headers, COL.overlapRate),
    posAbove: colIndex(headers, COL.posAbove),
    topPage: colIndex(headers, COL.topPage),
    absTop: colIndex(headers, COL.absTop),
    outranking: colIndex(headers, COL.outranking),
  };

  if (idx.accountName < 0 || idx.domain < 0) return { rows: [], periodLabel: '', customerIds: ids };

  const matched = [];
  for (let r = headerIdx + 1; r < allRows.length; r += 1) {
    const row = allRows[r];
    if (!row?.some((c) => String(c || '').trim())) continue;

    const account = String(row[idx.accountName] ?? '').trim();
    const rowCustomerId = idx.customerId >= 0 ? String(row[idx.customerId] ?? '').trim() : '';
    const domain = cellVal(row, idx.domain);
    if (!domain || domain === '—') continue;

    const idMatch = customerIdMatches(rowCustomerId, ids);
    if (ids.length) {
      if (!idMatch) continue;
    } else if (!accountMatches(account, clientName)) {
      continue;
    }

    matched.push({
      domain,
      impressionShare: cellVal(row, idx.impressionShare),
      overlapRate: cellVal(row, idx.overlapRate),
      posAbove: cellVal(row, idx.posAbove),
      topPage: cellVal(row, idx.topPage),
      absTop: cellVal(row, idx.absTop),
      outranking: cellVal(row, idx.outranking),
    });
  }

  const rows = sortAuctionRows(matched);
  return {
    rows: maxRows > 0 ? rows.slice(0, maxRows) : rows,
    periodLabel,
    customerIds: ids,
    matchedBy: ids.length ? 'customerId' : 'accountName',
  };
}

/** Normalize stored slide9 data — legacy array or { current, previous } object. */
export function normalizeAuctionSlideData(raw) {
  if (Array.isArray(raw)) {
    return {
      current: { periodLabel: '', rows: raw },
      previous: { periodLabel: '', rows: [] },
    };
  }
  if (raw && typeof raw === 'object') {
    return {
      current: {
        periodLabel: String(raw.current?.periodLabel || '').trim(),
        rows: Array.isArray(raw.current?.rows) ? raw.current.rows : [],
      },
      previous: {
        periodLabel: String(raw.previous?.periodLabel || '').trim(),
        rows: Array.isArray(raw.previous?.rows) ? raw.previous.rows : [],
      },
    };
  }
  return {
    current: { periodLabel: '', rows: [] },
    previous: { periodLabel: '', rows: [] },
  };
}

function auctionFetchOpts(customerIds, accessToken) {
  return {
    accessToken: accessToken || undefined,
    customerIds: customerIds || [],
  };
}

async function fetchAuctionWithAuth(sheetUrl, clientName, customerIds, accessToken) {
  let result = await fetchAuctionInsightsFromSheet(sheetUrl, clientName, auctionFetchOpts(customerIds, accessToken));
  if (!result.rows.length && result.error?.includes('private')) {
    const { requestGoogleDriveAccessToken } = await import('./googleDriveExport');
    const token = await requestGoogleDriveAccessToken({ forceSignIn: true });
    result = await fetchAuctionInsightsFromSheet(sheetUrl, clientName, auctionFetchOpts(customerIds, token));
  }
  return result;
}

/** Load current + previous month auction tables from two sheet URLs. */
export async function fetchAuctionInsightsComparison(
  currentUrl,
  previousUrl,
  clientName,
  { accessToken = '', customerId = '', customerIds = [] } = {},
) {
  const curUrl = resolveAuctionSheetUrl('', currentUrl);
  const prevUrl = String(previousUrl || '').trim() || DEFAULT_AUCTION_SHEET_PREVIOUS_URL;

  const ids = [
    ...new Set(
      [...(customerIds || []), customerId]
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    ),
  ];

  const [currentResult, previousResult] = await Promise.all([
    fetchAuctionWithAuth(curUrl, clientName, ids, accessToken),
    prevUrl ? fetchAuctionWithAuth(prevUrl, clientName, ids, accessToken) : Promise.resolve({ rows: [], periodLabel: '' }),
  ]);

  const data = {
    current: { periodLabel: currentResult.periodLabel || '', rows: currentResult.rows || [] },
    previous: { periodLabel: previousResult.periodLabel || '', rows: previousResult.rows || [] },
    customerIds: ids,
  };

  if (!data.current.rows.length && !data.previous.rows.length) {
    const err = currentResult.error || previousResult.error || 'No auction data found for this client';
    return { ...data, error: err };
  }

  return data;
}

export async function fetchAuctionInsightsFromSheet(sheetUrl, clientName, { accessToken = '', customerId = '', customerIds = [] } = {}) {
  const url = String(sheetUrl || '').trim() || DEFAULT_AUCTION_SHEET_URL;
  if (!parseGoogleSheetsUrl(url)) return { rows: [], periodLabel: '', error: 'Invalid Google Sheet URL' };

  const ids = [
    ...new Set(
      [...(customerIds || []), customerId]
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    ),
  ];

  const table = await fetchGoogleSheetCsvTable(url, { accessToken: accessToken || undefined });
  if (!table?.allRows?.length && !table?.rows?.length) {
    return { rows: [], periodLabel: '', error: 'Could not load sheet — sign in with Google if the sheet is private' };
  }

  const parsed = parseAuctionInsightsFromSheet(table, clientName, { customerIds: ids });
  if (!parsed.rows.length) {
    const idHint = ids.length
      ? `Customer ID ${ids.join(', ')}`
      : `Account name "${clientName}"`;
    return {
      ...parsed,
      error: `No auction rows found — check sheet ${idHint} matches a row in the Customer ID column`,
    };
  }
  return parsed;
}

export function resolveAuctionSheetUrl(sectionUrl, manualUrl) {
  return String(manualUrl || sectionUrl || DEFAULT_AUCTION_SHEET_URL).trim();
}

export function resolveAuctionSheetPreviousUrl(sectionUrl, manualUrl) {
  return String(manualUrl || sectionUrl || DEFAULT_AUCTION_SHEET_PREVIOUS_URL).trim();
}
