/**
 * Splits a date range into chunks of `chunkDays` and calls the sync function
 * for each chunk sequentially. Returns progress updates via callback.
 *
 * @param {Object} params
 * @param {string} params.customerId - platform_customer_id
 * @param {string} params.agencyId
 * @param {string} params.dateFrom - YYYY-MM-DD
 * @param {string} params.dateTo - YYYY-MM-DD
 * @param {string} params.accessToken - Supabase session token
 * @param {number} params.chunkDays - days per chunk (default 5)
 * @param {function} params.onProgress - callback({current, total, dateFrom, dateTo, status, rows})
 * @param {function} params.onChunkComplete - optional callback(chunkResult) for logging to sync_log
 * @returns {Promise<{success: boolean, totalRows: number, errors: string[]}>}
 */
export async function syncWithChunking(params) {
  const {
    customerId,
    agencyId,
    dateFrom,
    dateTo,
    accessToken,
    chunkDays = 5,
    onProgress,
    onChunkComplete,
  } = params;

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  if (!SUPABASE_URL) throw new Error('VITE_SUPABASE_URL not configured');

  const from = parseDate(dateFrom);
  const to = parseDate(dateTo);
  if (!from || !to || from > to) {
    throw new Error('Invalid date range');
  }

  const chunks = buildChunks(from, to, chunkDays);
  const total = chunks.length;
  let totalRows = 0;
  const errors = [];

  for (let i = 0; i < chunks.length; i++) {
    const { from: chunkFrom, to: chunkTo } = chunks[i];
    const fromStr = chunkFrom.toISOString().slice(0, 10);
    const toStr = chunkTo.toISOString().slice(0, 10);

    onProgress?.({
      current: i + 1,
      total,
      dateFrom: fromStr,
      dateTo: toStr,
      status: 'syncing',
      rows: 0,
    });

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/gads-full-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          customer_id: customerId,
          agency_id: agencyId,
          date_from: fromStr,
          date_to: toStr,
          mode: 'backfill',
        }),
      });

      const data = await res.json().catch(() => null);
      const rows = data?.total_rows ?? data?.log?.length ?? 0;
      totalRows += rows;

      const chunkResult = {
        dateFrom: fromStr,
        dateTo: toStr,
        status: res.ok ? 'success' : 'failed',
        rowsSynced: rows,
        errorMessage: null,
      };

      if (!res.ok) {
        const errMsg = data?.error || data?.message || await res.text().catch(() => 'Sync failed');
        chunkResult.errorMessage = errMsg;
        errors.push(`${fromStr}–${toStr}: ${errMsg}`);
        onProgress?.({
          current: i + 1,
          total,
          dateFrom: fromStr,
          dateTo: toStr,
          status: 'failed',
          rows,
        });
        onChunkComplete?.({ customerId, agencyId, ...chunkResult });
        continue;
      }

      onProgress?.({
        current: i + 1,
        total,
        dateFrom: fromStr,
        dateTo: toStr,
        status: 'success',
        rows,
      });
      onChunkComplete?.({ customerId, agencyId, ...chunkResult });
    } catch (err) {
      const errMsg = err?.message || 'Network error';
      errors.push(`${fromStr}–${toStr}: ${errMsg}`);
      onProgress?.({
        current: i + 1,
        total,
        dateFrom: fromStr,
        dateTo: toStr,
        status: 'failed',
        rows: 0,
      });
      onChunkComplete?.({ customerId, agencyId, dateFrom: fromStr, dateTo: toStr, status: 'failed', rowsSynced: 0, errorMessage: errMsg });
    }
  }

  return {
    success: errors.length === 0,
    totalRows,
    errors,
  };
}

function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function buildChunks(from, to, chunkDays) {
  const chunks = [];
  let current = new Date(from);

  while (current <= to) {
    const chunkEnd = new Date(current);
    chunkEnd.setDate(chunkEnd.getDate() + chunkDays - 1);

    const chunkTo = chunkEnd > to ? new Date(to) : chunkEnd;
    chunks.push({
      from: new Date(current),
      to: new Date(chunkTo),
    });

    current.setDate(current.getDate() + chunkDays);
  }

  return chunks;
}

/**
 * Syncs campaign, ad group, and keyword status via gads-status-geo.
 * @param {Object} params
 * @param {string} params.customerId
 * @param {string} params.accessToken
 * @returns {Promise<{campaigns: boolean, adgroups: boolean, keywords: boolean}>}
 */
export async function syncStatusAndGeo({ customerId, accessToken }) {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  if (!SUPABASE_URL) throw new Error('VITE_SUPABASE_URL not configured');

  const result = { campaigns: false, adgroups: false, keywords: false };
  const types = ['campaigns', 'adgroups', 'keywords'];

  for (const syncType of types) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/gads-status-geo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ customer_id: customerId, sync_type: syncType }),
      });
      result[syncType] = res.ok;
    } catch {
      result[syncType] = false;
    }
  }
  return result;
}

/**
 * Syncs geo data for a date range via gads-status-geo.
 * @param {Object} params
 * @param {string} params.customerId
 * @param {string} params.dateFrom - YYYY-MM-DD
 * @param {string} params.dateTo - YYYY-MM-DD
 * @param {string} params.accessToken
 * @returns {Promise<{success: boolean}>}
 */
export async function syncGeo({ customerId, dateFrom, dateTo, accessToken }) {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  if (!SUPABASE_URL) throw new Error('VITE_SUPABASE_URL not configured');

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gads-status-geo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        customer_id: customerId,
        date_from: dateFrom,
        date_to: dateTo,
        sync_type: 'geo',
      }),
    });
    return { success: res.ok };
  } catch {
    return { success: false };
  }
}

/**
 * Resolves geo location names via gads-geo-resolve.
 * @param {Object} params
 * @param {string} params.accessToken
 * @returns {Promise<{success: boolean}>}
 */
export async function resolveGeo({ accessToken }) {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  if (!SUPABASE_URL) throw new Error('VITE_SUPABASE_URL not configured');

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gads-geo-resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({}),
    });
    return { success: res.ok };
  } catch {
    return { success: false };
  }
}
