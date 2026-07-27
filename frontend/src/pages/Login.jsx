import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import heroBg from '../assets/preginant.jpeg';

function FieldError({ msg }) {
  if (!msg) return null;
  return (
    <span style={{ fontSize: '0.78rem', color: 'var(--red)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5.5" stroke="currentColor"/><path d="M6 3.5v3M6 8h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
      {msg}
    </span>
  );
}

function InputField({ label, id, type = 'text', value, onChange, onBlur, error, touched, placeholder, autoComplete, hint, rightElement }) {
  const hasError = touched && error;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: '1rem' }}>
      <label htmlFor={id} style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--green-900)' }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          autoComplete={autoComplete}
          style={{
            width: '100%',
            border: `1.5px solid ${hasError ? 'var(--red)' : touched && !error ? '#2e9e6e' : 'var(--line)'}`,
            borderRadius: 10,
            padding: rightElement ? '0.65rem 2.75rem 0.65rem 0.75rem' : '0.65rem 0.75rem',
            background: hasError ? '#fff8f8' : '#fff',
            fontSize: '0.95rem',
            outline: 'none',
            transition: 'border-color 0.15s',
            boxSizing: 'border-box',
          }}
        />
        {rightElement && (
          <span style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)' }}>
            {rightElement}
          </span>
        )}
      </div>
      {hint && !hasError && <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{hint}</span>}
      <FieldError msg={hasError ? error : ''} />
    </div>
  );
}

