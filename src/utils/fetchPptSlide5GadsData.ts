import { supabase } from '../lib/supabaseClient';
import { buildQuery, sbFetchAllParallel } from '../lib/supabaseRest';
import type { ReportData } from '../data/reportData';
import {
  buildPaidAdsComparisonSubtitle,
  getPreviousMonthLabel,
  reportData,
} from '../data/reportData';

type CampaignTotals = {
  cost: number;
  clicks: number;
  conversions: number;
};

export type PaidAdsOverallData = ReportData['paidAdsOverall'];

function num(v: unknown): number {
  return Number(v) || 0;
}

/** Local calendar date YYYY-MM-DD (avoids UTC shift from toISOString()). */
function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Real-world current calendar month (for top KPI cards — not tied to dropdown). */
export function getCalendarCurrentMonthRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: formatLocalDate(first), to: formatLocalDate(last) };
}

/** Calendar month bounds from dropdown value `YYYY-MM-01`. */
export function getMonthDateRange(monthValue: string) {
  const match = monthValue.match(/^(\d{4})-(\d{2})/);
  if (!match) {
    return { currentFrom: '', currentTo: '', prevFrom: '', prevTo: '' };
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);
  const prevFirst = new Date(year, monthIndex - 1, 1);
  const prevLast = new Date(year, monthIndex, 0);
  return {
    currentFrom: formatLocalDate(first),
    currentTo: formatLocalDate(last),
    prevFrom: formatLocalDate(prevFirst),
    prevTo: formatLocalDate(prevLast),
  };
}

const GOOGLE_ADS_PLATFORM = 'google_ads';

function normalizeCustomerId(id: unknown): string {
  return String(id ?? '').replace(/-/g, '');
}

type GadsCampaignRow = {
  customer_id?: unknown;
  campaign_id?: unknown;
  date?: unknown;
  cost?: unknown;
  clicks?: unknown;
  conversions?: unknown;
};

/**
 * One row per (normalized customer, date, campaign) — matches SQL aggregation when
 * the same campaign was synced under dashed and undashed customer_id values.
 */
function dedupeCampaignRows(rows: GadsCampaignRow[], allowedNormalized: Set<string>): GadsCampaignRow[] {
  const byKey = new Map<string, GadsCampaignRow>();
  for (const row of rows) {
    const norm = normalizeCustomerId(row.customer_id);
    if (!allowedNormalized.has(norm)) continue;
    const key = `${norm}|${row.date}|${row.campaign_id}`;
    if (!byKey.has(key)) byKey.set(key, row);
  }
  return [...byKey.values()];
}

/**
 * clients.id → client_platform_accounts.client_id (platform = google_ads)
 * → platform_customer_id used as gads_campaign_daily.customer_id
 */
async function resolveGoogleAdsCustomerIdsForClient(
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
    .eq('platform', GOOGLE_ADS_PLATFORM);

  if (client.agency_id) {
    cpaQuery = cpaQuery.eq('agency_id', client.agency_id);
  }

  const { data: accounts, error: cpaError } = await cpaQuery;

  if (cpaError) {
    throw new Error(cpaError.message || 'Failed to load Google Ads accounts for client');
  }

  const platformCustomerIds = [
    ...new Set(
      (accounts || [])
        .map((a) => String(a.platform_customer_id ?? '').trim())
        .filter(Boolean),
    ),
  ];

  if (!platformCustomerIds.length) {
    throw new Error(
      'No Google Ads account linked to this client. Link a client_platform_accounts row with client_id and platform=google_ads.',
    );
  }

  return platformCustomerIds;
}

async function fetchGadsCampaignTotals(
  platformCustomerIds: string[],
  from: string,
  to: string,
): Promise<CampaignTotals> {
  const allowedNormalized = new Set(
    platformCustomerIds.map(normalizeCustomerId).filter(Boolean),
  );

  const endpoint = buildQuery('gads_campaign_daily', {
    customerIds: platformCustomerIds,
    dateFrom: from,
    dateTo: to,
  });

  const rows = (await sbFetchAllParallel(endpoint)) as GadsCampaignRow[];
  const deduped = dedupeCampaignRows(rows, allowedNormalized);
  return sumCampaignRows(deduped);
}

function sumCampaignRows(rows: { cost?: unknown; clicks?: unknown; conversions?: unknown }[]): CampaignTotals {
  return rows.reduce(
    (acc, r) => ({
      cost: acc.cost + num(r.cost),
      clicks: acc.clicks + num(r.clicks),
      conversions: acc.conversions + num(r.conversions),
    }),
    { cost: 0, clicks: 0, conversions: 0 },
  );
}

