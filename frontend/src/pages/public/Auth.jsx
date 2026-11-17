import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useUniversity } from '../../context/UniversityContext';
import { useToast } from '../../context/ToastContext';
import { AuthApi } from '../../services/api';
import { Button, Card, Field, Input, Select, StatusBadge, Textarea } from '../../components/ui';
import { ImageUploader } from '../../components/ImageUploader';
import { firstName } from '../../utils/format';

function AuthShell({ children, asideTitle, asideText }) {
  const { active, universities } = useUniversity();
  return (
    <div className="auth-shell">
      <aside className="auth-brand">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="brand-crest" style={{ background: 'var(--brand-accent)' }} aria-hidden="true">
              {(active?.code || 'LF').slice(0, 2)}
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 15 }}>Lost &amp; Found Campus</div>
              <div style={{ fontSize: 11.5, color: 'rgba(250,249,245,0.7)' }}>
                {universities.length} institution{universities.length === 1 ? '' : 's'} served
              </div>
            </div>
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 800, marginTop: 34, lineHeight: 1.15, letterSpacing: '-0.02em' }}>
            {asideTitle}
          </h1>
          <p style={{ fontSize: 13.5, color: 'rgba(250,249,245,0.78)', marginTop: 12, maxWidth: 400 }}>{asideText}</p>
          <div className="auth-aside-list">
            {[
              'Confidential identifying marks are never published',
              'Every claim is verified by a campus custody officer',
              'QR custody passes contain no personal data',
              'Each university sees only its own records'
            ].map((item, index) => (
              <div className="auth-aside-item" key={item}>
                <span className="auth-aside-bullet">{index + 1}</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: 'rgba(250,249,245,0.55)', marginTop: 32 }}>
          {active?.name || 'University registry'} • Verified custody
        </div>
      </aside>
      <section className="auth-panel">
        <div className="auth-card">{children}</div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Login                                                              */
/* ------------------------------------------------------------------ */
export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const user = await login(form.email.trim(), form.password);
      toast.success(`Welcome back, ${firstName(user.full_name)}.`);
      const target = location.state?.from || '/dashboard';
      navigate(target, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      asideTitle="Sign in to your campus custody workspace."
      asideText="Track reports, respond to matches, submit ownership claims and schedule collections — all within your verified institution."
    >
      <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--brand-primary)', marginBottom: 6 }}>Sign in</h2>
      <p className="small muted" style={{ marginBottom: 20 }}>
        Use the email address you registered with.
      </p>
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }} noValidate>
        <Field label="Email" required htmlFor="login-email">
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            error={error ? true : undefined}
          />
        </Field>
        <Field label="Password" required htmlFor="login-password">
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            error={error ? true : undefined}
          />
        </Field>
        {error ? (
          <div className="notice notice-danger" role="alert">
            <span>{error}</span>
          </div>
        ) : null}
        <Button variant="primary" size="lg" type="submit" loading={loading}>
          Sign in
        </Button>
      </form>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, gap: 10, flexWrap: 'wrap' }}>
        <Link to="/forgot-password" className="link-plain small">
          Forgot your password?
        </Link>
        <Link to="/register" className="link-plain small">
          Create a campus account
        </Link>
      </div>
      <div className="notice notice-info" style={{ marginTop: 22 }}>
        <span>
          Demonstration environment: seeded accounts use the password <strong>Campus#2026</strong>. Administrator
          accounts are provisioned internally and cannot be self-registered.
        </span>
      </div>
      <div style={{ marginTop: 14 }}>
        <Link to="/" className="link-plain small">← Back to the public registry</Link>
      </div>
    </AuthShell>
  );
}

/* ------------------------------------------------------------------ */
/* Registration wizard                                                */
/* ------------------------------------------------------------------ */
const ROLES = [
  { code: 'student', label: 'Student', hint: 'Enrolled student with a campus enrolment number' },
  { code: 'faculty', label: 'Faculty', hint: 'Teaching faculty with an employee ID' },
  { code: 'university_staff', label: 'University Staff', hint: 'Administrative or support staff' },
  { code: 'security_personnel', label: 'Security Personnel', hint: 'Campus safety and custody desk officer' },
  { code: 'campus_member', label: 'Other Campus Member', hint: 'Contractors, researchers, hostel wardens' }
];

const YEAR_OPTIONS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year', 'Postgraduate'];
const SEMESTER_OPTIONS = ['Semester 1', 'Semester 2', 'Semester 3', 'Semester 4', 'Semester 5', 'Semester 6', 'Semester 7', 'Semester 8'];

