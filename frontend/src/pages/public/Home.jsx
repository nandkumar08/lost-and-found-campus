import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { useUniversity } from '../../context/UniversityContext';
import { ReportApi } from '../../services/api';
import { Button, Card, EmptyState, ErrorState, Loading, StatusBadge, Tabs } from '../../components/ui';
import { ItemIllustration, iconForCategory } from '../../components/ItemIllustration';
import { formatDate } from '../../utils/format';

const FEATURES = [
  { num: '01', title: 'Report Item', desc: 'Log lost belongings or found property with public attributes and private identifying marks.' },
  { num: '02', title: 'Find & Claim', desc: 'Browse sanitised public listings and submit confidential proof of ownership.' },
  { num: '03', title: 'Get Matched', desc: 'The matching engine scores attribute similarity and flags leads for human review.' },
  { num: '04', title: 'Return & Recover', desc: 'Schedule a vault collection and complete handover with a digital QR receipt.' }
];

const FAQS = [
  {
    q: 'Why are serial numbers and identifying marks hidden from public listings?',
    a: 'To prevent fraudulent claims, private marks, lock screen details and locker numbers are revealed only to a custody officer during blind ownership verification.'
  },
  {
    q: 'Does an automatic match prove ownership?',
    a: 'No. A match is a lead. Every claim is reviewed by a campus officer against the private marks recorded at intake before a handover pass is issued.'
  },
  {
    q: 'Who can register?',
    a: 'Students, faculty, university staff, security personnel and other campus members register with their institutional identity. Administrator accounts are provisioned internally.'
  },
  {
    q: 'Can I report an item without an account?',
    a: 'Yes — lost and found reports can be filed as a guest. Tracking, claims and collection scheduling require a verified account.'
  }
];