const NEEDS_FACILITY = ['midwife', 'doctor', 'chw', 'facility_admin'];

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ username: '', password: '', facility_code: '' });
  const [touched, setTouched] = useState({ username: false, password: false, facility_code: false });
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  // After first submit attempt, show all errors
  const [submitted, setSubmitted] = useState(false);
  // Detected role from server (to know if facility_code needed)
  const [detectedRole, setDetectedRole] = useState(null);

  if (isAuthenticated) return <Navigate to="/" replace />;

  // Client-side validation rules
  function validate(f) {
    const errs = {};
    const u = f.username.trim();
    const p = f.password;
    const fc = f.facility_code.trim();

    if (!u) {
      errs.username = 'Username is required';
    } else if (u.length < 3) {
      errs.username = 'Username must be at least 3 characters';
    } else if (!/^[a-zA-Z0-9._-]+$/.test(u)) {
      errs.username = 'Username may only contain letters, numbers, dots, hyphens, and underscores';
    }

    if (!p) {
      errs.password = 'Password is required';
    } else if (p.length < 6) {
      errs.password = 'Password must be at least 6 characters';
    }

    // Only validate facility_code if we know the role needs it, or if user typed something
    const roleNeedsFacility = detectedRole ? NEEDS_FACILITY.includes(detectedRole) : true;
    if (roleNeedsFacility) {
      if (!fc) {
        errs.facility_code = 'Facility code is required';
      } else if (!/^[A-Za-z0-9-]+$/.test(fc)) {
        errs.facility_code = 'Facility code may only contain letters, numbers, and hyphens';
      } else if (fc.length < 4) {
        errs.facility_code = 'Facility code is too short';
      }
    }

    return errs;
  }

  const errors = validate(form);
  const isValid = Object.keys(errors).length === 0;

  function touch(field) {
    setTouched((t) => ({ ...t, [field]: true }));
  }

  function touchAll() {
    setTouched({ username: true, password: true, facility_code: true });
  }

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setServerError('');
    // Clear detected role if username changes
    if (field === 'username') setDetectedRole(null);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitted(true);
    touchAll();
    if (!isValid) return;

    setServerError('');
    setLoading(true);
    try {
      const payload = {
        username: form.username.trim(),
        password: form.password,
      };
      const fc = form.facility_code.trim().toUpperCase();
      if (fc) payload.facility_code = fc;

      await login(payload);
      navigate('/');
    } catch (err) {
      const msg = err.data?.error || err.message || 'Login failed. Please try again.';
      setServerError(typeof msg === 'string' ? msg : 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  const showFacilityField = detectedRole ? NEEDS_FACILITY.includes(detectedRole) : true;
  const eyeIcon = showPassword
    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;

  return (
    <div className="login-page">
      {/* Left hero */}
      <section
        className="login-hero"
        style={{ backgroundImage: `linear-gradient(135deg, rgba(11,61,46,0.85), rgba(20,108,84,0.65)), url(${heroBg})` }}
      >
        <div>
          <div style={{ letterSpacing: '0.14em', textTransform: 'uppercase', fontSize: '0.75rem', opacity: 0.8, marginBottom: '0.85rem', fontWeight: 700 }}>
            Ministry of Health · Rwanda
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.4rem, 4vw, 3.6rem)', margin: '0 0 0.75rem', lineHeight: 1.1 }}>
            Rwanda Maternal<br />Digital Platform
          </h1>
          <p style={{ maxWidth: '34ch', opacity: 0.92, fontSize: '1.05rem', lineHeight: 1.6, margin: '0 0 2rem' }}>
            AI-guided maternity care — from first registration to postpartum. Every clinical decision, at the right time.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', maxWidth: '28rem' }}>
            {[
              { icon: '🤰', text: 'Pregnancy registration & risk scoring' },
              { icon: '🩺', text: 'Smart ANC visits with AI clinical alerts' },
              { icon: '🚨', text: 'Labor monitoring & emergency checklists' },
              { icon: '🏘️', text: 'Postpartum care & CHW community follow-up' },
            ].map(({ icon, text }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '0.55rem 0.85rem', backdropFilter: 'blur(4px)' }}>
                <span style={{ fontSize: '1.1rem' }}>{icon}</span>
                <span style={{ fontSize: '0.9rem', opacity: 0.95 }}>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Right login panel */}
      <section className="login-panel">
        <form className="login-card" onSubmit={onSubmit} noValidate>
          {/* Logo mark */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 48, height: 48, borderRadius: 14,
              background: 'linear-gradient(145deg, var(--green-700), var(--green-900))',
              marginBottom: '0.85rem',
            }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', margin: '0 0 0.25rem', color: 'var(--green-900)', fontSize: '1.6rem' }}>
              Sign in to RMDP
            </h2>
            <p style={{ color: 'var(--muted)', margin: 0, fontSize: '0.9rem' }}>
              Enter your credentials to access your workspace
            </p>
          </div>

          {/* Server error */}
          {serverError && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              background: 'var(--red-bg)', border: '1px solid #f5c6c2',
              borderRadius: 10, padding: '0.75rem 0.9rem', marginBottom: '1rem',
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="8" cy="8" r="7.5" stroke="var(--red)"/><path d="M8 4.5v4M8 10.5h.01" stroke="var(--red)" strokeWidth="1.3" strokeLinecap="round"/></svg>
              <span style={{ fontSize: '0.88rem', color: 'var(--red)', lineHeight: 1.45 }}>{serverError}</span>
            </div>
          )}

          <InputField
            label="Username"
            id="username"
            value={form.username}
            onChange={(e) => set('username', e.target.value)}
            onBlur={() => touch('username')}
            error={errors.username}
            touched={touched.username || submitted}
            placeholder="Enter your username"
            autoComplete="username"
            hint="Your RMDP account username"
          />

          <InputField
            label="Password"
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            onBlur={() => touch('password')}
            error={errors.password}
            touched={touched.password || submitted}
            placeholder="Enter your password"
            autoComplete="current-password"
            rightElement={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0, display: 'flex', alignItems: 'center' }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {eyeIcon}
              </button>
            }
          />

          {showFacilityField && (
            <InputField
              label="Facility code"
              id="facility_code"
              value={form.facility_code}
              onChange={(e) => set('facility_code', e.target.value.toUpperCase())}
              onBlur={() => touch('facility_code')}
              error={errors.facility_code}
              touched={touched.facility_code || submitted}
              placeholder="e.g. KGL-HC-01"
              autoComplete="off"
              hint="Your health facility identifier — not required for MoH or district accounts"
            />
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.8rem',
              borderRadius: 10,
              border: 'none',
              background: loading ? 'var(--green-700)' : 'linear-gradient(135deg, var(--green-700), var(--green-900))',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.98rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginTop: '0.25rem',
              boxShadow: '0 6px 20px rgba(20,108,84,0.3)',
              transition: 'opacity 0.15s',
              opacity: loading ? 0.8 : 1,
            }}
          >
            {loading ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" style={{ animation: 'spin 0.8s linear infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                Signing in…
              </>
            ) : (
              <>
                Sign in to workspace
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </>
            )}
          </button>

          <div style={{
            marginTop: '1.5rem',
            padding: '0.85rem',
            background: 'var(--sky-50)',
            borderRadius: 10,
            border: '1px solid var(--line)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.5rem' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green-700)" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--green-800)' }}>
                Secure access
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.5 }}>
              Your session is encrypted and expires after 12 hours. All actions are logged for clinical audit compliance.
            </p>
          </div>
        </form>
      </section>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
