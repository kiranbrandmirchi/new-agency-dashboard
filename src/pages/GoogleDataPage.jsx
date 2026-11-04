import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { GadsDailyTestTables } from '../components/GadsDailyTestTables';

const FN = 'gads-temp-sync';
const VIEWER_EMAIL = 'adityakhan063@gmail.com';

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function callFn(body) {
  const { data, error } = await supabase.functions.invoke(FN, { body });
  if (error) {
    let msg = error.message;
    try {
      const j = await error.context?.json();
      if (j?.error) msg = j.error;
    } catch { /* non-JSON error body */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function GoogleDataPage() {
  const { showNotification } = useApp();
  const { user, allAgencies, loading: authLoading } = useAuth();
  const allowed = user?.email?.toLowerCase() === VIEWER_EMAIL;

  const [status, setStatus] = useState({ connections: [], accounts: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await callFn({ action: 'status' }));
    } catch (err) {
      showNotification(err.message);
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    if (allowed) loadStatus();
  }, [allowed, loadStatus]);

  const handleSync = async (agencyId) => {
    setBusy(`daily-${agencyId}`);
    try {
      const r = await callFn({ action: 'sync', agency_id: agencyId, date_from: isoDaysAgo(3), date_to: isoDaysAgo(1) });
      showNotification(`Sync finished: ${r.total_rows} rows`);
      await loadStatus();
    } catch (err) {
      showNotification(err.message);
    } finally {
      setBusy(null);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="page-section active">
        <div className="page-content"><p>Loading…</p></div>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="page-section active">
        <div className="page-content">
          <div className="card" style={{ padding: 48, textAlign: 'center' }}>
            <h2>Access Denied</h2>
            <p>This page is not available for your account.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-section active">
      <div className="page-content">
        <div className="page-title-bar">
          <h2>Google Data (Daily Test)</h2>
          <p>Daily Google Ads data for the Wheeler and Red Castle test accounts</p>
        </div>
        {loading ? (
          <p>Loading…</p>
        ) : (
          <GadsDailyTestTables
            allAgencies={allAgencies}
            accounts={status.accounts}
            connections={status.connections}
            busyKey={busy}
            onSync={handleSync}
          />
        )}
      </div>
    </div>
  );
}
