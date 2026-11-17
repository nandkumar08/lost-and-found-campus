import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUniversity } from '../context/UniversityContext';
import { NotificationApi } from '../services/api';
import { Button, StatusBadge } from '../components/ui';
import { relativeTime, titleCase } from '../utils/format';

/**
 * Role-aware dashboard shell. The navigation is derived from the authenticated
 * user's role — but the server independently enforces every permission, so
 * hiding a link is convenience, not security.
 */
function sectionsFor(role) {
  if (role === 'platform_admin') {
    return [
      {
        heading: 'Platform',
        items: [
          { to: '/dashboard/platform/overview', label: 'Platform Overview' },
          { to: '/dashboard/platform/universities', label: 'Universities' },
          { to: '/dashboard/platform/onboarding', label: 'University Onboarding' },
          { to: '/dashboard/platform/analytics', label: 'Platform Analytics' },
          { to: '/dashboard/platform/settings', label: 'Platform Settings' },
          { to: '/dashboard/platform/logs', label: 'Cross-tenant Audit' }
        ]
      },
      { heading: 'Account', items: [{ to: '/dashboard/notifications', label: 'Notifications' }, { to: '/dashboard/profile', label: 'Profile' }] }
    ];
  }

  if (role === 'university_admin') {
    return [
      {
        heading: 'Overview',
        items: [
          { to: '/dashboard', label: 'Dashboard', end: true },
          { to: '/dashboard/analytics', label: 'Analytics' },
          { to: '/dashboard/notifications', label: 'Notifications' }
        ]
      },
      {
        heading: 'Identity & Access',
        items: [
          { to: '/dashboard/users', label: 'User Management' },
          { to: '/dashboard/verifications', label: 'Identity Verification' }
        ]
      },
      {
        heading: 'Custody & Recovery',
        items: [
          { to: '/dashboard/reports', label: 'All Reports' },
          { to: '/dashboard/matches', label: 'Smart Matches' },
          { to: '/dashboard/claims', label: 'Claims' },
          { to: '/dashboard/returns', label: 'Returns & Handover' }
        ]
      },
      {
        heading: 'Institution',
        items: [
          { to: '/dashboard/locations', label: 'Campus Locations' },
          { to: '/dashboard/categories', label: 'Categories' },
          { to: '/dashboard/logs', label: 'Activity Logs' },
          { to: '/dashboard/email-log', label: 'Email Delivery' },
          { to: '/dashboard/settings', label: 'University Settings' }
        ]
      }
    ];
  }

  if (role === 'security_personnel') {
    return [
      {
        heading: 'Custody Operations',
        items: [
          { to: '/dashboard', label: 'Custody Desk', end: true },
          { to: '/dashboard/intake', label: 'Found Item Intake' },
          { to: '/dashboard/custody', label: 'Deposited Items' },
          { to: '/dashboard/scan', label: 'QR Scanner' },
          { to: '/dashboard/claims', label: 'Ownership Claims' },
          { to: '/dashboard/returns', label: 'Handover & Returns' },
          { to: '/dashboard/locations', label: 'Storage Locations' }
        ]
      },
      {
        heading: 'Account',
        items: [
          { to: '/dashboard/notifications', label: 'Notifications' },
          { to: '/dashboard/profile', label: 'Profile' }
        ]
      }
    ];
  }

  return [
    {
      heading: 'My Campus Custody',
      items: [
        { to: '/dashboard', label: 'Dashboard', end: true },
        { to: '/dashboard/reports/lost', label: 'My Lost Reports' },
        { to: '/dashboard/reports/found', label: 'My Found Reports' },
        { to: '/dashboard/matches', label: 'My Matches' },
        { to: '/dashboard/claims', label: 'My Claims' },
        { to: '/dashboard/returns', label: 'My Collections' }
      ]
    },
    {
      heading: 'Account',
      items: [
        { to: '/dashboard/verification', label: 'Campus Verification' },
        { to: '/dashboard/notifications', label: 'Notifications' },
        { to: '/dashboard/profile', label: 'Profile & Settings' }
      ]
    }
  ];
}

