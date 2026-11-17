import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { useUniversity } from '../../context/UniversityContext';
import { useToast } from '../../context/ToastContext';
import { CatalogApi, ClaimApi, MatchApi, ReportApi, ReturnApi } from '../../services/api';
import {
  Button,
  Card,
  ConfidenceBadge,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  Select,
  StatusBadge,
  Table,
  Textarea
} from '../../components/ui';
import { ImageUploader } from '../../components/ImageUploader';
import { formatDate, formatDateTime, titleCase } from '../../utils/format';

/* ================================================================== */
/* Claim submission (owner)                                            */
/* ================================================================== */
export function ClaimSubmit() {
  const { code } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { active } = useUniversity();
  const { isVerified, user } = useAuth();

  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [answer, setAnswer] = useState('');
  const [lostReportId, setLostReportId] = useState('');
  const [files, setFiles] = useState([]);
  const [note, setNote] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const publicDetail = await ReportApi.detail(code, active?.code);
        const claimable = await ClaimApi.claimable(publicDetail.id);
        if (cancelled) return;
        setContext(claimable);
        // Suggest the claimant's own matched lost reports for this item.
        // (The engine's staff-only candidate ranking is not exposed to members.)
        try {
          const mine = await MatchApi.mine();
          if (!cancelled) {
            const related = (mine.items || []).filter(
              (match) => match.found_report?.report_code === publicDetail.report_code ||
                match.found_code === publicDetail.report_code
            );
            setCandidates(related.slice(0, 4).map((match) => ({
              report_id: match.lost_report?.report_code || match.lost_code,
              report_code: match.lost_report?.report_code || match.lost_code,
              title: match.lost_report?.title || match.lost_title || 'Your lost report',
              score: match.score,
              confidence: match.confidence
            })));
          }
        } catch (_) {
          /* suggestions are optional */
        }
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, active?.code]);

  const submit = async (event) => {
    event.preventDefault();
    if (answer.trim().length < 15) {
      toast.error('Describe the private identifying detail in at least 15 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = new FormData();
      payload.append('found_report_id', context.report.id);
      payload.append('identifying_answer', answer.trim());
      if (lostReportId) payload.append('lost_report_id', lostReportId);
      if (note) payload.append('evidence_note', note);
      files.forEach((file) => payload.append('evidence', file));
      const claim = await ClaimApi.submit(payload);
      toast.success(`Claim ${claim.claim_code} submitted for verification.`);
      navigate('/dashboard/claims');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorState error={error} onRetry={() => window.location.reload()} />;

  const report = context.report;
  const existing = context.existing_claim;

  return (
    <div style={{ maxWidth: 880 }}>
      <button type="button" className="btn-link" onClick={() => navigate(-1)} style={{ marginBottom: 14 }}>
        ← Back
      </button>
      <div className="eyebrow-text">Ownership claim</div>
      <h1 className="page-title" style={{ marginBottom: 6 }}>Claim: {report.title}</h1>
      <p className="page-subtitle" style={{ marginBottom: 18 }}>
        Report {report.report_code} • {report.category} • found {formatDate(report.incident_date)}
      </p>

      {existing ? (
        <div className="notice notice-warn" style={{ marginBottom: 16 }}>
          <span>
            You already filed claim <strong>{existing.claim_code}</strong> ({existing.status.replace('_', ' ')}).{' '}
            <Link to="/dashboard/claims" className="link-plain">View your claims →</Link>
          </span>
        </div>
      ) : null}

      {!isVerified ? (
        <div className="notice notice-danger" style={{ marginBottom: 16 }}>
          <span>
            Your campus identity is not verified yet, so claims are disabled.{' '}
            <Link to="/dashboard/verification" className="link-plain">Complete verification →</Link>
          </span>
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 20 }} className="claim-grid">
        <Card style={{ padding: 24 }}>
          <form onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
            <Field
              label="Private identifying detail"
              required
              hint="Something not shown publicly: an engraving, sticker, serial suffix, lock-screen image, or contents inside the item."
            >
              <Textarea
                rows={4}
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="e.g. Brass compass sticker left of the trackpad; serial ends in 9K4M."
                maxLength={2000}
              />
            </Field>

            <Field label="Link a lost report (optional)" hint="Helps the officer cross-check your earlier filing.">
              <Select value={lostReportId} onChange={(event) => setLostReportId(event.target.value)}>
                <option value="">Not linked</option>
                {(context.my_lost_reports || []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.report_code} • {item.title}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Supporting evidence (optional)" hint="Purchase receipt, serial photo or an older photo of the item. Max 4 files.">
              <ImageUploader
                files={files}
                onChange={(next) => setFiles(next.slice(0, 4))}
                max={4}
                accept="image/jpeg,image/png,image/webp,application/pdf"
                label="Upload evidence"
                hint="Images or PDF, 5 MB each"
              />
            </Field>

            <Field label="Evidence caption" hint="Shown to the reviewing officer.">
              <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Apple invoice showing serial 9K4M" maxLength={255} />
            </Field>

            <div className="privacy-shield">
              <span aria-hidden="true">🛡</span>
              <div>
                Your answer and evidence are visible only to you and your university's custody officers. They are
                never displayed on public pages or encoded into QR codes.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="secondary" type="button" onClick={() => navigate(-1)}>Cancel</Button>
              <Button
                variant="primary"
                type="submit"
                loading={submitting}
                disabled={Boolean(existing) || !isVerified}
              >
                Submit claim
              </Button>
            </div>
          </form>
        </Card>

        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <Card style={{ padding: 20 }}>
            <div className="panel-title">What happens next</div>
            <ol style={{ paddingLeft: 18, fontSize: 13, color: 'var(--ink-secondary)', display: 'grid', gap: 8 }}>
              <li>A custody officer reviews your private description against the intake record.</li>
              <li>They may request additional evidence.</li>
              <li>If approved, you schedule a collection slot.</li>
              <li>Bring your campus ID — the officer confirms the handover and issues a receipt.</li>
            </ol>
          </Card>

          {candidates.length ? (
            <Card style={{ padding: 20 }}>
              <div className="panel-title">Your linked lost reports</div>
              <div className="list-stack">
                {candidates.map((candidate) => (
                  <div key={candidate.report_id} style={{ border: '1px solid var(--border-hairline)', borderRadius: 8, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span className="mono xs">{candidate.report_code}</span>
                      <ConfidenceBadge confidence={candidate.confidence} score={candidate.score} />
                    </div>
                    <div className="xs" style={{ marginTop: 3 }}>{candidate.title}</div>
                  </div>
                ))}
              </div>
              <p className="xs muted" style={{ marginTop: 8 }}>
                Attribute similarity only — an officer still verifies ownership.
              </p>
            </Card>
          ) : null}
        </div>
      </div>
      <style>{`@media (max-width: 980px){ .claim-grid{grid-template-columns:1fr !important} }`}</style>
    </div>
  );
}

/* ================================================================== */
/* Claim list + officer review                                        */
/* ================================================================== */
const REVIEW_ACTIONS = [
  { value: 'start_review', label: 'Mark under review' },
  { value: 'request_evidence', label: 'Request more evidence' },
  { value: 'approve', label: 'Approve ownership' },
  { value: 'reject', label: 'Reject claim' }
];

export default function Claims() {
  const { isStaff } = useAuth();
  const { active } = useUniversity();
  const toast = useToast();
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [locations, setLocations] = useState([]);
  const [schedule, setSchedule] = useState({ scheduled_at: '', location_id: '', instructions: '' });
  const [reviewForm, setReviewForm] = useState({ action: 'approve', reason: '', notes: '', findings: '', verification_method: 'combined' });
  const [evidenceFiles, setEvidenceFiles] = useState([]);

  const { data, loading, error, reload } = useApi(
    () => (isStaff ? ClaimApi.list({ status: statusFilter || undefined, page_size: 30 }) : ClaimApi.mine({ page_size: 30 })),
    [statusFilter, isStaff]
  );

  const items = data?.items || [];

  const openClaim = async (claim) => {
    setSelected(claim);
    setDetail(null);
    setReviewForm({ action: 'approve', reason: '', notes: '', findings: '', verification_method: 'combined' });
    try {
      const full = await ClaimApi.get(claim.id);
      setDetail(full);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const runReview = async () => {
    if (!selected) return;
    if (reviewForm.action === 'reject' && !reviewForm.reason.trim()) {
      toast.error('A rejection reason is required.');
      return;
    }
    setBusy(true);
    try {
      await ClaimApi.review(selected.id, reviewForm);
      toast.success(`Claim ${selected.claim_code}: ${reviewForm.action.replace('_', ' ')} recorded.`);
      setSelected(null);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  
const openSchedule = async () => {
  setScheduleOpen(true);
  try {
    const data = await CatalogApi.locations(active?.code);
    setLocations(data.locations || []);
  } catch (_) {
    setLocations([]);
  }
};


  const submitSchedule = async () => {
    if (!schedule.scheduled_at) {
      toast.error('Choose a collection date and time.');
      return;
    }
    setBusy(true);
    try {
      const created = await ReturnApi.schedule({
        claim_id: selected.id,
        scheduled_at: schedule.scheduled_at,
        location_id: schedule.location_id || null,
        instructions: schedule.instructions || null
      });
      toast.success(`Collection ${created.return_code} scheduled.`);
      setScheduleOpen(false);
      setSelected(null);
      setSchedule({ scheduled_at: '', location_id: '', instructions: '' });
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitEvidence = async () => {
    if (!evidenceFiles.length) {
      toast.error('Select at least one file.');
      return;
    }
    setBusy(true);
    try {
      const payload = new FormData();
      evidenceFiles.forEach((file) => payload.append('files', file));
      await ClaimApi.evidence(selected.id, payload);
      toast.success('Evidence uploaded.');
      const full = await ClaimApi.get(selected.id);
      setDetail(full);
      setEvidenceFiles([]);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (claim) => {
    if (!window.confirm(`Cancel claim ${claim.claim_code}?`)) return;
    try {
      await ClaimApi.cancel(claim.id);
      toast.success('Claim cancelled.');
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <div className="page-title-row">
        <div>
          <div className="eyebrow-text">Ownership verification</div>
          <h1 className="page-title">{isStaff ? 'Ownership claims' : 'My claims'}</h1>
          <p className="page-subtitle">
            {isStaff
              ? 'Compare the claimant’s private description with the marks recorded at intake. Approval unlocks collection scheduling.'
              : 'Track the verification of the items you have claimed.'}
          </p>
        </div>
        <Field label="Filter">
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">All statuses</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under review</option>
            <option value="evidence_requested">Evidence requested</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </Select>
        </Field>
      </div>

      {loading ? <Loading rows={4} /> : null}
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="No claims yet"
          message={isStaff ? 'No ownership claims have been filed for this institution.' : 'Browse found items and submit a claim when you recognise yours.'}
        />
      ) : null}

      {items.length > 0 ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Table columns={['Claim', 'Item', 'Status', isStaff ? 'Claimant' : 'Submitted', 'Action']}>
            {items.map((claim) => (
              <tr key={claim.id}>
                <td className="mono xs">{claim.claim_code}</td>
                <td>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{claim.found_report?.title}</div>
                  <div className="mono xs muted">{claim.found_report?.report_code}</div>
                </td>
                <td><StatusBadge status={claim.status} label={titleCase(claim.status)} /></td>
                <td className="xs">
                  {isStaff ? (
                    <>
                      <div>{claim.claimant?.name}</div>
                      <div className="muted">{claim.claimant?.campus_id_number}</div>
                    </>
                  ) : (
                    <span className="tabular">{formatDate(claim.created_at)}</span>
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Button variant="secondary" size="sm" onClick={() => openClaim(claim)}>Open</Button>
                    {!isStaff && ['submitted', 'under_review', 'evidence_requested'].includes(claim.status) ? (
                      <Button variant="ghost" size="sm" onClick={() => cancel(claim)}>Cancel</Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}

      <Modal open={Boolean(selected)} title={`Claim ${selected?.claim_code || ''}`} onClose={() => setSelected(null)} width={760}>
        {!detail ? (
          <Loading rows={3} />
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>{detail.found_report?.title}</h3>
                <div className="mono xs muted">{detail.found_report?.report_code}</div>
              </div>
              <StatusBadge status={detail.status} label={titleCase(detail.status)} />
            </div>

            <div className="kv-list">
              {detail.claimant ? (
                <div className="kv-row"><div className="kv-key">Claimant</div><div>{detail.claimant.name} • {detail.claimant.email}</div></div>
              ) : null}
              {detail.identifying_answer ? (
                <div className="kv-row"><div className="kv-key">Private description</div><div>{detail.identifying_answer}</div></div>
              ) : null}
              <div className="kv-row"><div className="kv-key">Submitted</div><div className="tabular">{formatDateTime(detail.created_at)}</div></div>
              {detail.rejection_reason ? (
                <div className="kv-row"><div className="kv-key">Rejection reason</div><div>{detail.rejection_reason}</div></div>
              ) : null}
              {detail.return ? (
                <div className="kv-row">
                  <div className="kv-key">Collection</div>
                  <div>
                    {detail.return.return_code} • {formatDateTime(detail.return.scheduled_at)} • <StatusBadge status={detail.return.status} />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="panel" style={{ marginTop: 14 }}>
              <div className="panel-title">Evidence</div>
              {(detail.evidence || []).length === 0 ? <p className="small muted">No evidence uploaded.</p> : null}
              <div className="list-stack">
                {(detail.evidence || []).map((file) => (
                 <button
  key={file.id}
  type="button"
  className="link-plain small"
  onClick={async () => {
    const tab = window.open('about:blank', '_blank');

    try {
      const response = await ClaimApi.evidenceFile(file.id);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      if (tab) tab.location.href = url;
      else window.location.href = url;

      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      if (tab) tab.close();
      toast.error(err.message);
    }
  }}
>
  {file.name || 'Evidence file'} — {file.note || 'no caption'}
</button>
                ))}
              </div>
            </div>

            {isStaff ? (
              <div className="panel" style={{ marginTop: 14 }}>
                <div className="panel-title">Officer decision</div>
                <div style={{ display: 'grid', gap: 12 }}>
                  <Field label="Action" required>
                    <Select value={reviewForm.action} onChange={(event) => setReviewForm({ ...reviewForm, action: event.target.value })}>
                      {REVIEW_ACTIONS.map((action) => (
                        <option key={action.value} value={action.value}>{action.label}</option>
                      ))}
                    </Select>
                  </Field>
                  {reviewForm.action === 'approve' ? (
                    <>
                      <Field label="Verification method">
                        <Select
                          value={reviewForm.verification_method}
                          onChange={(event) => setReviewForm({ ...reviewForm, verification_method: event.target.value })}
                        >
                          <option value="combined">Combined checks</option>
                          <option value="physical_inspection">Physical inspection</option>
                          <option value="documentary">Documentary evidence</option>
                          <option value="serial_check">Serial number check</option>
                          <option value="witness">Witness statement</option>
                        </Select>
                      </Field>
                      <Field label="Verification findings">
                        <Textarea rows={2} value={reviewForm.findings} onChange={(event) => setReviewForm({ ...reviewForm, findings: event.target.value })} />
                      </Field>
                    </>
                  ) : null}
                  {reviewForm.action === 'reject' ? (
                    <Field label="Rejection reason" required hint="Shared with the claimant.">
                      <Textarea rows={2} value={reviewForm.reason} onChange={(event) => setReviewForm({ ...reviewForm, reason: event.target.value })} />
                    </Field>
                  ) : null}
                  <Field label="Internal notes">
                    <Input value={reviewForm.notes} onChange={(event) => setReviewForm({ ...reviewForm, notes: event.target.value })} />
                  </Field>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>
                    {detail.status === 'approved' ? (
                      <Button variant="forest" onClick={openSchedule}>Schedule collection</Button>
                    ) : null}
                    <Button variant="primary" loading={busy} onClick={runReview}>Record decision</Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="panel" style={{ marginTop: 14 }}>
                <div className="panel-title">Upload additional evidence</div>
                <ImageUploader files={evidenceFiles} onChange={setEvidenceFiles} max={4} accept="image/jpeg,image/png,image/webp,application/pdf" />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                  <Button variant="secondary" loading={busy} onClick={submitEvidence}>Upload evidence</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={scheduleOpen}
        title="Schedule collection"
        onClose={() => setScheduleOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setScheduleOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={submitSchedule}>Confirm schedule</Button>
          </>
        }
      >
        <Field label="Collection date & time" required>
          <Input type="datetime-local" value={schedule.scheduled_at} onChange={(event) => setSchedule({ ...schedule, scheduled_at: event.target.value })} />
        </Field>
        <Field label="Collection location">
          <Select value={schedule.location_id} onChange={(event) => setSchedule({ ...schedule, location_id: event.target.value })}>
            <option value="">Custody desk (default)</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Instructions for the owner">
          <Input value={schedule.instructions} onChange={(event) => setSchedule({ ...schedule, instructions: event.target.value })} placeholder="e.g. Bring campus ID, report to locker bay 2" />
        </Field>
      </Modal>
    </div>
  );
}
