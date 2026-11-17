import React from 'react';
import { useApi } from '../../hooks/useApi';
import { AnalyticsApi } from '../../services/api';
import { Card, ErrorState, Loading, StatCard, Table, ProgressBar } from '../../components/ui';
import { titleCase } from '../../utils/format';

function BarList({ rows, accent = false, valueKey = 'total' }) {
  const max = Math.max(1, ...rows.map((row) => row[valueKey] || 0));
  if (!rows.length) return <p className="small muted">No data recorded yet.</p>;
  return (
    <div>
      {rows.map((row, index) => (
        <div className="bar-row" key={`${row.label}-${index}`}>
          <span style={{ textTransform: 'capitalize' }}>{String(row.label).replace(/_/g, ' ')}</span>
          <div className="bar-track">
            <div className={`bar-fill ${accent ? 'accent' : ''}`} style={{ width: `${((row[valueKey] || 0) / max) * 100}%` }} />
          </div>
          <span className="tabular">{row[valueKey] || 0}</span>
        </div>
      ))}
    </div>
  );
}

export default function Analytics() {
  const { data, loading, error, reload } = useApi(() => AnalyticsApi.university(), []);

  if (loading) return <Loading rows={5} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const overview = data?.overview || {};
  const monthly = data?.monthly || [];
  const maxMonthly = Math.max(1, ...monthly.map((row) => row.total));

  return (
    <div>
      <div className="page-title-row">
        <div>
          <div className="eyebrow-text">Institution analytics</div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">
            All figures are computed from live database aggregates for your university. No estimated or demo values.
          </p>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <StatCard label="Total reports" value={overview.reports?.total ?? 0} hint={`${overview.reports?.lost ?? 0} lost • ${overview.reports?.found ?? 0} found`} />
        <StatCard label="Returned" value={overview.outcomes?.returned ?? 0} tone="sage" hint={`Recovery rate ${overview.outcomes?.recovery_rate_percent ?? 0}%`} />
        <StatCard label="Open claims" value={overview.pipeline?.open_claims ?? 0} tone="ochre" hint="Awaiting officer review" />
        <StatCard label="Avg match score" value={`${data?.matches?.average_score ?? 0}%`} tone="accent" hint={`${data?.matches?.total_matches ?? 0} scored pairs`} />
      </div>

      <div className="grid-2">
        <Card style={{ padding: 22 }}>
          <div className="panel-title">Reports by category</div>
          <BarList rows={data?.by_category || []} />
        </Card>

        <Card style={{ padding: 22 }}>
          <div className="panel-title">Reports by location</div>
          <BarList rows={data?.by_location || []} accent />
        </Card>
      </div>

      <Card style={{ padding: 22, marginTop: 20 }}>
        <div className="panel-title">Monthly volume</div>
        {monthly.length === 0 ? (
          <p className="small muted">No reports in the last six months.</p>
        ) : (
          <>
            <div className="trend-chart">
              {monthly.map((row) => (
                <div className="trend-col" key={row.month}>
                  <div className="trend-bars">
                    <div className="trend-bar" title={`${row.lost} lost`} style={{ height: `${(row.lost / maxMonthly) * 100}%` }} />
                    <div className="trend-bar found" title={`${row.found} found`} style={{ height: `${(row.found / maxMonthly) * 100}%` }} />
                  </div>
                  <span className="trend-label">{row.month.slice(2)}</span>
                </div>
              ))}
            </div>
            <div className="chart-legend" style={{ marginTop: 10 }}>
              <span><span className="legend-dot" style={{ background: 'var(--brand-primary)' }} />Lost</span>
              <span><span className="legend-dot" style={{ background: 'var(--brand-accent)' }} />Found</span>
            </div>
          </>
        )}
      </Card>

      <div className="grid-2" style={{ marginTop: 20 }}>
        <Card style={{ padding: 22 }}>
          <div className="panel-title">Match performance</div>
          <div className="kv-list">
            <div className="kv-row"><div className="kv-key">Total matches</div><div className="tabular">{data?.matches?.total_matches ?? 0}</div></div>
            <div className="kv-row"><div className="kv-key">Average score</div><div className="tabular">{data?.matches?.average_score ?? 0}%</div></div>
            {Object.entries(data?.matches?.by_confidence || {}).map(([key, value]) => (
              <div className="kv-row" key={key}>
                <div className="kv-key">{titleCase(key)} confidence</div>
                <div className="tabular">{value}</div>
              </div>
            ))}
            {Object.entries(data?.matches?.by_status || {}).map(([key, value]) => (
              <div className="kv-row" key={key}>
                <div className="kv-key">{titleCase(key)}</div>
                <div className="tabular">{value}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card style={{ padding: 22 }}>
          <div className="panel-title">Verification funnel</div>
          <BarList rows={data?.verifications || []} />
        </Card>
      </div>

      <Card style={{ padding: 22, marginTop: 20 }}>
        <div className="panel-title">Report status distribution</div>
        <Table columns={['Status', 'Reports', 'Share']}>
          {(data?.by_status || []).map((row) => {
            const total = (data?.by_status || []).reduce((sum, item) => sum + item.total, 0) || 1;
            return (
              <tr key={row.label}>
                <td style={{ textTransform: 'capitalize' }}>{String(row.label).replace(/_/g, ' ')}</td>
                <td className="tabular">{row.total}</td>
                <td style={{ minWidth: 180 }}>
                  <ProgressBar value={(row.total / total) * 100} />
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </div>
  );
}
