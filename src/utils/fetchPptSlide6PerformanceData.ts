import { supabase } from '../lib/supabaseClient';
import { buildGa4SummaryQuery, sbFetchAllParallel } from '../lib/supabaseRest';
import type { ReportData } from '../data/reportData';
import { getPreviousMonthLabel, reportData } from '../data/reportData';
import {
  fetchGadsCampaignTotals,
  getMonthDateRange,
  resolveGoogleAdsCustomerIdsForClient,
} from './fetchPptSlide5GadsData';

export type PaidAdsFloridaData = ReportData['paidAdsFlorida'];

type Ga4Totals = {
  total_users: number;
  sessions: number;
  screen_page_views: number;
};

type GadsTotals = {
  cost: number;
  conversions: number;
};

const GA4_PLATFORM = 'ga4';

function num(v: unknown): number {
  return Number(v) || 0;
}

function normalizeGa4CustomerId(id: unknown): string {
  let s = String(id ?? '').trim();
  if (s.toLowerCase().startsWith('properties/')) {
    s = s.slice(11);
  }
  return s.trim();
}

function expandGa4CustomerIdVariants(id: string): string[] {
  const s = String(id).trim();
  if (!s) return [];
  const norm = normalizeGa4CustomerId(s);
  const variants = new Set<string>([s, norm]);
  if (norm && norm !== s) {
    variants.add(`properties/${norm}`);
  }
  return [...variants].filter(Boolean);
}

