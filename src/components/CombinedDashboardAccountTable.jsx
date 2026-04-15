import React, { useState, useCallback, useMemo } from 'react';

const fU = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fI = (n) => Math.round(Number(n || 0)).toLocaleString('en-US');
const fP = (n) => Number(n || 0).toFixed(2) + '%';

/** @returns {{ delta: number, pct: number, up: boolean, isGood: boolean } | null} */
function metricChange(current, previous, inverse) {
  const curr = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0 && curr === 0) return { delta: 0, pct: 0, up: true, isGood: true };
  const delta = curr - prev;
  const pct = prev !== 0 ? (delta / Math.abs(prev)) * 100 : (curr > 0 ? 100 : 0);
  const up = delta >= 0;
  const isGood = inverse ? !up : up;
  return { delta, pct, up, isGood };
}

const AD_METRICS = [
  { key: 'cost', label: 'Spend', inverse: true, fmt: fU, pick: (a) => a.cost },
  { key: 'impressions', label: 'Impressions', inverse: false, fmt: fI, pick: (a) => a.impressions },
  { key: 'clicks', label: 'Clicks', inverse: false, fmt: fI, pick: (a) => a.clicks },
  { key: 'ctr', label: 'CTR', inverse: false, fmt: fP, pick: (a) => a.ctr },
  { key: 'cpc', label: 'CPC', inverse: true, fmt: fU, pick: (a) => a.cpc },
  { key: 'conversions', label: 'Conversions', inverse: false, fmt: fI, pick: (a) => a.conversions },
  { key: 'cpa', label: 'CPA', inverse: true, fmt: fU, pick: (a) => a.cpa },
];

const FB_EXTRA = [
  { key: 'reach', label: 'Reach', inverse: false, fmt: fI, pick: (a) => a.reach },
  { key: 'lead_count', label: 'Leads', inverse: false, fmt: fI, pick: (a) => a.lead_count },
  { key: 'purchase_value', label: 'Purch. Value', inverse: false, fmt: fU, pick: (a) => a.purchase_value },
];

const GA4_METRICS = [
  { key: 'total_users', label: 'Users', inverse: false, fmt: fI, pick: (a) => a.total_users },
  { key: 'sessions', label: 'Sessions', inverse: false, fmt: fI, pick: (a) => a.sessions },
  { key: 'page_views', label: 'Pageviews', inverse: false, fmt: fI, pick: (a) => a.page_views },
  { key: 'conversions', label: 'Conversions', inverse: false, fmt: fI, pick: (a) => a.conversions },
];

function defaultMetricOpen(keys) {
  const o = {};
  keys.forEach((k) => { o[k] = true; });
  return o;
}

function sumAccountMetrics(accounts, metrics) {
  const t = {};
  metrics.forEach((m) => { t[m.key] = 0; });
  accounts.forEach((a) => {
    metrics.forEach((m) => {
      t[m.key] += Number(m.pick(a)) || 0;
    });
  });
  if (metrics.some((x) => x.key === 'cost')) {
    t.ctr = t.impressions ? (t.clicks / t.impressions) * 100 : 0;
    t.cpc = t.clicks ? t.cost / t.clicks : 0;
    t.cpa = t.conversions ? t.cost / t.conversions : 0;
  }
  return t;
}

function totalFromPrimaryAndCompareMap(accounts, compareById, metrics) {
  const currT = sumAccountMetrics(accounts, metrics);
  const prevAccounts = accounts.map((a) => compareById.get(a.customer_id)).filter(Boolean);
  const prevT = sumAccountMetrics(prevAccounts, metrics);
  return { curr: currT, prev: prevT };
}

