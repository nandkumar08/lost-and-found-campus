import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { MatchApi } from '../../services/api';
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
  ProgressBar,
  StatusBadge,
  Table
} from '../../components/ui';
import { formatDateTime, titleCase } from '../../utils/format';

const WEIGHT_LABELS = {
  category: 'Category',
  name: 'Item name',
  description: 'Description',
  colour: 'Colour',
  brand: 'Brand',
  location: 'Location',
  datetime: 'Date & time'
};

export default function Matches() {
  const { isStaff } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [reviewNote, setReviewNote] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useApi(
    () => (isStaff ? MatchApi.list({ status: statusFilter || undefined, page_size: 30 }) : MatchApi.mine()),
    [statusFilter, isStaff]
  );

  const items = data?.items || [];

  const review = async (action) => {
    if (!selected) return;
    setBusy(true);
    try {
      await MatchApi.review(selected.id, { action, notes: reviewNote || undefined });
      toast.success(`Match ${action === 'confirm' ? 'confirmed' : 'rejected'}.`);
      setSelected(null);
      setReviewNote('');
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="page-title-row">
        <div>
          <div className="eyebrow-text">Smart matching engine</div>
          <h1 className="page-title">{isStaff ? 'Match review queue' : 'My matches'}</h1>
          <p className="page-subtitle">
            Scores are computed from weighted attribute similarity. A match is a lead — it never marks an item as
            returned without officer verification.
          </p>
        </div>
        {isStaff ? (
          <Field label="Filter by status">
            <select className="select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All</option>
              <option value="suggested">Suggested</option>
              <option value="confirmed">Confirmed</option>
              <option value="rejected">Rejected</option>
              <option value="closed">Closed</option>
            </select>
          </Field>
        ) : null}
      </div>

      {loading ? <Loading rows={4} /> : null}
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="No matches yet"
          message="When a found item overlaps with one of your lost reports, the engine records it here."
          action={<Button variant="secondary" onClick={() => navigate('/browse/found')}>Browse found items</Button>}
        />
      ) : null}

      {items.length > 0 ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Table columns={['Lost report', 'Found item', 'Score', 'Confidence', 'Status', isStaff ? 'Review' : 'Recorded']}>
            {items.map((match) => (
              <tr key={match.id}>
                <td>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{match.lost.title}</div>
                  <div className="mono xs muted">{match.lost.report_code}</div>
                </td>
                <td>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{match.found.title}</div>
                  <div className="mono xs muted">{match.found.report_code}</div>
                </td>
                <td className="tabular strong">{Math.round(match.score)}%</td>
                <td><ConfidenceBadge confidence={match.confidence} /></td>
                <td><StatusBadge status={match.status} label={titleCase(match.status)} /></td>
                <td>
                  {isStaff && match.status === 'suggested' ? (
                    <Button variant="secondary" size="sm" onClick={() => setSelected(match)}>
                      Review
                    </Button>
                  ) : (
                    <span className="xs muted tabular">{formatDateTime(match.created_at)}</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}

      <Modal open={Boolean(selected)} title="Review suggested match" onClose={() => setSelected(null)} width={720}>
        {selected ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <strong>{selected.lost.report_code} ↔ {selected.found.report_code}</strong>
              <ConfidenceBadge confidence={selected.confidence} score={selected.score} />
            </div>

            <div className="panel" style={{ marginBottom: 14 }}>
              <div className="panel-title">Score breakdown</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {Object.entries(selected.breakdown || {}).map(([key, value]) => (
                  <ProgressBar
                    key={key}
                    value={(value.points / value.weight) * 100}
                    label={`${WEIGHT_LABELS[key] || key} • ${value.points} of ${value.weight} pts`}
                  />
                ))}
              </div>
            </div>

            <div className="panel" style={{ marginBottom: 14 }}>
              <div className="panel-title">Signals</div>
              <ul style={{ paddingLeft: 18, fontSize: 13, color: 'var(--ink-secondary)' }}>
                {(selected.reasons || []).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
                {(selected.reasons || []).length === 0 ? <li>No strong individual signals.</li> : null}
              </ul>
            </div>

            <Field label="Review notes" hint="Stored in the audit log and shown to the reporting parties.">
              <Input value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="e.g. Serials do not match — rejecting" />
            </Field>

            <div className="notice notice-warn">
              <span>
                Confirming a match opens the claim path for the owner. It does <strong>not</strong> hand over the item.
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <Button variant="secondary" onClick={() => setSelected(null)}>Cancel</Button>
              <Button variant="danger" loading={busy} onClick={() => review('reject')}>Reject match</Button>
              <Button variant="primary" loading={busy} onClick={() => review('confirm')}>Confirm match</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