function formatCount(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function formatMoney(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMoneyRounded(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function formatMetricChange(
  current: number,
  previous: number,
): { text: string; positive: boolean; status: string } {
  if (previous === 0) {
    if (current === 0) {
      return { text: '0.00%', positive: true, status: 'No change' };
    }
    return { text: '+100.00%', positive: true, status: 'Increase' };
  }
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? '+' : '−';
  const positive = pct >= 0;
  return {
    text: `${sign}${Math.abs(pct).toFixed(2)}%`,
    positive,
    status: positive ? 'Increase' : 'Decrease',
  };
}

function sumGa4SummaryRows(
  rows: {
    customer_id?: unknown;
    total_users?: unknown;
    sessions?: unknown;
    screen_page_views?: unknown;
  }[],
  allowedNormalized: Set<string>,
): Ga4Totals {
  return rows.reduce(
    (acc, row) => {
      const norm = normalizeGa4CustomerId(row.customer_id);
      if (!allowedNormalized.has(norm)) return acc;
      return {
        total_users: acc.total_users + num(row.total_users),
        sessions: acc.sessions + num(row.sessions),
        screen_page_views: acc.screen_page_views + num(row.screen_page_views),
      };
    },
    { total_users: 0, sessions: 0, screen_page_views: 0 },
  );
}

/**
 * clients.id → client_platform_accounts.client_id (platform = ga4)
 * → platform_customer_id used as ga4_daily_summary.customer_id
 */
async function resolveGa4CustomerIdsForClient(
  clientId: string,
  agencyId?: string | null,
): Promise<string[]> {
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, agency_id')
    .eq('id', clientId)
    .maybeSingle();

  if (clientError) {
    throw new Error(clientError.message || 'Failed to load client');
  }
  if (!client) {
    throw new Error('Client not found');
  }
  if (agencyId && client.agency_id !== agencyId) {
    throw new Error('Client does not belong to the selected agency');
  }

  let cpaQuery = supabase
    .from('client_platform_accounts')
    .select('platform_customer_id')
    .eq('client_id', client.id)
    .eq('platform', GA4_PLATFORM);

  if (client.agency_id) {
    cpaQuery = cpaQuery.eq('agency_id', client.agency_id);
  }

  const { data: accounts, error: cpaError } = await cpaQuery;

  if (cpaError) {
    throw new Error(cpaError.message || 'Failed to load GA4 accounts for client');
  }

  const customerIds = [
    ...new Set(
      (accounts || []).flatMap((a) =>
        expandGa4CustomerIdVariants(String(a.platform_customer_id ?? '')),
      ),
    ),
  ].filter(Boolean);

  if (!customerIds.length) {
    throw new Error(
      'No GA4 account linked to this client. Link client_platform_accounts with client_id and platform=ga4.',
    );
  }

  return customerIds;
}

async function fetchGa4SummaryTotals(
  customerIds: string[],
  agencyId: string | null | undefined,
  from: string,
  to: string,
): Promise<Ga4Totals> {
  if (!customerIds.length) {
    return { total_users: 0, sessions: 0, screen_page_views: 0 };
  }

  const queryIds = [
    ...new Set(customerIds.flatMap((id) => expandGa4CustomerIdVariants(id))),
  ];
  const allowedNormalized = new Set(
    queryIds.map(normalizeGa4CustomerId).filter(Boolean),
  );

  let endpoint = buildGa4SummaryQuery({
    agencyId: agencyId || undefined,
    customerIds: queryIds,
    dateFrom: from,
    dateTo: to,
  });

  let rows = await sbFetchAllParallel(endpoint);

  if (!rows.length && agencyId) {
    endpoint = buildGa4SummaryQuery({
      customerIds: queryIds,
      dateFrom: from,
      dateTo: to,
    });
    rows = await sbFetchAllParallel(endpoint);
  }

  return sumGa4SummaryRows(rows, allowedNormalized);
}

function buildMetricPanel(
  ga4: Ga4Totals,
  gads: GadsTotals,
  label: string,
  tag: string,
): PaidAdsFloridaData['current'] {
  const costLead = gads.conversions ? gads.cost / gads.conversions : 0;
  return {
    label,
    tag,
    users: formatCount(ga4.total_users),
    sessions: formatCount(ga4.sessions),
    views: formatCount(ga4.screen_page_views),
    cost: formatMoney(gads.cost),
    conversions: formatCount(gads.conversions),
    costLead: formatMoneyRounded(costLead),
  };
}

function buildPaidAdsFloridaFromTotals(
  ga4Current: Ga4Totals,
  ga4Previous: Ga4Totals,
  gadsCurrent: GadsTotals,
  gadsPrevious: GadsTotals,
  monthLabel: string,
  monthValue: string,
): PaidAdsFloridaData {
  const previousMonthLabel =
    getPreviousMonthLabel(monthValue) || reportData.paidAdsFlorida.previousMonthLabel;

  const usersCh = formatMetricChange(ga4Current.total_users, ga4Previous.total_users);
  const sessionsCh = formatMetricChange(ga4Current.sessions, ga4Previous.sessions);
  const viewsCh = formatMetricChange(
    ga4Current.screen_page_views,
    ga4Previous.screen_page_views,
  );

  return {
    currentMonthLabel: monthLabel,
    previousMonthLabel,
    current: buildMetricPanel(ga4Current, gadsCurrent, monthLabel, 'Current Month'),
    previous: buildMetricPanel(
      ga4Previous,
      gadsPrevious,
      previousMonthLabel,
      'Previous Month',
    ),
    table: [
      {
        metric: 'Total Users',
        current: formatCount(ga4Current.total_users),
        previous: formatCount(ga4Previous.total_users),
        change: usersCh.text,
        status: usersCh.status,
        positive: usersCh.positive,
      },
      {
        metric: 'Sessions',
        current: formatCount(ga4Current.sessions),
        previous: formatCount(ga4Previous.sessions),
        change: sessionsCh.text,
        status: sessionsCh.status,
        positive: sessionsCh.positive,
      },
      {
        metric: 'Page Views',
        current: formatCount(ga4Current.screen_page_views),
        previous: formatCount(ga4Previous.screen_page_views),
        change: viewsCh.text,
        status: viewsCh.status,
        positive: viewsCh.positive,
      },
    ],
  };
}

const ZERO_GADS: GadsTotals = { cost: 0, conversions: 0 };

/**
 * Slide 6 — GA4 row 1 (ga4_daily_summary) + GAds row 2 (gads_campaign_daily).
 * Selected month vs previous month from dropdown.
 */
export async function fetchPaidAdsFloridaPerformanceData(
  clientId: string,
  monthValue: string,
  monthLabel: string,
  agencyId?: string | null,
): Promise<PaidAdsFloridaData> {
  const { currentFrom, currentTo, prevFrom, prevTo } = getMonthDateRange(monthValue);
  if (!currentFrom || !currentTo) {
    throw new Error('Invalid month selection');
  }

  const [ga4Ids, gadsIds] = await Promise.all([
    resolveGa4CustomerIdsForClient(clientId, agencyId).catch(() => [] as string[]),
    resolveGoogleAdsCustomerIdsForClient(clientId, agencyId).catch(() => [] as string[]),
  ]);

  if (!ga4Ids.length && !gadsIds.length) {
    throw new Error(
      'No GA4 or Google Ads accounts linked to this client (client_platform_accounts with client_id).',
    );
  }

  const [ga4Current, ga4Previous, gadsCurrentRaw, gadsPreviousRaw] = await Promise.all([
    fetchGa4SummaryTotals(ga4Ids, agencyId, currentFrom, currentTo),
    fetchGa4SummaryTotals(ga4Ids, agencyId, prevFrom, prevTo),
    gadsIds.length
      ? fetchGadsCampaignTotals(gadsIds, currentFrom, currentTo)
      : Promise.resolve(ZERO_GADS),
    gadsIds.length
      ? fetchGadsCampaignTotals(gadsIds, prevFrom, prevTo)
      : Promise.resolve(ZERO_GADS),
  ]);

  const gadsCurrent: GadsTotals = {
    cost: gadsCurrentRaw.cost,
    conversions: gadsCurrentRaw.conversions,
  };
  const gadsPrevious: GadsTotals = {
    cost: gadsPreviousRaw.cost,
    conversions: gadsPreviousRaw.conversions,
  };

  return buildPaidAdsFloridaFromTotals(
    ga4Current,
    ga4Previous,
    gadsCurrent,
    gadsPrevious,
    monthLabel,
    monthValue,
  );
}

/** Empty slide 6 when fetch fails or no linked accounts. */
export function emptyPaidAdsFlorida(monthLabel: string, monthValue: string): PaidAdsFloridaData {
  const zeroGa4: Ga4Totals = { total_users: 0, sessions: 0, screen_page_views: 0 };
  return buildPaidAdsFloridaFromTotals(
    zeroGa4,
    zeroGa4,
    ZERO_GADS,
    ZERO_GADS,
    monthLabel,
    monthValue,
  );
}
