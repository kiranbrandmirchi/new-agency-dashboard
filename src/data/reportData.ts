/**
 * Hardcoded report payload (Neulife Florida, April 2026, slides 1–10).
 * Replace this object with Supabase-fetched data when going dynamic.
 */
export const reportData = {
  client: 'Neulife Rehabilitation',
  location: 'Florida',
  month: 'April 2026',
  preparedBy: 'Red Castle Services',
  website: 'redcastleservices.com',
  /** Cover slide logo (public/) — used in preview, PDF, and PPTX */
  coverLogoUrl: '/rc-logo.png',

  services: [
    {
      icon: '💰',
      title: 'Pay-Per-Click Advertising',
      body: 'Driving targeted traffic and qualified leads through paid advertising campaigns across all four locations.',
    },
    {
      icon: '📍',
      title: 'Geo AI',
      body: 'Leveraging location-based targeting to reach the right audience in each market — Florida, Michigan, Kentucky, and Louisiana.',
    },
    {
      icon: '🔍',
      title: 'SEO',
      body: 'Improving search visibility and organic rankings across all Neulife Rehabilitation locations through content, technical SEO, and link building.',
    },
  ],

  leadSummary: {
    tableRow: {
      location: 'Florida',
      callApril: 715,
      formsApril: 24,
      chatApril: 73,
      callMar: 720,
      formsMar: 15,
      chatMar: 91,
    },
    statBoxes: [
      { value: '715', label: 'Total Call Leads', fill: 'C0392B' },
      { value: '97', label: 'Total Forms and Chat Widgets', fill: '333333' },
      { value: '720', label: 'Total Calls (Mar) — Previous month', fill: '666666' },
      { value: '106', label: 'Total Forms and Chat Widgets (Mar)', fill: '666666' },
    ],
  },

  sectionDivider: {
    title: 'Digital Update',
    subtitle: 'Paid Ads Performance — April 2026',
  },

  paidAdsOverall: {
    topStats: [
      { label: 'Total Cost', value: '$7,267.13' },
      { label: 'Total Clicks', value: '2,558' },
      { label: 'Conversions', value: '299' },
      { label: 'Cost/Lead', value: '$25' },
    ],
    table: [
      { metric: 'Clicks', current: '2,558', previous: '2,477', change: '+3.27%', positive: true },
      { metric: 'Conversions', current: '299', previous: '350', change: '−14.57%', positive: false },
      { metric: 'Avg. CPC', current: '$2.84', previous: '$2.95', change: '−3.73%', positive: true },
      { metric: 'Cost/Lead', current: '$25', previous: '$20.86', change: '+19.85%', positive: false },
    ],
  },

  paidAdsFlorida: {
    current: {
      label: 'April 2026',
      tag: 'Current Month',
      users: '1,754',
      sessions: '1,941',
      views: '5,159',
      cost: '$7,267.13',
      conversions: '299',
      costLead: '$24.30',
    },
    previous: {
      label: 'March 2026',
      tag: 'Previous Month',
      users: '1,547',
      sessions: '1,755',
      views: '4,629',
      cost: '$7,303.76',
      conversions: '350',
      costLead: '$20.86',
    },
    table: [
      { metric: 'Total Users', current: '1,754', previous: '1,547', change: '+13.38%', status: 'Increase', positive: true },
      { metric: 'Sessions', current: '1,941', previous: '1,755', change: '+10.60%', status: 'Increase', positive: true },
      { metric: 'Page Views', current: '5,159', previous: '4,629', change: '+11.45%', status: 'Increase', positive: true },
    ],
  },

  searchOverview: {
    table: [
      { metric: 'Total Users', overall: '9,763', paid: '1,754', organic: '5,844', paidPct: '15.17%', organicPct: '60.85%' },
      { metric: 'Sessions', overall: '11,264', paid: '1,941', organic: '6,950', paidPct: '14.88%', organicPct: '63.31%' },
      { metric: 'Views', overall: '25,710', paid: '5,159', organic: '15,155', paidPct: '16.99%', organicPct: '60.24%' },
      { metric: 'Pages/Session', overall: '2.68', paid: '2.65', organic: '2.18', paidPct: '—', organicPct: '—' },
      { metric: 'Avg Time on Site', overall: '2m 05s', paid: '1m 33s', organic: '2m 26s', paidPct: '—', organicPct: '—' },
      { metric: 'Bounce Rate', overall: '8.7%', paid: '5.7%', organic: '7.9%', paidPct: '—', organicPct: '—' },
      { metric: 'Calls (Paid)', overall: '—', paid: '250', organic: '—', paidPct: '—', organicPct: '—' },
      { metric: 'Forms & Chat Widgets (Paid)', overall: '—', paid: '49', organic: '—', paidPct: '—', organicPct: '—' },
    ],
  },

  topKeywords: {
    table: [
      { keyword: 'physical therapy rehab centers', cost: '$674.74', conversions: '36' },
      { keyword: 'neuro rehab center Florida', cost: '$907.12', conversions: '34' },
      { keyword: 'post surgical orthopedic rehab', cost: '$810.04', conversions: '29' },
      { keyword: 'rehabilitation center near me', cost: '$670.82', conversions: '10' },
      { keyword: 'stroke rehabilitation', cost: '$180.83', conversions: '6' },
    ],
    insight:
      'While the top-performing keywords include physical therapy rehab and neuro rehab centers, we are also actively focusing on inpatient TBI facility, residential brain injury rehab, and traumatic brain injury rehab Florida, which have generated around 14 conversions so far. We are continuously optimizing and scaling efforts to drive more conversions from these high-intent service-based keywords.',
  },

  auctionInsights: {
    table: [
      { domain: 'You', impressionShare: '13.82%', overlapRate: '—', posAbove: '—', topPage: '63.68%', absTop: '20.00%', outranking: '—' },
      { domain: 'adventhealth.com', impressionShare: '< 10%', overlapRate: '9.39%', posAbove: '56.93%', topPage: '85.89%', absTop: '38.45%', outranking: '13.08%' },
      { domain: 'encompasshealth.com', impressionShare: '< 10%', overlapRate: '10.05%', posAbove: '75.73%', topPage: '87.62%', absTop: '52.84%', outranking: '12.77%' },
    ],
    insights: [
      'Top of Page Rate saw an increase of 12.39%, indicating a noticeable improvement in how often ads appeared in prominent positions on the search results page.',
      'Absolute Top of Page Rate grew by 26.18%, reflecting a strong uplift in ads securing the very topmost position, which typically drives higher visibility and engagement.',
    ],
  },

  campaignProgress: {
    overview:
      'This month, we focused on service-specific keywords such as neuro rehab and TBI rehab while reducing spend on physical therapy rehab, with key investment directed toward high-intent searches like "neuro rehab center Florida" ($907.12) and "post surgical orthopedic rehab" ($810.04) to improve lead quality and relevance.',
    performance:
      "We've seen improvement in top of page and absolute top of page rates, and are continuing to focus on increasing impression share and visibility to strengthen our position in a competitive landscape and ensure ads reach the right audience.",
    metrics:
      'Clicks increased by 3.72%, indicating improved ad visibility, while total users and views also grew by +13.38% and +11.45%, reflecting strong user interest in the services.',
    goal: 'Our focus is to drive more qualified leads, improve ad quality, and continuously monitor and optimize campaigns to enhance overall performance.',
  },
};

