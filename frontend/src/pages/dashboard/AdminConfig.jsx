import React, { useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { useUniversity } from '../../context/UniversityContext';
import { useToast } from '../../context/ToastContext';
import { AdminApi, CategoryApi, LocationApi, CatalogApi } from '../../services/api';
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
import { formatDateTime, titleCase } from '../../utils/format';

/* ------------------------------------------------------------------ */
/* Locations                                                          */
/* ------------------------------------------------------------------ */
export function Locations() {
  const { active } = useUniversity();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', zone: '', description: '', is_storage: false, locker_count: 0, is_active: true });
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useApi(
    () => CatalogApi.locations(active?.code, { include_inactive: true }),
    [active?.code]
  );
  const items = data?.locations || [];

  const startCreate = () => {
    setEditing(null);
    setForm({ name: '', zone: '', description: '', is_storage: false, locker_count: 0, is_active: true });
    setOpen(true);
  };

  const startEdit = (location) => {
    setEditing(location);
    setForm({
      name: location.name,
      zone: location.zone || '',
      description: location.description || '',
      is_storage: location.is_storage,
      locker_count: location.locker_count,
      is_active: location.is_active
    });
    setOpen(true);
  };

  const save = async () => {
    if (form.name.trim().length < 2) {
      toast.error('Enter a location name.');
      return;
    }
    setBusy(true);
    try {
      if (editing) await LocationApi.update(editing.id, form);
      else await LocationApi.create(form);
      toast.success(editing ? 'Location updated.' : 'Location created.');
      setOpen(false);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (location) => {
    if (!window.confirm(`Remove ${location.name}? Reports keep their history but the location is retired.`)) return;
    try {
      await LocationApi.remove(location.id);
      toast.success('Location removed.');
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <div className="page-title-row">
        <div>
          <div className="eyebrow-text">Institution configuration</div>
          <h1 className="page-title">Campus locations</h1>
          <p className="page-subtitle">Locations are used for reporting, matching and custody storage.</p>
        </div>
        <Button variant="primary" onClick={startCreate}>Add location</Button>
      </div>

      {loading ? <Loading rows={3} /> : null}
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {!loading && items.length === 0 ? <EmptyState title="No locations" message="Add your first campus location." /> : null}

      {items.length > 0 ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Table columns={['Location', 'Zone', 'Storage', 'Lockers', 'Active', 'Actions']}>
            {items.map((location) => (
              <tr key={location.id}>
                <td>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{location.name}</div>
                  <div className="xs muted">{location.description || '—'}</div>
                </td>
                <td className="xs">{location.zone || '—'}</td>
                <td>{location.is_storage ? <StatusBadge status="active" label="Custody" /> : <span className="xs muted">Campus area</span>}</td>
                <td className="tabular xs">{location.locker_count}</td>
                <td><StatusBadge status={location.is_active ? 'active' : 'closed'} label={location.is_active ? 'Active' : 'Inactive'} /></td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Button variant="secondary" size="sm" onClick={() => startEdit(location)}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(location)}>Remove</Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}

      <Modal
        open={open}
        title={editing ? `Edit ${editing.name}` : 'Add campus location'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={save}>{editing ? 'Save changes' : 'Create location'}</Button>
          </>
        }
      >
        <Field label="Name" required><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
        <Field label="Zone"><Input value={form.zone} onChange={(event) => setForm({ ...form, zone: event.target.value })} placeholder="e.g. East Campus" /></Field>
        <Field label="Description"><Input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
        <div className="grid-2">
          <Field label="Storage location?">
            <Select value={form.is_storage ? 'yes' : 'no'} onChange={(event) => setForm({ ...form, is_storage: event.target.value === 'yes' })}>
              <option value="no">No — campus area</option>
              <option value="yes">Yes — custody storage</option>
            </Select>
          </Field>
          <Field label="Locker count"><Input type="number" min="0" value={form.locker_count} onChange={(event) => setForm({ ...form, locker_count: Number(event.target.value) })} /></Field>
        </div>
        <Field label="Status">
          <Select value={form.is_active ? 'active' : 'inactive'} onChange={(event) => setForm({ ...form, is_active: event.target.value === 'active' })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Categories                                                         */
/* ------------------------------------------------------------------ */
export function Categories() {
  const { active } = useUniversity();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', is_high_value: false, is_active: true, sort_order: 100 });
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useApi(
    () => CatalogApi.categories(active?.code, { include_inactive: true }),
    [active?.code]
  );
  const items = data?.categories || [];

  const save = async () => {
    if (form.name.trim().length < 2) {
      toast.error('Enter a category name.');
      return;
    }
    setBusy(true);
    try {
      if (editing) await CategoryApi.update(editing.id, form);
      else await CategoryApi.create(form);
      toast.success(editing ? 'Category updated.' : 'Category created.');
      setOpen(false);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (category) => {
    if (!window.confirm(`Remove ${category.name}?`)) return;
    try {
      await CategoryApi.remove(category.id);
      toast.success('Category removed.');
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <div className="page-title-row">
        <div>
          <div className="eyebrow-text">Institution configuration</div>
          <h1 className="page-title">Item categories</h1>
          <p className="page-subtitle">Categories drive reporting, matching weights and analytics.</p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setEditing(null);
            setForm({ name: '', description: '', is_high_value: false, is_active: true, sort_order: 100 });
            setOpen(true);
          }}
        >
          Add category
        </Button>
      </div>

      {loading ? <Loading rows={3} /> : null}
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {!loading && items.length === 0 ? <EmptyState title="No categories" message="Add your first category." /> : null}

      {items.length > 0 ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Table columns={['Category', 'High value', 'Reports', 'Active', 'Order', 'Actions']}>
            {items.map((category) => (
              <tr key={category.id}>
                <td>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{category.name}</div>
                  <div className="xs muted">{category.description || '—'}</div>
                </td>
                <td className="xs">{category.is_high_value ? 'Yes' : 'No'}</td>
                <td className="tabular xs">{category.report_count}</td>
                <td><StatusBadge status={category.is_active ? 'active' : 'closed'} label={category.is_active ? 'Active' : 'Inactive'} /></td>
                <td className="tabular xs">{category.sort_order}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setEditing(category);
                        setForm({
                          name: category.name,
                          description: category.description || '',
                          is_high_value: category.is_high_value,
                          is_active: category.is_active,
                          sort_order: category.sort_order
                        });
                        setOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(category)}>Remove</Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}

      <Modal
        open={open}
        title={editing ? `Edit ${editing.name}` : 'Add category'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={save}>{editing ? 'Save changes' : 'Create category'}</Button>
          </>
        }
      >
        <Field label="Name" required><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
        <Field label="Description"><Input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
        <div className="grid-2">
          <Field label="High value item?">
            <Select value={form.is_high_value ? 'yes' : 'no'} onChange={(event) => setForm({ ...form, is_high_value: event.target.value === 'yes' })}>
              <option value="no">No</option>
              <option value="yes">Yes — extra verification</option>
            </Select>
          </Field>
          <Field label="Sort order"><Input type="number" value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: Number(event.target.value) })} /></Field>
        </div>
        <Field label="Status">
          <Select value={form.is_active ? 'active' : 'inactive'} onChange={(event) => setForm({ ...form, is_active: event.target.value === 'active' })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* University settings                                                */
/* ------------------------------------------------------------------ */
export function UniversitySettings() {
  const toast = useToast();
  const { reload: reloadUniversities } = useUniversity();
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState(null);
  const [logoFile, setLogoFile] = useState(null);

  const { data, loading, error, reload } = useApi(() => AdminApi.settings(), []);

  React.useEffect(() => {
    if (data) {
      setProfile({
        name: data.university?.name || '',
        short_name: data.university?.short_name || '',
        contact_email: data.university?.contact_email || '',
        contact_phone: data.university?.contact_phone || '',
        address_line: data.university?.address_line || '',
        city: data.university?.city || '',
        region: data.university?.region || '',
        primary_color: data.university?.primary_color || '#142822',
        accent_color: data.university?.accent_color || '#D95D39'
      });
      setSettings({
        verification_mode: data.settings?.verification_mode || 'admin_manual',
        allowed_email_domains: data.settings?.allowed_email_domains || '',
        require_id_upload: data.settings?.require_id_upload ?? true,
        matching_high_threshold: data.settings?.matching_high_threshold ?? 75,
        matching_medium_threshold: data.settings?.matching_medium_threshold ?? 55,
        auto_close_days: data.settings?.auto_close_days ?? 90,
        max_upload_mb: data.settings?.max_upload_mb ?? 5,
        support_email: data.settings?.support_email || '',
        support_phone: data.settings?.support_phone || '',
        smtp_host: data.settings?.smtp_host || '',
        smtp_port: data.settings?.smtp_port || 587,
        smtp_username: data.settings?.smtp_username || '',
        smtp_from_email: data.settings?.smtp_from_email || '',
        smtp_use_tls: data.settings?.smtp_use_tls ?? true,
        smtp_password: ''
      });
    }
  }, [data]);

  const saveProfile = async () => {
    setBusy(true);
    try {
      await AdminApi.updateUniversity(profile);
      toast.success('University profile updated.');
      reload();
      reloadUniversities();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async () => {
    setBusy(true);
    try {
      const payload = { ...settings };
      if (!payload.smtp_password) delete payload.smtp_password;
      await AdminApi.updateSettings(payload);
      toast.success('Settings saved.');
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const uploadLogo = async () => {
    if (!logoFile) return;
    setBusy(true);
    try {
      const payload = new FormData();
      payload.append('logo', logoFile);
      await AdminApi.uploadLogo(payload);
      toast.success('Logo updated.');
      setLogoFile(null);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading || !profile || !settings) return <Loading rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div>
      <div className="page-title-row">
        <div>
          <div className="eyebrow-text">Institution configuration</div>
          <h1 className="page-title">University settings</h1>
          <p className="page-subtitle">Branding, verification policy, matching thresholds and email delivery.</p>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Card style={{ padding: 24 }}>
          <div className="panel-title">Institution profile</div>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="University name"><Input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></Field>
            <div className="grid-2">
              <Field label="Short name"><Input value={profile.short_name} onChange={(event) => setProfile({ ...profile, short_name: event.target.value })} /></Field>
              <Field label="Code"><Input value={data.university?.code || ''} disabled /></Field>
            </div>
            <div className="grid-2">
              <Field label="Contact email"><Input value={profile.contact_email} onChange={(event) => setProfile({ ...profile, contact_email: event.target.value })} /></Field>
              <Field label="Contact phone"><Input value={profile.contact_phone} onChange={(event) => setProfile({ ...profile, contact_phone: event.target.value })} /></Field>
            </div>
            <Field label="Address"><Input value={profile.address_line} onChange={(event) => setProfile({ ...profile, address_line: event.target.value })} /></Field>
            <div className="grid-2">
              <Field label="City"><Input value={profile.city} onChange={(event) => setProfile({ ...profile, city: event.target.value })} /></Field>
              <Field label="Region"><Input value={profile.region} onChange={(event) => setProfile({ ...profile, region: event.target.value })} /></Field>
            </div>
            <div className="grid-2">
              <Field label="Primary colour"><Input type="color" value={profile.primary_color} onChange={(event) => setProfile({ ...profile, primary_color: event.target.value })} /></Field>
              <Field label="Accent colour"><Input type="color" value={profile.accent_color} onChange={(event) => setProfile({ ...profile, accent_color: event.target.value })} /></Field>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="primary" loading={busy} onClick={saveProfile}>Save profile</Button>
            </div>
          </div>

          <div className="panel" style={{ marginTop: 18 }}>
            <div className="panel-title">Institution logo</div>
            {data.university?.logo_url ? (
              <img src={data.university.logo_url} alt="Current logo" style={{ height: 48, marginBottom: 10 }} />
            ) : (
              <p className="small muted">No logo uploaded — the crest initials are used.</p>
            )}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setLogoFile(event.target.files?.[0] || null)} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <Button variant="secondary" disabled={!logoFile} loading={busy} onClick={uploadLogo}>Upload logo</Button>
            </div>
          </div>
        </Card>

        <div style={{ display: 'grid', gap: 18 }}>
          <Card style={{ padding: 24 }}>
            <div className="panel-title">Verification policy</div>
            <div style={{ display: 'grid', gap: 12 }}>
              <Field label="Verification mode" hint="Manual review is always performed — this controls the supporting signal.">
                <Select value={settings.verification_mode} onChange={(event) => setSettings({ ...settings, verification_mode: event.target.value })}>
                  <option value="admin_manual">Administrator manual review</option>
                  <option value="email_domain">Restrict to institutional email domains</option>
                  <option value="hybrid">Domain restriction + manual review</option>
                </Select>
              </Field>
              <Field label="Allowed email domains" hint="Comma separated. Leave blank to allow any domain.">
                <Input value={settings.allowed_email_domains} onChange={(event) => setSettings({ ...settings, allowed_email_domains: event.target.value })} placeholder="alderton.edu, students.alderton.edu" />
              </Field>
              <Field label="Require ID document upload">
                <Select value={settings.require_id_upload ? 'yes' : 'no'} onChange={(event) => setSettings({ ...settings, require_id_upload: event.target.value === 'yes' })}>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </Select>
              </Field>
            </div>
          </Card>

          <Card style={{ padding: 24 }}>
            <div className="panel-title">Matching &amp; uploads</div>
            <div className="grid-2">
              <Field label="High confidence threshold"><Input type="number" min="0" max="100" value={settings.matching_high_threshold} onChange={(event) => setSettings({ ...settings, matching_high_threshold: Number(event.target.value) })} /></Field>
              <Field label="Medium confidence threshold"><Input type="number" min="0" max="100" value={settings.matching_medium_threshold} onChange={(event) => setSettings({ ...settings, matching_medium_threshold: Number(event.target.value) })} /></Field>
            </div>
            <div className="grid-2" style={{ marginTop: 12 }}>
              <Field label="Auto-close after (days)"><Input type="number" min="1" value={settings.auto_close_days} onChange={(event) => setSettings({ ...settings, auto_close_days: Number(event.target.value) })} /></Field>
              <Field label="Max upload size (MB)"><Input type="number" min="1" max="50" value={settings.max_upload_mb} onChange={(event) => setSettings({ ...settings, max_upload_mb: Number(event.target.value) })} /></Field>
            </div>
          </Card>

          <Card style={{ padding: 24 }}>
            <div className="panel-title">Email delivery (SMTP)</div>
            <div className="grid-2">
              <Field label="SMTP host"><Input value={settings.smtp_host} onChange={(event) => setSettings({ ...settings, smtp_host: event.target.value })} placeholder="smtp.example.edu" /></Field>
              <Field label="Port"><Input type="number" value={settings.smtp_port} onChange={(event) => setSettings({ ...settings, smtp_port: Number(event.target.value) })} /></Field>
            </div>
            <div className="grid-2" style={{ marginTop: 12 }}>
              <Field label="Username"><Input value={settings.smtp_username} onChange={(event) => setSettings({ ...settings, smtp_username: event.target.value })} /></Field>
              <Field label="Password" hint={data.settings?.smtp_password_set ? 'A password is stored — leave blank to keep it.' : 'Not set yet.'}>
                <Input type="password" value={settings.smtp_password} onChange={(event) => setSettings({ ...settings, smtp_password: event.target.value })} />
              </Field>
            </div>
            <div className="grid-2" style={{ marginTop: 12 }}>
              <Field label="From address"><Input value={settings.smtp_from_email} onChange={(event) => setSettings({ ...settings, smtp_from_email: event.target.value })} /></Field>
              <Field label="Use TLS">
                <Select value={settings.smtp_use_tls ? 'yes' : 'no'} onChange={(event) => setSettings({ ...settings, smtp_use_tls: event.target.value === 'yes' })}>
                  <option value="yes">Yes (STARTTLS)</option>
                  <option value="no">No</option>
                </Select>
              </Field>
            </div>
            <div className="notice notice-info" style={{ marginTop: 12 }}>
              <span>
                Without SMTP credentials, notifications are stored in the email log and can be delivered manually —
                in-app notifications always work.
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <Button variant="primary" loading={busy} onClick={saveSettings}>Save settings</Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Activity logs                                                      */
/* ------------------------------------------------------------------ */
export function ActivityLogs() {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi(
    () => AdminApi.logs({ q: query || undefined, page, page_size: 25 }),
    [query, page]
  );

  return (
    <div>
      <div className="page-title-row">
        <div>
          <div className="eyebrow-text">Audit trail</div>
          <h1 className="page-title">Activity logs</h1>
          <p className="page-subtitle">Every custody, verification, claim and administrative action for your institution.</p>
        </div>
        <Field label="Search">
          <Input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Action, actor or detail" />
        </Field>
      </div>

      {loading ? <Loading rows={4} /> : null}
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {!loading && (data?.items || []).length === 0 ? <EmptyState title="No activity" message="Audit entries appear as staff and members act." /> : null}

      {(data?.items || []).length > 0 ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Table columns={['Time', 'Actor', 'Role', 'Action', 'Entity', 'Detail']}>
            {data.items.map((log) => (
              <tr key={log.id}>
                <td className="tabular xs">{formatDateTime(log.at)}</td>
                <td className="xs">{log.actor || 'System'}</td>
                <td className="xs">{log.role || '—'}</td>
                <td className="xs" style={{ fontWeight: 600 }}>{titleCase(log.action)}</td>
                <td className="mono xs">{log.entity_type ? `${log.entity_type} ${log.entity_id || ''}` : '—'}</td>
                <td className="xs">{log.detail || '—'}</td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}

      <Pagination pagination={data?.pagination} onPage={setPage} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Email delivery log                                                 */
/* ------------------------------------------------------------------ */
export function EmailLog() {
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi(() => AdminApi.emailLog({ page, page_size: 20 }), [page]);

  return (
    <div>
      <div className="page-title-row">
        <div>
          <div className="eyebrow-text">Notifications</div>
          <h1 className="page-title">Email delivery</h1>
          <p className="page-subtitle">
            Every outbound message. When SMTP is not configured, messages are recorded here for manual delivery.
          </p>
        </div>
      </div>

      {loading ? <Loading rows={4} /> : null}
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {!loading && (data?.items || []).length === 0 ? <EmptyState title="No emails yet" message="Messages appear when reports, claims or verifications trigger notifications." /> : null}

      {(data?.items || []).length > 0 ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Table columns={['Time', 'To', 'Subject', 'Status', 'Preview']}>
            {data.items.map((email) => (
              <tr key={email.id}>
                <td className="tabular xs">{formatDateTime(email.at)}</td>
                <td className="xs">{email.to}</td>
                <td className="xs" style={{ fontWeight: 600 }}>{email.subject}</td>
                <td><StatusBadge status={email.status === 'sent' ? 'active' : email.status === 'failed' ? 'rejected' : 'pending'} label={titleCase(email.status)} /></td>
                <td className="xs muted" style={{ maxWidth: 320 }}>{email.preview}</td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}

      <Pagination pagination={data?.pagination} onPage={setPage} />
    </div>
  );
}
