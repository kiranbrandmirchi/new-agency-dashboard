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

/** Short display label from verbose sheet/API text (e.g. "Auction Insights report April 1, 2026 - …" → "Apr 2026"). */
export function formatDisplayPeriodLabel(raw, fallback = '') {
  const s = String(raw || '').trim();
  if (!s) return fallback;
  if (/^[A-Za-z]{3,9}\s+\d{4}$/.test(s)) return s;
  const m = s.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b[^0-9]*(\d{4})/i);
  if (m) {
    const d = new Date(`${m[1]} 1, ${m[2]}`);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
  }
  return fallback || (s.length > 16 ? '' : s);
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
    key: 'ppc',
    enabled: true,
    icon: '💰',
    title: 'Pay-Per-Click Advertising',
    body: 'Driving targeted traffic and qualified leads through paid advertising campaigns.',
  },
  {
    key: 'geoAi',
    enabled: true,
    icon: '📍',
    title: 'Geo AI',
    body: 'Leveraging location-based targeting to reach the right audience in each market.',
  },
  {
    key: 'seo',
    enabled: true,
    icon: '🔍',
    title: 'SEO',
    body: 'Improving search visibility and organic rankings through content, technical SEO, and link building.',
  },
  {
    key: 'webDev',
    enabled: false,
    icon: '🛠️',
    title: 'Web Development',
    body: 'Building and maintaining the website with performance, UX, and conversion-focused updates.',
  },
];

export const SLIDE2_SERVICE_OPTIONS = DEFAULT_SLIDE2_SERVICES.map(({ key, title }) => ({ key, label: title }));

/** Merge saved slide2 data with defaults (supports legacy arrays without keys). */
export function normalizeSlide2Services(raw) {
  const defaults = DEFAULT_SLIDE2_SERVICES.map((d) => ({ ...d }));
  if (!Array.isArray(raw) || !raw.length) return defaults;
  return defaults.map((def, idx) => {
    const byKey = raw.find((s) => s?.key === def.key);
    const legacy = raw[idx];
    const src = byKey || legacy;
    if (!src || typeof src !== 'object') return def;
    return {
      ...def,
      ...src,
      key: def.key,
      enabled: src.enabled !== undefined ? !!src.enabled : def.enabled,
    };
  });
}

export function getEnabledSlide2Services(services) {
  return normalizeSlide2Services(services).filter((s) => s.enabled !== false);
}

export const DEFAULT_SLIDE10_PROGRESS = {
  overview: 'This month we focused on high-intent keywords and optimized campaigns for lead quality.',
  performance: 'We continue to improve ad visibility and conversion rates across paid channels.',
  metrics: 'Monitor clicks, conversions, and cost per lead to guide ongoing optimization.',
  goal: 'Drive more qualified leads, improve ad quality, and continuously optimize campaigns.',
};

export const DEFAULT_SEO_EXECUTIVE_SECTIONS = {
  notes: '',
  websiteAnalytics: '',
  webDevUpdates: '',
  googleSearchConsole: '',
  gbpPerformance: '',
  keywordsRanking: '',
  nextSteps: '',
};

export const DEFAULT_SEO_WEBDEV_ITEMS = [
  {
    num: '01',
    title: 'Website Health & Performance Monitoring',
    body: 'Monitored website uptime, page speed, and overall performance to ensure smooth user experience.',
  },
  {
    num: '02',
    title: 'Security & Maintenance Checks',
    body: 'Conducted routine security reviews, plugin/module checks, and monitored for vulnerabilities or potential issues.',
  },
  {
    num: '03',
    title: 'Bug Monitoring & Technical Support',
    body: 'Reviewed website functionality across key pages and forms, ensuring no critical issues affected users.',
  },
  {
    num: '04',
    title: 'Content & SEO Readiness Review',
    body: 'Audited website content, metadata, broken links, and technical SEO elements to keep the site optimized and ready for future updates.',
  },
];

export const DEFAULT_COMPARE_SECTIONS = {
  executiveSummary: true,
  ga4Organic: true,
  ga4AllChannels: true,
  ga4LandingPages: true,
  ga4TopCities: true,
  gscSummary: true,
  top20Queries: true,
  gbp: true,
};

export const COMPARE_SECTION_OPTIONS = [
  { key: 'executiveSummary', label: 'Executive Summary KPIs' },
  { key: 'ga4Organic', label: 'GA4 Organic Channel' },
  { key: 'ga4AllChannels', label: 'GA4 All Channels' },
  { key: 'ga4LandingPages', label: 'GA4 Top Landing Pages' },
  { key: 'ga4TopCities', label: 'GA4 Top Cities' },
  { key: 'gscSummary', label: 'Google Search Console Summary' },
  { key: 'top20Queries', label: 'Top 20 Search Queries' },
  { key: 'gbp', label: 'Google Business Profile' },
];

/** Per-section comparison visibility (global compare must also be on). */
export function isSectionCompareOn(globalCompareOn, compareSections, sectionKey) {
  if (!globalCompareOn) return false;
  if (!compareSections || typeof compareSections !== 'object') return true;
  return compareSections[sectionKey] !== false;
}

