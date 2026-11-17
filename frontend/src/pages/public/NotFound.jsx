import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card } from '../../components/ui';

export function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="container" style={{ padding: '70px 24px', maxWidth: 640 }}>
      <Card style={{ padding: 36, textAlign: 'center' }}>
        <div className="empty-icon" aria-hidden="true">404</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--brand-primary)', marginBottom: 8 }}>
          Page not found
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--ink-secondary)', marginBottom: 20 }}>
          The page you requested does not exist. It may have been moved, or the link may be incorrect.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={() => navigate('/')}>Back to home</Button>
          <Button variant="secondary" onClick={() => navigate('/browse/all')}>Browse registry</Button>
        </div>
      </Card>
    </div>
  );
}

export function Forbidden() {
  const navigate = useNavigate();
  return (
    <div className="container" style={{ padding: '70px 24px', maxWidth: 640 }}>
      <Card style={{ padding: 36, textAlign: 'center' }}>
        <div className="empty-icon" aria-hidden="true">403</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--brand-primary)', marginBottom: 8 }}>
          Access restricted
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--ink-secondary)', marginBottom: 20 }}>
          Your role does not include permission for this area. If you believe this is an error, contact your
          university administrator.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={() => navigate('/dashboard')}>Go to my dashboard</Button>
          <Link to="/" className="link-plain" style={{ alignSelf: 'center' }}>Return to public site</Link>
        </div>
      </Card>
    </div>
  );
}