export default function Home() {
  const navigate = useNavigate();
  const { active } = useUniversity();
  const [tab, setTab] = useState('all');
  const [trackValue, setTrackValue] = useState('');

  const { data, loading, error, reload } = useApi(
    () => ReportApi.browse({ university_code: active?.code, page_size: 6 }),
    [active?.code]
  );

  const items = (data?.items || []).filter((item) => tab === 'all' || item.report_type === tab);

  return (
    <div>
      <section className="hero-wrap">
        <div className="container hero-grid">
          <div>
            <div className="eyebrow-pill">
              <span>{active?.name || 'Campus Registry'} • Verified Custody Registry</span>
            </div>
            <h1 className="hero-title">
              Lost Something on Campus? <span>Recover It With Confidence.</span>
            </h1>
            <p style={{ fontSize: 16, color: 'var(--ink-secondary)', maxWidth: 540, marginBottom: 28 }}>
              Connecting students, faculty, staff and campus security through attribute matching,
              confidential ownership verification and QR-verified vault handovers.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 30 }}>
              <Button variant="primary" size="lg" onClick={() => navigate('/report/lost')}>
                Report Lost Item
              </Button>
              <Button variant="forest" size="lg" onClick={() => navigate('/report/found')}>
                Report Found Item
              </Button>
            </div>

            <Card style={{ padding: 18, maxWidth: 500 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-muted)', marginBottom: 8, fontFamily: 'var(--font-sans)' }}>
                Track an existing report
              </div>
              <form
                style={{ display: 'flex', gap: 10 }}
                onSubmit={(event) => {
                  event.preventDefault();
                  navigate(`/track?code=${encodeURIComponent(trackValue.trim())}`);
                }}
              >
                <input
                  className="input tabular mono"
                  value={trackValue}
                  onChange={(event) => setTrackValue(event.target.value.toUpperCase())}
                  placeholder={`Report ID (e.g. ${active?.code || 'ADTU'}-LF-1001)`}
                  aria-label="Report ID"
                />
                <Button variant="forest" type="submit">
                  Track
                </Button>
              </form>
            </Card>
          </div>

          <div className="arch-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#D6D3D1', fontFamily: 'var(--font-sans)' }}>
                Custody workflow
              </span>
              <span className="badge badge-approved">Privacy protected</span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 18, marginBottom: 16, border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: 11, color: '#FDBA74', fontWeight: 700, letterSpacing: '0.04em' }}>
                LIVE REGISTRY • {active?.code}
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>
                {data?.pagination?.total !== undefined
                  ? `${data.pagination.total} active report${data.pagination.total === 1 ? '' : 's'}`
                  : 'Connecting to registry…'}
              </div>
              <div style={{ fontSize: 13, color: '#D6D3D1', marginTop: 6 }}>
                Public listings show sanitised attributes only — never serial numbers, locker numbers or contacts.
              </div>
            </div>
            <div className="grid-2" style={{ gap: 12 }}>
              {[
                { title: 'Blind verification', desc: 'Private marks masked publicly', accent: false },
                { title: 'QR custody pass', desc: 'Token-based desk pickup', accent: true },
                { title: 'Tenant isolation', desc: 'Each campus sees only its records', accent: false },
                { title: 'Audit trail', desc: 'Every custody action logged', accent: false }
              ].map((feature) => (
                <div key={feature.title} style={{ background: 'rgba(255,255,255,0.05)', padding: 14, borderRadius: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: feature.accent ? '#FDBA74' : '#FAF9F5' }}>{feature.title}</div>
                  <div style={{ fontSize: 11.5, color: '#A8A29E', marginTop: 3 }}>{feature.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="container" style={{ paddingTop: 56, paddingBottom: 40 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h2 style={{ fontSize: 27, fontWeight: 800, color: 'var(--brand-primary)', marginBottom: 8 }}>
            Four-stage campus recovery
          </h2>
          <p style={{ fontSize: 14, color: 'var(--ink-secondary)' }}>
            Built for academic security desks, students, faculty and staff.
          </p>
        </div>
        <div className="grid-4">
          {FEATURES.map((feature, index) => (
            <Card key={feature.num} className="card-hover" style={{ padding: 24 }}>
              <div
                className="brand-crest"
                style={{ marginBottom: 16, background: index === 1 ? 'var(--brand-accent)' : index === 3 ? '#15803D' : 'var(--brand-primary)' }}
                aria-hidden="true"
              >
                {feature.num}
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{feature.title}</h3>
              <p style={{ fontSize: 13, color: 'var(--ink-secondary)' }}>{feature.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="container" style={{ paddingTop: 20, paddingBottom: 56 }}>
        <div className="section-header">
          <div>
            <h2 className="section-title">Recently reported items</h2>
            <p className="section-subtitle">
              Live registry entries from {active?.name}. Confidential details stay hidden until ownership is verified.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { value: 'all', label: 'All' },
                { value: 'lost', label: 'Lost' },
                { value: 'found', label: 'Found' }
              ]}
            />
            <Button variant="secondary" size="sm" onClick={() => navigate('/browse/all')}>
              Browse full registry →
            </Button>
          </div>
        </div>

        {loading ? <Loading rows={2} /> : null}
        {error ? <ErrorState error={error} onRetry={reload} /> : null}
        {!loading && !error && items.length === 0 ? (
          <EmptyState
            title="No reports yet"
            message="Once items are reported at this institution they will appear here."
            action={<Button variant="primary" onClick={() => navigate('/report/lost')}>Report an item</Button>}
          />
        ) : null}

        <div className="grid-3">
          {items.slice(0, 6).map((item) => (
            <Card key={item.id} className="card-hover item-card">
              <ItemIllustration iconType={iconForCategory(item.category)} imageUrl={item.images?.[0]?.url} alt={item.title} />
              <div className="item-body">
                <div className="item-topline">
                  <StatusBadge status={item.report_type} />
                  <span className="tabular mono xs muted">{item.report_code}</span>
                </div>
                <h3 className="item-title">{item.title}</h3>
                <div className="item-meta">{item.location || 'Location not specified'}</div>
                <div className="item-meta tabular xs">Reported {formatDate(item.reported_at)}</div>
                <div className="item-footer">
                  <Button variant="secondary" size="sm" style={{ width: '100%' }} onClick={() => navigate(`/items/${item.report_code}`)}>
                    View details
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section style={{ background: 'var(--bg-linen)', borderTop: '1px solid var(--border-hairline)', padding: '52px 0' }}>
        <div className="container" style={{ maxWidth: 880 }}>
          <h2 style={{ fontSize: 25, fontWeight: 800, color: 'var(--brand-primary)', marginBottom: 22, textAlign: 'center' }}>
            Frequently asked questions
          </h2>
          <div className="list-stack">
            {FAQS.map((faq) => (
              <Card key={faq.q} style={{ padding: 20 }}>
                <h4 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 6 }}>{faq.q}</h4>
                <p style={{ fontSize: 13, color: 'var(--ink-secondary)' }}>{faq.a}</p>
              </Card>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 28 }}>
            <Link to="/how-it-works" className="link-plain">
              Read the full custody workflow →
            </Link>
          </div>
        </div>
      </section>

      <section className="container" style={{ padding: '52px 0 8px' }}>
        <Card style={{ padding: 32, background: 'var(--brand-primary)', border: 'none', color: '#FAF9F5' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ maxWidth: 620 }}>
              <h2 style={{ fontSize: 23, fontWeight: 800, marginBottom: 8 }}>Found something on campus?</h2>
              <p style={{ fontSize: 13.5, color: '#D6D3D1' }}>
                Log it into the custody registry so the owner can be matched and verified. Security desks
                can also record intake directly from the officer workspace.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Button variant="primary" onClick={() => navigate('/report/found')}>
                Report found item
              </Button>
              <Button variant="secondary" onClick={() => navigate('/browse/found')}>
                Browse found items
              </Button>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
