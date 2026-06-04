import { supabase } from '../lib/supabaseClient';
import { resolveClientMarketingSeoConfig } from './monthlyClientSeoConfig';
import { sanitizeApiErrorMessage } from './apiErrorMessage';

async function invokeErrorMessage(error, data) {
  if (error?.context && typeof error.context.json === 'function') {
    try {
      const body = await error.context.json();
      if (body?.error) return sanitizeApiErrorMessage(body.error);
    } catch {
      /* ignore */
    }
  }
  if (error?.message) return sanitizeApiErrorMessage(error.message);
  if (data?.success === false && data?.error) return sanitizeApiErrorMessage(data.error);
  if (data?.error && !data?.ga4 && !data?.gsc && !data?.gbp) return sanitizeApiErrorMessage(data.error);
  return null;
}

function num(v) {
  return Number(v) || 0;
}

function hasV2Payload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const ga4 = payload.ga4;
  if (ga4 && !ga4.error && (
    ga4.all_channels?.current?.length
    || ga4.organic_summary?.current
    || ga4.channel?.current?.length
  )) return true;
  const gsc = payload.gsc;
  if (gsc && !gsc.error && payload.gsc?.summary?.current?.length) return true;
  const gbp = payload.gbp;
  if (gbp && !gbp.error && gbp.summary && (
    num(gbp.summary.calls ?? gbp.summary.call_clicks)
    || num(gbp.summary.directions ?? gbp.summary.direction_requests)
    || num(gbp.summary.website_clicks)
    || num(gbp.summary.total_impressions)
  )) return true;
  return false;
}

/** Unwrap edge response — V2 returns flat { success, ga4, gsc, gbp }. */
export function unwrapMarketingReportPayload(raw) {
  if (!raw) return null;
  let payload = raw;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (payload?.data && (payload.data.ga4 || payload.data.gsc || payload.data.gbp)) {
    return payload.data;
  }
  if (payload.ga4 || payload.gsc || payload.gbp || payload.success) return payload;
  return payload;
}

function mapGa4ChannelRow(row) {
  if (!row) return {};
  return {
    channel_group: row.channel_group || row.channelGroup || '(not set)',
    total_users: row.total_users ?? row.totalUsers,
    new_users: row.new_users ?? row.newUsers,
    sessions: row.sessions,
    engaged_sessions: row.engaged_sessions ?? row.engagedSessions,
    screen_page_views: row.screen_page_views ?? row.screenPageViews,
    bounce_rate: row.bounce_rate ?? row.bounceRate,
    user_engagement_duration: row.user_engagement_duration ?? row.userEngagementDuration,
  };
}

function isNotSetLandingPage(row) {
  const page = String(row?.landing_page || row?.page_path || row?.pagePath || row?.page || '').trim().toLowerCase();
  return !page || page === '(not set)' || page === 'not set' || page === '(none)';
}

function mapGa4LandingRow(row) {
  if (!row) return {};
  return {
    landing_page: row.landing_page || row.page_path || row.pagePath || '/',
    sessions: row.sessions,
    active_users: row.active_users ?? row.activeUsers,
    new_users: row.new_users ?? row.newUsers,
    avg_session_duration: row.avg_session_duration ?? row.averageSessionDuration,
  };
}

function mapGa4CityRow(row) {
  if (!row) return {};
  return {
    city: row.city,
    region: row.region,
    screen_page_views: row.screen_page_views ?? row.screenPageViews,
    sessions: row.sessions,
    engaged_sessions: row.engaged_sessions ?? row.engagedSessions,
    total_users: row.total_users ?? row.totalUsers,
    user_engagement_duration: row.user_engagement_duration ?? row.userEngagementDuration,
    bounce_rate: row.bounce_rate ?? row.bounceRate,
  };
}

/** V2 GBP summary uses calls/directions; slides use call_clicks/direction_requests. */
export function normalizeGbpSummary(summary) {
  if (!summary || typeof summary !== 'object') {
    return {
      call_clicks: 0,
      direction_requests: 0,
      website_clicks: 0,
      total_impressions: 0,
      location_count: 0,
    };
  }
  return {
    call_clicks: num(summary.calls ?? summary.call_clicks),
    direction_requests: num(summary.directions ?? summary.direction_requests),
    website_clicks: num(summary.website_clicks),
    total_impressions: num(summary.total_impressions),
    location_count: num(summary.location_count),
  };
}

/**
 * Map marketing-report-realtime V2 response → monthly SEO slide builder shape.
 */
