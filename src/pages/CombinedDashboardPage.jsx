import React, { useState, useCallback } from 'react';
import { useCombinedDashboardData } from '../hooks/useCombinedDashboardData';
import { useAuth } from '../context/AuthContext';
import { PermissionGate } from '../components/PermissionGate';
import { DateRangePicker } from '../components/DatePicker';

const fU = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fI = (n) => Math.round(Number(n || 0)).toLocaleString('en-US');
const fP = (n) => Number(n || 0).toFixed(2) + '%';

const KPI_CARDS = [
  { key: 'cost', label: 'Total Spend', fmt: fU },
  { key: 'impressions', label: 'Impressions', fmt: fI },
  { key: 'clicks', label: 'Clicks', fmt: fI },
  { key: 'conversions', label: 'Conversions', fmt: fI },
  { key: 'cpa', label: 'CPA', fmt: fU },
  { key: 'cpc', label: 'Avg CPC', fmt: fU },
];

export function CombinedDashboardPage() {
  const { hasPermission } = useAuth();
  const {
    filters,
    updateFilter,
    fetchData,
    loading,
    error,
    summaryKpis,
    accountBreakdown,
    campaignByAccount,
    adGroupsByCampaign,
    isSingleAccount,
    hasGoogleAdsData,
    accountMap,
  } = useCombinedDashboardData();

  const [expandedAccount, setExpandedAccount] = useState(null);
  const [expandedCampaign, setExpandedCampaign] = useState(null);

  const handleDateApply = useCallback(({ preset, dateFrom, dateTo }) => {
    updateFilter('datePreset', preset);
    updateFilter('dateFrom', dateFrom);
    updateFilter('dateTo', dateTo);
  }, [updateFilter]);

  const toggleAccount = useCallback((cid) => {
    setExpandedAccount((prev) => (prev === cid ? null : cid));
    setExpandedCampaign(null);
  }, []);

  const toggleCampaign = useCallback((key) => {
    setExpandedCampaign((prev) => (prev === key ? null : key));
  }, []);

  if (!hasPermission('tab.combined_dashboard')) {
    return (
      <div className="page-section active" id="page-dashboard">
        <div className="page-content">
          <div className="panel">
            <div className="panel-body" style={{ padding: 48, textAlign: 'center' }}>
              <h2>Access Denied</h2>
              <p>You do not have permission to view the Dashboard.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-section active" id="page-dashboard">
      <div className="page-content">
        <div className="page-title-bar">
          <div>
            <h2>Dashboard</h2>
            <p>Combined performance across all accounts</p>
          </div>
          <div className="gads-filter-group" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <DateRangePicker
              preset={filters.datePreset}
              dateFrom={filters.dateFrom}
              dateTo={filters.dateTo}
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
          <div className="panel">
            <div className="panel-body" style={{ padding: 48, textAlign: 'center' }}>
              <div className="auth-loading-spinner" />
              <p style={{ marginTop: 12 }}>Loading data…</p>
            </div>
          </div>
        ) : (
          <>
            <div className="kpi-grid" style={{ marginBottom: 24 }}>
              {KPI_CARDS.map(({ key, label, fmt }) => (
                <div key={key} className="kpi-card">
                  <div className="kpi-header">
                    <span className="kpi-label">{label}</span>
                  </div>
                  <div className="kpi-value">
                    {summaryKpis ? fmt(summaryKpis[key] ?? 0) : '—'}
                  </div>
                </div>
              ))}
            </div>

            {!hasGoogleAdsData ? (
              <div className="panel">
                <div className="panel-body">
                  <p className="admin-empty-hint">No data found for the selected date range.</p>
                </div>
              </div>
            ) : (
              <PermissionGate permission="tab.account_breakdown">
                {isSingleAccount ? (
                  <SingleAccountView
                    accountBreakdown={accountBreakdown}
                    campaignByAccount={campaignByAccount}
                    adGroupsByCampaign={adGroupsByCampaign}
                    expandedCampaign={expandedCampaign}
                    toggleCampaign={toggleCampaign}
                    fU={fU}
                    fI={fI}
                    fP={fP}
                  />
                ) : (
                  <MultiAccountView
                    accountBreakdown={accountBreakdown}
                    campaignByAccount={campaignByAccount}
                    adGroupsByCampaign={adGroupsByCampaign}
                    expandedAccount={expandedAccount}
                    expandedCampaign={expandedCampaign}
                    toggleAccount={toggleAccount}
                    toggleCampaign={toggleCampaign}
                    fU={fU}
                    fI={fI}
                    fP={fP}
                  />
                )}
              </PermissionGate>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SingleAccountView({ accountBreakdown, campaignByAccount, adGroupsByCampaign, expandedCampaign, toggleCampaign, fU, fI, fP }) {
  const cid = accountBreakdown[0]?.customer_id;
  const campaigns = campaignByAccount.get(cid) || [];

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Campaigns</h3>
      </div>
      <div className="panel-body no-padding">
        <table className="data-table gads-table">
          <thead>
            <tr>
              <th style={{ width: 32 }} />
              <th>Campaign Name</th>
              <th className="text-right">Spend</th>
              <th className="text-right">Impressions</th>
              <th className="text-right">Clicks</th>
              <th className="text-right">CTR</th>
              <th className="text-right">Conversions</th>
              <th className="text-right">Conv. Rate</th>
              <th className="text-right">CPA</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <React.Fragment key={c.campaign_id}>
                <tr>
                  <td>
                    {adGroupsByCampaign.get(c.campaign_id)?.length > 0 && (
                      <button
                        type="button"
                        className="admin-expand-btn"
                        onClick={() => toggleCampaign(c.campaign_id)}
                        aria-label={expandedCampaign === c.campaign_id ? 'Collapse' : 'Expand'}
                      >
                        {expandedCampaign === c.campaign_id ? '▼' : '▶'}
                      </button>
                    )}
                  </td>
                  <td>{c.campaign_name || '—'}</td>
                  <td className="text-right">{fU(c.cost)}</td>
                  <td className="text-right">{fI(c.impressions)}</td>
                  <td className="text-right">{fI(c.clicks)}</td>
                  <td className="text-right">{fP(c.ctr)}</td>
                  <td className="text-right">{fI(c.conversions)}</td>
                  <td className="text-right">{fP(c.clicks ? (c.conversions / c.clicks) * 100 : 0)}</td>
                  <td className="text-right">{fU(c.cpa)}</td>
                </tr>
                {expandedCampaign === c.campaign_id && (
                  <tr className="admin-expand-row">
                    <td colSpan={9}>
                      <div style={{ paddingLeft: 24 }}>
                        <table className="data-table gads-table" style={{ marginTop: 8 }}>
                          <thead>
                            <tr>
                              <th>Ad Group</th>
                              <th className="text-right">Spend</th>
                              <th className="text-right">Clicks</th>
                              <th className="text-right">Conversions</th>
                              <th className="text-right">CPA</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(adGroupsByCampaign.get(c.campaign_id) || []).map((ag) => (
                              <tr key={ag.ad_group_id}>
                                <td>{ag.ad_group_name || '—'}</td>
                                <td className="text-right">{fU(ag.cost)}</td>
                                <td className="text-right">{fI(ag.clicks)}</td>
                                <td className="text-right">{fI(ag.conversions)}</td>
                                <td className="text-right">{fU(ag.cpa)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MultiAccountView({ accountBreakdown, campaignByAccount, adGroupsByCampaign, expandedAccount, expandedCampaign, toggleAccount, toggleCampaign, fU, fI, fP }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Account Breakdown</h3>
      </div>
      <div className="panel-body no-padding">
        <table className="data-table gads-table admin-clients-table">
          <thead>
            <tr>
              <th style={{ width: 32 }} />
              <th>Account Name</th>
              <th>Account ID</th>
              <th className="text-right">Spend</th>
              <th className="text-right">Impressions</th>
              <th className="text-right">Clicks</th>
              <th className="text-right">CTR</th>
              <th className="text-right">Conversions</th>
              <th className="text-right">Conv. Rate</th>
              <th className="text-right">CPA</th>
            </tr>
          </thead>
          <tbody>
            {accountBreakdown.map((acc) => {
              const isExpanded = expandedAccount === acc.customer_id;
              const campaigns = campaignByAccount.get(acc.customer_id) || [];
              const displayName = acc.account_name || acc.account_label || acc.customer_id;
              return (
                <React.Fragment key={acc.customer_id}>
                  <tr>
                    <td>
                      <button
                        type="button"
                        className="admin-expand-btn"
                        onClick={() => toggleAccount(acc.customer_id)}
                        aria-label={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        {isExpanded ? '▼' : '▶'}
                      </button>
                    </td>
                    <td>{displayName}</td>
                    <td>{acc.customer_id}</td>
                    <td className="text-right">{fU(acc.cost)}</td>
                    <td className="text-right">{fI(acc.impressions)}</td>
                    <td className="text-right">{fI(acc.clicks)}</td>
                    <td className="text-right">{fP(acc.ctr)}</td>
                    <td className="text-right">{fI(acc.conversions)}</td>
                    <td className="text-right">{fP(acc.clicks ? (acc.conversions / acc.clicks) * 100 : 0)}</td>
                    <td className="text-right">{fU(acc.cpa)}</td>
                  </tr>
                  {isExpanded && (
                    <tr className="admin-expand-row">
                      <td colSpan={10}>
                        <div style={{ paddingLeft: 24 }}>
                          <table className="data-table gads-table" style={{ marginTop: 8 }}>
                            <thead>
                              <tr>
                                <th style={{ width: 32 }} />
                                <th>Campaign Name</th>
                                <th className="text-right">Spend</th>
                                <th className="text-right">Clicks</th>
                                <th className="text-right">Conversions</th>
                                <th className="text-right">CPA</th>
                              </tr>
                            </thead>
                            <tbody>
                              {campaigns.map((c) => (
                                <React.Fragment key={c.campaign_id}>
                                  <tr>
                                    <td>
                                      {adGroupsByCampaign.get(c.campaign_id)?.length > 0 && (
                                        <button
                                          type="button"
                                          className="admin-expand-btn"
                                          onClick={() => toggleCampaign(`${acc.customer_id}:${c.campaign_id}`)}
                                          aria-label={expandedCampaign === `${acc.customer_id}:${c.campaign_id}` ? 'Collapse' : 'Expand'}
                                        >
                                          {expandedCampaign === `${acc.customer_id}:${c.campaign_id}` ? '▼' : '▶'}
                                        </button>
                                      )}
                                    </td>
                                    <td>{c.campaign_name || '—'}</td>
                                    <td className="text-right">{fU(c.cost)}</td>
                                    <td className="text-right">{fI(c.clicks)}</td>
                                    <td className="text-right">{fI(c.conversions)}</td>
                                    <td className="text-right">{fU(c.cpa)}</td>
                                  </tr>
                                  {expandedCampaign === `${acc.customer_id}:${c.campaign_id}` && (
                                    <tr>
                                      <td colSpan={6}>
                                        <div style={{ paddingLeft: 24 }}>
                                          <table className="data-table gads-table" style={{ marginTop: 8 }}>
                                            <tbody>
                                              {(adGroupsByCampaign.get(c.campaign_id) || []).map((ag) => (
                                                <tr key={ag.ad_group_id}>
                                                  <td>{ag.ad_group_name || '—'}</td>
                                                  <td className="text-right">{fU(ag.cost)}</td>
                                                  <td className="text-right">{fI(ag.clicks)}</td>
                                                  <td className="text-right">{fI(ag.conversions)}</td>
                                                  <td className="text-right">{fU(ag.cpa)}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
