import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { AuthApi, NotificationApi, VerificationApi } from '../../services/api';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  Pagination,
  Select,
  StatCard,
  StatusBadge
} from '../../components/ui';
import { ImageUploader } from '../../components/ImageUploader';
import { formatDateTime, relativeTime, titleCase } from '../../utils/format';

/* ------------------------------------------------------------------ */
/* Notifications                                                      */
/* ------------------------------------------------------------------ */
export function Notifications() {
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { refreshNotifications } = useAuth();
  const toast = useToast();

  const { data, loading, error, reload } = useApi(
    () => NotificationApi.list({ page, page_size: 15, unread_only: unreadOnly }),
    [page, unreadOnly]
  );

  const markRead = async (id) => {
    try {
      await NotificationApi.read(id);
      reload();
      refreshNotifications();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <div className="page-title-row">
        <div>
          <div className="eyebrow-text">Notification centre</div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle">Report confirmations, match alerts, claim decisions, verification updates and collection notices.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field label="Filter">
            <Select value={unreadOnly ? 'unread' : 'all'} onChange={(event) => { setUnreadOnly(event.target.value === 'unread'); setPage(1); }}>
              <option value="all">All notifications</option>
              <option value="unread">Unread only</option>
            </Select>
          </Field>
          <Button
            variant="secondary"
            onClick={async () => {
              await NotificationApi.readAll();
              toast.success('All notifications marked read.');
              reload();
              refreshNotifications();
            }}
          >
            Mark all read
          </Button>
        </div>
      </div>

      {loading ? <Loading rows={4} /> : null}
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {!loading && !error && (data?.items || []).length === 0 ? (
        <EmptyState title="No notifications" message="You will be notified here when something needs your attention." />
      ) : null}

      <div className="notif-list">
        {(data?.items || []).map((item) => (
          <button
            type="button"
            key={item.id}
            className={`notif-item ${item.unread ? 'unread' : ''}`}
            onClick={() => item.unread && markRead(item.id)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span className="notif-type">{titleCase(item.type)}</span>
              {item.unread ? <span className="badge badge-lost">Unread</span> : null}
            </div>
            <div className="notif-title">{item.title}</div>
            {item.body ? <div className="notif-body">{item.body}</div> : null}
            <div className="notif-meta tabular">
              {formatDateTime(item.date)} • {relativeTime(item.date)}
              {item.email_status && item.email_status !== 'not_sent' ? ` • email: ${item.email_status}` : ''}
            </div>
          </button>
        ))}
      </div>

      <Pagination
        pagination={
          data
            ? {
                page: data.page,
                pages: Math.ceil((data.total || 0) / (data.page_size || 15)),
                total: data.total,
                has_next: (data.page || 1) < Math.ceil((data.total || 0) / (data.page_size || 15)),
                has_prev: (data.page || 1) > 1
              }
            : null
        }
        onPage={setPage}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Profile                                                            */
/* ------------------------------------------------------------------ */
export function Profile() {
  const { user, refreshMe } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({
    full_name: user?.full_name || '',
    phone: user?.phone || '',
    department: user?.department || '',
    academic_year: user?.academic_year || '',
    semester: user?.semester || '',
    designation: user?.designation || ''
  });
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm: '' });
  const [busy, setBusy] = useState(false);

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await AuthApi.updateProfile(form);
      await refreshMe();
      toast.success('Profile updated.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    if (passwords.new_password !== passwords.confirm) {
      toast.error('New passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await AuthApi.changePassword({
        current_password: passwords.current_password,
        new_password: passwords.new_password
      });
      setPasswords({ current_password: '', new_password: '', confirm: '' });
      toast.success('Password changed.');
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
          <div className="eyebrow-text">Account</div>
          <h1 className="page-title">Profile &amp; settings</h1>
          <p className="page-subtitle">Your campus identity details and security settings.</p>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Card style={{ padding: 24 }}>
          <div className="panel-title">Account summary</div>
          <div className="kv-list">
            <div className="kv-row"><div className="kv-key">Name</div><div>{user?.full_name}</div></div>
            <div className="kv-row"><div className="kv-key">Email</div><div>{user?.email}</div></div>
            <div className="kv-row"><div className="kv-key">Role</div><div>{user?.role_label}</div></div>
            <div className="kv-row"><div className="kv-key">Campus ID</div><div className="mono">{user?.campus_id_number || '—'}</div></div>
            <div className="kv-row"><div className="kv-key">Department</div><div>{user?.department || '—'}</div></div>
            <div className="kv-row">
              <div className="kv-key">Verification</div>
              <div><StatusBadge status={user?.verification_status} label={titleCase(user?.verification_status || 'Not submitted')} /></div>
            </div>
            <div className="kv-row"><div className="kv-key">Account status</div><div><StatusBadge status={user?.account_status} label={titleCase(user?.account_status || '')} /></div></div>
            <div className="kv-row"><div className="kv-key">Last sign-in</div><div className="tabular">{user?.last_login_at ? formatDateTime(user.last_login_at) : '—'}</div></div>
          </div>
          {user?.role !== 'platform_admin' ? (
            <div style={{ marginTop: 14 }}>
              <Link to="/dashboard/verification" className="link-plain small">Manage campus verification →</Link>
            </div>
          ) : null}
        </Card>

        <div style={{ display: 'grid', gap: 18 }}>
          <Card style={{ padding: 24 }}>
            <div className="panel-title">Edit profile</div>
            <form onSubmit={save} style={{ display: 'grid', gap: 12 }}>
              <Field label="Full name"><Input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></Field>
              <div className="grid-2">
                <Field label="Phone"><Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
                <Field label="Department"><Input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></Field>
              </div>
              <div className="grid-2">
                <Field label="Academic year"><Input value={form.academic_year} onChange={(event) => setForm({ ...form, academic_year: event.target.value })} /></Field>
                <Field label="Semester"><Input value={form.semester} onChange={(event) => setForm({ ...form, semester: event.target.value })} /></Field>
              </div>
              <Field label="Designation"><Input value={form.designation} onChange={(event) => setForm({ ...form, designation: event.target.value })} /></Field>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="primary" type="submit" loading={busy}>Save changes</Button>
              </div>
            </form>
          </Card>

          <Card style={{ padding: 24 }}>
            <div className="panel-title">Change password</div>
            <form onSubmit={changePassword} style={{ display: 'grid', gap: 12 }}>
              <Field label="Current password" required><Input type="password" value={passwords.current_password} onChange={(event) => setPasswords({ ...passwords, current_password: event.target.value })} /></Field>
              <div className="grid-2">
                <Field label="New password" required><Input type="password" value={passwords.new_password} onChange={(event) => setPasswords({ ...passwords, new_password: event.target.value })} /></Field>
                <Field label="Confirm new password" required><Input type="password" value={passwords.confirm} onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })} /></Field>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="primary" type="submit" loading={busy}>Update password</Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Campus verification                                                */
