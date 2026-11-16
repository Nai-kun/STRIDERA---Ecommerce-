'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '+63 ', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const PH_MOBILE_REGEX = /^\+63 9\d{2}-\d{3}-\d{4}$/;

  const formatPhMobile = (raw) => {
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('63')) digits = digits.slice(2);
    else if (digits.startsWith('0')) digits = digits.slice(1);
    digits = digits.slice(0, 10);
    let formatted = digits.slice(0, 3);
    if (digits.length > 3) formatted += '-' + digits.slice(3, 6);
    if (digits.length > 6) formatted += '-' + digits.slice(6, 10);
    return '+63 ' + formatted;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!PH_MOBILE_REGEX.test(form.phone)) {
      setError('Mobile number must be in Philippine international format: +63 9XX-XXX-YYYY (e.g. +63 917-123-4567)');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone, password: form.password })
      });
      const data = await res.json();
      if (!data.success) {
        const detailMsg = data.error?.details?.[0]?.msg;
        throw new Error(detailMsg || data.error?.message || data.message || 'Registration failed');
      }
      if (typeof window !== 'undefined') {
        if (data.data?.token) localStorage.setItem('stridera_token', data.data.token);
        if (data.data?.user) localStorage.setItem('stridera_user', JSON.stringify(data.data.user));
      }
      router.push('/');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)', padding: 'var(--space-8)' }}>
      <div style={{ width: '100%', maxWidth: 480, background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-8)', boxShadow: 'var(--shadow-xl)' }}>
        <Link href="/" style={{ display: 'inline-block', marginBottom: 'var(--space-6)' }}>
          <img src="/assets/logo/stridera-logo.png" alt="STRIDERA" style={{ height: 36 }} />
        </Link>

        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, marginBottom: 'var(--space-1)' }}>Create account</h1>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-6)', fontSize: 'var(--text-sm)' }}>
          Already have one? <Link href="/account/login" style={{ color: 'var(--color-brand-primary)', fontWeight: 600 }}>Sign in</Link>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="reg-firstName">First Name *</label>
              <input id="reg-firstName" className="form-input" value={form.firstName} onChange={e => setField('firstName', e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="reg-lastName">Last Name *</label>
              <input id="reg-lastName" className="form-input" value={form.lastName} onChange={e => setField('lastName', e.target.value)} required />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="reg-email">Email Address *</label>
            <input id="reg-email" type="email" className="form-input" value={form.email} onChange={e => setField('email', e.target.value)} required autoComplete="email" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="reg-phone">Mobile Number (PH International) *</label>
            <input
              id="reg-phone"
              type="tel"
              inputMode="numeric"
              maxLength={16}
              pattern="^\+63 9\d{2}-\d{3}-\d{4}$"
              required
              className="form-input"
              placeholder="+63 917-123-4567"
              value={form.phone}
              onKeyDown={e => {
                if ((e.key === 'Backspace' || e.key === 'Delete') && (e.currentTarget.selectionStart ?? 0) <= 4 && (e.currentTarget.selectionEnd ?? 0) <= 4) {
                  e.preventDefault();
                }
              }}
              onChange={e => setField('phone', formatPhMobile(e.target.value))}
            />
            <span className="form-error" style={{ color: form.phone.length > 4 && !PH_MOBILE_REGEX.test(form.phone) ? 'var(--color-error)' : 'var(--color-text-subtle)' }}>
              Format: +63 9XX-XXX-YYYY (12 digits, e.g. +63 917-123-4567) — {form.phone.replace(/\D/g, '').length}/12 digits
            </span>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="reg-password">Password *</label>
            <input id="reg-password" type="password" className="form-input" value={form.password} onChange={e => setField('password', e.target.value)} required autoComplete="new-password" minLength={8} />
            <span className="form-error" style={{ color: 'var(--color-text-subtle)' }}>Minimum 8 characters</span>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="reg-confirm">Confirm Password *</label>
            <input id="reg-confirm" type="password" className="form-input" value={form.confirmPassword} onChange={e => setField('confirmPassword', e.target.value)} required autoComplete="new-password" />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg btn-full"
            disabled={loading || !form.firstName || !form.email || !PH_MOBILE_REGEX.test(form.phone) || !form.password || !form.confirmPassword}
            id="register-submit-btn"
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