function formatMoney(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMoneyRounded(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function formatCount(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function formatPercentChange(
  metric: string,
  current: number,
  previous: number,
): { text: string; positive: boolean } {
  if (previous === 0) {
    if (current === 0) return { text: '0.00%', positive: true };
    const sign = current > 0 ? '+' : '';
    const positive = metric === 'Clicks' || metric === 'Conversions';
    return { text: `${sign}100.00%`, positive };
  }
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? '+' : '−';
  const lowerIsBetter = metric === 'Avg. CPC' || metric === 'Cost/Lead';
  const positive = lowerIsBetter ? pct <= 0 : pct >= 0;
  return { text: `${sign}${Math.abs(pct).toFixed(2)}%`, positive };
}

function buildPaidAdsOverallFromTotals(
  topStatsTotals: CampaignTotals,
  tableCurrent: CampaignTotals,
  tablePrevious: CampaignTotals,
  monthLabel: string,
  monthValue: string,
): PaidAdsOverallData {
  const previousMonthLabel = getPreviousMonthLabel(monthValue);
  const topCpl = topStatsTotals.conversions ? topStatsTotals.cost / topStatsTotals.conversions : 0;

  const tableCpc = tableCurrent.clicks ? tableCurrent.cost / tableCurrent.clicks : 0;
  const prevCpc = tablePrevious.clicks ? tablePrevious.cost / tablePrevious.clicks : 0;
  const tableCpl = tableCurrent.conversions ? tableCurrent.cost / tableCurrent.conversions : 0;
  const prevCpl = tablePrevious.conversions ? tablePrevious.cost / tablePrevious.conversions : 0;

  const clicksCh = formatPercentChange('Clicks', tableCurrent.clicks, tablePrevious.clicks);
  const convCh = formatPercentChange('Conversions', tableCurrent.conversions, tablePrevious.conversions);
  const cpcCh = formatPercentChange('Avg. CPC', tableCpc, prevCpc);
  const cplCh = formatPercentChange('Cost/Lead', tableCpl, prevCpl);

  return {
    comparisonSubtitle: previousMonthLabel
      ? buildPaidAdsComparisonSubtitle(monthLabel, previousMonthLabel)
      : reportData.paidAdsOverall.comparisonSubtitle,
    currentMonthLabel: monthLabel,
    previousMonthLabel: previousMonthLabel || reportData.paidAdsOverall.previousMonthLabel,
    topStats: [
      { label: 'Total Cost', value: formatMoney(topStatsTotals.cost) },
      { label: 'Total Clicks', value: formatCount(topStatsTotals.clicks) },
      { label: 'Conversions', value: formatCount(topStatsTotals.conversions) },
      { label: 'Cost/Lead', value: formatMoneyRounded(topCpl) },
    ],
    table: [
      {
        metric: 'Clicks',
        current: formatCount(tableCurrent.clicks),
        previous: formatCount(tablePrevious.clicks),
        change: clicksCh.text,
        positive: clicksCh.positive,
      },
      {
        metric: 'Conversions',
        current: formatCount(tableCurrent.conversions),
        previous: formatCount(tablePrevious.conversions),
        change: convCh.text,
        positive: convCh.positive,
      },
      {
        metric: 'Avg. CPC',
        current: formatMoney(tableCpc),
        previous: formatMoney(prevCpc),
        change: cpcCh.text,
        positive: cpcCh.positive,
      },
      {
        metric: 'Cost/Lead',
        current: formatMoneyRounded(tableCpl),
        previous: formatMoneyRounded(prevCpl),
        change: cplCh.text,
        positive: cplCh.positive,
      },
    ],
  };
}

/**
 * clients.id → client_platform_accounts.client_id (platform = google_ads)
 * → gads_campaign_daily.customer_id (= platform_customer_id)
 */
export async function fetchPaidAdsOverallFromGads(
  clientId: string,
  monthValue: string,
  monthLabel: string,
  agencyId?: string | null,
): Promise<PaidAdsOverallData> {
  const platformCustomerIds = await resolveGoogleAdsCustomerIdsForClient(clientId, agencyId);

  const calendarRange = getCalendarCurrentMonthRange();
  const { currentFrom, currentTo, prevFrom, prevTo } = getMonthDateRange(monthValue);
  if (!currentFrom || !currentTo) {
    throw new Error('Invalid month selection');
  }

  const [topStatsTotals, tableCurrent, tablePrevious] = await Promise.all([
    fetchGadsCampaignTotals(platformCustomerIds, calendarRange.from, calendarRange.to),
    fetchGadsCampaignTotals(platformCustomerIds, currentFrom, currentTo),
    fetchGadsCampaignTotals(platformCustomerIds, prevFrom, prevTo),
  ]);

  return buildPaidAdsOverallFromTotals(
    topStatsTotals,
    tableCurrent,
    tablePrevious,
    monthLabel,
    monthValue,
  );
}

/** Empty slide 5 metrics when fetch fails or no data. */
export function emptyPaidAdsOverall(monthLabel: string, monthValue: string): PaidAdsOverallData {
  const zero = { cost: 0, clicks: 0, conversions: 0 };
  return buildPaidAdsOverallFromTotals(zero, zero, zero, monthLabel, monthValue);
}