export type ReportData = typeof reportData;

/** Merge UI selections into the report payload (slides 1–6 client/month fields, footers, etc.) */
export function buildReportDataForSelection(
  clientName: string,
  monthLabel: string,
): ReportData {
  return {
    ...reportData,
    client: clientName,
    month: monthLabel,
    sectionDivider: {
      ...reportData.sectionDivider,
      subtitle: `Paid Ads Performance — ${monthLabel}`,
    },
  };
}

/** Deep-copy slide 2 service rows for in-session editing (not persisted). */
export function cloneReportServices(services: ReportData['services']): ReportData['services'] {
  return services.map((s) => ({ ...s }));
}

/** Slides 1–10 only */
export const SLIDE_DEFINITIONS = [
  { num: 1, title: 'Cover — SEO & Digital Marketing Updates', type: 'cover' },
  { num: 2, title: 'What We Are Managing', type: 'content' },
  { num: 3, title: 'Overall Performance Overview – Lead Summary', type: 'stats' },
  { num: 4, title: 'Digital Update (section divider)', type: 'section' },
  { num: 5, title: 'Paid Ads Performance (overall cost & conversion)', type: 'stats' },
  { num: 6, title: 'Paid Ads Performance – Florida', type: 'stats' },
  { num: 7, title: 'Search Overview – Florida (GA4)', type: 'stats' },
  { num: 8, title: 'Top Keywords – Florida', type: 'stats' },
  { num: 9, title: 'Google Ads Auction Insights', type: 'stats' },
  { num: 10, title: 'Campaign Progress & Next Steps', type: 'content' },
] as const;

export type SlideDefinition = (typeof SLIDE_DEFINITIONS)[number];
export type SlideType = SlideDefinition['type'];
