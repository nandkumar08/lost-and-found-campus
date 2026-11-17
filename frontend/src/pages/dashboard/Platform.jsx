import React, { useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { AdminApi, AnalyticsApi } from '../../services/api';
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
  StatCard,
  StatusBadge,
  Table
} from '../../components/ui';
import { formatDate, formatDateTime, titleCase } from '../../utils/format';

/* ------------------------------------------------------------------ */
/* Universities                                                       */
/* ------------------------------------------------------------------ */
export function Universities() {
  const toast = useToast();
  const [confirmAction, setConfirmAction] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useApi(() => AdminApi.platformUniversities(), []);

  const setStatus = async () => {
    if (!confirmAction) return;
    setBusy(true);
    try {
      await AdminApi.setUniversityStatus(confirmAction.university.id, {
        status: confirmAction.status,
        reason: reason || undefined
      });
      toast.success(`${confirmAction.university.name} is now ${confirmAction.status}.`);
      setConfirmAction(null);
      setReason('');
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const universities = data?.universities || [];

  return (
    <div>
      <div className="page-title-row">
        <div>
          <div className="eyebrow-text">Platform administration</div>
          <h1 className="page-title">Universities</h1>
          <p className="page-subtitle">Activate or suspend tenants. Suspension blocks all access for that institution.</p>
        </div>
      </div>

      {universities.length === 0 ? (
        <EmptyState title="No universities" message="Onboard the first institution from the onboarding screen." />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Table columns={['Institution', 'Code', 'Status', 'Users', 'Reports', 'Onboarded', 'Actions']}>
            {universities.map((university) => (
              <tr key={university.id}>
                <td>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{university.name}</div>
                  <div className="xs muted">{university.contact_email} • {[university.city, university.region].filter(Boolean).join(', ')}</div>
                </td>
                <td className="mono xs">{university.code}</td>
                <td><StatusBadge status={university.status} label={titleCase(university.status)} /></td>
                <td className="tabular xs">{university.users}</td>
                <td className="tabular xs">{university.reports}</td>
                <td className="tabular xs">{formatDate(university.created_at)}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {university.status !== 'active' ? (
                      <Button variant="secondary" size="sm" onClick={() => setConfirmAction({ university, status: 'active' })}>Activate</Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => setConfirmAction({ university, status: 'suspended' })}>Suspend</Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Modal
        open={Boolean(confirmAction)}
        title={confirmAction ? `${confirmAction.status === 'active' ? 'Activate' : 'Suspend'} ${confirmAction.university.name}` : ''}
        onClose={() => setConfirmAction(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmAction(null)}>Cancel</Button>
            <Button variant={confirmAction?.status === 'active' ? 'primary' : 'danger'} loading={busy} onClick={setStatus}>
              Confirm
            </Button>
          </>
        }
      >
        <Field label="Reason (shared with the university administrators)">
          <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Pending compliance review" />
        </Field>
        <div className="notice notice-warn">
          <span>Suspending a tenant immediately blocks sign-in and API access for all of its users except platform administrators.</span>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Onboarding                                                         */
/* ------------------------------------------------------------------ */
export function Onboarding() {
  const toast = useToast();
  const [form, setForm] = useState({
    name: '',
    short_name: '',
    code: '',
    contact_email: '',
    contact_phone: '',
    city: '',
    region: '',
    address_line: '',
    primary_color: '#142822',
    accent_color: '#D95D39',
    admin_full_name: '',
    admin_email: '',
    admin_password: '',
    seed_defaults: true
  });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name || !form.code || !form.contact_email || !form.admin_email || !form.admin_password) {
      toast.error('Institution name, code, contact email and administrator credentials are required.');
      return;
    }
    setBusy(true);
    try {
      const result = await AdminApi.createUniversity(form);
      setCreated(result);
      toast.success(`${form.name} onboarded.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <Card style={{ padding: 28, maxWidth: 720 }}>
        <span className="badge badge-approved" style={{ marginBottom: 12 }}>Institution onboarded</span>
        <h1 className="page-title" style={{ marginBottom: 8 }}>{form.name}</h1>
        <p className="page-subtitle" style={{ marginBottom: 16 }}>
          Tenant code <strong>{created.code}</strong>. Default categories and campus locations were created, and a
          university administrator account is active.
        </p>
        <div className="kv-list">
          <div className="kv-row"><div className="kv-key">Administrator email</div><div>{form.admin_email}</div></div>
          <div className="kv-row"><div className="kv-key">Onboarding status</div><div>Active — ready for staff verification and reporting</div></div>
        </div>
        <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
          <Button variant="primary" onClick={() => { setCreated(null); setForm({ ...form, name: '', code: '', admin_email: '', admin_password: '', contact_email: '' }); }}>
            Onboard another
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="page-title-row">
        <div>
          <div className="eyebrow-text">Platform administration</div>
          <h1 className="page-title">University onboarding</h1>
          <p className="page-subtitle">
            Create a tenant, its default catalogue and the first administrator account. The administrator then verifies
            staff and configures branding and SMTP.
          </p>
        </div>
      </div>

      <form onSubmit={submit}>
        <Card style={{ padding: 24, display: 'grid', gap: 16 }}>
          <div className="grid-2">
            <Field label="Institution name" required><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
            <Field label="Short name" required><Input value={form.short_name} onChange={(event) => setForm({ ...form, short_name: event.target.value })} /></Field>
          </div>
          <div className="grid-2">
            <Field label="Tenant code" required hint="2–12 characters, used in report IDs.">
              <Input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} maxLength={12} />
            </Field>
            <Field label="Contact email" required><Input type="email" value={form.contact_email} onChange={(event) => setForm({ ...form, contact_email: event.target.value })} /></Field>
          </div>
          <div className="grid-2">
            <Field label="Contact phone"><Input value={form.contact_phone} onChange={(event) => setForm({ ...form, contact_phone: event.target.value })} /></Field>
            <Field label="City"><Input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></Field>
          </div>
          <div className="grid-2">
            <Field label="Region"><Input value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} /></Field>
            <Field label="Address"><Input value={form.address_line} onChange={(event) => setForm({ ...form, address_line: event.target.value })} /></Field>
          </div>
          <div className="grid-2">
            <Field label="Primary colour"><Input type="color" value={form.primary_color} onChange={(event) => setForm({ ...form, primary_color: event.target.value })} /></Field>
            <Field label="Accent colour"><Input type="color" value={form.accent_color} onChange={(event) => setForm({ ...form, accent_color: event.target.value })} /></Field>
          </div>

          <h3 style={{ fontSize: 14, fontWeight: 700, borderTop: '1px solid var(--border-hairline)', paddingTop: 14 }}>First administrator</h3>
          <div className="grid-2">
            <Field label="Administrator name" required><Input value={form.admin_full_name} onChange={(event) => setForm({ ...form, admin_full_name: event.target.value })} /></Field>
            <Field label="Administrator email" required><Input type="email" value={form.admin_email} onChange={(event) => setForm({ ...form, admin_email: event.target.value })} /></Field>
          </div>
          <Field label="Temporary password" required hint="Minimum 8 characters with a number. The administrator should change it after first sign-in.">
            <Input type="password" value={form.admin_password} onChange={(event) => setForm({ ...form, admin_password: event.target.value })} />
          </Field>
          <Field label="Seed default categories and locations">
            <Select value={form.seed_defaults ? 'yes' : 'no'} onChange={(event) => setForm({ ...form, seed_defaults: event.target.value === 'yes' })}>
              <option value="yes">Yes — recommended</option>
              <option value="no">No — configure manually</option>
            </Select>
          </Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" size="lg" type="submit" loading={busy}>Onboard university</Button>
          </div>
        </Card>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Platform analytics                                                 */
/* ------------------------------------------------------------------ */
export function PlatformAnalytics() {
  const { data, loading, error, reload } = useApi(() => AnalyticsApi.platform(), []);
  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const totals = data?.totals || {};

  return (
    <div>
      <div className="page-title-row">
        <div>
          <div className="eyebrow-text">Platform administration</div>
          <h1 className="page-title">Platform analytics</h1>
          <p className="page-subtitle">Aggregate metrics across all tenants (no cross-tenant personal data).</p>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <StatCard label="Institutions" value={totals.universities ?? 0} hint={`${totals.active_universities ?? 0} active`} />
        <StatCard label="Accounts" value={totals.users ?? 0} tone="sage" />
        <StatCard label="Reports" value={totals.reports ?? 0} tone="accent" />
        <StatCard label="Returned" value={totals.returned ?? 0} tone="ochre" />
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <Table columns={['Institution', 'Status', 'Users', 'Reports', 'Returned', 'Pending verifications']}>
          {(data?.universities || []).map((university) => (
            <tr key={university.id}>
              <td style={{ fontSize: 13, fontWeight: 600 }}>{university.name}</td>
              <td><StatusBadge status={university.status} label={titleCase(university.status)} /></td>
              <td className="tabular">{university.users}</td>
              <td className="tabular">{university.reports}</td>
              <td className="tabular">{university.returned}</td>
              <td className="tabular">{university.pending_verifications}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Platform settings                                                  */
/* ------------------------------------------------------------------ */
export function PlatformSettings() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => AdminApi.platformSettings(), []);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (data?.settings) setForm(data.settings);
  }, [data]);

  if (loading || !form) return <Loading rows={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const save = async () => {
    setBusy(true);
    try {
      await AdminApi.updatePlatformSettings(form);
      toast.success('Platform settings updated.');
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="page-title-row">
        <div>
          <div className="eyebrow-text">Platform administration</div>
          <h1 className="page-title">Platform settings</h1>
          <p className="page-subtitle">Global defaults applied across every tenant.</p>
        </div>
      </div>

      <Card style={{ padding: 24, display: 'grid', gap: 14 }}>
        <Field label="Platform name"><Input value={form.platform_name || ''} onChange={(event) => setForm({ ...form, platform_name: event.target.value })} /></Field>
        <Field label="Support email"><Input value={form.support_email || ''} onChange={(event) => setForm({ ...form, support_email: event.target.value })} /></Field>
        <Field label="Allow guest reporting">
          <Select value={form.allow_public_reporting ? 'yes' : 'no'} onChange={(event) => setForm({ ...form, allow_public_reporting: event.target.value === 'yes' })}>
            <option value="yes">Yes — visitors may file reports</option>
            <option value="no">No — sign-in required</option>
          </Select>
        </Field>
        <Field label="Announcement banner" hint="Shown to administrators across tenants.">
          <Input value={form.announcement || ''} onChange={(event) => setForm({ ...form, announcement: event.target.value })} />
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" loading={busy} onClick={save}>Save settings</Button>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cross-tenant audit                                                 */
/* ------------------------------------------------------------------ */
export function PlatformLogs() {
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi(() => AdminApi.platformLogs({ page, page_size: 30 }), [page]);

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div>
      <div className="page-title-row">
        <div>
          <div className="eyebrow-text">Platform administration</div>
          <h1 className="page-title">Cross-tenant audit</h1>
          <p className="page-subtitle">Administrative actions recorded across every institution.</p>
        </div>
      </div>

      {(data?.items || []).length === 0 ? (
        <EmptyState title="No entries" message="Audit entries appear as platform actions occur." />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Table columns={['Time', 'University', 'Actor', 'Role', 'Action', 'Detail']}>
            {data.items.map((log) => (
              <tr key={log.id}>
                <td className="tabular xs">{formatDateTime(log.at)}</td>
                <td className="xs">{log.university || 'Platform'}</td>
                <td className="xs">{log.actor || 'System'}</td>
                <td className="xs">{log.role || '—'}</td>
                <td className="xs" style={{ fontWeight: 600 }}>{titleCase(log.action)}</td>
                <td className="xs">{log.detail || '—'}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Pagination pagination={data?.pagination} onPage={setPage} />
    </div>
  );
}
