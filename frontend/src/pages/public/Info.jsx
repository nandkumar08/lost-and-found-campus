import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useUniversity } from '../../context/UniversityContext';
import { Button, Card, Field, Input, Textarea } from '../../components/ui';
import { useToast } from '../../context/ToastContext';

const STAGES = [
  {
    step: '01',
    title: 'Report',
    body: 'File a lost or found report with public attributes (category, colour, brand, location, date) and private identifying marks. No account is required to file.'
  },
  {
    step: '02',
    title: 'Match',
    body: 'A Python rule engine scores each lost/found pair across seven weighted attributes and surfaces high, medium and low confidence leads for human review.'
  },
  {
    step: '03',
    title: 'Verify',
    body: 'The owner submits a claim with a private description and optional evidence. A custody officer compares it with the marks recorded at intake. Uploading an ID never auto-approves anything.'
  },
  {
    step: '04',
    title: 'Return',
    body: 'Approved claims can schedule a collection window. Readiness, owner confirmation and handover are recorded separately, producing a digital return receipt and closing the report.'
  }
];

const PRIVACY = [
  ['Public listing', 'Category, colour, brand, general description, campus location, incident date, report ID.'],
  ['Owner & officers only', 'Confidential identifying marks, contact details, exact locker, claim evidence.'],
  ['Administrators only', 'Identity documents, verification decisions, audit logs, settings, analytics.']
];

