import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ReportApi } from '../../services/api';
import { useUniversity } from '../../context/UniversityContext';
import { Button, Card, Field, Input, StatusBadge, Timeline } from '../../components/ui';
import { formatDate, formatDateTime } from '../../utils/format';

export default function Track() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { active } = useUniversity();
  const [code, setCode] = useState(searchParams.get('code') || '');
  const [token, setToken] = useState(searchParams.get('token') || '');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const lookup = async (reportCode, trackingToken) => {
    if (!reportCode || reportCode.trim().length < 3) {
      setError('Enter a valid report ID.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await ReportApi.track({
        code: reportCode.trim().toUpperCase(),
        token: trackingToken || undefined,
        university_code: active?.code
      });
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialCode = searchParams.get('code');
    const initialToken = searchParams.get('token');
    if (initialCode) lookup(initialCode, initialToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (event) => {
    event.preventDefault();
    const next = new URLSearchParams();
    if (code) next.set('code', code.trim().toUpperCase());
    if (token) next.set('token', token.trim());
    setSearchParams(next, { replace: true });
    lookup(code, token);
  };

  return (
    <div className="container" style={{ paddingTop: 36, paddingBottom: 60, maxWidth: 880 }}>
      <div className="eyebrow-text">Report tracking</div>
      <h1 className="page-title" style={{ marginBottom: 6 }}>
        Track a report
      </h1>
      <p className="page-subtitle" style={{ marginBottom: 22 }}>
        Enter the report ID from your confirmation screen. Add the tracking token from your QR pass to unlock the
        detailed timeline. Without the token only the current status is shown.
      </p>

      <Card style={{ padding: 22, marginBottom: 22 }}>
        <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
          <div className="grid-2">
            <Field label="Report ID" required htmlFor="report-code" hint="Format: ADTU-LF-1001">
              <Input
                id="report-code"
                className="input tabular mono"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder={`${active?.code || 'ADTU'}-LF-1001`}
              />
            </Field>
            <Field label="Tracking token (optional)" htmlFor="tracking-token" hint="Printed beneath the QR code on your confirmation pass.">
              <Input
                id="tracking-token"
                className="input mono"
                value={token}
                onChange={(event) => setToken(event.target.value.trim())}
                placeholder="64-character token"
              />
            </Field>
          </div>
          {error ? (
            <div className="notice notice-danger" role="alert">
              <span>{error}</span>
            </div>
          ) : null}
          <div>
            <Button variant="primary" type="submit" loading={loading}>
              Look up report
            </Button>
          </div>
        </form>
      </Card>

      {result ? (
        <Card style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div className="eyebrow-text">{result.report.report_code}</div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--brand-primary)' }}>{result.report.title}</h2>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <StatusBadge status={result.report.report_type} label={result.report.report_type === 'lost' ? 'Lost' : 'Found'} />
              <StatusBadge status={result.report.status} label={result.report.status_label} />
            </div>
          </div>

          {result.mode === 'status_only' ? (
            <div className="notice notice-info" style={{ marginBottom: 16 }}>
              <span>{result.hint}</span>
            </div>
          ) : null}

          <div className="kv-list" style={{ marginBottom: 20 }}>
            <div className="kv-row">
              <div className="kv-key">Category</div>
              <div>{result.report.category || 'Not categorised'}</div>
            </div>
            <div className="kv-row">
              <div className="kv-key">Location</div>
              <div>{result.report.location || 'Not specified'}</div>
            </div>
            <div className="kv-row">
              <div className="kv-key">Incident date</div>
              <div className="tabular">{formatDate(result.report.incident_date)}</div>
            </div>
            <div className="kv-row">
              <div className="kv-key">Reported</div>
              <div className="tabular">{formatDateTime(result.report.reported_at)}</div>
            </div>
            {result.report.custody_location ? (
              <div className="kv-row">
                <div className="kv-key">Custody location</div>
                <div>{result.report.custody_location}</div>
              </div>
            ) : null}
            {result.report.contact_email_masked ? (
              <div className="kv-row">
                <div className="kv-key">Contact (masked)</div>
                <div>
                  {result.report.contact_email_masked}
                  {result.report.contact_phone_masked ? ` • ${result.report.contact_phone_masked}` : ''}
                </div>
              </div>
            ) : null}
          </div>

          {result.match_summary?.length ? (
            <div className="panel" style={{ marginBottom: 20 }}>
              <div className="panel-title">Matching engine signals</div>
              <div className="list-stack">
                {result.match_summary.map((match, index) => (
                  <div key={index} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
                    <span>
                      Candidate pair #{index + 1} • {Math.round(match.score)}% similarity
                    </span>
                    <StatusBadge status={match.status} label={match.status} />
                  </div>
                ))}
              </div>
              <p className="xs muted" style={{ marginTop: 8 }}>
                A match is a lead only. A custody officer verifies ownership before any handover.
              </p>
            </div>
          ) : null}

          <div className="panel">
            <div className="panel-title">Status timeline</div>
            <Timeline items={result.timeline || []} />
          </div>

          {result.campus_contact ? (
            <p className="small muted" style={{ marginTop: 16 }}>
              Questions? Contact {result.campus_contact.university} custody desk
              {result.campus_contact.email ? ` • ${result.campus_contact.email}` : ''}
              {result.campus_contact.phone ? ` • ${result.campus_contact.phone}` : ''}
            </p>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
