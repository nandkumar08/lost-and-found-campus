import React, { useEffect } from 'react';

/* ------------------------------------------------------------------ */
/* Badges                                                              */
/* ------------------------------------------------------------------ */
const STATUS_CLASS = {
  lost: 'badge-lost',
  searching: 'badge-lost',
  found: 'badge-found',
  in_custody: 'badge-found',
  matched: 'badge-review',
  suggested: 'badge-review',
  under_review: 'badge-review',
  evidence_requested: 'badge-review',
  claim_pending: 'badge-pending',
  submitted: 'badge-pending',
  pending: 'badge-pending',
  return_scheduled: 'badge-pending',
  scheduled: 'badge-pending',
  ready: 'badge-pending',
  approved: 'badge-approved',
  verified: 'badge-approved',
  active: 'badge-approved',
  confirmed: 'badge-approved',
  passed: 'badge-approved',
  owner_confirmed: 'badge-approved',
  rejected: 'badge-rejected',
  suspended: 'badge-rejected',
  failed: 'badge-rejected',
  returned: 'badge-returned',
  completed: 'badge-returned',
  handed_over: 'badge-returned',
  closed: 'badge-closed',
  archived: 'badge-closed',
  cancelled: 'badge-closed',
  not_submitted: 'badge-closed'
};

export function StatusBadge({ status, label }) {
  const key = String(status || '').toLowerCase();
  const cls = STATUS_CLASS[key] || 'badge-closed';
  return (
    <span className={`badge ${cls}`}>
      <span className="badge-dot" />
      {label || String(status || '').replace(/_/g, ' ')}
    </span>
  );
}

export function ConfidenceBadge({ confidence, score }) {
  const map = { high: 'badge-approved', medium: 'badge-pending', low: 'badge-closed' };
  return (
    <span className={`badge ${map[confidence] || 'badge-closed'}`}>
      <span className="badge-dot" />
      {score !== undefined ? `${Math.round(score)}% ` : ''}
      {(confidence || '').replace(/^\w/, (c) => c.toUpperCase())}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons & fields                                                    */
/* ------------------------------------------------------------------ */
export function Button({ variant = 'primary', size, loading, children, className = '', ...rest }) {
  const classes = [
    'btn',
    `btn-${variant}`,
    size === 'sm' ? 'btn-sm' : '',
    size === 'lg' ? 'btn-lg' : '',
    className
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={classes} disabled={loading || rest.disabled} {...rest}>
      {loading ? <span className="btn-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function Field({ label, required, error, hint, children, htmlFor }) {
  return (
    <div className="field-group">
      {label ? (
        <label className="field-label" htmlFor={htmlFor}>
          <span>
            {label}
            {required ? <span className="req-star">*</span> : null}
          </span>
        </label>
      ) : null}
      {children}
      {hint && !error ? <span className="field-hint">{hint}</span> : null}
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function Input({ error, ...rest }) {
  return <input className={`input ${error ? 'error' : ''}`} {...rest} />;
}

export function Select({ error, children, ...rest }) {
  return (
    <select className={`select ${error ? 'error' : ''}`} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ error, ...rest }) {
  return <textarea className={`textarea ${error ? 'error' : ''}`} {...rest} />;
}

/* ------------------------------------------------------------------ */
/* Layout helpers                                                      */
/* ------------------------------------------------------------------ */
export function Card({ children, className = '', style, ...rest }) {
  return (
    <div className={`card ${className}`} style={style} {...rest}>
      {children}
    </div>
  );
}

export function SectionHeader({ title, subtitle, actions, eyebrow }) {
  return (
    <div className="section-header">
      <div>
        {eyebrow ? <div className="eyebrow-text">{eyebrow}</div> : null}
        <h2 className="section-title">{title}</h2>
        {subtitle ? <p className="section-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="section-actions">{actions}</div> : null}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = 'forest', icon }) {
  return (
    <div className={`stat-card stat-${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value tabular">{value}</div>
      {hint ? <div className="stat-hint">{hint}</div> : null}
      {icon ? <div className="stat-icon">{icon}</div> : null}
    </div>
  );
}

export function EmptyState({ title, message, action, icon = '◎' }) {
  return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      {message ? <p>{message}</p> : null}
      {action}
    </div>
  );
}

export function Loading({ label = 'Loading…', rows = 3 }) {
  return (
    <div aria-busy="true" aria-label={label} style={{ display: 'grid', gap: 10 }}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton" style={{ height: index === 0 ? 26 : 44, width: index === 0 ? '40%' : '100%' }} />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="empty-state error-state">
      <div className="empty-icon" aria-hidden="true">
        !
      </div>
      <h3>Something went wrong</h3>
      <p>{error?.message || 'Unable to load this section.'}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tab-bar" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          className={`tab-btn ${value === tab.value ? 'active' : ''}`}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, title, children, onClose, footer, width = 660 }) {
  useEffect(() => {
    if (!open) return undefined;
    const handler = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className="modal-box" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: width }}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" aria-label="Close dialog" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Pagination({ pagination, onPage }) {
  if (!pagination || pagination.pages <= 1) return null;
  const { page, pages, total } = pagination;
  return (
    <div className="pagination">
      <span className="pagination-info tabular">
        Page {page} of {pages} • {total} record{total === 1 ? '' : 's'}
      </span>
      <div className="pagination-controls">
        <Button variant="secondary" size="sm" disabled={!pagination.has_prev} onClick={() => onPage(page - 1)}>
          ← Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={!pagination.has_next} onClick={() => onPage(page + 1)}>
          Next →
        </Button>
      </div>
    </div>
  );
}

export function ProgressBar({ value = 0, label }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div>
      {label ? (
        <div className="progress-label">
          <span>{label}</span>
          <span className="tabular">{Math.round(clamped)}%</span>
        </div>
      ) : null}
      <div className="progress-track" role="progressbar" aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-fill" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

export function Timeline({ items = [] }) {
  if (!items.length) return <p className="muted small">No status events recorded yet.</p>;
  return (
    <ol className="timeline">
      {items.map((item, index) => (
        <li key={`${item.status}-${index}`} className={index === items.length - 1 ? 'current' : ''}>
          <span className="timeline-dot" aria-hidden="true" />
          <div>
            <div className="timeline-title">{item.label || item.status}</div>
            {item.note ? <div className="timeline-note">{item.note}</div> : null}
            <div className="timeline-meta tabular">
              {item.at}
              {item.actor ? ` • ${item.actor}` : ''}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Table({ columns, children }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function AccessDenied({ message = 'You do not have permission to view this section.' }) {
  return (
    <EmptyState
      icon="⊘"
      title="Access restricted"
      message={message}
      action={
        <Button variant="secondary" onClick={() => window.history.back()}>
          Go back
        </Button>
      }
    />
  );
}
