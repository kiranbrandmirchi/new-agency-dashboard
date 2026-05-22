import { supabase } from '../lib/supabaseClient';
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

/** Real-world current calendar month (for top KPI cards — not tied to dropdown). */
export function getCalendarCurrentMonthRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(first), to: fmt(last) };
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
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return {
    currentFrom: fmt(first),
    currentTo: fmt(last),
    prevFrom: fmt(prevFirst),
    prevTo: fmt(prevLast),
  };
}

/** Google Ads customer_id variants (with/without dashes) for matching gads_campaign_daily. */
function expandCustomerIdVariants(id: string): string[] {
  const s = String(id).trim();
  if (!s) return [];
  const noDash = s.replace(/-/g, '');
  const variants = new Set<string>([s, noDash]);
  if (noDash.length === 10) {
    variants.add(`${noDash.slice(0, 3)}-${noDash.slice(3, 6)}-${noDash.slice(6)}`);
  }
  return [...variants];
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
 * clients.id → client_platform_accounts (google_ads) → gads_campaign_daily
 */
export async function fetchPaidAdsOverallFromGads(
  clientId: string,
  monthValue: string,
  monthLabel: string,
): Promise<PaidAdsOverallData> {
  const { data: accounts, error: cpaError } = await supabase
    .from('client_platform_accounts')
    .select('platform_customer_id')
    .eq('client_id', clientId)
    .eq('platform', 'google_ads')
    .eq('is_active', true);

  if (cpaError) {
    throw new Error(cpaError.message || 'Failed to load Google Ads accounts for client');
  }

  const customerIds = [
    ...new Set(
      (accounts || []).flatMap((a) =>
        expandCustomerIdVariants(String(a.platform_customer_id ?? '')),
      ),
    ),
  ].filter(Boolean);

  if (!customerIds.length) {
    throw new Error('No active Google Ads account linked to this client');
  }

  const calendarRange = getCalendarCurrentMonthRange();
  const { currentFrom, currentTo, prevFrom, prevTo } = getMonthDateRange(monthValue);
  if (!currentFrom || !currentTo) {
    throw new Error('Invalid month selection');
  }

  const query = (from: string, to: string) =>
    supabase
      .from('gads_campaign_daily')
      .select('cost, clicks, conversions')
      .in('customer_id', customerIds)
      .gte('date', from)
      .lte('date', to);

  const [topStatsRes, selectedRes, previousRes] = await Promise.all([
    query(calendarRange.from, calendarRange.to),
    query(currentFrom, currentTo),
    query(prevFrom, prevTo),
  ]);

  if (topStatsRes.error) {
    throw new Error(topStatsRes.error.message || 'Failed to load Google Ads KPI data');
  }
  if (selectedRes.error) {
    throw new Error(selectedRes.error.message || 'Failed to load selected month Google Ads data');
  }
  if (previousRes.error) {
    throw new Error(previousRes.error.message || 'Failed to load previous month Google Ads data');
  }

  const topStatsTotals = sumCampaignRows(topStatsRes.data || []);
  const tableCurrent = sumCampaignRows(selectedRes.data || []);
  const tablePrevious = sumCampaignRows(previousRes.data || []);

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
  return buildPaidAdsOverallFromTotals(
    { cost: 0, clicks: 0, conversions: 0 },
    { cost: 0, clicks: 0, conversions: 0 },
    monthLabel,
    monthValue,
  );
}
