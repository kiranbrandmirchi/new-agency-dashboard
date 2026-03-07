import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session, agencyId, signOut } = useAuth();

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  const [step, setStep] = useState('loading');
  const [mccId, setMccId] = useState('');
  const [customers, setCustomers] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [credentialId, setCredentialId] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const redirectUri = typeof window !== 'undefined' ? `${window.location.origin}/oauth/callback` : 'http://localhost:5173/oauth/callback';

  useEffect(() => {
    if (errorParam) {
      setError(`OAuth error: ${errorParam}`);
      setStep('error');
      return;
    }
    if (!code) {
      setError('No authorization code received.');
      setStep('error');
      return;
    }
    if (!session) {
      setStep('auth');
      return;
    }
    if (!agencyId) {
      setError('No agency assigned. Contact admin.');
      setStep('error');
      return;
    }
    setStep('mcc');
  }, [code, errorParam, session, agencyId]);

  const handleExchangeCode = async (e) => {
    e.preventDefault();
    if (!mccId.trim()) {
      setError('Please enter your MCC ID.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/oauth-connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'exchange_code',
          code,
          redirect_uri: redirectUri,
          platform: 'google_ads',
          mcc_id: mccId.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to connect');
      }
      if (!data.success) {
        throw new Error(data.error || 'Exchange failed');
      }
      setStep('list');
    } catch (err) {
      setError(err.message || 'Failed to connect Google Ads');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (step !== 'list' || !agencyId || !session) return;
    const fetchAccounts = async () => {
      setSubmitting(true);
      setError('');
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/gads-full-sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ list_only: true, agency_id: agencyId }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || data.message || 'Failed to list accounts');
        }
        const list = data.customers || data.accounts || data || [];
        setCustomers(Array.isArray(list) ? list : []);
        if (Array.isArray(list) && list.length > 0) {
          setSelectedIds(new Set(list.map((c) => String(c.customer_id || c.id || c))));
        }
      } catch (err) {
        setError(err.message || 'Failed to list accounts');
      } finally {
        setSubmitting(false);
      }
    };
    fetchAccounts();
  }, [step, agencyId, session]);

  const toggleAccount = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSaveAccounts = async () => {
    if (selectedIds.size === 0) {
      setError('Select at least one account.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const { data: creds } = await supabase
        .from('agency_platform_credentials')
        .select('id')
        .eq('agency_id', agencyId)
        .eq('platform', 'google_ads')
        .eq('is_active', true)
        .limit(1)
        .single();
      const credId = creds?.id;
      if (!credId) {
        throw new Error('No active Google Ads credential found. Please try connecting again.');
      }

      const toInsert = [];
      customers.forEach((c) => {
        const cid = String(c.customer_id || c.id || c);
        if (!selectedIds.has(cid)) return;
        const name = c.descriptive_name || c.account_name || c.name || cid;
        toInsert.push({
          agency_id: agencyId,
          credential_id: credId,
          platform: 'google_ads',
          platform_customer_id: cid,
          account_name: name,
          is_active: true,
        });
      });

      const { error: insertErr } = await supabase.from('client_platform_accounts').insert(toInsert);
      if (insertErr) throw insertErr;

      const today = new Date();
      const backfillItems = [];
      for (let d = 0; d < 90; d++) {
        const date = new Date(today);
        date.setDate(date.getDate() - d);
        const fillDate = date.toISOString().slice(0, 10);
        toInsert.forEach((acc) => {
          backfillItems.push({ customer_id: acc.platform_customer_id, fill_date: fillDate, func: 'full-sync' });
          backfillItems.push({ customer_id: acc.platform_customer_id, fill_date: fillDate, func: 'geo' });
        });
      }
      const { error: backfillErr } = await supabase.from('gads_backfill_queue').insert(backfillItems);
      if (backfillErr) console.warn('[OAuth] Backfill queue insert:', backfillErr.message);

      navigate('/');
      window.location.reload();
    } catch (err) {
      setError(err.message || 'Failed to save accounts');
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'auth') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="auth-title">Sign In Required</h1>
          <p className="auth-subtitle">Please sign in to complete the Google Ads connection.</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/login')}>
            Sign In
          </button>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="auth-title">Connection Error</h1>
          <p className="auth-subtitle" style={{ color: 'var(--danger)' }}>{error}</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (step === 'mcc') {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ maxWidth: 420 }}>
          <h1 className="auth-title">Connect Google Ads</h1>
          <p className="auth-subtitle">Enter your Google Ads Manager (MCC) account ID to continue.</p>
          <form onSubmit={handleExchangeCode}>
            <div className="auth-form-group">
              <label htmlFor="mcc-id">MCC Account ID</label>
              <input
                id="mcc-id"
                type="text"
                placeholder="e.g. 1234567890"
                value={mccId}
                onChange={(e) => setMccId(e.target.value)}
                required
              />
            </div>
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button type="submit" className="btn btn-primary auth-submit" disabled={submitting}>
              {submitting ? 'Connecting…' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (step === 'list') {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ maxWidth: 560 }}>
          <h1 className="auth-title">Select Accounts</h1>
          <p className="auth-subtitle">Choose which Google Ads accounts to add to your agency.</p>
          {submitting && customers.length === 0 ? (
            <div className="auth-loading-spinner" style={{ margin: '24px auto' }} />
          ) : (
            <>
              <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 16, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 12 }}>
                {customers.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)' }}>No accounts found under this MCC.</p>
                ) : (
                  customers.map((c) => {
                    const cid = String(c.customer_id || c.id || c);
                    const name = c.descriptive_name || c.account_name || c.name || cid;
                    return (
                      <label key={cid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(cid)}
                          onChange={() => toggleAccount(cid)}
                        />
                        <span>{name}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>({cid})</span>
                      </label>
                    );
                  })
                )}
              </div>
              {error && <div className="auth-error" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSaveAccounts}
                  disabled={submitting || selectedIds.size === 0}
                >
                  {submitting ? 'Saving…' : 'Save Selected Accounts'}
                </button>
                <button type="button" className="btn btn-outline" onClick={() => navigate('/')}>
                  Skip
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-loading-spinner" />
        <p className="auth-subtitle">Loading…</p>
      </div>
    </div>
  );
}
