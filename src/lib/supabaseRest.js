import { supabase } from './supabaseClient';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const PAGE_SIZE = 1000;
const MAX_RETRIES = 4;
const RETRY_DELAY = 800;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || SUPABASE_ANON_KEY;
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
    'Prefer': 'count=exact',
  };
}

async function rawFetch(url) {
  const headers = await getAuthHeaders();
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text();
    console.error('[Supabase]', res.status, body);
    return { data: [], totalCount: 0 };
  }
  const contentRange = res.headers.get('content-range');
  let totalCount = null;
  if (contentRange) {
    const match = contentRange.match(/\/(\d+)/);
    if (match) totalCount = parseInt(match[1], 10);
  }
  const data = await res.json();
  return { data, totalCount };
}

async function fetchWithRetry(url) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await rawFetch(url);
    } catch (err) {
      lastErr = err;
      console.warn(`[Supabase] Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`, err.message);
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY * (attempt + 1));
    }
  }
  throw lastErr;
}

export async function sbFetch(endpoint) {
  const { data } = await fetchWithRetry(SUPABASE_URL + '/rest/v1/' + endpoint);
  return data;
}

export async function sbFetchAll(endpoint) {
  const sep = endpoint.includes('?') ? '&' : '?';
  const baseUrl = SUPABASE_URL + '/rest/v1/' + endpoint;

  const firstResult = await fetchWithRetry(baseUrl + sep + 'limit=' + PAGE_SIZE + '&offset=0');
  const firstData = firstResult.data;
  if (!Array.isArray(firstData) || firstData.length === 0) return [];

  const totalCount = firstResult.totalCount;

  if (firstData.length < PAGE_SIZE || (totalCount && totalCount <= PAGE_SIZE)) {
    return firstData;
  }

  if (totalCount && totalCount > PAGE_SIZE) {
    const all = [...firstData];
    const pages = Math.ceil(totalCount / PAGE_SIZE);
    const BATCH = 3;

    for (let batch = 1; batch < pages; batch += BATCH) {
      const promises = [];
      for (let p = batch; p < Math.min(batch + BATCH, pages); p++) {
        promises.push(
          fetchWithRetry(baseUrl + sep + 'limit=' + PAGE_SIZE + '&offset=' + (p * PAGE_SIZE))
        );
      }
      const results = await Promise.all(promises);
      for (const r of results) {
        if (Array.isArray(r.data) && r.data.length > 0) all.push(...r.data);
      }
    }
    console.log(`[Supabase] ${endpoint.split('?')[0]}: fetched ${all.length}/${totalCount} rows`);
    return all;
  }

  const all = [...firstData];
  let offset = PAGE_SIZE;
  while (true) {
    const { data } = await fetchWithRetry(baseUrl + sep + 'limit=' + PAGE_SIZE + '&offset=' + offset);
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

export async function sbFetchAllParallel(endpoint) {
  return sbFetchAll(endpoint);
}

export function buildQuery(table, { customerId, customerIds, dateFrom, dateTo, extra } = {}) {
  let q = table + '?select=*';
  if (customerIds && Array.isArray(customerIds) && customerIds.length > 0) {
    q += '&customer_id=in.(' + customerIds.join(',') + ')';
  } else if (customerId && customerId !== 'ALL' && customerId !== 'ALL_MINE') {
    q += '&customer_id=eq.' + customerId;
  }
  if (dateFrom) q += '&date=gte.' + dateFrom;
  if (dateTo) q += '&date=lte.' + dateTo;
  if (extra) q += extra;
  return q;
}
