'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  EMAIL_POLICY,
  formatPhMobileInput,
  handlePhMobileKeyDown,
  normalizePhMobile,
  validateEmail,
  validatePersonName,
  validatePassword,
  focusFirstInvalidField
} from '../../../lib/validation';
import InlineFieldError from '../../../components/InlineFieldError';
import PasswordInput from '../../../components/PasswordInput';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '+63 ',
    password: '',
    confirmPassword: ''
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const validateField = (field, rawVal, nextForm = form) => {
    switch (field) {
      case 'firstName': {
        const r = validatePersonName(rawVal, 'First name');
        return r.valid ? null : r.error;
      }
      case 'lastName': {
        const r = validatePersonName(rawVal, 'Last name');
        return r.valid ? null : r.error;
      }
      case 'email': {
        const r = validateEmail(rawVal, { required: true, applyPolicy: true, policy: EMAIL_POLICY });
        return r.valid ? null : r.error;
      }
      case 'phone': {
        const r = normalizePhMobile(rawVal, { required: true });
        return r.valid ? null : r.error;
      }
      case 'password': {
        const r = validatePassword(rawVal, { required: true, checkStrength: true });
        return r.valid ? null : r.error;
      }
      case 'confirmPassword': {
        if (!rawVal) return 'Please confirm your password.';
        return rawVal === nextForm.password ? null : 'Passwords do not match.';
      }
      default:
        return null;
    }
  };

  const setField = (k, v) => {
    setForm(prev => {
      const next = { ...prev, [k]: v };
      if (fieldErrors[k]) {
        setFieldErrors(fe => ({ ...fe, [k]: validateField(k, v, next) }));
      }
      if (k === 'password' && prev.confirmPassword && fieldErrors.confirmPassword) {
        setFieldErrors(fe => ({ ...fe, confirmPassword: validateField('confirmPassword', prev.confirmPassword, next) }));
      }
      return next;
    });
  };

  const handleBlur = (k) => {
    setFieldErrors(prev => ({ ...prev, [k]: validateField(k, form[k], form) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError(null);

    const errors = {
      firstName: validateField('firstName', form.firstName),
      lastName: validateField('lastName', form.lastName),
      email: validateField('email', form.email),
      phone: validateField('phone', form.phone),
      password: validateField('password', form.password),
      confirmPassword: validateField('confirmPassword', form.confirmPassword)
    };
    setFieldErrors(errors);

    const firstInvalid = Object.values(errors).some(Boolean);
    if (firstInvalid) {
      focusFirstInvalidField(errors, {
        firstName: 'reg-firstName',
        lastName: 'reg-lastName',
        email: 'reg-email',
        phone: 'reg-phone',
        password: 'reg-password',
        confirmPassword: 'reg-confirm'
      });
      return;
    }

    const emailCheck = validateEmail(form.email, { required: true, applyPolicy: true, policy: EMAIL_POLICY });
    const phoneCheck = normalizePhMobile(form.phone, { required: true });

    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: emailCheck.value,
          phone: phoneCheck.value,
          password: form.password,
          confirmPassword: form.confirmPassword
        })
      });
      const data = await res.json();
      if (!data.success) {
        if (data.fieldErrors) setFieldErrors(prev => ({ ...prev, ...data.fieldErrors }));
        const detailMsg = data.error?.details?.[0]?.msg;
        throw new Error(data.message || detailMsg || data.error?.message || 'Registration failed');
      }
      if (typeof window !== 'undefined') {
        if (data.data?.token) localStorage.setItem('stridera_token', data.data.token);
        if (data.data?.user) localStorage.setItem('stridera_user', JSON.stringify(data.data.user));
      }
      router.push('/');
    } catch (err) {
      setError(err.message);
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
              <input
                id="reg-firstName"
                className="form-input"
                placeholder="e.g. Juan"
                value={form.firstName}
                onChange={e => setField('firstName', e.target.value)}
                onBlur={() => handleBlur('firstName')}
                required
                aria-required="true"
                aria-invalid={Boolean(fieldErrors.firstName)}
                aria-describedby={fieldErrors.firstName ? 'reg-firstName-err' : undefined}
                maxLength={60}
              />
              <InlineFieldError id="reg-firstName-err" error={fieldErrors.firstName} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="reg-lastName">Last Name *</label>
              <input
                id="reg-lastName"
                className="form-input"
                placeholder="e.g. Dela Cruz"
                value={form.lastName}
                onChange={e => setField('lastName', e.target.value)}
                onBlur={() => handleBlur('lastName')}
                required
                aria-required="true"
                aria-invalid={Boolean(fieldErrors.lastName)}
                aria-describedby={fieldErrors.lastName ? 'reg-lastName-err' : undefined}
                maxLength={60}
              />
              <InlineFieldError id="reg-lastName-err" error={fieldErrors.lastName} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-email">Email Address *</label>
            <input
              id="reg-email"
              type="email"
              className="form-input"
              placeholder="name@gmail.com"
              value={form.email}
              onChange={e => setField('email', e.target.value)}
              onBlur={() => handleBlur('email')}
              required
              aria-required="true"
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'reg-email-err' : undefined}
              autoComplete="email"
              maxLength={254}
            />
            <InlineFieldError id="reg-email-err" error={fieldErrors.email} />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-phone">Mobile Number (PH International) *</label>
            <input
              id="reg-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={16}
              required
              aria-required="true"
              aria-invalid={Boolean(fieldErrors.phone)}
              aria-describedby={fieldErrors.phone ? 'reg-phone-err' : 'reg-phone-hint'}
              className="form-input"
              placeholder="+63 9XX-XXX-YYYY"
              value={form.phone}
              onKeyDown={handlePhMobileKeyDown}
              onChange={e => setField('phone', formatPhMobileInput(e.target.value))}
              onBlur={() => handleBlur('phone')}
            />
            <InlineFieldError id="reg-phone-err" error={fieldErrors.phone} />
            <span id="reg-phone-hint" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)', display: 'block', marginTop: 3 }}>
              Format: +63 9XX-XXX-YYYY ({form.phone.replace(/\D/g, '').length}/12 digits)
            </span>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-password">Password *</label>
            <PasswordInput
              id="reg-password"
              className="form-input"
              value={form.password}
              onChange={e => setField('password', e.target.value)}
              onBlur={() => handleBlur('password')}
              required
              aria-required="true"
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? 'reg-password-err' : 'reg-password-hint'}
              autoComplete="new-password"
              minLength={8}
            />
            <InlineFieldError id="reg-password-err" error={fieldErrors.password} />
            <span id="reg-password-hint" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)', display: 'block', marginTop: 3 }}>
              Minimum 8 characters with at least 1 letter and 1 number
            </span>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-confirm">Confirm Password *</label>
            <PasswordInput
              id="reg-confirm"
              className="form-input"
              toggleLabel="confirm password"
              value={form.confirmPassword}
              onChange={e => setField('confirmPassword', e.target.value)}
              onBlur={() => handleBlur('confirmPassword')}
              required
              aria-required="true"
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              aria-describedby={fieldErrors.confirmPassword ? 'reg-confirm-err' : undefined}
              autoComplete="new-password"
            />
            <InlineFieldError id="reg-confirm-err" error={fieldErrors.confirmPassword} />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg btn-full"
            disabled={loading}
            id="register-submit-btn"
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