export const DEFAULT_KEYWORD_TRACKER = {
  sheetUrl: '',
  insights: [
    { icon: '✅', title: 'Strong Rankings', body: 'Ranking well on almost all targeted keywords within primary service areas and nearby locations.' },
    { icon: '🔧', title: 'In Progress', body: "Some keywords not yet on Google's 1st page — actively optimizing content, metadata, and internal links." },
    { icon: '🎯', title: 'Local Strategy', body: 'Geo-targeted content performing well across primary markets and surrounding areas.' },
    { icon: '📈', title: 'Visibility Growth', body: 'Impressions demonstrate extensive reach; position improvements signal growing authority.' },
  ],
};

export const DEFAULT_KEYWORD_SCREENSHOT = {
  sheetUrl: '',
  imageUrl: '',
  caption: 'Paste keyword ranking table screenshot here (or add sheet URL on slide 22).',
  subtitle: 'SEO Rankings',
};

export const DEFAULT_BLOG_UPDATES = [
  {
    title: 'Blog Post Title — Topic Headline',
    overview: 'This article explains the topic, audience, and primary SEO focus for this content piece.',
    keyThemes: [
      'Key theme or section 1',
      'Key theme or section 2',
      'Key theme or section 3',
      'Key theme or section 4',
    ],
    goal: 'Educate the target audience, build topical authority, and position the provider as a trusted resource.',
  },
  {
    title: 'Blog Post Title — Second Topic',
    overview: 'This article explains the second blog topic, audience, and primary SEO focus.',
    keyThemes: [
      'Key theme or section 1',
      'Key theme or section 2',
      'Key theme or section 3',
      'Key theme or section 4',
    ],
    goal: 'Educate readers, build confidence in recovery strategies, and support long-term organic growth.',
  },
];

/** @deprecated use DEFAULT_BLOG_UPDATES */
export const DEFAULT_BLOG_CONTENT_SLIDES = DEFAULT_BLOG_UPDATES;

export const DEFAULT_SEO_NEXT_STEPS = [
  { icon: '🔍', title: 'Ongoing SEO', body: 'Continue optimizing for targeted keywords and expanding local SEO efforts for greater visibility.' },
  { icon: '📝', title: 'Content Strategy', body: 'Focus on content creation covering key service topics to build organic authority.' },
  { icon: '🔗', title: 'Backlink Strategy', body: 'Build domain authority through targeted link acquisition, directory listings, and strategic outreach.' },
  { icon: '🤖', title: 'AI Optimization', body: 'Leverage AI-driven SEO techniques to maintain competitive advantage and respond to algorithm changes quickly.' },
  { icon: '📊', title: 'Tracking & Reporting', body: 'Monthly monitoring with timely strategy adjustments to address issues and capture new growth opportunities.' },
  { icon: '🤝', title: 'Our Commitment', body: 'We value your trust and are dedicated to long-term digital growth. Looking forward to our continued partnership.' },
];

export const KEYWORD_RANKING_COLUMNS = [
  'keyword',
  'googleRank',
  'googleChange',
  'localRank',
  'localChange',
  'bingRank',
];

export const KEYWORD_RANKING_CSV_HEADERS = [
  'Keyword',
  'Google',
  'G. Change',
  'Google Local',
  'L. Change',
  'Bing',
];

export const BACKLINKS_CSV_HEADERS = [
  'Metric',
  'Count',
];

export const BACKLINKS_ANCHOR_CSV_HEADERS = [
  'Anchor Text',
  'Domains',
];

export const DEFAULT_BACKLINKS_SUMMARY = {
  totalBacklinks: '',
  referringDomains: '',
  trustFlow: '',
  citationFlow: '',
  linkStats: [
    { metric: 'New Links (Last 30 Days)', count: '' },
    { metric: 'Lost Links (Last 30 Days)', count: '' },
    { metric: 'Follow Links', count: '' },
    { metric: 'No-Follow Links', count: '' },
  ],
  topAnchors: [{ anchor: '', domains: '' }],
  insight: '',
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

export function csvToKeywordRankingRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const keyMap = {
    Keyword: 'keyword',
    keyword: 'keyword',
    Google: 'googleRank',
    googleRank: 'googleRank',
    'G. Change': 'googleChange',
    googleChange: 'googleChange',
    'Google Local': 'localRank',
    localRank: 'localRank',
    'L. Change': 'localChange',
    localChange: 'localChange',
    Bing: 'bingRank',
    bingRank: 'bingRank',
  };
  return rows.map((row) => {
    const out = {};
    KEYWORD_RANKING_COLUMNS.forEach((col) => { out[col] = ''; });
    Object.entries(row).forEach(([k, v]) => {
      const mapped = keyMap[k] || keyMap[k.trim()];
      if (mapped) out[mapped] = String(v ?? '');
    });
    return out;
  });
}

export function csvToBacklinkStats(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  return rows.map((row) => ({
    metric: String(row.Metric ?? row.metric ?? ''),
    count: String(row.Count ?? row.count ?? ''),
  })).filter((r) => r.metric);
}

export function csvToBacklinkAnchors(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  return rows.map((row) => ({
    anchor: String(row['Anchor Text'] ?? row.anchor ?? ''),
    domains: String(row.Domains ?? row.domains ?? ''),
  })).filter((r) => r.anchor || r.domains);
}
