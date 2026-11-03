'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { login, forgotPassword } from '../../../lib/api';

const DEMO_ROLES = [
  { role: '1. Shopper', email: 'demo@stridera.ph', pass: 'Customer@123!', portal: '/shop', badge: '#0284c7' },
  { role: '2a. Seller (Apex)', email: 'seller@stridera.ph', pass: 'Seller@123!', portal: '/seller/dashboard', badge: '#059669' },
  { role: '2b. Seller (Manila Sole)', email: 'sole@stridera.ph', pass: 'Seller@123!', portal: '/seller/dashboard', badge: '#0d9488' },
  { role: '3. Administrator', email: 'admin@stridera.ph', pass: 'Admin@Stridera2024!', portal: '/admin/dashboard', badge: '#7c3aed' },
  { role: '4. Inventory Manager', email: 'inventory@stridera.ph', pass: 'Inventory@123!', portal: '/inventory', badge: '#d97706' },
  { role: '5. Delivery Personnel', email: 'delivery@stridera.ph', pass: 'Delivery@123!', portal: '/delivery', badge: '#ea580c' },
  { role: '6. Customer Support', email: 'support@stridera.ph', pass: 'Support@123!', portal: '/support', badge: '#2563eb' },
  { role: '7. Finance Officer', email: 'finance@stridera.ph', pass: 'Finance@123!', portal: '/finance', badge: '#16a34a' }
];

