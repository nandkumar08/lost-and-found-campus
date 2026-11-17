import React, { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApi, useDebounced } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { useUniversity } from '../../context/UniversityContext';
import { useToast } from '../../context/ToastContext';
import { CatalogApi, ReportApi } from '../../services/api';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  Pagination,
  Select,
  StatusBadge,
  Table,
  Timeline
} from '../../components/ui';
import { QRPass, downloadQr, printQr } from '../../components/QRPass';
import { formatDate, formatDateTime, titleCase } from '../../utils/format';

const STATUS_OPTIONS = [
  ['', 'All statuses'],
  ['searching', 'Searching'],
  ['in_custody', 'In safe custody'],
  ['matched', 'Match found'],
  ['under_review', 'Under review'],
  ['claim_pending', 'Claim in progress'],
  ['return_scheduled', 'Collection scheduled'],
  ['returned', 'Returned'],
  ['closed', 'Closed'],
  ['archived', 'Archived']
];

export default function Reports() {
  const { type } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isStaff, user } = useAuth();
  const { active } = useUniversity();
  const toast = useToast();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [reportType, setReportType] = useState(type === 'found' ? 'found' : type === 'lost' ? 'lost' : '');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusModal, setStatusModal] = useState(null);
  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [busy, setBusy] = useState(false);

  const debouncedQuery = useDebounced(query);

  const { data: catalog } = useApi(() => CatalogApi.categories(active?.code), [active?.code]);
  const categories = catalog?.categories || [];

  const filters = useMemo(
    () => ({
      report_type: reportType || undefined,
      status: status || undefined,
      q: debouncedQuery || undefined,
      page,
      page_size: 15
    }),
    [reportType, status, debouncedQuery, page]
  );

  // Staff read the tenant-wide registry; members only read their own reports.
  const { data, loading, error, reload } = useApi(
    () => (isStaff ? ReportApi.browse({ university_code: active?.code, ...filters, report_type: filters.report_type })
      : ReportApi.mine({ ...filters })),
    [JSON.stringify(filters), isStaff, active?.code]
  );

  React.useEffect(() => {
    setPage(1);
  }, [reportType, status, debouncedQuery]);

  React.useEffect(() => {
    const next = new URLSearchParams();
    if (query) next.set('q', query);
    if (status) next.set('status', status);
    setSearchParams(next, { replace: true });
  }, [query, status, setSearchParams]);

  const items = (data?.items || []).filter((item) => !categoryId || String(item.category_id) === String(categoryId));

  const openDetail = async (item) => {
    setDetailLoading(true);
    setDetail({ loading: true, item });
    try {
      const full = await ReportApi.get(item.id);
      setDetail(full);
    } catch (err) {
      toast.error(err.message);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const changeStatus = async () => {
    if (!statusModal || !newStatus) return;
    setBusy(true);
    try {
      await ReportApi.status(statusModal.id, { status: newStatus, note: statusNote || undefined });
      toast.success(`Status updated to ${titleCase(newStatus)}.`);
      setStatusModal(null);
      setNewStatus('');
      setStatusNote('');
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (report) => {
    if (!window.confirm(`Withdraw report ${report.report_code}? It will be archived and removed from public listings.`)) return;
    try {
      await ReportApi.remove(report.id);
      toast.success('Report withdrawn.');
      setDetail(null);
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const title = isStaff
    ? reportType === 'found'
      ? 'Found property registry'
      : reportType === 'lost'
        ? 'Lost report registry'
        : 'All campus reports'
    : reportType === 'found'
      ? 'My found reports'
      : reportType === 'lost'
        ? 'My lost reports'
        : 'My reports';

  return (
    <div>
      <div className="page-title-row">
        <div>
          <div className="eyebrow-text">{isStaff ? 'Custody registry' : 'My custody records'}</div>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">
            {isStaff
              ? 'Tenant-wide registry for your institution. Confidential fields are visible to custody staff only.'
              : 'Reports you filed. Add a claim when a matching found item appears.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={() => navigate('/report/lost')}>Report lost</Button>
          <Button variant="forest" onClick={() => navigate('/report/found')}>Report found</Button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="field-group filter-search">
          <Field label="Search">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, description, brand, report ID…" />
          </Field>
        </div>
        <div className="field-group">
          <Field label="Type">
            <Select
              value={reportType}
              onChange={(event) => {
                setReportType(event.target.value);
                navigate(`/dashboard/reports${event.target.value ? `/${event.target.value}` : ''}`);
              }}
            >
              <option value="">All types</option>
              <option value="lost">Lost</option>
              <option value="found">Found</option>
            </Select>
          </Field>
        </div>
        <div className="field-group">
          <Field label="Status">
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              {STATUS_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="field-group">
          <Field label="Category">
            <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      {loading ? <Loading rows={4} /> : null}
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="No reports found"
          message={isStaff ? 'No reports match these filters yet.' : 'You have not filed reports that match these filters.'}
          action={<Button variant="primary" onClick={() => navigate('/report/lost')}>File a report</Button>}
        />
      ) : null}

      {items.length > 0 ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Table columns={['Report', 'Type', 'Category', 'Location', 'Status', 'Reported', 'Actions']}>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{item.title}</div>
                  <div className="mono xs muted">{item.report_code}</div>
                </td>
                <td><StatusBadge status={item.report_type} /></td>
                <td className="xs">{item.category || '—'}</td>
                <td className="xs">{item.location || '—'}</td>
                <td><StatusBadge status={item.status} label={item.status_label || titleCase(item.status)} /></td>
                <td className="tabular xs">{formatDate(item.reported_at)}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Button variant="secondary" size="sm" onClick={() => openDetail(item)}>
                      Details
                    </Button>
                    {isStaff ? (
                      <Button variant="ghost" size="sm" onClick={() => { setStatusModal(item); setNewStatus(item.status); }}>
                        Status
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}

      <Pagination pagination={data?.pagination} onPage={setPage} />

      <Modal open={Boolean(detail)} title="Report detail" onClose={() => setDetail(null)} width={760}>
        {detail?.loading ? (
          <Loading rows={3} />
        ) : detail ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800 }}>{detail.title}</h3>
                <div className="mono xs muted">{detail.report_code}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <StatusBadge status={detail.report_type} />
                <StatusBadge status={detail.status} label={detail.status_label} />
              </div>
            </div>

            <div className="kv-list">
              <div className="kv-row"><div className="kv-key">Description</div><div>{detail.description}</div></div>
              <div className="kv-row"><div className="kv-key">Category</div><div>{detail.category || '—'}</div></div>
              <div className="kv-row"><div className="kv-key">Colour / brand</div><div>{[detail.colour, detail.brand].filter(Boolean).join(' • ') || '—'}</div></div>
              <div className="kv-row"><div className="kv-key">Incident</div><div className="tabular">{formatDate(detail.incident_date)} {detail.incident_time ? `• ${detail.incident_time}` : ''}</div></div>
              <div className="kv-row"><div className="kv-key">Location</div><div>{detail.location || detail.location_text || '—'}</div></div>
              <div className="kv-row"><div className="kv-key">Confidential marks</div><div>{detail.confidential_marks || '—'}</div></div>
              <div className="kv-row"><div className="kv-key">Reporter</div><div>{detail.reporter_name || '—'} • {detail.reporter_email || ''} {detail.reporter_phone ? `• ${detail.reporter_phone}` : ''}</div></div>
              {detail.custody_location ? (
                <div className="kv-row"><div className="kv-key">Custody location</div><div>{detail.custody_location}</div></div>
              ) : null}
              <div className="kv-row"><div className="kv-key">Reported</div><div className="tabular">{formatDateTime(detail.reported_at)}</div></div>
            </div>

            {detail.qr ? (
              <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center' }}>
                <QRPass
                  qr={detail.qr}
                  reportCode={detail.report_code}
                  onDownload={() => downloadQr(detail.qr, detail.report_code)}
                  onPrint={() => printQr(detail.qr, detail.report_code, detail.title)}
                />
              </div>
            ) : null}

            <div className="panel" style={{ marginTop: 18 }}>
              <div className="panel-title">Timeline</div>
              <Timeline items={detail.timeline || []} />
            </div>

            {detail.claims?.length ? (
              <div className="panel" style={{ marginTop: 14 }}>
                <div className="panel-title">Claims on this item</div>
                <div className="kv-list">
                  {detail.claims.map((claim) => (
                    <div className="kv-row" key={claim.claim_code}>
                      <div className="kv-key">{claim.claim_code}</div>
                      <div>{claim.claimant} • <StatusBadge status={claim.status} /></div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18, flexWrap: 'wrap' }}>
              {!isStaff && detail.report_type === 'found' ? (
                <Button variant="primary" onClick={() => navigate(`/claim/${detail.report_code}`)}>Claim this item</Button>
              ) : null}
              {detail.report_type === 'found' && !isStaff ? null : null}
              {!['returned', 'closed'].includes(detail.status) && (isStaff || detail.reporter_user_id === user?.id) ? (
                <Button variant="danger" onClick={() => withdraw(detail)}>Withdraw report</Button>
              ) : null}
              <Button variant="secondary" onClick={() => setDetail(null)}>Close</Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(statusModal)}
        title={`Update status — ${statusModal?.report_code || ''}`}
        onClose={() => setStatusModal(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setStatusModal(null)}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={changeStatus}>Save status</Button>
          </>
        }
      >
        <Field label="New status" required>
          <Select value={newStatus} onChange={(event) => setNewStatus(event.target.value)}>
            {STATUS_OPTIONS.filter(([value]) => value).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Note for the audit trail">
          <Input value={statusNote} onChange={(event) => setStatusNote(event.target.value)} placeholder="e.g. Verified with locker inspection" />
        </Field>
        <div className="notice notice-info">
          <span>Status changes are recorded in the timeline and notify the reporter. Marking an item returned closes the report.</span>
        </div>
      </Modal>
    </div>
  );
}