/* ------------------------------------------------------------------ */
export function Verification() {
  const { user, refreshMe } = useAuth();
  const toast = useToast();
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useApi(() => VerificationApi.mine(), []);
  const application = data?.application;

  const upload = async () => {
    if (!files.length) {
      toast.error('Select a document to upload.');
      return;
    }
    setBusy(true);
    try {
      const payload = new FormData();
      payload.append('document', files[0]);
      const result = await VerificationApi.upload(payload);
      toast.success(result.message);
      setFiles([]);
      reload();
      refreshMe();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 940 }}>
      <div className="page-title-row">
        <div>
          <div className="eyebrow-text">Campus identity</div>
          <h1 className="page-title">Verification</h1>
          <p className="page-subtitle">
            Verification unlocks ownership claims and collections. A university administrator reviews every
            application manually — uploading a document never auto-approves an account.
          </p>
        </div>
        {application ? <StatusBadge status={application.status} label={titleCase(application.status)} /> : null}
      </div>

      {loading ? <Loading rows={3} /> : null}
      {error ? <ErrorState error={error} onRetry={reload} /> : null}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Card style={{ padding: 24 }}>
          <div className="panel-title">Application status</div>
          <div className="stepper" style={{ marginBottom: 18 }}>
            {(data?.steps || []).map((step) => (
              <div className="step-node" key={step.key}>
                <div className={`step-bar ${step.done ? 'done' : ''}`} />
                <span className="xs muted">{step.label}</span>
              </div>
            ))}
          </div>

          {application ? (
            <div className="kv-list">
              <div className="kv-row"><div className="kv-key">Status</div><div><StatusBadge status={application.status} label={titleCase(application.status)} /></div></div>
              <div className="kv-row"><div className="kv-key">Requested role</div><div>{titleCase(application.requested_role)}</div></div>
              <div className="kv-row"><div className="kv-key">Campus ID</div><div className="mono">{application.campus_id_number || '—'}</div></div>
              <div className="kv-row"><div className="kv-key">Department</div><div>{application.department || '—'}</div></div>
              <div className="kv-row"><div className="kv-key">Submitted</div><div className="tabular">{formatDateTime(application.submitted_at)}</div></div>
              {application.reviewed_at ? (
                <div className="kv-row"><div className="kv-key">Reviewed</div><div className="tabular">{formatDateTime(application.reviewed_at)} {application.reviewed_by_name ? `• ${application.reviewed_by_name}` : ''}</div></div>
              ) : null}
              {application.review_notes ? (
                <div className="kv-row"><div className="kv-key">Officer notes</div><div>{application.review_notes}</div></div>
              ) : null}
              {application.rejection_reason ? (
                <div className="kv-row"><div className="kv-key">Reason</div><div>{application.rejection_reason}</div></div>
              ) : null}
            </div>
          ) : (
            <p className="small muted">No application on record yet. Upload your ID to open one.</p>
          )}

          {application?.documents?.length ? (
            <div className="panel" style={{ marginTop: 16 }}>
              <div className="panel-title">Uploaded documents</div>
              <div className="list-stack">
                {application.documents.map((document) => (
                  <div key={document.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
                    <span>{document.document_type.replace('_', ' ')} • {document.original_name}</span>
                    <a href={document.url} target="_blank" rel="noreferrer" className="link-plain">
                      View (private)
                    </a>
                  </div>
                ))}
              </div>
              <p className="xs muted" style={{ marginTop: 8 }}>
                Only you and your university administrators can open these files.
              </p>
            </div>
          ) : null}
        </Card>

        <Card style={{ padding: 24 }}>
          <div className="panel-title">Upload ID document</div>
          {application?.status === 'verified' ? (
            <div className="notice notice-success">
              <span>Your identity is verified. No further action is needed.</span>
            </div>
          ) : (
            <>
              <p className="small" style={{ color: 'var(--ink-secondary)', marginBottom: 12 }}>
                Upload a clear photo of your student or employee ID card, or an institutional letter.
              </p>
              <ImageUploader
                files={files}
                onChange={(next) => setFiles(next.slice(0, 1))}
                max={1}
                accept="image/jpeg,image/png,image/webp,application/pdf"
                label="Select ID document"
                hint="JPG, PNG, WEBP or PDF up to 5 MB"
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <Button variant="primary" loading={busy} onClick={upload}>Upload for review</Button>
              </div>
            </>
          )}
          <div className="privacy-shield" style={{ marginTop: 16 }}>
            <span aria-hidden="true">🛡</span>
            <div>
              Documents are stored privately with randomised filenames and served only through an authenticated,
              permission-checked endpoint. They are never published, indexed or embedded in QR codes.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
