import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { useUniversity } from '../../context/UniversityContext';
import { ReportApi } from '../../services/api';
import { Button, Card, ErrorState, Loading, StatusBadge, Timeline } from '../../components/ui';
import { ItemIllustration, iconForCategory } from '../../components/ItemIllustration';
import { formatDate, formatDateTime, formatTime } from '../../utils/format';

export default function ItemDetail() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { active } = useUniversity();
  const { isAuthed, isVerified, user } = useAuth();

  const { data, loading, error, reload } = useApi(
    () => ReportApi.detail(code, active?.code),
    [code, active?.code]
  );

  if (loading) {
    return (
      <div className="container" style={{ padding: '40px 24px' }}>
        <Loading rows={4} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="container" style={{ padding: '40px 24px', maxWidth: 720 }}>
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }

  const item = data;
  const isFound = item.report_type === 'found';

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 56 }}>
      <button type="button" className="btn-link" onClick={() => navigate(-1)} style={{ marginBottom: 16 }}>
        ← Back to registry
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)', gap: 24 }} className="detail-grid">
        <div>
          <Card style={{ overflow: 'hidden' }}>
            <div style={{ height: 280, background: 'var(--bg-linen)' }}>
              {item.images?.[0]?.url ? (
                <img src={item.images[0].url} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
                  <ItemIllustration iconType={iconForCategory(item.category)} />
                </div>
              )}
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                <StatusBadge status={item.report_type} label={isFound ? 'Found item' : 'Lost item'} />
                <StatusBadge status={item.status} label={item.status_label} />
                <span className="tabular mono xs muted">{item.report_code}</span>
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--brand-primary)', marginBottom: 10 }}>{item.title}</h1>
              <p style={{ fontSize: 14, color: 'var(--ink-secondary)', marginBottom: 18 }}>{item.description}</p>

              <div className="kv-list">
                <div className="kv-row">
                  <div className="kv-key">Category</div>
                  <div>{item.category || 'Not categorised'}</div>
                </div>
                <div className="kv-row">
                  <div className="kv-key">Colour</div>
                  <div>{item.colour || 'Not stated'}</div>
                </div>
                <div className="kv-row">
                  <div className="kv-key">Brand</div>
                  <div>{item.brand || 'Not stated'}</div>
                </div>
                <div className="kv-row">
                  <div className="kv-key">{isFound ? 'Found on' : 'Lost on'}</div>
                  <div className="tabular">
                    {formatDate(item.incident_date)} {item.incident_time ? `• ${formatTime(item.incident_time)}` : ''}
                  </div>
                </div>
                <div className="kv-row">
                  <div className="kv-key">Location</div>
                  <div>
                    {item.location || 'Not specified'}
                    {item.zone ? <span className="muted"> • {item.zone}</span> : null}
                  </div>
                </div>
                <div className="kv-row">
                  <div className="kv-key">Reported</div>
                  <div className="tabular">{formatDateTime(item.reported_at)}</div>
                </div>
                <div className="kv-row">
                  <div className="kv-key">Institution</div>
                  <div>{item.university_name}</div>
                </div>
              </div>

              {item.images?.length > 1 ? (
                <div style={{ marginTop: 18 }}>
                  <div className="field-label" style={{ marginBottom: 8 }}>
                    <span>Additional photographs</span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {item.images.slice(1).map((image) => (
                      <img
                        key={image.id}
                        src={image.url}
                        alt="Reported item"
                        style={{ width: 104, height: 78, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border-strong)' }}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </Card>

          <Card style={{ padding: 22, marginTop: 20 }}>
            <div className="panel-title">Custody timeline</div>
            <Timeline items={data.timeline || []} />
          </Card>
        </div>

        <div>
          <Card style={{ padding: 22, marginBottom: 18 }}>
            <div className="panel-title">Ownership &amp; collection</div>
            <div className="privacy-shield" style={{ marginBottom: 14 }}>
              <span aria-hidden="true">🛡</span>
              <div>
                <strong style={{ display: 'block', marginBottom: 2 }}>Confidential details withheld</strong>
                Private identifying marks, the exact custody locker and contact information are visible only to
                the reporting party and campus custody officers.
              </div>
            </div>

            {isFound ? (
              <>
                <p style={{ fontSize: 13, color: 'var(--ink-secondary)', marginBottom: 14 }}>
                  Think this is yours? Sign in with your verified campus account and submit a claim. An officer
                  compares your private description with the marks recorded at intake.
                </p>
                {!isAuthed ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <Button variant="primary" onClick={() => navigate('/login', { state: { from: `/items/${item.report_code}` } })}>
                      Sign in to claim
                    </Button>
                    <Button variant="secondary" onClick={() => navigate('/register')}>
                      Register your campus account
                    </Button>
                  </div>
                ) : !isVerified ? (
                  <div className="notice notice-warn">
                    <span>
                      Your campus identity is <strong>{user?.verification_status?.replace('_', ' ') || 'not verified'}</strong>.
                      Claims unlock once an administrator verifies your identity.
                    </span>
                  </div>
                ) : item.status === 'returned' || item.status === 'closed' ? (
                  <div className="notice notice-info">
                    <span>This item has already been returned to its owner and is closed.</span>
                  </div>
                ) : (
                  <Button variant="primary" style={{ width: '100%' }} onClick={() => navigate(`/claim/${item.report_code}`)}>
                    Submit ownership claim
                  </Button>
                )}
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, color: 'var(--ink-secondary)', marginBottom: 14 }}>
                  If you have found this item, hand it to the nearest custody desk. The reporter has been notified
                  of any plausible matches by the matching engine.
                </p>
                <Button variant="forest" style={{ width: '100%' }} onClick={() => navigate('/report/found')}>
                  I found a matching item
                </Button>
              </>
            )}
          </Card>

          <Card style={{ padding: 22 }}>
            <div className="panel-title">Need help?</div>
            <p style={{ fontSize: 13, color: 'var(--ink-secondary)', marginBottom: 12 }}>
              Contact the {item.campus_contact?.university || 'campus'} custody desk with your report ID.
            </p>
            <div className="kv-list">
              <div className="kv-row">
                <div className="kv-key">Email</div>
                <div style={{ wordBreak: 'break-all' }}>{item.campus_contact?.email || 'Not published'}</div>
              </div>
              <div className="kv-row">
                <div className="kv-key">Phone</div>
                <div>{item.campus_contact?.phone || 'Not published'}</div>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <Link to={`/track?code=${item.report_code}`} className="link-plain">
                Track this report →
              </Link>
            </div>
          </Card>
        </div>
      </div>

      <style>{`
        @media (max-width: 980px) {
          .detail-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
