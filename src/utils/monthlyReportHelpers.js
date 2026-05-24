/** Parse YYYY-MM-DD without UTC timezone shifts. */
export function parseYmd(dateStr) {
  const s = String(dateStr || '').slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return null;
  return { year: +match[1], month: +match[2], day: +match[3] };
}

const pad2 = (n) => String(n).padStart(2, '0');

function daysInCalendarMonth(year, month1to12) {
  if (month1to12 === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month1to12 - 1];
}

/** Full calendar month for report_month (e.g. 2026-04-01 → Apr 1–30; compare Mar 1–31). */
export function getMonthRange(reportMonth) {
  const parsed = parseYmd(reportMonth);
  let year;
  let month;
  if (parsed) {
    year = parsed.year;
    month = parsed.month;
  } else {
    const partial = /^(\d{4})-(\d{2})/.exec(String(reportMonth || ''));
    if (!partial) {
      return { currentFrom: '', currentTo: '', prevFrom: '', prevTo: '' };
    }
    year = +partial[1];
    month = +partial[2];
  }
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return {
    currentFrom: `${year}-${pad2(month)}-01`,
    currentTo: `${year}-${pad2(month)}-${pad2(daysInCalendarMonth(year, month))}`,
    prevFrom: `${prevYear}-${pad2(prevMonth)}-01`,
    prevTo: `${prevYear}-${pad2(prevMonth)}-${pad2(daysInCalendarMonth(prevYear, prevMonth))}`,
  };
}

/** Previous calendar month relative to a YYYY-MM-DD end date. */
export function getPreviousCalendarMonthRange(endDateStr) {
  const parsed = parseYmd(endDateStr);
  if (!parsed) return { prevFrom: '', prevTo: '' };
  const prevMonth = parsed.month === 1 ? 12 : parsed.month - 1;
  const prevYear = parsed.month === 1 ? parsed.year - 1 : parsed.year;
  return {
    prevFrom: `${prevYear}-${pad2(prevMonth)}-01`,
    prevTo: `${prevYear}-${pad2(prevMonth)}-${pad2(daysInCalendarMonth(prevYear, prevMonth))}`,
  };
}

export function formatMonthLabel(dateStr) {
  if (!dateStr) return '';
  const parsed = parseYmd(dateStr);
  if (parsed) {
    return new Date(parsed.year, parsed.month - 1, 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  }
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Compact period for table headers (e.g. "Apr 2026"). */
export function formatPeriodShort(dateStr) {
  if (!dateStr) return '';
  const parsed = parseYmd(dateStr);
  if (parsed) {
    return new Date(parsed.year, parsed.month - 1, 1).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  }
  const d = new Date(dateStr);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  return String(dateStr);
}

export function formatShortMonthLabel(dateStr) {
  if (!dateStr) return '';
  const parsed = parseYmd(dateStr);
  if (parsed) {
    return new Date(parsed.year, parsed.month - 1, 1).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  }
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function momChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export function formatChangePct(pct, lowerIsBetter = false) {
  const sign = pct >= 0 ? '+' : '';
  const str = `${sign}${pct.toFixed(2)}%`;
  const positive = lowerIsBetter ? pct <= 0 : pct >= 0;
  return { text: str, positive };
}

export const fU = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fI = (n) => Math.round(Number(n || 0)).toLocaleString('en-US');
export const fP = (n) => Number(n || 0).toFixed(1) + '%';

/** GA4 bounceRate is 0–1; values already in 0–100 pass through unchanged. */
export function formatBounceRate(rate) {
  const n = Number(rate);
  if (Number.isNaN(n)) return '—';
  const pct = n > 0 && n <= 1 ? n * 100 : n;
  return `${pct.toFixed(1)}%`;
}

export const fDur = (sec) => {
  const n = Number(sec);
  if (Number.isNaN(n) || n <= 0) return '—';
  const m = Math.floor(n / 60);
  const s = Math.floor(n % 60);
  return `${m}m ${String(s).padStart(2, '0')}s`;
};

export const DEFAULT_SLIDE2_SERVICES = [
  {
    icon: '💰',
    title: 'Pay-Per-Click Advertising',
    body: 'Driving targeted traffic and qualified leads through paid advertising campaigns.',
  },
  {
    icon: '📍',
    title: 'Geo AI',
    body: 'Leveraging location-based targeting to reach the right audience in each market.',
  },
  {
    icon: '🔍',
    title: 'SEO',
    body: 'Improving search visibility and organic rankings through content, technical SEO, and link building.',
  },
];

export const DEFAULT_SLIDE10_PROGRESS = {
  overview: 'This month we focused on high-intent keywords and optimized campaigns for lead quality.',
  performance: 'We continue to improve ad visibility and conversion rates across paid channels.',
  metrics: 'Monitor clicks, conversions, and cost per lead to guide ongoing optimization.',
  goal: 'Drive more qualified leads, improve ad quality, and continuously optimize campaigns.',
};

export const AUCTION_COLUMNS = [
  'domain',
  'impressionShare',
  'overlapRate',
  'posAbove',
  'topPage',
  'absTop',
  'outranking',
];

/** CSV template headers — must match slide 9 / PPTX auction table column titles. */
export const AUCTION_CSV_HEADERS = [
  'Domain',
  'Impression Share',
  'Overlap Rate',
  'Position Above Rate',
  'Top of Page Rate',
  'Abs. Top of Page Rate',
  'Outranking Share',
];

export function buildAuctionCsvTemplate() {
  return `${AUCTION_CSV_HEADERS.join(',')}\n`;
}

export function parseSectionJson(sections, key, fallback) {
  const raw = (sections || []).find((s) => s.section_key === key)?.content;
  if (!raw) return fallback;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return fallback;
  }
}

export function getSectionText(sections, key, fallback = '') {
  return (sections || []).find((s) => s.section_key === key)?.content ?? fallback;
}

export function mergeSections(existing, updates) {
  const map = new Map((existing || []).map((s) => [s.section_key, s]));
  (updates || []).forEach((u) => map.set(u.section_key, { ...map.get(u.section_key), ...u }));
  return [...map.values()];
}

export function csvToAuctionRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const keyMap = {
    Domain: 'domain',
    domain: 'domain',
    'Display URL domain': 'domain',
    'Impression share': 'impressionShare',
    'Impression Share': 'impressionShare',
    impressionShare: 'impressionShare',
    'Overlap rate': 'overlapRate',
    'Overlap Rate': 'overlapRate',
    overlapRate: 'overlapRate',
    'Position above rate': 'posAbove',
    'Position Above Rate': 'posAbove',
    posAbove: 'posAbove',
    'Top of page rate': 'topPage',
    'Top of Page Rate': 'topPage',
    topPage: 'topPage',
    'Abs. Top of page rate': 'absTop',
    'Abs. Top of Page Rate': 'absTop',
    absTop: 'absTop',
    'Outranking share': 'outranking',
    'Outranking Share': 'outranking',
    outranking: 'outranking',
  };
  return rows.map((row) => {
    const out = {};
    AUCTION_COLUMNS.forEach((col) => { out[col] = ''; });
    Object.entries(row).forEach(([k, v]) => {
      const mapped = keyMap[k] || keyMap[k.trim()];
      if (mapped) out[mapped] = String(v ?? '');
    });
    return out;
  });
}
