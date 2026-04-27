import { useState, useEffect } from 'react';

/** Meta auth codes are single-use; React Strict Mode runs effects twice in dev — only one exchange per code. */
const metaOAuthExchangeInFlight = new Set();
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabaseClient';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session, activeAgencyId } = useAuth();
  const { showNotification, showPage } = useApp();

  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');
  const errorParam = searchParams.get('error');

  const stateParsed = (() => {
    if (!stateParam) return {};
    try {
      return JSON.parse(stateParam) || {};
    } catch {
      return {};
    }
  })();
  const stateAgencyId = stateParsed?.agency_id || null;
  const statePlatform = stateParsed?.platform || 'google_ads';
  const effectiveAgencyId = stateAgencyId || activeAgencyId;

  const [step, setStep] = useState('loading');
  const [mccId, setMccId] = useState('');
  const [customers, setCustomers] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [accountSearch, setAccountSearch] = useState('');
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
    if (!effectiveAgencyId) {
      setError('No agency assigned. Contact admin.');
      setStep('error');
      return;
    }
    if (statePlatform === 'reddit') {
      setStep('reddit_exchange');
      return;
    }
    if (statePlatform === 'ga4') {
      setStep('ga4_exchange');
      return;
    }
    if (statePlatform === 'facebook') {
      setStep('facebook_exchange');
      return;
    }
    setStep('mcc');
  }, [code, errorParam, session, effectiveAgencyId, statePlatform]);

  useEffect(() => {
    if (step !== 'ga4_exchange' || !code || !session || !effectiveAgencyId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/ga4-oauth-connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({
            action: 'exchange_code',
            code,
            redirect_uri: redirectUri,
            agency_id: effectiveAgencyId,
            credential_id: stateParsed?.credential_id || null,
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.success) throw new Error(data.error || 'Failed to connect GA4');
        showNotification?.('GA4 connected successfully');
        showPage?.('settings');
        navigate('/');
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || 'Failed to connect GA4');
        setStep('error');
      }
    })();
    return () => { cancelled = true; };
  }, [step, code, session, effectiveAgencyId, redirectUri, navigate, showNotification, showPage]);

  useEffect(() => {
    if (step !== 'reddit_exchange' || !code || !session || !effectiveAgencyId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('reddit-oauth-connect', {
          body: {
            action: 'exchange_code',
            code,
            redirect_uri: redirectUri,
            agency_id: effectiveAgencyId,
          },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (cancelled) return;
        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);
        showNotification?.('Reddit Ads connected successfully');
        showPage?.('settings');
        navigate('/');
      } catch (err) {
        if (cancelled) return;
        showNotification?.(err?.message || 'Failed to connect Reddit Ads');
        showPage?.('settings');
        navigate('/');
      }
    })();
    return () => { cancelled = true; };
  }, [step, code, session, effectiveAgencyId, redirectUri, navigate, showNotification, showPage]);

  useEffect(() => {
    if (step !== 'facebook_exchange' || !code || !session || !effectiveAgencyId) return;
    if (metaOAuthExchangeInFlight.has(code)) return;
    metaOAuthExchangeInFlight.add(code);

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/fb-oauth-connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({
            action: 'exchange_code',
            code,
            redirect_uri: redirectUri,
            agency_id: effectiveAgencyId,
          }),
        });
        const data = await res.json().catch(() => ({}));
        const errText = String(data.error || data.message || '');
        const codeAlreadyUsed = /authorization code has been used|code has been used|already been used/i.test(errText);

        if (!res.ok || !data.success) {
          if (codeAlreadyUsed) {
            showNotification?.('Facebook / Meta connected.');
            showPage?.('settings');
            navigate('/');
            return;
          }
          if (cancelled) return;
          throw new Error(errText || 'Failed to connect Facebook / Meta');
        }
        // Token exchange succeeded — complete UX even if Strict Mode already tore this effect down.
        showNotification?.('Facebook / Meta connected successfully');
        showPage?.('settings');
        navigate('/');
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || 'Failed to connect Facebook / Meta');
        setStep('error');
      } finally {
        metaOAuthExchangeInFlight.delete(code);
      }
    })();
    return () => { cancelled = true; };
  }, [step, code, session, effectiveAgencyId, redirectUri, navigate, showNotification, showPage]);

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
          agency_id: effectiveAgencyId,
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
    if (step !== 'list' || !effectiveAgencyId || !session) return;
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
          body: JSON.stringify({ list_only: true, agency_id: effectiveAgencyId }),
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
  }, [step, effectiveAgencyId, session]);

  const toggleAccount = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const toSelect = accountSearch.trim() ? filteredCustomers : customers;
    setSelectedIds(new Set(toSelect.map((c) => String(c.customer_id || c.id || c))));
  };

  const unselectAll = () => {
    setSelectedIds(new Set());
  };

  const filteredCustomers = accountSearch.trim()
    ? customers.filter((c) => {
        const cid = String(c.customer_id || c.id || c);
        const name = (c.descriptive_name || c.account_name || c.name || cid).toLowerCase();
        const search = accountSearch.trim().toLowerCase();
        return name.includes(search) || cid.includes(search);
      })
    : customers;

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
        .eq('agency_id', effectiveAgencyId)
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
          agency_id: effectiveAgencyId,
          credential_id: credId,
          platform: 'google_ads',
          platform_customer_id: cid,
          account_name: name,
          is_active: true,
        });
      });

      const { error: insertErr } = await supabase
        .from('client_platform_accounts')
        .upsert(toInsert, { onConflict: 'platform,platform_customer_id' });
      if (insertErr) throw insertErr;

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
              {customers.length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="Search accounts by name or ID..."
                    value={accountSearch}
                    onChange={(e) => setAccountSearch(e.target.value)}
                    style={{
                      flex: 1,
                      minWidth: 180,
                      padding: '8px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 14,
                    }}
                  />
                  <button type="button" className="btn btn-outline btn-sm" onClick={selectAll}>
                    Select all
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={unselectAll}>
                    Unselect all
                  </button>
                </div>
              )}
              <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 16, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 12 }}>
                {customers.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)' }}>No accounts found under this MCC.</p>
                ) : filteredCustomers.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)' }}>No accounts match your search.</p>
                ) : (
                  filteredCustomers.map((c) => {
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
                  {submitting ? 'Saving…' : `Save Selected Accounts${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
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
