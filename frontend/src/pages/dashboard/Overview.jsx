import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { AdminApi, AnalyticsApi, ClaimApi, MatchApi, NotificationApi, ReportApi, ReturnApi, VerificationApi } from '../../services/api';
import {
  Button,
  Card,
  ConfidenceBadge,
  EmptyState,
  ErrorState,
  Loading,
  StatCard,
  StatusBadge,
  Table,
  Timeline
} from '../../components/ui';
import { firstName, formatDate, formatDateTime, relativeTime, titleCase } from '../../utils/format';

/* ------------------------------------------------------------------ */
/* Student / faculty / staff overview                                  */
/* ------------------------------------------------------------------ */
function MemberOverview() {
  const { user, isVerified } = useAuth();
  const navigate = useNavigate();

  const reports = useApi(() => ReportApi.mine({ page_size: 50 }), []);
  const matches = useApi(() => MatchApi.mine(), []);
  const claims = useApi(() => ClaimApi.mine({ page_size: 20 }), []);
  const returns = useApi(() => ReturnApi.mine({ page_size: 10 }), []);
  const notifications = useApi(() => NotificationApi.list({ page_size: 5 }), []);
  const verification = useApi(() => VerificationApi.mine(), []);

  const items = reports.data?.items || [];
  const lost = items.filter((item) => item.report_type === 'lost');
  const found = items.filter((item) => item.report_type === 'found');
  const openClaims = (claims.data?.items || []).filter((claim) =>
    ['submitted', 'under_review', 'evidence_requested', 'approved'].includes(claim.status)
  );
  const nextCollection = (returns.data?.items || []).find((ret) =>
    ['scheduled', 'ready', 'owner_confirmed'].includes(ret.status)
  );
  const verificationStatus = verification.data?.status || user?.verification_status;

  return (
    <div>
      <div className="page-title-row">
        <div>
          <div className="eyebrow-text">{titleCase(user?.role_label || '')}</div>
          <h1 className="page-title">Welcome back, {firstName(user?.full_name)}</h1>
          <p className="page-subtitle">
            {user?.department} {user?.campus_id_number ? `• ${user.campus_id_number}` : ''} •{' '}
            <StatusBadge status={user?.account_status} label={titleCase(user?.account_status || '')} />
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={() => navigate('/report/lost')}>Report lost item</Button>
          <Button variant="forest" onClick={() => navigate('/report/found')}>Report found item</Button>
        </div>
      </div>

      {!isVerified ? (
        <div className="notice notice-warn" style={{ marginBottom: 18 }}>
          <span>
            Your campus identity is <strong>{titleCase(verificationStatus || 'not submitted')}</strong>. Claims and
            collections unlock once an administrator verifies your identity.{' '}
            <Link to="/dashboard/verification" className="link-plain">Open verification →</Link>
          </span>
        </div>
      ) : null}

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <StatCard label="My lost reports" value={lost.length} hint={`${lost.filter((i) => i.status === 'matched').length} with a match`} tone="accent" />
        <StatCard label="My found reports" value={found.length} hint="Items I logged into custody" />
        <StatCard label="Active claims" value={openClaims.length} hint="Awaiting or approved" tone="ochre" />
        <StatCard
          label="Notifications"
          value={notifications.data?.unread ?? 0}
          hint="Unread in-app alerts"
          tone="sage"
        />
      </div>

      {nextCollection ? (
        <Card style={{ padding: 20, marginBottom: 20, borderColor: 'var(--brand-accent)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div className="eyebrow-text">Next collection</div>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>{nextCollection.found_report?.title}</h3>
              <p className="small" style={{ color: 'var(--ink-secondary)' }}>
                {formatDateTime(nextCollection.scheduled_at)} • {nextCollection.collection_location || 'Custody desk'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <StatusBadge status={nextCollection.status} label={titleCase(nextCollection.status)} />
              <Button variant="primary" size="sm" onClick={() => navigate('/dashboard/returns')}>
                View collection
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 20 }} className="overview-grid">
        <Card style={{ padding: 20 }}>
          <div className="panel-title">
            Recent reports
            <Link to="/dashboard/reports/lost" className="btn-link">View all</Link>
          </div>
          {reports.loading ? <Loading rows={3} /> : null}
          {reports.error ? <ErrorState error={reports.error} onRetry={reports.reload} /> : null}
          {!reports.loading && items.length === 0 ? (
            <EmptyState
              title="No reports yet"
              message="File a lost or found report to start the matching process."
              action={<Button variant="primary" size="sm" onClick={() => navigate('/report/lost')}>Report an item</Button>}
            />
          ) : null}
          {items.length > 0 ? (
            <Table columns={['Report', 'Type', 'Status', 'Date']}>
              {items.slice(0, 6).map((item) => (
                <tr key={item.id}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{item.title}</div>
                    <div className="mono xs muted">{item.report_code}</div>
                  </td>
                  <td><StatusBadge status={item.report_type} /></td>
                  <td><StatusBadge status={item.status} label={item.status_label} /></td>
                  <td className="tabular xs">{formatDate(item.reported_at)}</td>
                </tr>
              ))}
            </Table>
          ) : null}
        </Card>

        <div style={{ display: 'grid', gap: 16 }}>
          <Card style={{ padding: 20 }}>
            <div className="panel-title">
              Matches
              <Link to="/dashboard/matches" className="btn-link">All</Link>
            </div>
            {matches.loading ? <Loading rows={2} /> : null}
            {!matches.loading && (matches.data?.items || []).length === 0 ? (
              <p className="small muted">No attribute matches yet. The engine re-scores reports as new items arrive.</p>
            ) : null}
            <div className="list-stack">
              {(matches.data?.items || []).slice(0, 3).map((match) => (
                <div key={match.id} style={{ border: '1px solid var(--border-hairline)', borderRadius: 8, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong style={{ fontSize: 12.5 }}>{match.found.title || match.found.report_code}</strong>
                    <ConfidenceBadge confidence={match.confidence} score={match.score} />
                  </div>
                  <div className="xs muted" style={{ marginTop: 4 }}>
                    {match.reasons?.slice(0, 2).join(' • ') || 'Attribute similarity detected'}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card style={{ padding: 20 }}>
            <div className="panel-title">
              Latest notifications
              <Link to="/dashboard/notifications" className="btn-link">All</Link>
            </div>
            <div className="list-stack">
              {(notifications.data?.items || []).slice(0, 4).map((item) => (
                <div key={item.id}>
                  <div className="notif-type">{titleCase(item.type)}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{item.title}</div>
                  <div className="xs muted tabular">{relativeTime(item.date)}</div>
                </div>
              ))}
              {(notifications.data?.items || []).length === 0 ? <p className="small muted">No notifications yet.</p> : null}
            </div>
          </Card>
        </div>
      </div>

      <style>{`@media (max-width: 1080px) { .overview-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Security custody desk                                              */
/* ------------------------------------------------------------------ */
function SecurityOverview() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(() => AdminApi.securityDashboard(), []);

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const stats = data?.stats || {};
  const custody = data?.custody_items || [];
  const returns = data?.upcoming_returns || [];

  return (
    <div>
      <div className="page-title-row">
        <div>
          <div className="eyebrow-text">Custody operations</div>
          <h1 className="page-title">Custody desk overview</h1>
          <p className="page-subtitle">
            Items in safe custody, pending claims and scheduled handovers for your campus.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={() => navigate('/dashboard/intake')}>Found item intake</Button>
          <Button variant="secondary" onClick={() => navigate('/dashboard/scan')}>Scan QR pass</Button>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <StatCard label="Items in custody" value={stats.in_custody ?? 0} tone="accent" hint="Awaiting owner verification" />
        <StatCard label="Claims to review" value={stats.claims_pending ?? 0} tone="ochre" hint="Ownership pending" />
        <StatCard label="Collections today" value={stats.returns_today ?? 0} tone="sage" hint="Scheduled handovers" />
        <StatCard label="Handed over" value={stats.handed_over ?? 0} hint="Completed returns" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 20 }} className="overview-grid">
        <Card style={{ padding: 20 }}>
          <div className="panel-title">
            Deposited items
            <Link to="/dashboard/custody" className="btn-link">Open vault</Link>
          </div>
          {custody.length === 0 ? (
            <EmptyState title="Vault is clear" message="No found items are currently awaiting a claim." />
          ) : (
            <Table columns={['Item', 'Custody location', 'Status', 'Logged']}>
              {custody.slice(0, 8).map((item) => (
                <tr key={item.id}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{item.title}</div>
                    <div className="mono xs muted">{item.report_code}</div>
                  </td>
                  <td className="xs">{item.custody_location || '—'}</td>
                  <td><StatusBadge status={item.status} /></td>
                  <td className="tabular xs">{formatDate(item.created_at)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <div style={{ display: 'grid', gap: 16 }}>
          <Card style={{ padding: 20 }}>
            <div className="panel-title">
              Upcoming collections
              <Link to="/dashboard/returns" className="btn-link">Manage</Link>
            </div>
            {returns.length === 0 ? <p className="small muted">No collections scheduled.</p> : null}
            <div className="list-stack">
              {returns.map((item) => (
                <div key={item.id} style={{ border: '1px solid var(--border-hairline)', borderRadius: 8, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong style={{ fontSize: 12.5 }}>{item.return_code}</strong>
                    <StatusBadge status={item.status} label={titleCase(item.status)} />
                  </div>
                  <div className="xs" style={{ marginTop: 4 }}>{item.title}</div>
                  <div className="xs muted tabular">{formatDateTime(item.scheduled_at)} • {item.location || 'Desk'}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card style={{ padding: 20 }}>
            <div className="panel-title">Storage locations</div>
            <div className="kv-list">
              {(data?.storage_locations || []).map((location) => (
                <div className="kv-row" key={location.id}>
                  <div className="kv-key">{location.zone || 'Campus'}</div>
                  <div style={{ fontSize: 12.5 }}>
                    {location.name} <span className="muted xs">• {location.locker_count} lockers</span>
                  </div>
                </div>
              ))}
              {(data?.storage_locations || []).length === 0 ? <p className="small muted">No storage locations configured.</p> : null}
            </div>
          </Card>
        </div>
      </div>
      <style>{`@media (max-width: 1080px) { .overview-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* University admin                                                   */
/* ------------------------------------------------------------------ */
function AdminOverview() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(() => AdminApi.dashboard(), []);

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const overview = data?.overview || {};
  const queue = data?.queue || {};

  return (
    <div>
      <div className="page-title-row">
        <div>
          <div className="eyebrow-text">University administration</div>
          <h1 className="page-title">Operations dashboard</h1>
          <p className="page-subtitle">Live counts from your institution's registry — no sample or estimated figures.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={() => navigate('/dashboard/verifications')}>
            Verification queue ({(queue.verifications?.total ?? 0)})
          </Button>
          <Button variant="secondary" onClick={() => navigate('/dashboard/analytics')}>Analytics</Button>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <StatCard label="Total reports" value={overview.reports?.total ?? 0} hint={`${overview.reports?.lost ?? 0} lost • ${overview.reports?.found ?? 0} found`} />
        <StatCard label="In custody" value={overview.outcomes?.in_custody ?? 0} tone="accent" hint="Awaiting verification" />
        <StatCard label="Returned" value={overview.outcomes?.returned ?? 0} tone="sage" hint={`Recovery rate ${overview.outcomes?.recovery_rate_percent ?? 0}%`} />
        <StatCard label="Verified users" value={overview.people?.verified_users ?? 0} tone="ochre" hint={`of ${overview.people?.total_users ?? 0} accounts`} />
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <Card style={{ padding: 20 }}>
          <div className="panel-title">
            Identity verification queue
            <Link to="/dashboard/verifications" className="btn-link">Review all</Link>
          </div>
          {(queue.verifications?.items || []).length === 0 ? (
            <p className="small muted">No pending applications.</p>
          ) : (
            <div className="list-stack">
              {queue.verifications.items.map((application) => (
                <div key={application.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', borderBottom: '1px solid var(--border-hairline)', paddingBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{application.applicant?.name}</div>
                    <div className="xs muted">
                      {application.campus_id_number} • {titleCase(application.requested_role)}
                    </div>
                  </div>
                  <StatusBadge status={application.status} label={titleCase(application.status)} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card style={{ padding: 20 }}>
          <div className="panel-title">
            Claims awaiting review
            <Link to="/dashboard/claims" className="btn-link">Open claims</Link>
          </div>
          {(queue.claims || []).length === 0 ? (
            <p className="small muted">No open claims.</p>
          ) : (
            <div className="list-stack">
              {queue.claims.map((claim) => (
                <div key={claim.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', borderBottom: '1px solid var(--border-hairline)', paddingBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{claim.claim_code}</div>
                    <div className="xs muted">{claim.report_code} • {claim.title}</div>
                  </div>
                  <StatusBadge status={claim.status} label={titleCase(claim.status)} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid-2">
        <Card style={{ padding: 20 }}>
          <div className="panel-title">
            Suggested matches
            <Link to="/dashboard/matches" className="btn-link">Review</Link>
          </div>
          {(queue.matches || []).length === 0 ? (
            <p className="small muted">No unreviewed matches.</p>
          ) : (
            <Table columns={['Lost', 'Found', 'Score']}>
              {queue.matches.map((match) => (
                <tr key={match.id}>
                  <td className="mono xs">{match.lost_code}</td>
                  <td className="mono xs">{match.found_code}</td>
                  <td><ConfidenceBadge confidence={match.confidence} score={match.score} /></td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card style={{ padding: 20 }}>
          <div className="panel-title">
            Scheduled returns
            <Link to="/dashboard/returns" className="btn-link">Manage</Link>
          </div>
          {(queue.returns || []).length === 0 ? (
            <p className="small muted">No scheduled collections.</p>
          ) : (
            <Table columns={['Return', 'Status', 'Scheduled']}>
              {queue.returns.map((ret) => (
                <tr key={ret.id}>
                  <td className="mono xs">{ret.return_code}</td>
                  <td><StatusBadge status={ret.status} /></td>
                  <td className="tabular xs">{formatDateTime(ret.scheduled_at)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Platform admin                                                     */
/* ------------------------------------------------------------------ */
function PlatformOverview() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(() => AdminApi.platformUniversities(), []);

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const overview = data?.overview || {};
  const totals = overview.totals || {};

  return (
    <div>
      <div className="page-title-row">
        <div>
          <div className="eyebrow-text">Platform operations</div>
          <h1 className="page-title">Multi-university overview</h1>
          <p className="page-subtitle">Aggregate figures across every onboarded tenant.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={() => navigate('/dashboard/platform/onboarding')}>Onboard university</Button>
          <Button variant="secondary" onClick={() => navigate('/dashboard/platform/analytics')}>Platform analytics</Button>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <StatCard label="Universities" value={totals.universities ?? 0} hint={`${totals.active_universities ?? 0} active`} />
        <StatCard label="Accounts" value={totals.users ?? 0} tone="sage" hint="Across all tenants" />
        <StatCard label="Reports" value={totals.reports ?? 0} tone="accent" hint="All institutions" />
        <StatCard label="Returned" value={totals.returned ?? 0} tone="ochre" hint="Completed handovers" />
      </div>

      <Card style={{ padding: 20 }}>
        <div className="panel-title">
          Institutions
          <Link to="/dashboard/platform/universities" className="btn-link">Manage</Link>
        </div>
        <Table columns={['University', 'Code', 'Status', 'Users', 'Reports', 'Pending verifications']}>
          {(overview.universities || []).map((university) => (
            <tr key={university.id}>
              <td style={{ fontWeight: 600, fontSize: 13 }}>{university.name}</td>
              <td className="mono xs">{university.code}</td>
              <td><StatusBadge status={university.status} label={titleCase(university.status)} /></td>
              <td className="tabular">{university.users}</td>
              <td className="tabular">{university.reports}</td>
              <td className="tabular">{university.pending_verifications}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

export default function Overview() {
  const { role } = useAuth();
  if (role === 'platform_admin') return <PlatformOverview />;
  if (role === 'university_admin') return <AdminOverview />;
  if (role === 'security_personnel') return <SecurityOverview />;
  return <MemberOverview />;
}