export function HowItWorks() {
  const { active } = useUniversity();
  return (
    <div className="container" style={{ paddingTop: 36, paddingBottom: 60, maxWidth: 980 }}>
      <div className="eyebrow-text">Custody workflow</div>
      <h1 className="page-title" style={{ marginBottom: 8 }}>How {active?.short_name || 'campus'} lost &amp; found works</h1>
      <p className="page-subtitle" style={{ marginBottom: 28 }}>
        Every recovery follows the same four stages, with a human decision at the point that matters: the handover.
      </p>

      <div className="grid-2" style={{ marginBottom: 32 }}>
        {STAGES.map((stage) => (
          <Card key={stage.step} style={{ padding: 24 }}>
            <div className="brand-crest" style={{ marginBottom: 14 }} aria-hidden="true">{stage.step}</div>
            <h3 style={{ fontSize: 16.5, fontWeight: 700, marginBottom: 8 }}>{stage.title}</h3>
            <p style={{ fontSize: 13.5, color: 'var(--ink-secondary)' }}>{stage.body}</p>
          </Card>
        ))}
      </div>

      <Card style={{ padding: 26, marginBottom: 26 }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: 'var(--brand-primary)', marginBottom: 14 }}>Data visibility by role</h2>
        <div className="kv-list">
          {PRIVACY.map(([label, detail]) => (
            <div className="kv-row" key={label}>
              <div className="kv-key">{label}</div>
              <div style={{ fontSize: 13 }}>{detail}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ padding: 26 }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: 'var(--brand-primary)', marginBottom: 10 }}>Matching weights</h2>
        <p style={{ fontSize: 13.5, color: 'var(--ink-secondary)', marginBottom: 16 }}>
          The engine scores every plausible lost/found pair from 0 to 100. A match never changes an item to
          "returned" — an officer must confirm the claim first.
        </p>
        <div style={{ display: 'grid', gap: 8 }}>
          {[
            ['Category', 20],
            ['Item name', 20],
            ['Description', 20],
            ['Colour', 10],
            ['Brand', 10],
            ['Location', 10],
            ['Date & time', 10]
          ].map(([label, weight]) => (
            <div className="bar-row" key={label}>
              <span>{label}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(weight / 20) * 100}%` }} />
              </div>
              <span className="tabular">{weight}%</span>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 10, marginTop: 26, flexWrap: 'wrap' }}>
        <Link to="/report/lost"><Button variant="primary">Report a lost item</Button></Link>
        <Link to="/track"><Button variant="secondary">Track a report</Button></Link>
      </div>
    </div>
  );
}

export function About() {
  const { active } = useUniversity();
  return (
    <div className="container" style={{ paddingTop: 36, paddingBottom: 60, maxWidth: 900 }}>
      <div className="eyebrow-text">About the platform</div>
      <h1 className="page-title" style={{ marginBottom: 16 }}>A custody registry built for universities</h1>
      <Card style={{ padding: 26, marginBottom: 20 }}>
        <p style={{ fontSize: 14, color: 'var(--ink-secondary)', marginBottom: 14 }}>
          Lost &amp; Found Campus is a multi-university platform: one deployment serves many institutions, each with
          completely isolated users, identity documents, reports, matches, claims and returns. Every record is scoped
          to a university, and isolation is enforced in the backend rather than the interface.
        </p>
        <p style={{ fontSize: 14, color: 'var(--ink-secondary)', marginBottom: 14 }}>
          The platform is deliberately explicit about what it protects. Public listings never reveal serial numbers,
          precise locker numbers, contact details or identity documents. Ownership claims are reviewed by campus
          officers against private marks recorded at intake, and the final handover requires two independent
          confirmations before a report closes.
        </p>
        <p style={{ fontSize: 14, color: 'var(--ink-secondary)' }}>
          This deployment currently serves <strong>{active?.name || 'its institutions'}</strong>. Institution branding,
          categories, campus locations, verification policy and SMTP credentials are configured per university by its
          own administrators.
        </p>
      </Card>

      <div className="grid-3">
        {[
          { title: 'Confidential by default', body: 'Private marks and evidence are visible only to the owner and custody staff.' },
          { title: 'Human verified', body: 'No automatic approval of identities, claims or returns at any stage.' },
          { title: 'Auditable', body: 'Every custody, claim and administrative action is written to an audit log.' }
        ].map((item) => (
          <Card key={item.title} style={{ padding: 22 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{item.title}</h3>
            <p style={{ fontSize: 13, color: 'var(--ink-secondary)' }}>{item.body}</p>
          </Card>
        ))}
      </div>

      <Card style={{ padding: 26, marginTop: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--brand-primary)', marginBottom: 10 }}>Technology</h2>
        <p style={{ fontSize: 13.5, color: 'var(--ink-secondary)' }}>
          React (JavaScript) with ordinary CSS on the front end; Python FastAPI with JWT authentication, parameterized
          SQL, a managed MySQL connection pool, Pillow image processing and server generated QR codes on the back end.
          No Node backend, no ORM and no client-side data store.
        </p>
      </Card>
    </div>
  );
}

export function Contact() {
  const { active } = useUniversity();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });

  return (
    <div className="container" style={{ paddingTop: 36, paddingBottom: 60, maxWidth: 900 }}>
      <div className="eyebrow-text">Support</div>
      <h1 className="page-title" style={{ marginBottom: 8 }}>Contact the custody desk</h1>
      <p className="page-subtitle" style={{ marginBottom: 24 }}>
        For urgent property matters, visit the {active?.short_name || 'campus'} security desk with your report ID.
      </p>

      <div className="grid-2">
        <Card style={{ padding: 24 }}>
          <div className="panel-title">Institution contacts</div>
          <div className="kv-list">
            <div className="kv-row">
              <div className="kv-key">University</div>
              <div>{active?.name || 'Not selected'}</div>
            </div>
            <div className="kv-row">
              <div className="kv-key">Custody email</div>
              <div style={{ wordBreak: 'break-all' }}>{active?.contact_email || 'Not published'}</div>
            </div>
            <div className="kv-row">
              <div className="kv-key">Phone</div>
              <div>{active?.contact_phone || 'Not published'}</div>
            </div>
            <div className="kv-row">
              <div className="kv-key">Address</div>
              <div>{[active?.city, active?.region].filter(Boolean).join(', ') || 'Not published'}</div>
            </div>
          </div>
          <div className="privacy-shield" style={{ marginTop: 16 }}>
            <span aria-hidden="true">🛡</span>
            <div>Never share passwords or identity documents by email. Staff will never ask for them.</div>
          </div>
        </Card>

        <Card style={{ padding: 24 }}>
          <div className="panel-title">Send a message</div>
          <form
            style={{ display: 'grid', gap: 14 }}
            onSubmit={(event) => {
              event.preventDefault();
              if (!form.name || !form.email || !form.message) {
                toast.error('Please complete your name, email and message.');
                return;
              }
              toast.success(
                `Thank you. Your message has been noted for the ${active?.short_name || 'campus'} custody desk.`
              );
              setForm({ name: '', email: '', subject: '', message: '' });
            }}
          >
            <Field label="Your name" required htmlFor="contact-name">
              <Input id="contact-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </Field>
            <Field label="Email" required htmlFor="contact-email">
              <Input id="contact-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </Field>
            <Field label="Subject" htmlFor="contact-subject">
              <Input id="contact-subject" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} />
            </Field>
            <Field label="Message" required htmlFor="contact-message">
              <Textarea id="contact-message" rows={4} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} />
            </Field>
            <div className="notice notice-info">
              <span>
                This form records a message for the demonstration deployment. Provisioned SMTP credentials deliver
                real email; otherwise messages are logged for manual follow-up.
              </span>
            </div>
            <Button variant="primary" type="submit">Send message</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
