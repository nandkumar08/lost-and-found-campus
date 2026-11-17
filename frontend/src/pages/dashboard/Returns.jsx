import React, { useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ReturnApi } from '../../services/api';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  Modal,
  StatusBadge,
  Table
} from '../../components/ui';
import { formatDateTime, titleCase } from '../../utils/format';

const STEP_COPY = {
  owner_confirm: {
    label: 'Confirm handover',
    help: 'Confirm that you physically received the item from the finder.'
  },
  finder_confirm: {
    label: 'Confirm handover',
    help: 'Confirm that you physically handed over the item to the owner.'
  }
};

export default function Returns() {
  const { isStaff, user } = useAuth();
  const toast = useToast();

  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [busyStep, setBusyStep] = useState('');

  const currentUserId = user?.id ?? user?.user_id;

  const { data, loading, error, reload } = useApi(
    () => (
      isStaff
        ? ReturnApi.list({ status: statusFilter || undefined, page_size: 30 })
        : ReturnApi.mine({ page_size: 30 })
    ),
    [statusFilter, isStaff]
  );

  const items = data?.items || [];

  const getMyConfirmationStep = (ret) => {
    if (isStaff || currentUserId == null) return null;

    const isOwner = String(ret.owner_user_id) === String(currentUserId);
    const isFinder = String(ret.finder_user_id) === String(currentUserId);

    if (isOwner && !ret.owner_confirmed_at) return 'owner_confirm';
    if (isFinder && !ret.finder_confirmed_at) return 'finder_confirm';

    return null;
  };

  const confirmStep = async (ret, step) => {
    if (!window.confirm('Have you physically exchanged the item with the other student?')) {
      return;
    }

    setBusyStep(step);

    try {
      const result = await ReturnApi.confirm(ret.id, { step });

      if (result?.status === 'completed') {
        toast.success('Both students confirmed. Return completed and receipt generated.');
      } else {
        toast.success('Your confirmation is recorded. Waiting for the other student.');
      }

      setSelected(null);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyStep('');
    }
  };

  const openReceipt = async (ret) => {
    try {
      const data = await ReturnApi.receipt(ret.id);
      setReceipt(data);
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <div className="page-title-row">
        <div>
          <div className="eyebrow-text">Return management</div>

          <h1 className="page-title">
            {isStaff ? 'Handover & collections' : 'My collections'}
          </h1>

          <p className="page-subtitle">
            The finder and owner meet directly at the scheduled campus location.
            Both students must confirm the physical exchange before the return
            is completed and a digital receipt is issued.
          </p>
        </div>

        <Field label="Filter">
          <select
            className="select"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </Field>
      </div>

      {loading ? <Loading rows={4} /> : null}

      {error ? <ErrorState error={error} onRetry={reload} /> : null}

      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="No collections"
          message={
            isStaff
              ? 'Approved claims can be scheduled for collection from the Claims screen.'
              : 'Approved claims will appear here with a campus meetup slot.'
          }
        />
      ) : null}

      {items.length > 0 ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Table columns={['Return', 'Item', 'Scheduled', 'Location', 'Status', 'Actions']}>
            {items.map((ret) => (
              <tr key={ret.id}>
                <td className="mono xs">{ret.return_code}</td>

                <td>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {ret.found_report?.title}
                  </div>
                  <div className="mono xs muted">
                    {ret.found_report?.report_code}
                  </div>
                </td>

                <td className="tabular xs">
                  {formatDateTime(ret.scheduled_at)}
                </td>

                <td className="xs">
                  {ret.collection_location || '—'}
                </td>

                <td>
                  <StatusBadge
                    status={ret.status}
                    label={titleCase(ret.status)}
                  />
                </td>

                <td>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelected(ret)}
                    >
                      Open
                    </Button>

                    {ret.status === 'completed' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openReceipt(ret)}
                      >
                        Receipt
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}

      <Modal
        open={Boolean(selected)}
        title={`Collection ${selected?.return_code || ''}`}
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap',
                marginBottom: 12
              }}
            >
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>
                  {selected.found_report?.title}
                </h3>

                <div className="mono xs muted">
                  {selected.found_report?.report_code} • claim {selected.claim_code}
                </div>
              </div>

              <StatusBadge
                status={selected.status}
                label={titleCase(selected.status)}
              />
            </div>

            <div className="kv-list">
              <div className="kv-row">
                <div className="kv-key">Scheduled</div>
                <div className="tabular">
                  {formatDateTime(selected.scheduled_at)}
                </div>
              </div>

              <div className="kv-row">
                <div className="kv-key">Campus location</div>
                <div>
                  {selected.collection_location || 'To be confirmed'}
                  {selected.collection_zone
                    ? ` • ${selected.collection_zone}`
                    : ''}
                </div>
              </div>

              <div className="kv-row">
                <div className="kv-key">Owner</div>
                <div>{selected.owner_name || '—'}</div>
              </div>

              <div className="kv-row">
                <div className="kv-key">Finder</div>
                <div>{selected.finder_name || '—'}</div>
              </div>

              <div className="kv-row">
                <div className="kv-key">Owner confirmation</div>
                <div className="tabular">
                  {selected.owner_confirmed_at
                    ? formatDateTime(selected.owner_confirmed_at)
                    : 'Pending'}
                </div>
              </div>

              <div className="kv-row">
                <div className="kv-key">Finder confirmation</div>
                <div className="tabular">
                  {selected.finder_confirmed_at
                    ? formatDateTime(selected.finder_confirmed_at)
                    : 'Pending'}
                </div>
              </div>

              {selected.receipt_number ? (
                <div className="kv-row">
                  <div className="kv-key">Receipt</div>
                  <div className="mono">{selected.receipt_number}</div>
                </div>
              ) : null}

              {selected.collection_instructions ? (
                <div className="kv-row">
                  <div className="kv-key">Instructions</div>
                  <div>{selected.collection_instructions}</div>
                </div>
              ) : null}
            </div>

            {!isStaff && selected.status !== 'completed' ? (
              <p className="xs muted" style={{ marginTop: 14 }}>
                Confirm only after you have met the other student and physically
                exchanged the item.
              </p>
            ) : null}

            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                justifyContent: 'flex-end',
                marginTop: 18
              }}
            >
              <Button
                variant="secondary"
                onClick={() => setSelected(null)}
              >
                Close
              </Button>

              {getMyConfirmationStep(selected) ? (
                <Button
                  variant="primary"
                  loading={Boolean(busyStep)}
                  onClick={() =>
                    confirmStep(selected, getMyConfirmationStep(selected))
                  }
                >
                  Confirm handover
                </Button>
              ) : null}

              {selected.status === 'completed' ? (
                <Button
                  variant="primary"
                  onClick={() => openReceipt(selected)}
                >
                  View receipt
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(receipt)}
        title="Digital return receipt"
        onClose={() => setReceipt(null)}
        width={620}
      >
        {receipt ? (
          <div className="print-area">
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div
                className="brand-crest"
                style={{
                  margin: '0 auto 8px',
                  background: 'var(--brand-accent)'
                }}
                aria-hidden="true"
              >
                {(receipt.university?.code || 'LF').slice(0, 2)}
              </div>

              <h3 style={{ fontSize: 16, fontWeight: 800 }}>
                {receipt.university?.name}
              </h3>

              <div className="xs muted">Digital return receipt</div>
            </div>

            <div className="kv-list">
              <div className="kv-row">
                <div className="kv-key">Receipt number</div>
                <div className="mono strong">{receipt.receipt_number}</div>
              </div>

              <div className="kv-row">
                <div className="kv-key">Return reference</div>
                <div className="mono">{receipt.return_code}</div>
              </div>

              <div className="kv-row">
                <div className="kv-key">Item</div>
                <div>
                  {receipt.item?.title} ({receipt.item?.report_code})
                </div>
              </div>

              <div className="kv-row">
                <div className="kv-key">Claim</div>
                <div className="mono">{receipt.claim_code}</div>
              </div>

              <div className="kv-row">
                <div className="kv-key">Owner</div>
                <div>{receipt.owner?.name || '—'}</div>
              </div>

              <div className="kv-row">
                <div className="kv-key">Finder</div>
                <div>{receipt.finder?.name || '—'}</div>
              </div>

              <div className="kv-row">
                <div className="kv-key">Campus meetup</div>
                <div className="tabular">
                  {formatDateTime(receipt.collection?.scheduled_at)}
                  {' • '}
                  {receipt.collection?.location || ''}
                </div>
              </div>

              <div className="kv-row">
                <div className="kv-key">Issued</div>
                <div className="tabular">
                  {formatDateTime(receipt.issued_at)}
                </div>
              </div>
            </div>

            <p className="xs muted" style={{ marginTop: 14 }}>
              {receipt.verification_statement}
            </p>

            <div
              className="no-print"
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 16
              }}
            >
              <Button
                variant="secondary"
                onClick={() => setReceipt(null)}
              >
                Close
              </Button>

              <Button
                variant="primary"
                onClick={() => window.print()}
              >
                Print receipt
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}