function CompareMetricHeader({ m, expanded, onToggle }) {
  return (
    <th
      colSpan={expanded ? 4 : 1}
      className="dash-metric-group-th"
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 28 }}>
        <span style={{ fontWeight: 700, fontSize: 12 }}>{m.label}</span>
        <button
          type="button"
          className="dash-metric-chevron"
          title={expanded ? 'Hide comparison columns' : 'Show comparison columns'}
          aria-expanded={expanded}
          onClick={(e) => { e.stopPropagation(); onToggle(m.key); }}
        >
          {expanded ? '‹' : '›'}
        </button>
      </div>
    </th>
  );
}

function formatDeltaDisplay(m, deltaNum) {
  if (m.key === 'ctr') return `${deltaNum >= 0 ? '+' : ''}${Number(deltaNum).toFixed(2)} pp`;
  const absFmt = m.fmt(Math.abs(deltaNum));
  if (absFmt.startsWith('$')) return `${deltaNum >= 0 ? '+' : '−'}${fU(Math.abs(deltaNum))}`;
  return `${deltaNum >= 0 ? '+' : ''}${fI(Math.abs(deltaNum))}`;
}

function CompareCells({ m, currVal, prevVal, compareOn, expanded }) {
  if (!compareOn) {
    return <td className="text-right">{m.fmt(currVal)}</td>;
  }
  if (!expanded) {
    return <td className="text-right">{m.fmt(currVal)}</td>;
  }
  const prevMissing = prevVal == null || (typeof prevVal === 'number' && Number.isNaN(prevVal));
  const ch = prevMissing ? null : metricChange(currVal, prevVal, m.inverse);
  const goodCls = ch ? (ch.isGood ? 'dash-cmp-good' : 'dash-cmp-bad') : '';

  const deltaNum = prevMissing ? null : (Number(currVal) - Number(prevVal));
  const deltaStr = prevMissing || ch == null ? '—' : formatDeltaDisplay(m, deltaNum);

  const pctStr = prevMissing || ch == null ? '—' : `${ch.pct >= 0 ? '+' : ''}${ch.pct.toFixed(2)}%`;

  return (
    <>
      <td className="text-right dash-cmp-primary">{m.fmt(currVal)}</td>
      <td className="text-right dash-cmp-secondary">{prevMissing ? '—' : m.fmt(prevVal)}</td>
      <td className={`text-right dash-cmp-delta ${goodCls}`}>{deltaStr}</td>
      <td className={`text-right dash-cmp-delta ${goodCls}`}>{pctStr}</td>
    </>
  );
}

/**
 * @param {object} props
 * @param {any[]} props.accounts
 * @param {Map<string, object>} [props.compareById]
 * @param {boolean} props.compareOn
 * @param {string} props.primaryRangeLabel
 * @param {string} props.compareRangeLabel
 */