export function Register() {
  const navigate = useNavigate();
  const { universities, active, setCode } = useUniversity();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    university_code: '',
    role: '',
    full_name: '',
    email: '',
    phone: '',
    password: '',
    confirm_password: '',
    campus_id_number: '',
    department: '',
    academic_year: '',
    semester: '',
    designation: '',
    note: ''
  });
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!form.university_code && active?.code) {
      setForm((current) => ({ ...current, university_code: active.code }));
    }
  }, [active, form.university_code]);

  const selectedRole = useMemo(() => ROLES.find((role) => role.code === form.role), [form.role]);
  const needsAcademic = ['student', 'campus_member'].includes(form.role);
  const needsDesignation = ['faculty', 'university_staff', 'security_personnel'].includes(form.role);

  const update = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const validateStep = (target) => {
    const next = {};
    if (target >= 2) {
      if (!form.university_code) next.university_code = 'Select your university.';
      if (!form.role) next.role = 'Choose your campus role.';
    }
    if (target >= 3) {
      if (form.full_name.trim().length < 3) next.full_name = 'Enter your full name.';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) next.email = 'Enter a valid email address.';
      if (form.password.length < 8) next.password = 'Use at least 8 characters.';
      if (!/\d/.test(form.password)) next.password = 'Include at least one number.';
      if (form.password !== form.confirm_password) next.confirm_password = 'Passwords do not match.';
      if (form.campus_id_number.trim().length < 2) next.campus_id_number = 'Enter your enrolment or employee ID.';
      if (!form.department.trim()) next.department = 'Enter your department.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const goNext = () => {
   if (!validateStep(step)) {
      toast.error('Please complete the highlighted fields.');
      return;
    }
    setStep((current) => Math.min(4, current + 1));
  };

  const submit = async () => {
    if (!validateStep(3)) {
      toast.error('Please complete the highlighted fields.');
      setStep(3);
      return;
    }
    setLoading(true);
    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (value) payload.append(key, value);
      });
      if (files[0]) payload.append('id_document', files[0]);
      const data = await AuthApi.register(payload);
      setResult(data);
      setStep(5);
      toast.success('Account created. Your campus identity is pending verification.');
    } catch (error) {
      toast.error(error.message);
      setErrors({ form: error.message });
    } finally {
      setLoading(false);
    }
  };

  if (step === 5 && result) {
    return (
      <AuthShell asideTitle="Your application is queued for verification." asideText="A university administrator reviews every campus identity application manually. You will be notified by email and in-app.">
        <Card style={{ padding: 26 }}>
          <span className="badge badge-pending" style={{ marginBottom: 12 }}>Verification pending</span>
          <h2 style={{ fontSize: 21, fontWeight: 800, color: 'var(--brand-primary)', marginBottom: 8 }}>
            Account created, {firstName(result.full_name)}
          </h2>
          <p className="small" style={{ color: 'var(--ink-secondary)', marginBottom: 16 }}>
            Your account exists but sensitive actions (claims, collections) unlock once an administrator verifies your
            campus identity. Uploading an ID alone does not grant approval.
          </p>
          <div className="kv-list">
            <div className="kv-row">
              <div className="kv-key">University</div>
              <div>{result.university.name}</div>
            </div>
            <div className="kv-row">
              <div className="kv-key">Role</div>
              <div>{result.role_label}</div>
            </div>
            <div className="kv-row">
              <div className="kv-key">Verification</div>
              <div><StatusBadge status={result.verification_status} label="Pending" /></div>
            </div>
            <div className="kv-row">
              <div className="kv-key">Next step</div>
              <div>Sign in to upload your ID card if you have not already, then track the review status.</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={() => navigate('/login')}>Sign in</Button>
            <Button variant="secondary" onClick={() => navigate('/')}>Browse the registry</Button>
          </div>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      asideTitle="Register your campus identity."
      asideText="Four steps: choose your institution, select your campus role, provide your identity details and upload your ID card for manual verification."
    >
      <div className="stepper" aria-label="Registration progress">
        {['Account', 'Institution & role', 'Campus identity', 'ID verification'].map((label, index) => {
          const number = index + 1;
          const state = step > number ? 'done' : step === number ? 'active' : '';
          return (
            <div className="step-node" key={label}>
              <div className={`step-bar ${state}`} />
              <span className="xs muted">{`${number}. ${label}`}</span>
            </div>
          );
        })}
      </div>

      <h2 style={{ fontSize: 21, fontWeight: 800, color: 'var(--brand-primary)', marginBottom: 6 }}>
        {step === 1 && 'Create your account'}
        {step === 2 && 'Institution & campus role'}
        {step === 3 && 'Campus identity details'}
        {step === 4 && 'Identity document upload'}
      </h2>
      <p className="small muted" style={{ marginBottom: 18 }}>
        Administrator accounts cannot be self-registered — they are provisioned by the university or platform.
      </p>

      {errors.form ? (
        <div className="notice notice-danger" style={{ marginBottom: 14 }}>
          <span>{errors.form}</span>
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 14 }}>
        {step === 1 ? (
          <>
            <Field label="Full name (as printed on your campus ID)" required error={errors.full_name} htmlFor="reg-name">
              <Input id="reg-name" value={form.full_name} onChange={update('full_name')} error={errors.full_name} autoComplete="name" />
            </Field>
            <Field label="email address" required error={errors.email} htmlFor="reg-email">
              <Input id="reg-email" type="email" value={form.email} onChange={update('email')} error={errors.email} autoComplete="email" />
            </Field>
            <Field label="Phone (optional)" htmlFor="reg-phone">
              <Input id="reg-phone" value={form.phone} onChange={update('phone')} autoComplete="tel" />
            </Field>
            <div className="grid-2">
              <Field label="Password" required error={errors.password} htmlFor="reg-password" hint="8+ characters with a number.">
                <Input id="reg-password" type="password" value={form.password} onChange={update('password')} error={errors.password} autoComplete="new-password" />
              </Field>
              <Field label="Confirm password" required error={errors.confirm_password} htmlFor="reg-confirm">
                <Input id="reg-confirm" type="password" value={form.confirm_password} onChange={update('confirm_password')} error={errors.confirm_password} autoComplete="new-password" />
              </Field>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Field label="University" required error={errors.university_code} htmlFor="reg-university">
              <Select
                id="reg-university"
                value={form.university_code}
                onChange={(event) => {
                  update('university_code')(event);
                  setCode(event.target.value);
                }}
                error={errors.university_code}
              >
                <option value="">Select your institution</option>
                {universities.map((university) => (
                  <option key={university.id} value={university.code}>
                    {university.name} ({university.code})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Campus role" required error={errors.role}>
              <div style={{ display: 'grid', gap: 8 }}>
                {ROLES.map((role) => (
                  <label
                    key={role.code}
                    className={`role-option ${form.role === role.code ? 'selected' : ''}`}
                    style={{
                      border: `1px solid ${form.role === role.code ? 'var(--brand-primary)' : 'var(--border-strong)'}`,
                      background: form.role === role.code ? 'var(--bg-linen)' : 'var(--bg-surface)',
                      borderRadius: 10,
                      padding: '11px 13px',
                      cursor: 'pointer',
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start'
                    }}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={role.code}
                      checked={form.role === role.code}
                      onChange={update('role')}
                      style={{ marginTop: 3 }}
                    />
                    <span>
                      <strong style={{ fontSize: 13, display: 'block' }}>{role.label}</strong>
                      <span className="xs muted">{role.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </Field>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Field label={selectedRole?.code === 'student' ? 'Enrolment number' : 'Employee / campus ID number'} required error={errors.campus_id_number} htmlFor="reg-campus-id">
              <Input id="reg-campus-id" value={form.campus_id_number} onChange={update('campus_id_number')} error={errors.campus_id_number} placeholder="e.g. STU-1108" />
            </Field>
            <Field label="Department" required error={errors.department} htmlFor="reg-dept">
              <Input id="reg-dept" value={form.department} onChange={update('department')} error={errors.department} placeholder="e.g. Computer Science" />
            </Field>
            {needsAcademic ? (
              <div className="grid-2">
                <Field label="Academic year" htmlFor="reg-year">
                  <Select id="reg-year" value={form.academic_year} onChange={update('academic_year')}>
                    <option value="">Select year</option>
                    {YEAR_OPTIONS.map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Semester" htmlFor="reg-semester">
                  <Select id="reg-semester" value={form.semester} onChange={update('semester')}>
                    <option value="">Select semester</option>
                    {SEMESTER_OPTIONS.map((semester) => (
                      <option key={semester} value={semester}>{semester}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            ) : null}
            {needsDesignation ? (
              <Field label="Designation" htmlFor="reg-designation">
                <Input id="reg-designation" value={form.designation} onChange={update('designation')} placeholder="e.g. Associate Professor" />
              </Field>
            ) : null}
            <Field label="Note for the verifying administrator (optional)" htmlFor="reg-note">
              <Textarea id="reg-note" rows={2} value={form.note} onChange={update('note')} placeholder="Anything that helps confirm your campus affiliation." />
            </Field>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <div className="privacy-shield">
              <span aria-hidden="true">🛡</span>
              <div>
                Your identity document is stored in a private directory and is visible only to your university's
                administrators. It is never served publicly and never embedded in a QR code.
              </div>
            </div>
            <Field label="Campus ID card or institutional letter" hint="JPG, PNG, WEBP or PDF up to 5 MB.">
              <ImageUploader
                files={files}
                onChange={(next) => setFiles(next.slice(0, 1))}
                max={1}
                accept="image/jpeg,image/png,image/webp,application/pdf"
                label="Click to upload your ID document"
                hint="Single file, 5 MB maximum"
              />
            </Field>
            <div className="notice notice-info">
              <span>
                Uploading a document does not approve your account. A university administrator reviews the
                application manually — expect a status of <strong>pending</strong> in the meantime.
              </span>
            </div>
          </>
        ) : null}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
        <Button
          variant="secondary"
          type="button"
          onClick={() => (step === 1 ? navigate('/login') : setStep((current) => current - 1))}
        >
          {step === 1 ? 'Back to sign in' : '← Back'}
        </Button>
        {step < 4 ? (
          <Button variant="primary" type="button" onClick={goNext}>
            Continue →
          </Button>
        ) : (
          <Button variant="primary" type="button" loading={loading} onClick={submit}>
            Submit application
          </Button>
        )}
      </div>
    </AuthShell>
  );
}

/* ------------------------------------------------------------------ */
/* Forgot / reset password                                            */
/* ------------------------------------------------------------------ */
export function ForgotPassword() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const data = await AuthApi.forgot({ email });
      setResponse(data);
      toast.success(data.message);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell asideTitle="Reset your password securely." asideText="Reset links are single-use, expire after 60 minutes and are never exposed in the interface unless SMTP is not configured in development.">
      <h2 style={{ fontSize: 21, fontWeight: 800, color: 'var(--brand-primary)', marginBottom: 6 }}>Forgot password</h2>
      <p className="small muted" style={{ marginBottom: 18 }}>Enter your email address address.</p>
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <Field label="Email" required htmlFor="forgot-email">
          <Input id="forgot-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Button variant="primary" type="submit" loading={loading}>Send reset link</Button>
      </form>
      {response?.dev_reset_token ? (
        <div className="notice notice-warn" style={{ marginTop: 16 }}>
          <span>
            Development mode — SMTP is not configured, so the reset token is shown here:{' '}
            <Link to={`/reset-password?token=${response.dev_reset_token}`} className="link-plain">open reset page</Link>
          </span>
        </div>
      ) : null}
      <div style={{ marginTop: 16 }}>
        <Link to="/login" className="link-plain small">← Back to sign in</Link>
      </div>
    </AuthShell>
  );
}

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [token, setToken] = useState(searchParams.get('token') || '');
  const [form, setForm] = useState({ new_password: '', confirm_password: '' });
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (form.new_password !== form.confirm_password) {
      toast.error('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const data = await AuthApi.reset({ token, ...form });
      toast.success(data.message);
      navigate('/login');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell asideTitle="Choose a new password." asideText="Passwords are stored as PBKDF2-HMAC-SHA256 hashes with a unique salt. We never store or display your password.">
      <h2 style={{ fontSize: 21, fontWeight: 800, color: 'var(--brand-primary)', marginBottom: 6 }}>Reset password</h2>
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <Field label="Reset token" required htmlFor="reset-token" hint="Copied from your email link.">
          <Input id="reset-token" className="mono" value={token} onChange={(event) => setToken(event.target.value.trim())} />
        </Field>
        <Field label="New password" required htmlFor="reset-password">
          <Input id="reset-password" type="password" value={form.new_password} onChange={(event) => setForm({ ...form, new_password: event.target.value })} />
        </Field>
        <Field label="Confirm new password" required htmlFor="reset-password-2">
          <Input id="reset-password-2" type="password" value={form.confirm_password} onChange={(event) => setForm({ ...form, confirm_password: event.target.value })} />
        </Field>
        <Button variant="primary" type="submit" loading={loading}>Update password</Button>
      </form>
      <div style={{ marginTop: 16 }}>
        <Link to="/login" className="link-plain small">← Back to sign in</Link>
      </div>
    </AuthShell>
  );
}