function initialsOf(name) {
  const parts = String(name || '')
    .replace(/\b(dr|prof|mr|mrs|ms|miss)\.?\b/gi, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'CU';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function DashboardLayout() {
  const { user, isAuthed, booting, logout, unread, refreshNotifications, setUnread } = useAuth();
  const { active } = useUniversity();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const popRef = useRef(null);

  useEffect(() => {
    if (!booting && !isAuthed) navigate('/login', { replace: true, state: { from: location.pathname } });
  }, [booting, isAuthed, navigate, location.pathname]);

  useEffect(() => {
    setMobileOpen(false);
    setNotifOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

  useEffect(() => {
    const handler = (event) => {
      if (popRef.current && !popRef.current.contains(event.target)) {
        setNotifOpen(false);
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const sections = useMemo(() => sectionsFor(user?.role), [user?.role]);

  const openNotifications = async () => {
    setNotifOpen((open) => !open);
    setProfileOpen(false);
    if (!notifOpen) {
      try {
        const data = await NotificationApi.list({ page_size: 6 });
        setNotifications(data.items || []);
        setUnread(data.unread || 0);
      } catch (_) {
        /* ignore */
      }
    }
  };

  const markRead = async (id) => {
    try {
      await NotificationApi.read(id);
      setNotifications((list) => list.map((item) => (item.id === id ? { ...item, unread: false } : item)));
      refreshNotifications();
    } catch (_) {
      /* ignore */
    }
  };

  if (booting) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg-canvas)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="brand-crest" style={{ margin: '0 auto 12px' }}>
            LF
          </div>
          <p className="muted small">Restoring your secure session…</p>
        </div>
      </div>
    );
  }

  if (!isAuthed) return null;

  return (
    <div className="app-shell">
      {mobileOpen ? <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} /> : null}

      <aside
        className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
        aria-label="Dashboard navigation"
      >
        <div style={{ padding: '18px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div className="brand-crest" style={{ width: 34, height: 34, fontSize: 13, background: 'var(--brand-accent)' }} aria-hidden="true">
              {(active?.code || user?.university_code || 'LF').slice(0, 2)}
            </div>
            {!sidebarCollapsed ? (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 13, color: '#FAF9F5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {active?.name || user?.university_name}
                </div>
                <div style={{ fontSize: 10.5, color: '#A8A29E' }}>{user?.role_label}</div>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="icon-btn"
            style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#FAF9F5' }}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          >
            {sidebarCollapsed ? '»' : '«'}
          </button>
        </div>

        <nav style={{ flex: 1, overflowY: 'auto', paddingBottom: 18 }}>
          {sections.map((section) => (
            <div key={section.heading}>
              {!sidebarCollapsed ? <div className="sidebar-section">{section.heading}</div> : null}
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  title={item.label}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) => `side-item ${isActive ? 'active' : ''}`}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {sidebarCollapsed ? item.label.slice(0, 2).toUpperCase() : item.label}
                  </span>
                  {!sidebarCollapsed && item.to === '/dashboard/notifications' && unread > 0 ? (
                    <span className="side-count tabular">{unread}</span>
                  ) : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'grid', gap: 8 }}>
          <NavLink to="/" className="btn btn-secondary btn-sm" style={{ background: 'rgba(255,255,255,0.08)', color: '#FAF9F5', borderColor: 'transparent' }}>
            {sidebarCollapsed ? '←' : '← Public Website'}
          </NavLink>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ background: 'transparent', color: '#FAF9F5', borderColor: 'rgba(255,255,255,0.2)' }}
            onClick={() => {
              logout();
              navigate('/');
            }}
          >
            {sidebarCollapsed ? '⏻' : 'Sign out'}
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <button type="button" className="mobile-menu-btn" aria-label="Open navigation" onClick={() => setMobileOpen(true)} style={{ display: 'inline-flex' }}>
              ☰
            </button>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 14.5, color: 'var(--brand-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.university_name}
              </div>
              <div className="xs muted">{user?.role_label} workspace</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} ref={popRef}>
            {user?.verification_status && user.verification_status !== 'verified' && !['security_personnel', 'university_admin', 'platform_admin'].includes(user.role) ? (
              <NavLink to="/dashboard/verification" style={{ textDecoration: 'none' }}>
                <StatusBadge status={user.verification_status} label={`Verification: ${titleCase(user.verification_status)}`} />
              </NavLink>
            ) : null}

            <div className="dropdown-wrap">
              <button type="button" className="btn btn-secondary btn-sm" onClick={openNotifications} aria-expanded={notifOpen} aria-label="Notifications">
                Notifications
                {unread > 0 ? (
                  <span className="badge badge-lost" style={{ padding: '1px 6px', fontSize: 10 }}>
                    {unread}
                  </span>
                ) : null}
              </button>
              {notifOpen ? (
                <div className="dropdown-menu dropdown-menu-right" style={{ width: 340, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong style={{ fontSize: 12.5 }}>Notification Centre</strong>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={async () => {
                        await NotificationApi.readAll();
                        setNotifications((list) => list.map((item) => ({ ...item, unread: false })));
                        refreshNotifications();
                      }}
                    >
                      Mark all read
                    </button>
                  </div>
                  <div style={{ display: 'grid', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                    {notifications.length === 0 ? <p className="small muted">No notifications yet.</p> : null}
                    {notifications.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={`notif-item ${item.unread ? 'unread' : ''}`}
                        onClick={() => markRead(item.id)}
                      >
                        <div className="notif-type">{titleCase(item.type)}</div>
                        <div className="notif-title">{item.title}</div>
                        {item.body ? <div className="notif-body">{item.body}</div> : null}
                        <div className="notif-meta tabular">{relativeTime(item.date)}</div>
                      </button>
                    ))}
                  </div>
                  <Button variant="secondary" size="sm" style={{ width: '100%', marginTop: 10 }} onClick={() => navigate('/dashboard/notifications')}>
                    Open notification centre
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="dropdown-wrap">
              <button
                type="button"
                className="btn btn-forest btn-sm"
                onClick={() => {
                  setProfileOpen((open) => !open);
                  setNotifOpen(false);
                }}
                aria-expanded={profileOpen}
              >
                {initialsOf(user?.full_name)} ▾
              </button>
              {profileOpen ? (
                <div className="dropdown-menu dropdown-menu-right" style={{ width: 240 }}>
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-hairline)' }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{user?.full_name}</div>
                    <div className="xs muted">
                      {user?.campus_id_number || '—'} • {user?.department || user?.role_label}
                    </div>
                  </div>
                  <NavLink to="/dashboard/profile" className="dropdown-item" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
                    Profile &amp; settings
                  </NavLink>
                  {user?.role !== 'platform_admin' ? (
                    <NavLink to="/dashboard/verification" className="dropdown-item" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
                      Campus verification
                    </NavLink>
                  ) : null}
                  <NavLink to="/" className="dropdown-item" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
                    Public website
                  </NavLink>
                  <button
                    type="button"
                    className="dropdown-item"
                    style={{ color: '#B91C1C' }}
                    onClick={() => {
                      logout();
                      navigate('/');
                    }}
                  >
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
