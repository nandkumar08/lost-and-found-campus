import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUniversity } from '../context/UniversityContext';
import { Button } from '../components/ui';

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/browse/all', label: 'Browse Items' },
  { to: '/track', label: 'Track Report' },
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' }
];

export default function PublicLayout({ children }) {
  // Supports both <PublicLayout>{page}</PublicLayout> and nested routing via <Outlet />.
  const { user, logout } = useAuth();
  const { universities, active, setCode } = useUniversity();
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportMenu, setReportMenu] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setMenuOpen(false);
    setReportMenu(false);
  }, [location.pathname]);

  const credential = active?.short_name || active?.name || 'Campus Registry';

  return (
    <div>
      <header className="pub-nav">
        <div className="container pub-nav-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            <Link to="/" className="brand-lockup" aria-label="Lost & Found Campus home">
              <div className="brand-crest" aria-hidden="true">
                {(active?.code || 'LF').slice(0, 2)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 800,
                    fontSize: 15.5,
                    color: 'var(--brand-primary)',
                    lineHeight: 1.15,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {active?.name || 'Lost & Found Campus'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontWeight: 600 }}>
                  Lost &amp; Found Campus
                </div>
              </div>
            </Link>

            <label className="sr-only" htmlFor="university-selector">
              Select university
            </label>
            <select
              id="university-selector"
              className="uni-selector"
              value={active?.code || ''}
              onChange={(event) => setCode(event.target.value)}
              title="Switch institution"
            >
              {universities.map((university) => (
                <option key={university.id} value={university.code}>
                  {university.code} • {university.short_name || university.name}
                </option>
              ))}
            </select>
          </div>

          <nav className="nav-links" aria-label="Main navigation">
            {NAV_LINKS.slice(0, 2).map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                end={link.to === '/'}
              >
                {link.label}
              </NavLink>
            ))}

            <div
              className="dropdown-wrap"
              onMouseLeave={() => setReportMenu(false)}
            >
              <button
                type="button"
                className={`nav-link ${
                  location.pathname.startsWith('/report') ? 'active' : ''
                }`}
                aria-haspopup="true"
                aria-expanded={reportMenu}
                onClick={() => setReportMenu((open) => !open)}
              >
                Report Item ▾
              </button>
              {reportMenu ? (
                <div className="dropdown-menu">
                  <Link to="/report/lost" className="dropdown-item">
                    <strong style={{ color: '#BE123C', fontSize: 13 }}>Report Lost Item</strong>
                    <span style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
                      Register missing personal belongings
                    </span>
                  </Link>
                  <Link to="/report/found" className="dropdown-item">
                    <strong style={{ color: '#15803D', fontSize: 13 }}>Report Found Item</strong>
                    <span style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
                      Log found property into campus custody
                    </span>
                  </Link>
                </div>
              ) : null}
            </div>

            {NAV_LINKS.slice(2).map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {user ? (
              <>
                <Button variant="secondary" size="sm" onClick={() => navigate('/dashboard')}>
                  Dashboard
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    logout();
                    navigate('/');
                  }}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" size="sm" onClick={() => navigate('/login')}>
                  Login
                </Button>
                <Button variant="primary" size="sm" onClick={() => navigate('/register')}>
                  Register
                </Button>
              </>
            )}
            <button
              type="button"
              className="mobile-menu-btn"
              aria-label="Toggle navigation menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              ☰
            </button>
          </div>
        </div>

        {menuOpen ? (
          <div className="mobile-drawer">
            {NAV_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} className="nav-link" style={{ textAlign: 'left' }} end={link.to === '/'}>
                {link.label}
              </NavLink>
            ))}
            <Link to="/report/lost" className="nav-link" style={{ textAlign: 'left' }}>
              Report Lost Item
            </Link>
            <Link to="/report/found" className="nav-link" style={{ textAlign: 'left' }}>
              Report Found Item
            </Link>
            <Link to="/about" className="nav-link" style={{ textAlign: 'left' }}>
              About Us
            </Link>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {user ? (
                <>
                  <Button variant="primary" size="sm" onClick={() => navigate('/dashboard')}>
                    Dashboard
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => { logout(); navigate('/'); }}>
                    Sign out
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="secondary" size="sm" onClick={() => navigate('/login')}>
                    Login
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => navigate('/register')}>
                    Register
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : null}
      </header>

      <main id="main-content">{children || <Outlet />}</main>

      <footer className="pub-footer">
        <div className="container">
          <div className="footer-grid">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div className="brand-crest" style={{ background: 'var(--brand-accent)' }} aria-hidden="true">
                  {(active?.code || 'LF').slice(0, 2)}
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, color: '#FAF9F5', fontSize: 14 }}>
                    {active?.name || 'Lost & Found Campus'}
                  </div>
                  <div style={{ fontSize: 11.5 }}>{credential} • Verified Custody Registry</div>
                </div>
              </div>
              <p style={{ fontSize: 12.5, maxWidth: 330 }}>
                A multi-university lost and found platform with confidential ownership verification,
                attribute matching and QR-verified handovers.
              </p>
            </div>
            <div>
              <div className="footer-heading">Campus Registry</div>
              <Link to="/browse/lost">Browse Lost Items</Link>
              <Link to="/browse/found">Browse Found Items</Link>
              <Link to="/report/lost">Report a Lost Item</Link>
              <Link to="/report/found">Report a Found Item</Link>
            </div>
            <div>
              <div className="footer-heading">Custody</div>
              <Link to="/track">Track a Report</Link>
              <Link to="/scan">Scan a QR Pass</Link>
              <Link to="/how-it-works">How It Works</Link>
              <Link to="/contact">Contact Security Desk</Link>
            </div>
            <div>
              <div className="footer-heading">Institution</div>
              <Link to="/about">About Us</Link>
              <Link to="/login">Staff Sign In</Link>
              <Link to="/register">Campus Registration</Link>
              <a href="/api/docs" target="_blank" rel="noreferrer">
                API Documentation
              </a>
            </div>
          </div>
          <div className="footer-bottom">
            <span>
              © {new Date().getFullYear()} Lost &amp; Found Campus • {active?.name || 'University Registry'}
            </span>
            <span>
              Privacy first: identity documents and confidential marks are never published.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
