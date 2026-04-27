import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useCombinedDashboardData } from '../hooks/useCombinedDashboardData';
import { useAuth } from '../context/AuthContext';
import { PermissionGate } from '../components/PermissionGate';
import { DateRangePicker } from '../components/DatePicker';
import { CombinedDashboardAccountTable } from '../components/CombinedDashboardAccountTable';

function accountsToCompareMap(list) {
  const m = new Map();
  (list || []).forEach((a) => { m.set(a.customer_id, a); });
  return m;
}

export function CombinedDashboardPage() {
  const { hasPermission } = useAuth();
  const {
    filters, batchUpdateFilters, fetchData, loading, error, hasData,
    gadsAccounts, fbAccounts, redditAccounts, tiktokAccounts, ga4Accounts,
    gadsAccountsCompare, fbAccountsCompare, redditAccountsCompare, tiktokAccountsCompare, ga4AccountsCompare,
    gadsCampaigns, fbCampaigns, redditCampaigns, tiktokCampaigns,
    primaryRangeLabel, compareRangeLabel,
  } = useCombinedDashboardData();

  const [expandedGads, setExpandedGads] = useState(null);
  const [expandedFb, setExpandedFb] = useState(null);
  const [expandedReddit, setExpandedReddit] = useState(null);
  const [expandedTiktok, setExpandedTiktok] = useState(null);

  const toggleGads = useCallback((cid) => setExpandedGads((p) => (p === cid ? null : cid)), []);
  const toggleFb = useCallback((cid) => setExpandedFb((p) => (p === cid ? null : cid)), []);
  const toggleReddit = useCallback((cid) => setExpandedReddit((p) => (p === cid ? null : cid)), []);
  const toggleTiktok = useCallback((cid) => setExpandedTiktok((p) => (p === cid ? null : cid)), []);

  const handleDateApply = useCallback((payload) => {
    batchUpdateFilters({
      datePreset: payload.preset,
      dateFrom: payload.dateFrom,
      dateTo: payload.dateTo,
      compareOn: !!payload.compareOn,
      compareFrom: payload.compareFrom || '',
      compareTo: payload.compareTo || '',
    });
  }, [batchUpdateFilters]);

  const gadsCmpMap = useMemo(() => accountsToCompareMap(gadsAccountsCompare), [gadsAccountsCompare]);
  const fbCmpMap = useMemo(() => accountsToCompareMap(fbAccountsCompare), [fbAccountsCompare]);
  const redditCmpMap = useMemo(() => accountsToCompareMap(redditAccountsCompare), [redditAccountsCompare]);
  const tiktokCmpMap = useMemo(() => accountsToCompareMap(tiktokAccountsCompare), [tiktokAccountsCompare]);
  const ga4CmpMap = useMemo(() => accountsToCompareMap(ga4AccountsCompare), [ga4AccountsCompare]);

  const tabs = useMemo(() => {
    const t = [];
    if (gadsAccounts.length > 0) t.push({ id: 'google_ads', label: `Google Ads (${gadsAccounts.length})` });
    if (fbAccounts.length > 0) t.push({ id: 'facebook', label: `Facebook (${fbAccounts.length})` });
    if (redditAccounts.length > 0) t.push({ id: 'reddit', label: `Reddit (${redditAccounts.length})` });
    if (tiktokAccounts.length > 0) t.push({ id: 'tiktok', label: `TikTok (${tiktokAccounts.length})` });
    if (ga4Accounts.length > 0) t.push({ id: 'ga4', label: `GA4 (${ga4Accounts.length})` });
    return t;
  }, [gadsAccounts, fbAccounts, redditAccounts, tiktokAccounts, ga4Accounts]);

  const [activeTab, setActiveTab] = useState('google_ads');

  useEffect(() => {
    if (tabs.length === 0) return;
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs, activeTab]);

  if (!hasPermission('tab.combined_dashboard')) {
    return (
      <div className="page-section active" id="page-dashboard">
        <div className="page-content">
          <div className="panel"><div className="panel-body" style={{ padding: 48, textAlign: 'center' }}>
            <h2>Access Denied</h2>
            <p>You do not have permission to view the Dashboard.</p>
          </div></div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-section active" id="page-dashboard">
      <div className="page-content">
        <div className="page-title-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2>Dashboard</h2>
            <p>Cross-platform performance overview — all accounts</p>
          </div>
          <div style={{ marginLeft: 'auto', flexShrink: 0, width: 'min(440px, 100%)' }}>
            <DateRangePicker
              blockLayout
              preset={filters.datePreset}
              dateFrom={filters.dateFrom}
              dateTo={filters.dateTo}
              compareOn={filters.compareOn}
              compareFrom={filters.compareFrom}
              compareTo={filters.compareTo}
              onApply={handleDateApply}
            />
          </div>
        </div>

        {error && (
          <div className="admin-message error" style={{ marginBottom: 16 }}>
            {error}
            <button type="button" className="btn btn-outline btn-sm" style={{ marginLeft: 8 }} onClick={fetchData}>Retry</button>
          </div>
        )}

        {loading ? (
          <div className="panel"><div className="panel-body" style={{ padding: 48, textAlign: 'center' }}>
            <div className="auth-loading-spinner" />
            <p style={{ marginTop: 12 }}>Loading data across all platforms…</p>
          </div></div>
        ) : (
          <PermissionGate permission="tab.combined_dashboard">
            {!hasData ? (
              <div className="panel"><div className="panel-body">
                <p className="admin-empty-hint">No data found for the selected date range across any platform.</p>
              </div></div>
            ) : (
              <>
                <div className="gads-tabs-container">
                  <div className="gads-tabs-row">
                    <div className="gads-tabs">
                      {tabs.map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          className={`gads-tab ${activeTab === tab.id ? 'active' : ''}`}
                          onClick={() => setActiveTab(tab.id)}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  {activeTab === 'google_ads' && (
                    <CombinedDashboardAccountTable
                      key={`google_ads-${filters.compareOn}`}
                      accounts={gadsAccounts}
                      campaigns={gadsCampaigns}
                      platform="google_ads"
                      expanded={expandedGads}
                      toggleExpand={toggleGads}
                      compareOn={filters.compareOn}
                      compareById={gadsCmpMap}
                      primaryRangeLabel={primaryRangeLabel}
                      compareRangeLabel={compareRangeLabel}
                    />
                  )}

                  {activeTab === 'facebook' && (
                    <CombinedDashboardAccountTable
                      key={`facebook-${filters.compareOn}`}
                      accounts={fbAccounts}
                      campaigns={fbCampaigns}
                      platform="facebook"
                      expanded={expandedFb}
                      toggleExpand={toggleFb}
                      compareOn={filters.compareOn}
                      compareById={fbCmpMap}
                      primaryRangeLabel={primaryRangeLabel}
                      compareRangeLabel={compareRangeLabel}
                    />
                  )}

                  {activeTab === 'reddit' && (
                    <CombinedDashboardAccountTable
                      key={`reddit-${filters.compareOn}`}
                      accounts={redditAccounts}
                      campaigns={redditCampaigns}
                      platform="reddit"
                      expanded={expandedReddit}
                      toggleExpand={toggleReddit}
                      compareOn={filters.compareOn}
                      compareById={redditCmpMap}
                      primaryRangeLabel={primaryRangeLabel}
                      compareRangeLabel={compareRangeLabel}
                    />
                  )}

                  {activeTab === 'tiktok' && (
                    <CombinedDashboardAccountTable
                      key={`tiktok-${filters.compareOn}`}
                      accounts={tiktokAccounts}
                      campaigns={tiktokCampaigns}
                      platform="tiktok"
                      expanded={expandedTiktok}
                      toggleExpand={toggleTiktok}
                      compareOn={filters.compareOn}
                      compareById={tiktokCmpMap}
                      primaryRangeLabel={primaryRangeLabel}
                      compareRangeLabel={compareRangeLabel}
                    />
                  )}

                  {activeTab === 'ga4' && (
                    <CombinedDashboardAccountTable
                      key={`ga4-${filters.compareOn}`}
                      accounts={ga4Accounts}
                      campaigns={null}
                      platform="ga4"
                      expanded={null}
                      toggleExpand={() => {}}
                      compareOn={filters.compareOn}
                      compareById={ga4CmpMap}
                      primaryRangeLabel={primaryRangeLabel}
                      compareRangeLabel={compareRangeLabel}
                    />
                  )}
                </div>
              </>
            )}
          </PermissionGate>
        )}
      </div>
    </div>
  );
}
