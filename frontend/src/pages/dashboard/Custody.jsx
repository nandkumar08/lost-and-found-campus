import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi, useDebounced } from '../../hooks/useApi';
import { useUniversity } from '../../context/UniversityContext';
import { useToast } from '../../context/ToastContext';
import { AdminApi, CatalogApi, QrApi, ReportApi } from '../../services/api';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  Select,
  StatusBadge,
  Table,
  Textarea
} from '../../components/ui';
import { ImageUploader } from '../../components/ImageUploader';
import { formatDate, formatDateTime, titleCase, todayISO } from '../../utils/format';

/* ------------------------------------------------------------------ */
/* Found item intake (security desk)                                  */
/* ------------------------------------------------------------------ */
export function Intake() {
  const { active } = useUniversity();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({
    title: '',
    category_id: '',
    colour: '',
    brand: '',
    description: '',
    confidential_marks: '',
    incident_date: todayISO(),
    incident_time: '',
    location_id: '',
    location_text: '',
    custody_location: '',
    custody_notes: '',
    reporter_email: '',
    reporter_phone: ''
  });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);

  const { data: catalog } = useApi(
    () => Promise.all([CatalogApi.categories(active?.code), CatalogApi.locations(active?.code, { storage_only: true })]),
    [active?.code]
  );
  const categories = catalog?.[0]?.categories || [];
  const storage = catalog?.[1]?.locations || [];

  useEffect(() => {
    if (storage.length && !form.custody_location) {
      setForm((current) => ({ ...current, custody_location: storage[0].name }));
    }
  }, [storage, form.custody_location]);

  const submit = async (event) => {
    event.preventDefault();
    if (form.title.trim().length < 3 || form.description.trim().length < 10) {
      toast.error('Provide an item name and a description of at least 10 characters.');
      return;
    }
    if (!form.category_id || !form.location_id || !form.custody_location) {
      toast.error('Category, found location and custody location are required.');
      return;
    }
    setBusy(true);
    try {
      const payload = new FormData();
      payload.append('report_type', 'found');
      Object.entries(form).forEach(([key, value]) => {
        if (value) payload.append(key, value);
      });
      payload.append('reporter_email', form.reporter_email || 'custody-desk@desk.local');
      payload.append('university_code', active?.code || '');
      files.forEach((file) => payload.append('images', file));
      const result = await ReportApi.create(payload);
      setCreated(result);
      toast.success(`Intake recorded as ${result.report.report_code}.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <div style={{ maxWidth: 720 }}>
        <Card style={{ padding: 28 }}>
          <span className="badge badge-approved" style={{ marginBottom: 12 }}>Intake recorded</span>
          <h1 className="page-title" style={{ marginBottom: 8 }}>{created.report.report_code}</h1>
          <p className="page-subtitle" style={{ marginBottom: 18 }}>
            {created.report.title} is now in custody at {created.report.custody_location}. The matching engine has
            scored it against open lost reports.
          </p>
          <div className="kv-list">
            <div className="kv-row"><div className="kv-key">Status</div><div><StatusBadge status={created.report.status} label={created.report.status_label} /></div></div>
            <div className="kv-row"><div className="kv-key">Custody</div><div>{created.report.custody_location}</div></div>
            <div className="kv-row"><div className="kv-key">Custody pass</div><div><a href={created.qr.image_url} target="_blank" rel="noreferrer" className="link-plain">Open QR image</a></div></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={() => { setCreated(null); setForm({ ...form, title: '', description: '', confidential_marks: '', colour: '', brand: '' }); setFiles([]); }}>
              Log another item
            </Button>
            <Button variant="secondary" onClick={() => navigate('/dashboard/custody')}>Open vault</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 940 }}>
      <div className="page-title-row">
        <div>
          <div className="eyebrow-text">Custody operations</div>
          <h1 className="page-title">Found item intake</h1>
          <p className="page-subtitle">
            Record property handed to the custody desk. Confidential marks entered here are what officers compare
            against later ownership claims.
          </p>
        </div>
      </div>

      <form onSubmit={submit}>
        <Card style={{ padding: 24, display: 'grid', gap: 16 }}>
          <div className="grid-2">
            <Field label="Item name" required><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Apple 14-inch laptop" /></Field>
            <Field label="Category" required>
              <Select value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value })}>
                <option value="">Select category</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Colour"><Input value={form.colour} onChange={(event) => setForm({ ...form, colour: event.target.value })} /></Field>
            <Field label="Brand"><Input value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} /></Field>
          </div>
          <Field label="Description" required>
            <Textarea rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </Field>
          <Field label="Confidential identifying marks" hint="Serial suffix, engravings, contents, lock screen. Never published.">
            <Textarea rows={2} value={form.confidential_marks} onChange={(event) => setForm({ ...form, confidential_marks: event.target.value })} />
          </Field>
          <div className="grid-3">
            <Field label="Found date" required><Input type="date" max={todayISO()} value={form.incident_date} onChange={(event) => setForm({ ...form, incident_date: event.target.value })} /></Field>
            <Field label="Time"><Input type="time" value={form.incident_time} onChange={(event) => setForm({ ...form, incident_time: event.target.value })} /></Field>
            <Field label="Found location" required>
              <Select value={form.location_id} onChange={(event) => setForm({ ...form, location_id: event.target.value })}>
                <option value="">Select location</option>
                {(catalog?.[1]?.locations || []).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Location detail"><Input value={form.location_text} onChange={(event) => setForm({ ...form, location_text: event.target.value })} /></Field>
          <div className="grid-2">
            <Field label="Custody storage" required>
              <Select value={form.custody_location} onChange={(event) => setForm({ ...form, custody_location: event.target.value })}>
                <option value="">Select storage</option>
                {storage.map((location) => <option key={location.id} value={location.name}>{location.name}</option>)}
              </Select>
            </Field>
            <Field label="Locker / bag reference"><Input value={form.custody_notes} onChange={(event) => setForm({ ...form, custody_notes: event.target.value })} placeholder="e.g. Locker B4, evidence bag 44" /></Field>
          </div>
          <Field label="Photographs" hint="Evidence photos of the item and any marks.">
            <ImageUploader files={files} onChange={setFiles} max={5} />
          </Field>
          <div className="grid-2">
            <Field label="Contact email (finder / desk)"><Input type="email" value={form.reporter_email} onChange={(event) => setForm({ ...form, reporter_email: event.target.value })} placeholder="security@university.edu" /></Field>
            <Field label="Contact phone"><Input value={form.reporter_phone} onChange={(event) => setForm({ ...form, reporter_phone: event.target.value })} /></Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button variant="primary" size="lg" type="submit" loading={busy}>Record intake</Button>
          </div>
        </Card>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Deposited items vault                                              */
/* ------------------------------------------------------------------ */
export function Custody() {
  const toast = useToast();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query);

  const { data, loading, error, reload } = useApi(() => AdminApi.securityDashboard(), []);

  const items = useMemo(() => {
    const list = data?.custody_items || [];
    return list.filter((item) => {
      const matchesQuery = !debounced ||
        item.title.toLowerCase().includes(debounced.toLowerCase()) ||
        item.report_code.toLowerCase().includes(debounced.toLowerCase());
      return matchesQuery;
    });
  }, [data, debounced]);

  return (
    <div>
      <div className="page-title-row">
        <div>
          <div className="eyebrow-text">Custody operations</div>
          <h1 className="page-title">Deposited items</h1>
          <p className="page-subtitle">Everything currently held in campus custody awaiting verification or collection.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={() => navigate('/dashboard/intake')}>New intake</Button>
          <Button variant="secondary" onClick={() => navigate('/dashboard/scan')}>Scan pass</Button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="field-group filter-search">
          <Field label="Search"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Item name or report code" /></Field>
        </div>
      </div>

      {loading ? <Loading rows={4} /> : null}
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {!loading && items.length === 0 ? <EmptyState title="Vault is clear" message="No items currently in custody." /> : null}

      {items.length > 0 ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Table columns={['Item', 'Category', 'Custody location', 'Status', 'Found', 'Reported']}>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{item.title}</div>
                  <div className="mono xs muted">{item.report_code}</div>
                </td>
                <td className="xs">{item.category_name || '—'}</td>
                <td className="xs">{item.custody_location || '—'}</td>
                <td><StatusBadge status={item.status} label={titleCase(item.status)} /></td>
                <td className="tabular xs">{formatDate(item.incident_date)}</td>
                <td className="tabular xs">{formatDate(item.created_at)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* QR scanner                                                         */
/* ------------------------------------------------------------------ */
export function QrScanner() {
  const toast = useToast();
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const resolve = async (value) => {
    if (!value || value.length < 8) {
      setError('Enter or paste the token from the scanned pass.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await QrApi.scan(value);
      setResult(data);
      toast.success(`Pass resolved: ${data.report.report_code}`);
    } catch (err) {
      setResult(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 820 }}>
      <div className="page-title-row">
        <div>
          <div className="eyebrow-text">Custody operations</div>
          <h1 className="page-title">QR scanner</h1>
          <p className="page-subtitle">
            Resolve a custody pass. As a signed-in officer you see the private custody details; public scans see only
            the report status.
          </p>
        </div>
      </div>

      <Card style={{ padding: 24, marginBottom: 18 }}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            resolve(token);
          }}
          style={{ display: 'grid', gap: 12 }}
        >
          <Field label="Scanned token" hint="Paste the token from the scanned link (after ?qr=).">
            <Input className="mono" value={token} onChange={(event) => setToken(event.target.value.trim())} />
          </Field>
          {error ? <div className="notice notice-danger"><span>{error}</span></div> : null}
          <div><Button variant="primary" type="submit" loading={loading}>Resolve pass</Button></div>
        </form>
      </Card>

      {result ? (
        <Card style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <div className="eyebrow-text">Resolved custody pass</div>
              <h3 style={{ fontSize: 17, fontWeight: 800 }}>{result.report.report_code}</h3>
            </div>
            <StatusBadge status={result.report.status} label={result.report.status_label} />
          </div>
          <div className="kv-list">
            <div className="kv-row"><div className="kv-key">Item</div><div>{result.report.title}</div></div>
            <div className="kv-row"><div className="kv-key">Custody location</div><div>{result.officer_view?.custody_location || '—'}</div></div>
            <div className="kv-row"><div className="kv-key">Confidential marks</div><div>{result.officer_view?.confidential_marks || '—'}</div></div>
            <div className="kv-row"><div className="kv-key">Reporter</div><div>{result.officer_view?.reporter_name || '—'}</div></div>
            <div className="kv-row">
              <div className="kv-key">Claims</div>
              <div>
                {result.officer_view?.claims?.length
                  ? result.officer_view.claims.map((claim) => `${claim.claim_code} (${claim.status})`).join(', ')
                  : 'No claims filed'}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => navigate('/dashboard/claims')}>Open claims</Button>
            <Button variant="primary" onClick={() => navigate('/dashboard/returns')}>Open handovers</Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