export function CombinedDashboardAccountTable({
  accounts,
  campaigns,
  platform,
  expanded,
  toggleExpand,
  compareOn,
  compareById,
  primaryRangeLabel,
  compareRangeLabel,
}) {
  const isGA4 = platform === 'ga4';
  const isFb = platform === 'facebook';
  const metrics = useMemo(() => {
    if (isGA4) return GA4_METRICS;
    const base = [...AD_METRICS];
    if (isFb) base.push(...FB_EXTRA);
    return base;
  }, [isGA4, isFb]);

  const metricKeys = useMemo(() => metrics.map((m) => m.key), [metrics]);
  const [metricOpen, setMetricOpen] = useState(() => defaultMetricOpen(metricKeys));

  const toggleMetric = useCallback((key) => {
    setMetricOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const totalRow = useMemo(() => {
    const t = { cost: 0, clicks: 0, impressions: 0, conversions: 0, sessions: 0, total_users: 0, page_views: 0, reach: 0, purchase_count: 0, purchase_value: 0, lead_count: 0 };
    accounts.forEach((a) => { Object.keys(t).forEach((k) => { t[k] += a[k] || 0; }); });
    t.ctr = t.impressions ? (t.clicks / t.impressions) * 100 : 0;
    t.cpc = t.clicks ? t.cost / t.clicks : 0;
    t.cpa = t.conversions ? t.cost / t.conversions : 0;
    return t;
  }, [accounts]);

  const totalPrev = useMemo(() => {
    if (!compareOn) return null;
    const { prev } = totalFromPrimaryAndCompareMap(accounts, compareById || new Map(), metrics);
    return prev;
  }, [compareOn, compareById, accounts, metrics]);

  if (isGA4) {
    if (!compareOn) {
      return (
        <div className="panel"><div className="panel-body no-padding"><div className="table-wrapper">
          <table className="data-table gads-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Client</th>
                <th className="text-right">Users</th>
                <th className="text-right">Sessions</th>
                <th className="text-right">Pageviews</th>
                <th className="text-right">Conversions</th>
              </tr>
            </thead>
            <tbody>
              <tr className="gads-total-row-top">
                <td colSpan={2}><strong>Total</strong></td>
                <td className="text-right"><strong>{fI(totalRow.total_users)}</strong></td>
                <td className="text-right"><strong>{fI(totalRow.sessions)}</strong></td>
                <td className="text-right"><strong>{fI(totalRow.page_views)}</strong></td>
                <td className="text-right"><strong>{fI(totalRow.conversions)}</strong></td>
              </tr>
              {accounts.map((a) => (
                <tr key={a.customer_id}>
                  <td>{a.account_name}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{a.client_name}</td>
                  <td className="text-right">{fI(a.total_users)}</td>
                  <td className="text-right">{fI(a.sessions)}</td>
                  <td className="text-right">{fI(a.page_views)}</td>
                  <td className="text-right">{fI(a.conversions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div></div>
      );
    }

    return (
      <div className="panel"><div className="panel-body no-padding"><div className="table-wrapper">
        <table className="data-table gads-table dash-compare-table">
          <thead>
            <tr>
              <th rowSpan={2}>Account</th>
              <th rowSpan={2}>Client</th>
              {metrics.map((m) => (
                <CompareMetricHeader key={m.key} m={m} expanded={metricOpen[m.key]} onToggle={toggleMetric} />
              ))}
            </tr>
            <tr>
              {metrics.map((m) => (metricOpen[m.key] ? (
                <React.Fragment key={`${m.key}-sub`}>
                  <th className="text-right dash-sub-th">{primaryRangeLabel}</th>
                  <th className="text-right dash-sub-th">{compareRangeLabel}</th>
                  <th className="text-right dash-sub-th">Change</th>
                  <th className="text-right dash-sub-th">Change (%)</th>
                </React.Fragment>
              ) : null))}
            </tr>
          </thead>
          <tbody>
            <tr className="gads-total-row-top">
              <td colSpan={2}><strong>Total</strong></td>
              {metrics.map((m) => {
                const cv = m.pick(totalRow);
                const pv = totalPrev ? m.pick(totalPrev) : null;
                return (
                  <React.Fragment key={m.key}>
                    <CompareCells m={m} currVal={cv} prevVal={pv} compareOn expanded={metricOpen[m.key]} />
                  </React.Fragment>
                );
              })}
            </tr>
            {accounts.map((a) => {
              const p = compareById?.get(a.customer_id);
              return (
                <tr key={a.customer_id}>
                  <td>{a.account_name}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{a.client_name}</td>
                  {metrics.map((m) => (
                    <React.Fragment key={m.key}>
                      <CompareCells
                        m={m}
                        currVal={m.pick(a)}
                        prevVal={p ? m.pick(p) : null}
                        compareOn
                        expanded={metricOpen[m.key]}
                      />
                    </React.Fragment>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div></div></div>
    );
  }

  const colSpanTotal = useMemo(() => {
    let n = 3;
    metrics.forEach((m) => { n += compareOn && metricOpen[m.key] ? 4 : 1; });
    return n;
  }, [metrics, compareOn, metricOpen]);

  const theadRow1 = (
    <tr>
      <th rowSpan={compareOn ? 2 : 1} style={{ width: 28 }} />
      <th rowSpan={compareOn ? 2 : 1}>Account</th>
      <th rowSpan={compareOn ? 2 : 1}>Client</th>
      {compareOn ? metrics.map((m) => (
        <CompareMetricHeader key={m.key} m={m} expanded={metricOpen[m.key]} onToggle={toggleMetric} />
      )) : metrics.map((m) => <th key={m.key} className="text-right">{m.label}</th>)}
    </tr>
  );

  const theadRow2 = compareOn ? (
    <tr>
      {metrics.map((m) => (metricOpen[m.key] ? (
        <React.Fragment key={`${m.key}-sub`}>
          <th className="text-right dash-sub-th">{primaryRangeLabel}</th>
          <th className="text-right dash-sub-th">{compareRangeLabel}</th>
          <th className="text-right dash-sub-th">Change</th>
          <th className="text-right dash-sub-th">Change (%)</th>
        </React.Fragment>
      ) : null))}
    </tr>
  ) : null;

  return (
    <div className="panel"><div className="panel-body no-padding"><div className="table-wrapper">
      <table className={`data-table gads-table ${compareOn ? 'dash-compare-table' : ''}`}>
        <thead>
          {theadRow1}
          {theadRow2}
        </thead>
        <tbody>
          <tr className="gads-total-row-top">
            <td />
            <td colSpan={2}><strong>Total</strong></td>
            {metrics.map((m) => {
              const cv = m.pick(totalRow);
              const pv = totalPrev ? m.pick(totalPrev) : null;
              return (
                <React.Fragment key={m.key}>
                  <CompareCells m={m} currVal={cv} prevVal={pv} compareOn={compareOn} expanded={metricOpen[m.key]} />
                </React.Fragment>
              );
            })}
          </tr>
          {accounts.map((a) => {
            const isExp = expanded === a.customer_id;
            const campList = campaigns?.get(a.customer_id) || [];
            const hasCamps = campList.length > 0;
            const p = compareById?.get(a.customer_id);
            return (
              <React.Fragment key={a.customer_id}>
                <tr className={hasCamps ? 'gads-row-click' : ''} onClick={hasCamps ? () => toggleExpand(a.customer_id) : undefined}>
                  <td>{hasCamps && <span className="gads-expand-arrow">{isExp ? '▼' : '▶'}</span>}</td>
                  <td>{a.account_name}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{a.client_name}</td>
                  {metrics.map((m) => (
                    <React.Fragment key={m.key}>
                      <CompareCells m={m} currVal={m.pick(a)} prevVal={p ? m.pick(p) : null} compareOn={compareOn} expanded={metricOpen[m.key]} />
                    </React.Fragment>
                  ))}
                </tr>
                {isExp && campList.length > 0 && (
                  <tr className="admin-expand-row">
                    <td colSpan={colSpanTotal}>
                      <div style={{ paddingLeft: 32, paddingTop: 8, paddingBottom: 8 }}>
                        <table className="data-table gads-table" style={{ fontSize: 12 }}>
                          <thead><tr><th>Campaign</th><th className="text-right">Spend</th><th className="text-right">Clicks</th><th className="text-right">Conv.</th><th className="text-right">CPA</th></tr></thead>
                          <tbody>
                            {campList.slice(0, 20).map((c) => (
                              <tr key={c.campaign_id}><td>{c.campaign_name || '—'}</td><td className="text-right">{fU(c.cost)}</td><td className="text-right">{fI(c.clicks)}</td><td className="text-right">{fI(c.conversions)}</td><td className="text-right">{fU(c.cpa)}</td></tr>
                            ))}
                            {campList.length > 20 && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#999', fontSize: 11 }}>… and {campList.length - 20} more campaigns</td></tr>}
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
    </div></div></div>
  );
}
