import { supabase } from '../lib/supabaseClient';
import { normalizeGa4PropertyId } from './monthlySlideData';
import {
  discoverGscCustomerIds,
  pickGscSiteUrlFromCustomerIds,
  gbpCustomerIdVariants,
} from './monthlySeoDbFallback';

function looksLikeGscSiteUrl(value) {
  const s = String(value || '').trim();
  if (!s) return false;
  return s.startsWith('sc-domain:') || s.startsWith('http://') || s.startsWith('https://');
}

function looksLikeGbpLocationId(value) {
  const s = String(value || '').trim();
  if (!s) return false;
  if (/^locations\/\d+$/.test(s)) return true;
  return /^\d{10,}$/.test(s);
}

function normalizeMatchName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function domainFromSiteUrl(url) {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function toGbpLocationPath(id) {
  const s = String(id || '').trim();
  if (!s) return '';
  if (s.startsWith('locations/')) return s;
  if (/^\d+$/.test(s)) return `locations/${s}`;
  return '';
}

function matchGbpAccountsToLocations(gbpAccounts, locations) {
  const matched = [];
  const used = new Set();
  (gbpAccounts || []).forEach((acc) => {
    const needle = normalizeMatchName(acc.account_name || acc.platform_customer_id);
    if (!needle) return;
    const hit = (locations || []).find((loc) => {
      if (used.has(loc.location_id)) return false;
      const hay = normalizeMatchName(loc.location_name);
      if (!hay) return false;
      return hay.includes(needle) || needle.includes(hay)
        || hay.split(' ').filter((w) => w.length > 3).some((w) => needle.includes(w));
    });
    if (hit?.location_id) {
      const path = toGbpLocationPath(hit.location_id);
      if (path) {
        matched.push(path);
        used.add(hit.location_id);
      }
    }
  });
  return matched;
}

/**
 * Resolve GSC site URL and GBP location from client_platform_accounts (Settings / Admin → Clients).
 * GA4 property comes from the ga4 account linked to this client.
 */
export async function resolveClientMarketingSeoConfig(clientId, agencyId) {
  const result = { gscSiteUrl: '', gbpLocationId: '', gbpLocationIds: [], ga4PropertyId: '' };
  if (!clientId) return result;

  const { data: accounts } = await supabase
    .from('client_platform_accounts')
    .select('id, platform, platform_customer_id, account_name')
    .eq('client_id', clientId)
    .eq('is_active', true);

  const rows = accounts || [];

  const ga4Row = rows.find((a) => a.platform === 'ga4');
  if (ga4Row?.platform_customer_id) {
    result.ga4PropertyId = normalizeGa4PropertyId(ga4Row.platform_customer_id);
  }

  const gscRow = rows.find((a) => {
    if (a.platform === 'gsc' || a.platform === 'search_console') return true;
    return looksLikeGscSiteUrl(a.platform_customer_id) || looksLikeGscSiteUrl(a.account_name);
  });
  if (gscRow) {
    const url = String(gscRow.platform_customer_id || gscRow.account_name || '').trim();
    if (looksLikeGscSiteUrl(url)) result.gscSiteUrl = url;
  }

  const gbpAccounts = rows.filter((a) => a.platform === 'gbp' || a.platform === 'gmb');
  const gbpIdsFromNumeric = [];
  gbpAccounts.forEach((a) => {
    for (const raw of [a.platform_customer_id, a.account_name]) {
      const s = String(raw || '').trim();
      if (looksLikeGbpLocationId(s)) {
        const path = toGbpLocationPath(s);
        if (path) gbpIdsFromNumeric.push(path);
      }
    }
  });

  let gmbLocations = [];
  if (agencyId) {
    const { data: locations } = await supabase
      .from('gmb_locations')
      .select('location_id, location_name')
      .eq('agency_id', agencyId)
      .limit(100);
    gmbLocations = locations || [];
  }

  const gbpFromNames = matchGbpAccountsToLocations(gbpAccounts, gmbLocations);
  result.gbpLocationIds = [...new Set([...gbpIdsFromNumeric, ...gbpFromNames])];
  if (result.gbpLocationIds.length) {
    result.gbpLocationId = result.gbpLocationIds[0];
  } else if (gmbLocations.length === 1) {
    const path = toGbpLocationPath(gmbLocations[0].location_id);
    if (path) {
      result.gbpLocationId = path;
      result.gbpLocationIds = [path];
    }
  }

  const { data: client } = await supabase.from('clients').select('*').eq('id', clientId).maybeSingle();
  if (client) {
    if (client.gsc_site_url && looksLikeGscSiteUrl(client.gsc_site_url)) {
      result.gscSiteUrl = String(client.gsc_site_url).trim();
    }
    if (client.gbp_location_id && looksLikeGbpLocationId(client.gbp_location_id)) {
      result.gbpLocationId = String(client.gbp_location_id).trim();
    }
    if (client.website_url && !result.gscSiteUrl && looksLikeGscSiteUrl(client.website_url)) {
      result.gscSiteUrl = String(client.website_url).trim();
    }
  }

  if (agencyId && !result.gscSiteUrl) {
    const gscIds = await discoverGscCustomerIds(agencyId, result.ga4PropertyId, clientId);
    const fromDb = pickGscSiteUrlFromCustomerIds(gscIds);
    if (fromDb) result.gscSiteUrl = fromDb;
  }

  if (agencyId && !result.gbpLocationIds.length) {
    const { data: insightRows } = await supabase
      .from('gmb_insights_daily')
      .select('customer_id')
      .eq('agency_id', agencyId)
      .limit(200);
    const insightIds = [...new Set((insightRows || []).map((r) => String(r.customer_id || '').trim()).filter(Boolean))]
      .map((id) => toGbpLocationPath(id))
      .filter(Boolean);
    if (insightIds.length) {
      result.gbpLocationIds = insightIds;
      result.gbpLocationId = insightIds[0];
    }
  }

  if (result.gscSiteUrl) {
    const domain = domainFromSiteUrl(result.gscSiteUrl);
    if (domain && !result.gscSiteUrl.startsWith('sc-domain:')) {
      result.gscSiteUrl = result.gscSiteUrl.endsWith('/') ? result.gscSiteUrl : `${result.gscSiteUrl}/`;
    }
  }

  return result;
}

/** All active platform accounts for a client (for monthly report auto-selection). */
export async function fetchClientPlatformAccountsForReport(clientId) {
  if (!clientId) return [];
  const { data } = await supabase
    .from('client_platform_accounts')
    .select('id, platform_customer_id, account_name, platform')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('account_name');
  return data || [];
}
