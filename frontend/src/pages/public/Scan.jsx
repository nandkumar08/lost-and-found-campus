import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { QrApi } from '../../services/api';
import { Button, Card, Field, Input, StatusBadge, Timeline } from '../../components/ui';
import { formatDate } from '../../utils/format';

/**
 * Public QR resolver. Scanning a custody pass reveals ONLY public-safe data:
 * report code, type, title, status and timeline. Officers who are signed in see
 * the custody details (handled server-side).
 */
export default function Scan() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState(searchParams.get('qr') || '');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const resolve = async (value) => {
    if (!value || value.length < 8) {
      setError('Enter the token encoded in the QR code.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await QrApi.scan(value);
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initial = searchParams.get('qr');
    if (initial) resolve(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container" style={{ paddingTop: 36, paddingBottom: 60, maxWidth: 780 }}>
      <div className="eyebrow-text">Custody verification</div>
      <h1 className="page-title" style={{ marginBottom: 6 }}>
        Scan or resolve a QR pass
      </h1>
      <p className="page-subtitle" style={{ marginBottom: 22 }}>
        QR passes encode a secure token only. Nothing personal, no serial numbers and no storage locations are
        embedded in the code itself.
      </p>

      <Card style={{ padding: 22, marginBottom: 20 }}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            resolve(token);
          }}
          style={{ display: 'grid', gap: 14 }}
        >
          <Field label="QR token" htmlFor="qr-token" hint="Paste the token from the scanned link, or open the link directly.">
            <Input id="qr-token" className="mono" value={token} onChange={(event) => setToken(event.target.value.trim())} placeholder="Opened automatically when scanning" />
          </Field>
          {error ? (
            <div className="notice notice-danger" role="alert">
              <span>{error}</span>
            </div>
          ) : null}
          <div>
            <Button variant="primary" type="submit" loading={loading}>
              Resolve pass
            </Button>
          </div>
        </form>
      </Card>

      {result ? (
        <Card style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div className="eyebrow-text">Verified custody pass</div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--brand-primary)' }}>{result.report.report_code}</h2>
            </div>
            <StatusBadge status={result.report.status} label={result.report.status_label} />
          </div>

          <div className="kv-list">
            <div className="kv-row">
              <div className="kv-key">Item</div>
              <div>{result.report.title}</div>
            </div>
            <div className="kv-row">
              <div className="kv-key">Type</div>
              <div>{result.report.report_type === 'lost' ? 'Lost report' : 'Found property'}</div>
            </div>
            <div className="kv-row">
              <div className="kv-key">Category</div>
              <div>{result.report.category || 'Uncategorised'}</div>
            </div>
            <div className="kv-row">
              <div className="kv-key">Incident date</div>
              <div className="tabular">{formatDate(result.report.incident_date)}</div>
            </div>
            <div className="kv-row">
              <div className="kv-key">Scans recorded</div>
              <div className="tabular">{result.scan_count}</div>
            </div>
          </div>

          {result.officer_view ? (
            <div className="panel" style={{ marginTop: 18 }}>
              <div className="panel-title">Officer view</div>
              <div className="kv-list">
                <div className="kv-row">
                  <div className="kv-key">Custody location</div>
                  <div>{result.officer_view.custody_location || '—'}</div>
                </div>
                <div className="kv-row">
                  <div className="kv-key">Confidential marks</div>
                  <div>{result.officer_view.confidential_marks || '—'}</div>
                </div>
                <div className="kv-row">
                  <div className="kv-key">Reporter</div>
                  <div>
                    {result.officer_view.reporter_name || '—'} • {result.officer_view.reporter_email || ''}
                  </div>
                </div>
                <div className="kv-row">
                  <div className="kv-key">Claims</div>
                  <div>
                    {result.officer_view.claims?.length
                      ? result.officer_view.claims.map((claim) => `${claim.claim_code} (${claim.status})`).join(', ')
                      : 'No claims filed'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="notice notice-info" style={{ marginTop: 18 }}>
              <span>
                Signed-in custody officers see the private custody details after scanning. Personal information is
                never exposed to public scans.
              </span>
            </div>
          )}

          <div className="panel" style={{ marginTop: 18 }}>
            <div className="panel-title">Timeline</div>
            <Timeline items={result.timeline || []} />
          </div>

          <div style={{ marginTop: 18 }}>
            <Button variant="secondary" onClick={() => navigate(`/track?code=${result.report.report_code}`)}>
              Track this report
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
