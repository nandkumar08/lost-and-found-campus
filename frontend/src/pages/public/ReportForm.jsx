import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { useUniversity } from '../../context/UniversityContext';
import { useToast } from '../../context/ToastContext';
import { CatalogApi, ReportApi } from '../../services/api';
import { Button, Card, Field, Input, Select, Textarea } from '../../components/ui';
import { ImageUploader } from '../../components/ImageUploader';
import { QRPass, downloadQr, printQr } from '../../components/QRPass';
import { todayISO } from '../../utils/format';

const EMPTY_FORM = {
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
  reporter_name: '',
  reporter_email: '',
  reporter_phone: ''
};

export default function ReportForm() {
  const { type } = useParams();
  const reportType = type === 'found' ? 'found' : 'lost';
  const navigate = useNavigate();
  const { active } = useUniversity();
  const { user, isAuthed } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState(EMPTY_FORM);
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  const { data: catalog } = useApi(
    () => Promise.all([CatalogApi.categories(active?.code), CatalogApi.locations(active?.code)]),
    [active?.code]
  );
  const categories = catalog?.[0]?.categories || [];
  const locations = catalog?.[1]?.locations || [];
  const storageLocations = useMemo(() => locations.filter((location) => location.is_storage), [locations]);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      reporter_name: current.reporter_name || user?.full_name || '',
      reporter_email: current.reporter_email || user?.email || '',
      reporter_phone: current.reporter_phone || user?.phone || ''
    }));
  }, [user]);

  useEffect(() => {
    setForm(EMPTY_FORM);
    setFiles([]);
    setSubmitted(null);
  }, [reportType]);

  const update = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const validate = () => {
    const next = {};
    if (form.title.trim().length < 3) next.title = 'Enter at least 3 characters.';
    if (form.description.trim().length < 10) next.description = 'Describe the item in at least 10 characters.';
    if (!form.category_id) next.category_id = 'Select a category.';
    if (!form.incident_date) next.incident_date = 'Select the date.';
    if (!form.location_id && !form.location_text.trim())
      next.location_id = reportType === 'lost' ? 'Select or type where it was lost.' : 'Select or type where it was found.';
    if (reportType === 'found' && !form.custody_location)
      next.custody_location = 'State where the item is currently held.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.reporter_email)) next.reporter_email = 'Enter a valid email address.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!validate()) {
      toast.error('Please correct the highlighted fields.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = new FormData();
      payload.append('report_type', reportType);
      payload.append('title', form.title.trim());
      payload.append('description', form.description.trim());
      payload.append('reporter_email', form.reporter_email.trim());
      payload.append('incident_date', form.incident_date);
      if (form.category_id) payload.append('category_id', form.category_id);
      if (form.colour) payload.append('colour', form.colour);
      if (form.brand) payload.append('brand', form.brand);
      if (form.confidential_marks) payload.append('confidential_marks', form.confidential_marks);
      if (form.incident_time) payload.append('incident_time', form.incident_time);
      if (form.location_id) payload.append('location_id', form.location_id);
      if (form.location_text) payload.append('location_text', form.location_text);
      if (form.reporter_name) payload.append('reporter_name', form.reporter_name);
      if (form.reporter_phone) payload.append('reporter_phone', form.reporter_phone);
      if (form.custody_location) payload.append('custody_location', form.custody_location);
      if (form.custody_notes) payload.append('custody_notes', form.custody_notes);
      payload.append('university_code', active?.code || '');
      files.forEach((file) => payload.append('images', file));

      const result = await ReportApi.create(payload);
      setSubmitted(result);
      toast.success(`Report ${result.report.report_code} logged successfully.`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    const report = submitted.report;
    return (
      <div className="container" style={{ paddingTop: 44, paddingBottom: 64, maxWidth: 720 }}>
        <Card style={{ padding: 34, textAlign: 'center' }}>
          <span className="badge badge-approved" style={{ marginBottom: 14 }}>
            Submission confirmed
          </span>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--brand-primary)', marginBottom: 8 }}>
            {reportType === 'lost' ? 'Lost item report logged' : 'Found property report logged'}
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--ink-secondary)', marginBottom: 22 }}>
            Keep your report ID and tracking link. The QR pass below contains no personal information.
          </p>

          <QRPass
            qr={submitted.qr}
            reportCode={report.report_code}
            onDownload={() => downloadQr(submitted.qr, report.report_code)}
            onPrint={() => printQr(submitted.qr, report.report_code, report.title)}
          />

          <div className="linen-panel" style={{ padding: 16, textAlign: 'left', fontSize: 13, marginTop: 22 }}>
            <div className="kv-row">
              <div className="kv-key">Report ID</div>
              <div className="mono strong">{report.report_code}</div>
            </div>
            <div className="kv-row">
              <div className="kv-key">Item</div>
              <div>{report.title}</div>
            </div>
            <div className="kv-row">
              <div className="kv-key">Status</div>
              <div>{report.status_label}</div>
            </div>
            <div className="kv-row">
              <div className="kv-key">Tracking link</div>
              <div style={{ wordBreak: 'break-all', fontSize: 12 }}>
                {submitted.tracking_url}
                <div className="muted xs" style={{ marginTop: 4 }}>
                  Keep this link private — it unlocks the detailed timeline for this report.
                </div>
              </div>
            </div>
            <div className="kv-row">
              <div className="kv-key">Privacy</div>
              <div>Confidential marks and contact details are hidden from public listings.</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 24 }}>
            <Button variant="primary" onClick={() => navigate(`/track?code=${report.report_code}&token=${submitted.tracking_token}`)}>
              Track report status
            </Button>
            {isAuthed ? (
              <Button variant="secondary" onClick={() => navigate('/dashboard')}>
                Go to dashboard
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => navigate('/register')}>
                Create an account to manage it
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                setSubmitted(null);
                setForm(EMPTY_FORM);
                setFiles([]);
              }}
            >
              File another report
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--bg-canvas)', paddingBottom: 60 }}>
      <div className="container" style={{ paddingTop: 32, maxWidth: 900 }}>
        <div style={{ marginBottom: 22 }}>
          <span className={`badge ${reportType === 'lost' ? 'badge-lost' : 'badge-found'}`} style={{ marginBottom: 10 }}>
            {reportType === 'lost' ? 'Lost property filing' : 'Found property intake'}
          </span>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--brand-primary)', marginBottom: 6 }}>
            {reportType === 'lost' ? 'Report a lost item' : 'Report a found item'}
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--ink-secondary)', maxWidth: 720 }}>
            Fields marked with <span className="req-star">*</span> are required. Public details help identify the item;
            confidential details stay hidden and are used only for ownership verification.
          </p>
        </div>

        <form onSubmit={submit} noValidate>
          <Card style={{ padding: 28, display: 'grid', gap: 24 }}>
            <div>
              <h3 style={{ fontSize: 15.5, fontWeight: 700, borderBottom: '1px solid var(--border-hairline)', paddingBottom: 8, marginBottom: 16 }}>
                1. Public item information (visible in the registry)
              </h3>
              <div style={{ display: 'grid', gap: 16 }}>
                <div className="grid-2">
                  <Field label="Item name" required error={errors.title} htmlFor="title">
                    <Input id="title" value={form.title} onChange={update('title')} error={errors.title} placeholder="e.g. iPad Air 11-inch Space Grey" maxLength={180} />
                  </Field>
                  <Field label="Category" required error={errors.category_id} htmlFor="category">
                    <Select id="category" value={form.category_id} onChange={update('category_id')} error={errors.category_id}>
                      <option value="">Select a category</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <div className="grid-2">
                  <Field label="Primary colour" htmlFor="colour">
                    <Input id="colour" value={form.colour} onChange={update('colour')} placeholder="e.g. Matte black / navy" maxLength={80} />
                  </Field>
                  <Field label="Brand / manufacturer" htmlFor="brand">
                    <Input id="brand" value={form.brand} onChange={update('brand')} placeholder="e.g. Apple, Sony, Fossil" maxLength={80} />
                  </Field>
                </div>

                <Field label="General description" required error={errors.description} htmlFor="description" hint="Describe the outer appearance and condition. Do not include secret serial numbers here.">
                  <Textarea id="description" rows={3} value={form.description} onChange={update('description')} error={errors.description} placeholder="Colour, case, general condition, distinguishing features visible to anyone." maxLength={4000} />
                </Field>

                <div className="grid-3">
                  <Field label={reportType === 'lost' ? 'Lost date' : 'Found date'} required error={errors.incident_date} htmlFor="incident_date">
                    <Input id="incident_date" type="date" max={todayISO()} value={form.incident_date} onChange={update('incident_date')} error={errors.incident_date} />
                  </Field>
                  <Field label="Approximate time" htmlFor="incident_time">
                    <Input id="incident_time" type="time" value={form.incident_time} onChange={update('incident_time')} />
                  </Field>
                  <Field label={reportType === 'lost' ? 'Last seen location' : 'Found location'} required error={errors.location_id} htmlFor="location">
                    <Select id="location" value={form.location_id} onChange={update('location_id')} error={errors.location_id}>
                      <option value="">Select a campus location</option>
                      {locations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}{location.zone ? ` • ${location.zone}` : ''}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <Field label="Location detail (optional)" htmlFor="location_text" hint="Building, floor, room or courtyard if it is not in the list.">
                  <Input id="location_text" value={form.location_text} onChange={update('location_text')} placeholder="e.g. Library 3rd floor quiet zone" maxLength={180} />
                </Field>

                <Field label={reportType === 'lost' ? 'Photograph (optional)' : 'Photographs (recommended)'} hint={`Up to 5 images, ${active ? '5' : '5'} MB each. Images are re-encoded on the server to strip metadata.`}>
                  <ImageUploader files={files} onChange={setFiles} max={5} />
                </Field>
              </div>
            </div>

            <div className="linen-panel" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--brand-primary)' }}>
                  2. Confidential information (hidden from the public)
                </h3>
                <span className="badge badge-approved">Private</span>
              </div>

              <div style={{ display: 'grid', gap: 14 }}>
                <Field label="Identifying marks, serial suffix or hidden contents" htmlFor="confidential_marks" hint="Engravings, stickers, lock-screen wallpaper, contents inside a bag. Used only for ownership verification.">
                  <Textarea id="confidential_marks" rows={2} value={form.confidential_marks} onChange={update('confidential_marks')} maxLength={2000} />
                </Field>

                {reportType === 'found' ? (
                  <>
                    <Field label="Current storage / custody location" required error={errors.custody_location} htmlFor="custody">
                      <Select id="custody" value={form.custody_location} onChange={update('custody_location')} error={errors.custody_location}>
                        <option value="">Select where the item is stored</option>
                        {storageLocations.map((location) => (
                          <option key={location.id} value={location.name}>
                            {location.name}
                          </option>
                        ))}
                        <option value="Held by finder (awaiting vault drop-off)">Held by finder (awaiting vault drop-off)</option>
                      </Select>
                    </Field>
                    <Field label="Intake notes" htmlFor="custody_notes" hint="Locker number, evidence bag, officer notes.">
                      <Input id="custody_notes" value={form.custody_notes} onChange={update('custody_notes')} maxLength={255} />
                    </Field>
                  </>
                ) : null}

                <div className="grid-2">
                  <Field label={reportType === 'lost' ? 'Contact email' : 'Finder email'} required error={errors.reporter_email} htmlFor="email">
                    <Input id="email" type="email" value={form.reporter_email} onChange={update('reporter_email')} error={errors.reporter_email} />
                  </Field>
                  <Field label={reportType === 'lost' ? 'Contact phone (optional)' : 'Finder phone (optional)'} htmlFor="phone">
                    <Input id="phone" value={form.reporter_phone} onChange={update('reporter_phone')} maxLength={40} />
                  </Field>
                </div>
                <Field label="Your name" htmlFor="reporter_name">
                  <Input id="reporter_name" value={form.reporter_name} onChange={update('reporter_name')} maxLength={140} />
                </Field>
              </div>
            </div>

            {!isAuthed ? (
              <div className="notice notice-info">
                <span>
                  You are filing as a guest. <Link to="/register">Create a campus account</Link> to track reports,
                  submit claims and receive email alerts. Your report ID works either way.
                </span>
              </div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              <Button variant="secondary" type="button" onClick={() => navigate('/')}>
                Cancel
              </Button>
              <Button variant="primary" size="lg" type="submit" loading={submitting}>
                Submit report
              </Button>
            </div>
          </Card>
        </form>
      </div>
    </div>
  );
}