function getRedirectForRole(role) {
  switch (role) {
    case 'SELLER': return '/seller/dashboard';
    case 'ADMIN': return '/admin/dashboard';
    case 'INVENTORY_MANAGER': return '/inventory';
    case 'DELIVERY_PERSONNEL': return '/delivery';
    case 'CUSTOMER_SUPPORT': return '/support';
    case 'FINANCE_OFFICER': return '/finance';
    default: return '/';
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Forgot password modal state (FR-1.7)
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryNewPass, setRecoveryNewPass] = useState('');
  const [recoveryMsg, setRecoveryMsg] = useState(null);

  const performLogin = async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const data = await login(email, password);
      const user = data.data?.user;
      const token = data.data?.token;
      if (typeof window !== 'undefined') {
        if (token) localStorage.setItem('stridera_token', token);
        if (user) localStorage.setItem('stridera_user', JSON.stringify(user));
      }
      router.push(getRedirectForRole(user?.role));
    } catch (e) {
      setError(e.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await performLogin(form.email, form.password);
  };

  const handlePasswordRecovery = async (e) => {
    e.preventDefault();
    setRecoveryMsg(null);
    try {
      const res = await forgotPassword(recoveryEmail, recoveryNewPass || undefined);
      setRecoveryMsg({ type: 'success', text: res.message });
    } catch (err) {
      setRecoveryMsg({ type: 'error', text: err.message || 'Recovery request failed' });
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1.15fr 0.85fr' }}>
      {/* Left panel — form + 7-Role Quick Switcher */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-8)', background: 'var(--color-bg)' }}>
        <div style={{ width: '100%', maxWidth: 480 }}>
          <Link href="/" style={{ display: 'inline-block', marginBottom: 'var(--space-6)' }}>
            <img src="/assets/logo/stridera-logo.png" alt="STRIDERA" style={{ height: 36 }} />
          </Link>

          <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, marginBottom: 'var(--space-1)' }}>Sign in to STRIDERA</h1>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-6)', fontSize: 'var(--text-sm)' }}>
            Unified Authentication &amp; Role-Based Access Control across all 7 System Roles
          </p>

          {error && (
            <div role="alert" style={{
              background: 'rgba(239,68,68,0.08)', border: '1px solid var(--color-error)',
              borderRadius: 'var(--radius-md)', padding: 'var(--space-3) var(--space-4)',
              color: 'var(--color-error)', fontSize: 'var(--text-sm)', fontWeight: 500,
              marginBottom: 'var(--space-4)'
            }}>{error}</div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                className="form-input"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                required
                autoComplete="email"
              />
            </div>
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                <label className="form-label" htmlFor="password" style={{ margin: 0 }}>Password</label>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--color-brand-primary)', textDecoration: 'underline' }}
                >
                  Forgot password?
                </button>
              </div>
              <input
                id="password"
                type="password"
                className="form-input"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                required
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-lg btn-full"
              disabled={loading || !form.email || !form.password}
              id="login-submit-btn"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          {/* 7-Role Instant Demo Switcher */}
          <div style={{
            marginTop: 'var(--space-6)',
            padding: 'var(--space-4)',
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)'
          }}>
            <p style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>
              ⚡ 1-Click Demo Login (All 7 System Roles — Section B)
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
              {DEMO_ROLES.map(d => (
                <button
                  key={d.email}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setForm({ email: d.email, password: d.pass });
                    performLogin(d.email, d.pass);
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg)',
                    cursor: 'pointer',
                    fontSize: '11px',
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ fontWeight: 700, color: d.badge }}>{d.role}</div>
                  <div style={{ color: 'var(--color-text-muted)', fontSize: '10px' }}>{d.email}</div>
                </button>
              ))}
            </div>
          </div>

          <p style={{ textAlign: 'center', marginTop: 'var(--space-5)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            New to STRIDERA?{' '}
            <Link href="/account/register" style={{ color: 'var(--color-brand-primary)', fontWeight: 600 }}>Create Shopper Account</Link>
            {' '}|{' '}
            <Link href="/seller/register" style={{ color: 'var(--color-brand-primary)', fontWeight: 600 }}>Apply as Seller</Link>
          </p>
        </div>
      </div>

      {/* Right panel — image */}
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <img
          src="/assets/products/running-women-2.jpg"
          alt="STRIDERA Collection"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, rgba(26,58,107,0.75), rgba(74,144,196,0.35))',
          display: 'flex', alignItems: 'flex-end', padding: 'var(--space-12)'
        }}>
          <blockquote style={{ color: '#fff' }}>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-4xl)', lineHeight: 1.1 }}>
              Every Stride.<br />Every Role.<br />Connected.
            </p>
            <footer style={{ fontSize: 'var(--text-sm)', opacity: 0.85, marginTop: 'var(--space-3)' }}>
              — STRIDERA Multi-Seller Footwear Platform
            </footer>
          </blockquote>
        </div>
      </div>

      {/* Forgot Password Modal (FR-1.7) */}
      {showForgotModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 'var(--space-4)'
        }}>
          <div style={{
            background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-6)', width: '100%', maxWidth: 420, boxShadow: 'var(--shadow-xl)'
          }}>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 800, marginBottom: 'var(--space-2)' }}>Password Recovery (FR-1.7)</h2>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
              Enter your registered email and new password to reset your account credentials.
            </p>
            {recoveryMsg && (
              <div style={{
                padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)',
                fontSize: 'var(--text-xs)', fontWeight: 600,
                background: recoveryMsg.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                color: recoveryMsg.type === 'success' ? 'var(--color-success)' : 'var(--color-error)'
              }}>
                {recoveryMsg.text}
              </div>
            )}
            <form onSubmit={handlePasswordRecovery}>
              <div className="form-group">
                <label className="form-label">Registered Email</label>
                <input
                  type="email"
                  className="form-input"
                  value={recoveryEmail}
                  onChange={e => setRecoveryEmail(e.target.value)}
                  placeholder="demo@stridera.ph"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">New Password (min 8 chars)</label>
                <input
                  type="password"
                  className="form-input"
                  value={recoveryNewPass}
                  onChange={e => setRecoveryNewPass(e.target.value)}
                  placeholder="Enter new password"
                  minLength={8}
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => { setShowForgotModal(false); setRecoveryMsg(null); }}>
                  Close
                </button>
                <button type="submit" className="btn btn-primary">
                  Reset Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
