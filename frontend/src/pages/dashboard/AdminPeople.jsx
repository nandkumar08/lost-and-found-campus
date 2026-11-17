import React, { useMemo, useState } from 'react';
import { useApi, useDebounced } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { AdminApi, VerificationApi, getToken } from '../../services/api';
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
  Textarea
} from '../../components/ui';
import { formatDate, formatDateTime, titleCase } from '../../utils/format';

const ROLES = [
  ['', 'All roles'],
  ['student', 'Student'],
  ['faculty', 'Faculty'],
  ['university_staff', 'University Staff'],
  ['security_personnel', 'Security Personnel'],
  ['campus_member', 'Campus Member'],
  ['university_admin', 'University Admin']
];

/* ------------------------------------------------------------------ */
/* User management                                                    */
/* ------------------------------------------------------------------ */
export function Users() {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [accountStatus, setAccountStatus] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [roleChange, setRoleChange] = useState('');
  const [busy, setBusy] = useState(false);
  const debounced = useDebounced(query);

  const filters = useMemo(
    () => ({
      q: debounced || undefined,
      role: role || undefined,
      account_status: accountStatus || undefined,
      verification_status: verificationStatus || undefined,
      page,
      page_size: 15
    }),
    [debounced, role, accountStatus, verificationStatus, page]
  );

  const { data, loading, error, reload } = useApi(() => AdminApi.users(filters), [JSON.stringify(filters)]);
  const items = data?.items || [];

  const updateStatus = async (user, status) => {
    const reason = status === 'suspended' ? window.prompt('Reason for suspension (shared with the user):') : null;
    if (status === 'suspended' && !reason) return;
    setBusy(true);
    try {
      await AdminApi.setUserStatus(user.id, { account_status: status, reason });
      toast.success(`${user.full_name} set to ${status}.`);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async () => {
    if (!selected || !roleChange) return;
    setBusy(true);
    try {
      await AdminApi.setUserRole(selected.id, { role: roleChange });
      toast.success('Role updated.');
      setSelected(null);
      setRoleChange('');
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
          <div className="eyebrow-text">Identity &amp; access</div>
          <h1 className="page-title">User management</h1>
          <p className="page-subtitle">
            Accounts belonging to your university only. Platform administrators are managed at platform level.
          </p>
        </div>
      </div>

      <div className="filter-bar">
        <div className="field-group filter-search">
          <Field label="Search"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email or campus ID" /></Field>
        </div>
        <div className="field-group">
          <Field label="Role">
            <Select value={role} onChange={(event) => setRole(event.target.value)}>
              {ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
        </div>
        <div className="field-group">
          <Field label="Account">
            <Select value={accountStatus} onChange={(event) => setAccountStatus(event.target.value)}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="suspended">Suspended</option>
              <option value="deactivated">Deactivated</option>
            </Select>
          </Field>
        </div>
        <div className="field-group">
          <Field label="Verification">
            <Select value={verificationStatus} onChange={(event) => setVerificationStatus(event.target.value)}>
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="under_review">Under review</option>
              <option value="verified">Verified</option>
              <option value="rejected">Rejected</option>
              <option value="suspended">Suspended</option>
            </Select>
          </Field>
        </div>
      </div>

      {loading ? <Loading rows={4} /> : null}
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyState title="No users found" message="Try a different search or filter." /> : null}

      {items.length > 0 ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Table columns={['User', 'Role', 'Campus ID', 'Verification', 'Account', 'Last seen', 'Actions']}>
            {items.map((user) => (
              <tr key={user.id}>
                <td>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{user.full_name}</div>
                  <div className="xs muted">{user.email}</div>
                </td>
                <td className="xs">{user.role_label}</td>
                <td className="mono xs">{user.campus_id_number || '—'}</td>
                <td><StatusBadge status={user.verification_status} label={titleCase(user.verification_status)} /></td>
                <td><StatusBadge status={user.account_status} label={titleCase(user.account_status)} /></td>
                <td className="tabular xs">{user.last_login_at ? formatDate(user.last_login_at) : '—'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Button variant="secondary" size="sm" onClick={() => { setSelected(user); setRoleChange(user.role); }}>
                      Manage
                    </Button>
                    {user.account_status === 'active' ? (
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => updateStatus(user, 'suspended')}>
                        Suspend
                      </Button>
                    ) : user.account_status === 'suspended' ? (
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => updateStatus(user, 'active')}>
                        Reactivate
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

      <Modal open={Boolean(selected)} title={selected ? `Manage ${selected.full_name}` : ''} onClose={() => setSelected(null)}>
        {selected ? (
          <div>
            <div className="kv-list">
              <div className="kv-row"><div className="kv-key">Email</div><div>{selected.email}</div></div>
              <div className="kv-row"><div className="kv-key">Campus ID</div><div className="mono">{selected.campus_id_number || '—'}</div></div>
              <div className="kv-row"><div className="kv-key">Department</div><div>{selected.department || '—'}</div></div>
              <div className="kv-row"><div className="kv-key">Joined</div><div className="tabular">{formatDateTime(selected.created_at)}</div></div>
              <div className="kv-row"><div className="kv-key">Verification</div><div><StatusBadge status={selected.verification_status} label={titleCase(selected.verification_status)} /></div></div>
            </div>

            <Field label="Change role" hint="Roles determine what the account can do across the campus workspace.">
              <Select value={roleChange} onChange={(event) => setRoleChange(event.target.value)}>
                {ROLES.filter(([value]) => value).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </Field>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 14 }}>
              <Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>
              <Button variant="primary" loading={busy} onClick={changeRole}>Save role</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Identity verification queue                                        */
/* ------------------------------------------------------------------ */
export function Verifications() {
  const toast = useToast();
  const [statusFilter, setStatusFilter] = useState('pending');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ action: 'verify', reason: '', notes: '' });
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useApi(
    () => VerificationApi.applications({ status: statusFilter || undefined, page, page_size: 15 }),
    [statusFilter, page]
  );

  const items = data?.items || [];

  const review = async () => {
    if (!selected) return;
    if (form.action === 'reject' && !form.reason.trim()) {
      toast.error('A rejection reason is required.');
      return;
    }
    setBusy(true);
    try {
      await VerificationApi.review(selected.id, form);
      toast.success(`Application ${form.action.replace('_', ' ')}.`);
      setSelected(null);
      setForm({ action: 'verify', reason: '', notes: '' });
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
          <div className="eyebrow-text">Campus identity</div>
          <h1 className="page-title">Identity verification queue</h1>
          <p className="page-subtitle">
            Compare the applicant's details with the uploaded document, then verify or reject manually. Approving
            activates the account and unlocks claims.
          </p>
        </div>
        <Field label="Status">
          <Select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="under_review">Under review</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
            <option value="suspended">Suspended</option>
          </Select>
        </Field>
      </div>

      {loading ? <Loading rows={4} /> : null}
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState title="Queue is clear" message="No applications match this filter." />
      ) : null}

      {items.length > 0 ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Table columns={['Applicant', 'Requested role', 'Campus ID', 'Documents', 'Status', 'Submitted', 'Action']}>
            {items.map((application) => (
              <tr key={application.id}>
                <td>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{application.applicant?.name}</div>
                  <div className="xs muted">{application.applicant?.email}</div>
                </td>
                <td className="xs">{titleCase(application.requested_role)}</td>
                <td className="mono xs">{application.campus_id_number || '—'}</td>
                <td className="tabular xs">{application.documents?.length || 0}</td>
                <td><StatusBadge status={application.status} label={titleCase(application.status)} /></td>
                <td className="tabular xs">{formatDate(application.submitted_at)}</td>
                <td>
                  <Button variant="secondary" size="sm" onClick={() => { setSelected(application); setForm({ action: 'verify', reason: '', notes: '' }); }}>
                    Review
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}

      <Pagination
        pagination={data ? { page: data.page, pages: data.pages, total: data.total, has_next: data.page < data.pages, has_prev: data.page > 1 } : null}
        onPage={setPage}
      />

      <Modal open={Boolean(selected)} title="Review identity application" onClose={() => setSelected(null)} width={720}>
        {selected ? (
          <div>
            <div className="kv-list">
              <div className="kv-row"><div className="kv-key">Applicant</div><div>{selected.applicant?.name} • {selected.applicant?.email}</div></div>
              <div className="kv-row"><div className="kv-key">Requested role</div><div>{titleCase(selected.requested_role)}</div></div>
              <div className="kv-row"><div className="kv-key">Campus ID</div><div className="mono">{selected.campus_id_number || '—'}</div></div>
              <div className="kv-row"><div className="kv-key">Department</div><div>{selected.department || '—'}</div></div>
              <div className="kv-row"><div className="kv-key">Year / semester</div><div>{[selected.academic_year, selected.semester].filter(Boolean).join(' • ') || '—'}</div></div>
              <div className="kv-row"><div className="kv-key">Designation</div><div>{selected.designation || '—'}</div></div>
              <div className="kv-row"><div className="kv-key">Applicant note</div><div>{selected.applicant_note || '—'}</div></div>
              <div className="kv-row"><div className="kv-key">Submitted</div><div className="tabular">{formatDateTime(selected.submitted_at)}</div></div>
            </div>

            <div className="panel" style={{ marginTop: 14 }}>
              <div className="panel-title">Identity documents</div>
              {(selected.documents || []).length === 0 ? (
                <div className="notice notice-warn"><span>No document uploaded. Request one before verifying.</span></div>
              ) : (
                <div className="list-stack">
                  {selected.documents.map((document) => (
                    <div key={document.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
                      <span>{document.document_type.replace('_', ' ')} • {document.original_name}</span>
                      <button
  type="button"
  className="link-plain"
  onClick={async () => {
    try {
      const token = getToken();
      const response = await fetch(document.url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Unable to open document");
      }

      const blob = await response.blob();
      const fileUrl = URL.createObjectURL(blob);
      window.open(fileUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      alert(error.message);
    }
  }}
>
  Open private document
</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
              <Field label="Decision" required>
                <Select value={form.action} onChange={(event) => setForm({ ...form, action: event.target.value })}>
                  <option value="verify">Verify identity</option>
                  <option value="start_review">Mark under review</option>
                  <option value="reject">Reject application</option>
                  <option value="suspend">Suspend campus access</option>
                  <option value="reopen">Reopen for review</option>
                </Select>
              </Field>
              {form.action === 'reject' ? (
                <Field label="Rejection reason" required hint="Emailed to the applicant.">
                  <Textarea rows={2} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
                </Field>
              ) : null}
              <Field label="Internal notes">
                <Input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
              </Field>
              <div className="notice notice-info">
                <span>Verifying activates the account and unlocks claims. This action is written to the audit log.</span>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <Button variant="secondary" onClick={() => setSelected(null)}>Cancel</Button>
                <Button variant="primary" loading={busy} onClick={review}>Record decision</Button>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