export function normalizeMarketingReportV2(data) {
  if (!data || typeof data !== 'object') {
    return { ga4: {}, gsc: {}, gbp: {} };
  }

  const ga4raw = data.ga4 || {};
  let ga4 = ga4raw;

  if (ga4raw.all_channels || ga4raw.organic_summary || ga4raw.landing_pages || ga4raw.cities) {
    ga4 = {
      ...ga4raw,
      channel: {
        current: (ga4raw.all_channels?.current || ga4raw.channel?.current || []).map(mapGa4ChannelRow),
        previous: (ga4raw.all_channels?.previous || ga4raw.channel?.previous || []).map(mapGa4ChannelRow),
      },
      landing_page: {
        current: (ga4raw.landing_pages?.current || ga4raw.landing_page?.current || [])
          .filter((row) => !isNotSetLandingPage(row))
          .map(mapGa4LandingRow),
        previous: (ga4raw.landing_pages?.previous || ga4raw.landing_page?.previous || [])
          .filter((row) => !isNotSetLandingPage(row))
          .map(mapGa4LandingRow),
      },
      geo: {
        current: (ga4raw.cities?.current || ga4raw.geo?.current || []).map(mapGa4CityRow),
        previous: (ga4raw.cities?.previous || ga4raw.geo?.previous || []).map(mapGa4CityRow),
      },
      organic_summary: ga4raw.organic_summary,
    };
  } else if (ga4raw.channel?.current) {
    ga4 = {
      ...ga4raw,
      channel: {
        current: (ga4raw.channel.current || []).map(mapGa4ChannelRow),
        previous: (ga4raw.channel.previous || []).map(mapGa4ChannelRow),
      },
      landing_page: ga4raw.landing_page
        ? {
          current: (ga4raw.landing_page.current || []).map(mapGa4LandingRow),
          previous: (ga4raw.landing_page.previous || []).map(mapGa4LandingRow),
        }
        : ga4raw.landing_page,
      geo: ga4raw.geo
        ? {
          current: (ga4raw.geo.current || []).map(mapGa4CityRow),
          previous: (ga4raw.geo.previous || []).map(mapGa4CityRow),
        }
        : ga4raw.geo,
    };
  }

  const gsc = data.gsc || {};
  const gbpRaw = data.gbp || {};
  const gbp = {
    ...gbpRaw,
    summary: normalizeGbpSummary(gbpRaw.summary),
    previous_summary: gbpRaw.previous_summary
      ? normalizeGbpSummary(gbpRaw.previous_summary)
      : null,
    locations: gbpRaw.locations || [],
    previous_locations: gbpRaw.previous_locations || [],
  };

  return { ga4, gsc, gbp };
}

/**
 * marketing-report-realtime V2 — client_id + dates; edge resolves GA4/GSC/GBP.
 */
export async function invokeMarketingReportRealtime({
  clientId,
  agencyId = null,
  dateFrom,
  dateTo,
  compareDateFrom,
  compareDateTo,
  compareOn = true,
  services = ['ga4', 'gsc', 'gbp'],
}) {
  if (!clientId) {
    return { success: false, error: 'client_id required', data: null, normalized: null };
  }

  let resolvedAgencyId = agencyId;
  if (!resolvedAgencyId) {
    const { data: clientRow } = await supabase
      .from('clients')
      .select('agency_id')
      .eq('id', clientId)
      .maybeSingle();
    resolvedAgencyId = clientRow?.agency_id || null;
  }

  const cfg = await resolveClientMarketingSeoConfig(clientId, resolvedAgencyId);

  const body = {
    client_id: clientId,
    date_from: dateFrom,
    date_to: dateTo,
    services,
  };

  if (cfg.ga4PropertyId) body.customer_id = cfg.ga4PropertyId;
  if (cfg.gscSiteUrl) body.gsc_site_url = cfg.gscSiteUrl;

  if (compareOn && compareDateFrom && compareDateTo) {
    body.compare_date_from = compareDateFrom;
    body.compare_date_to = compareDateTo;
  }

  const { data: { session } } = await supabase.auth.getSession();
  const headers = session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : undefined;

  const { data: raw, error } = await supabase.functions.invoke('marketing-report-realtime', {
    body,
    headers,
  });

  const payload = unwrapMarketingReportPayload(raw);
  const apiError = await invokeErrorMessage(error, payload || raw);

  if (!hasV2Payload(payload) && apiError) {
    console.warn('[SEO] marketing-report-realtime failed:', apiError, { body, raw, payload });
    return {
      success: false,
      error: apiError,
      data: payload || raw || null,
      normalized: null,
      seoConfig: cfg,
      agencyId: resolvedAgencyId,
    };
  }

  const normalized = normalizeMarketingReportV2(payload || {});

  const partialErrors = [
    payload?.ga4?.error && `GA4: ${sanitizeApiErrorMessage(payload.ga4.error)}`,
    payload?.gsc?.error && `GSC: ${sanitizeApiErrorMessage(payload.gsc.error)}`,
    payload?.gbp?.error && `GBP: ${sanitizeApiErrorMessage(payload.gbp.error)}`,
  ].filter(Boolean).join('; ') || apiError;

  if (import.meta.env.DEV) {
    console.log('[SEO] marketing-report-realtime V2', {
      client_id: clientId,
      gsc: normalized.gsc?.summary?.current?.[0] || normalized.gsc?.error || 'MISSING',
      gbp: normalized.gbp?.summary || normalized.gbp?.error || 'MISSING',
      ga4Organic: normalized.ga4?.organic_summary?.current || 'MISSING',
      channels: normalized.ga4?.channel?.current?.length ?? 0,
      warn: partialErrors || null,
    });
  }

  return {
    success: true,
    error: partialErrors || null,
    data: payload,
    normalized,
    seoConfig: cfg,
    agencyId: resolvedAgencyId,
  };
}

export const invokeSeoReportGenerate = invokeMarketingReportRealtime;
