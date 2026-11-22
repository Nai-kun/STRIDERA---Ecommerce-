'use client';

import { useState } from 'react';
import Link from 'next/link';
import { registerSeller } from '../../../lib/api';
import {
  EMAIL_POLICY,
  formatPhMobileInput,
  handlePhMobileKeyDown,
  normalizePhMobile,
  validateEmail,
  validatePersonName,
  validateEntityName,
  validateOptionalText,
  validateRequiredText,
  validateOptionalUrl,
  validatePassword,
  focusFirstInvalidField
} from '../../../lib/validation';
import InlineFieldError from '../../../components/InlineFieldError';
import PasswordInput from '../../../components/PasswordInput';

export default function SellerRegisterPage() {
  const [form, setForm] = useState({
    storeName: '',
    storeDescription: '',
    storeLogoUrl: '',
    identificationDetails: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '+63 ',
    password: '',
    confirmPassword: ''
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const validateField = (field, rawVal, nextForm = form) => {
    switch (field) {
      case 'storeName': {
        const r = validateEntityName(rawVal, 'Store name', { min: 2, max: 80 });
        return r.valid ? null : r.error;
      }
      case 'storeDescription': {
        const r = validateOptionalText(rawVal, 'Store description', { max: 1000 });
        return r.valid ? null : r.error;
      }
      case 'storeLogoUrl': {
        const r = validateOptionalUrl(rawVal, 'Store logo URL');
        return r.valid ? null : r.error;
      }
      case 'identificationDetails': {
        const r = validateRequiredText(rawVal, 'Business / DTI / TIN ID details', { min: 3, max: 300 });
        return r.valid ? null : r.error;
      }
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
      storeName: validateField('storeName', form.storeName),
      storeDescription: validateField('storeDescription', form.storeDescription),
      identificationDetails: validateField('identificationDetails', form.identificationDetails),
      storeLogoUrl: validateField('storeLogoUrl', form.storeLogoUrl),
      firstName: validateField('firstName', form.firstName),
      lastName: validateField('lastName', form.lastName),
      email: validateField('email', form.email),
      phone: validateField('phone', form.phone),
      password: validateField('password', form.password),
      confirmPassword: validateField('confirmPassword', form.confirmPassword)
    };
    setFieldErrors(errors);

    if (Object.values(errors).some(Boolean)) {
      focusFirstInvalidField(errors, {
        storeName: 'sr-storeName',
        storeDescription: 'sr-storeDesc',
        identificationDetails: 'sr-idDetails',
        storeLogoUrl: 'sr-logoUrl',
        firstName: 'sr-firstName',
        lastName: 'sr-lastName',
        email: 'sr-email',
        phone: 'sr-phone',
        password: 'sr-password',
        confirmPassword: 'sr-confirm'
      });
      return;
    }

    const emailCheck = validateEmail(form.email, { required: true, applyPolicy: true, policy: EMAIL_POLICY });
    const phoneCheck = normalizePhMobile(form.phone, { required: true });

    try {
      setLoading(true);
      const res = await registerSeller({
        email: emailCheck.value,
        password: form.password,
        confirmPassword: form.confirmPassword,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: phoneCheck.value,
        storeName: form.storeName.trim(),
        storeDescription: form.storeDescription.trim() || '',
        storeLogoUrl: form.storeLogoUrl.trim() || '',
        identificationDetails: form.identificationDetails.trim()
      });

      if (res.success) {
        setSubmitted(true);
      }
    } catch (err) {
      if (err?.data?.fieldErrors) setFieldErrors(prev => ({ ...prev, ...err.data.fieldErrors }));
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', padding: 'var(--space-4) 0' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" style={{ color: 'var(--color-text)', textDecoration: 'none', fontWeight: 700, fontSize: 'var(--text-lg)' }}>
            STRIDERA
          </Link>
          <Link href="/account/login" className="btn btn-outline btn-sm">
            Sign In
          </Link>
        </div>
      </header>

      <main className="container" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-12) var(--space-4)' }}>
        <div style={{
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-8)',
          boxShadow: 'var(--shadow-md)',
          maxWidth: '580px',
          width: '100%'
        }}>
          {submitted ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'rgba(34, 197, 94, 0.1)', color: 'var(--color-success)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto var(--space-4)', fontSize: 'var(--text-2xl)'
              }}>
                ✓
              </div>
              <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
                Seller Application Submitted! (FR-5.1)
              </h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)', lineHeight: 1.6 }}>
                Your merchant application and identification details for <strong>{form.storeName}</strong> have been received and are queued for Administrator approval (FR-10.3).
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' }}>
                <Link href="/" className="btn btn-primary">Return to Storefront</Link>
                <Link href="/account/login" className="btn btn-outline">Sign In</Link>
              </div>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 'var(--space-6)', textAlign: 'center' }}>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', color: 'var(--color-brand-dark)' }}>
                  Become a STRIDERA Merchant (FR-5.1)
                </h1>
                <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>
                  Submit your store profile and identification details for Administrator verification.
                </p>
              </div>

              {error && (
                <div role="alert" style={{
                  background: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  color: 'var(--color-error)',
                  padding: 'var(--space-3) var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: 'var(--space-4)',
                  fontSize: 'var(--text-sm)'
                }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div>
                  <label htmlFor="sr-storeName" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                    Store / Merchant Brand Name *
                  </label>
                  <input
                    id="sr-storeName"
                    type="text"
                    required
                    aria-required="true"
                    aria-invalid={Boolean(fieldErrors.storeName)}
                    aria-describedby={fieldErrors.storeName ? 'sr-storeName-err' : undefined}
                    maxLength={80}
                    placeholder="e.g. Apex Footwear Hub"
                    value={form.storeName}
                    onChange={e => setField('storeName', e.target.value)}
                    onBlur={() => handleBlur('storeName')}
                    className="form-input"
                  />
                  <InlineFieldError id="sr-storeName-err" error={fieldErrors.storeName} />
                </div>

                <div>
                  <label htmlFor="sr-storeDesc" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                    Store Overview &amp; Specialty <span className="form-optional">(optional)</span>
                  </label>
                  <textarea
                    id="sr-storeDesc"
                    rows="2"
                    maxLength={1000}
                    placeholder="Authorized distributor of performance and marathon running shoes..."
                    value={form.storeDescription}
                    onChange={e => setField('storeDescription', e.target.value)}
                    onBlur={() => handleBlur('storeDescription')}
                    aria-invalid={Boolean(fieldErrors.storeDescription)}
                    aria-describedby={fieldErrors.storeDescription ? 'sr-storeDesc-err' : undefined}
                    className="form-input"
                  />
                  <InlineFieldError id="sr-storeDesc-err" error={fieldErrors.storeDescription} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  <div>
                    <label htmlFor="sr-idDetails" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                      Business / DTI / TIN ID Details *
                    </label>
                    <input
                      id="sr-idDetails"
                      type="text"
                      required
                      aria-required="true"
                      aria-invalid={Boolean(fieldErrors.identificationDetails)}
                      aria-describedby={fieldErrors.identificationDetails ? 'sr-idDetails-err' : undefined}
                      maxLength={300}
                      placeholder="e.g. DTI-NCR-2026-884120 / TIN 412-889-102"
                      value={form.identificationDetails}
                      onChange={e => setField('identificationDetails', e.target.value)}
                      onBlur={() => handleBlur('identificationDetails')}
                      className="form-input"
                    />
                    <InlineFieldError id="sr-idDetails-err" error={fieldErrors.identificationDetails} />
                  </div>
                  <div>
                    <label htmlFor="sr-logoUrl" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                      Store Logo URL <span className="form-optional">(optional)</span>
                    </label>
                    <input
                      id="sr-logoUrl"
                      type="text"
                      maxLength={300}
                      placeholder="/assets/logo/stridera-logo.png"
                      value={form.storeLogoUrl}
                      onChange={e => setField('storeLogoUrl', e.target.value)}
                      onBlur={() => handleBlur('storeLogoUrl')}
                      aria-invalid={Boolean(fieldErrors.storeLogoUrl)}
                      aria-describedby={fieldErrors.storeLogoUrl ? 'sr-logoUrl-err' : undefined}
                      className="form-input"
                    />
                    <InlineFieldError id="sr-logoUrl-err" error={fieldErrors.storeLogoUrl} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  <div>
                    <label htmlFor="sr-firstName" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                      Representative First Name *
                    </label>
                    <input
                      id="sr-firstName"
                      type="text"
                      required
                      aria-required="true"
                      aria-invalid={Boolean(fieldErrors.firstName)}
                      aria-describedby={fieldErrors.firstName ? 'sr-firstName-err' : undefined}
                      maxLength={60}
                      placeholder="Juan"
                      value={form.firstName}
                      onChange={e => setField('firstName', e.target.value)}
                      onBlur={() => handleBlur('firstName')}
                      className="form-input"
                    />
                    <InlineFieldError id="sr-firstName-err" error={fieldErrors.firstName} />
                  </div>
                  <div>
                    <label htmlFor="sr-lastName" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                      Last Name *
                    </label>
                    <input
                      id="sr-lastName"
                      type="text"
                      required
                      aria-required="true"
                      aria-invalid={Boolean(fieldErrors.lastName)}
                      aria-describedby={fieldErrors.lastName ? 'sr-lastName-err' : undefined}
                      maxLength={60}
                      placeholder="Dela Cruz"
                      value={form.lastName}
                      onChange={e => setField('lastName', e.target.value)}
                      onBlur={() => handleBlur('lastName')}
                      className="form-input"
                    />
                    <InlineFieldError id="sr-lastName-err" error={fieldErrors.lastName} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  <div>
                    <label htmlFor="sr-email" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                      Business Email *
                    </label>
                    <input
                      id="sr-email"
                      type="email"
                      autoComplete="email"
                      required
                      aria-required="true"
                      aria-invalid={Boolean(fieldErrors.email)}
                      aria-describedby={fieldErrors.email ? 'sr-email-err' : undefined}
                      maxLength={254}
                      placeholder="name@gmail.com"
                      value={form.email}
                      onChange={e => setField('email', e.target.value)}
                      onBlur={() => handleBlur('email')}
                      className="form-input"
                    />
                    <InlineFieldError id="sr-email-err" error={fieldErrors.email} />
                  </div>
                  <div>
                    <label htmlFor="sr-phone" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                      Contact Mobile *
                    </label>
                    <input
                      id="sr-phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      maxLength={16}
                      required
                      aria-required="true"
                      aria-invalid={Boolean(fieldErrors.phone)}
                      aria-describedby={fieldErrors.phone ? 'sr-phone-err' : 'sr-phone-hint'}
                      placeholder="+63 9XX-XXX-YYYY"
                      value={form.phone}
                      onKeyDown={handlePhMobileKeyDown}
                      onChange={e => setField('phone', formatPhMobileInput(e.target.value))}
                      onBlur={() => handleBlur('phone')}
                      className="form-input"
                    />
                    <InlineFieldError id="sr-phone-err" error={fieldErrors.phone} />
                    <span id="sr-phone-hint" style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'block', marginTop: 3 }}>
                      {form.phone.replace(/\D/g, '').length}/12 digits (+63 9XX-XXX-YYYY)
                    </span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  <div>
                    <label htmlFor="sr-password" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                      Password *
                    </label>
                    <PasswordInput
                      id="sr-password"
                      autoComplete="new-password"
                      required
                      aria-required="true"
                      aria-invalid={Boolean(fieldErrors.password)}
                      aria-describedby={fieldErrors.password ? 'sr-password-err' : undefined}
                      minLength={8}
                      placeholder="Min 8 chars, 1 letter & 1 number"
                      value={form.password}
                      onChange={e => setField('password', e.target.value)}
                      onBlur={() => handleBlur('password')}
                      className="form-input"
                    />
                    <InlineFieldError id="sr-password-err" error={fieldErrors.password} />
                  </div>
                  <div>
                    <label htmlFor="sr-confirm" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                      Confirm Password *
                    </label>
                    <PasswordInput
                      id="sr-confirm"
                      toggleLabel="confirm password"
                      autoComplete="new-password"
                      required
                      aria-required="true"
                      aria-invalid={Boolean(fieldErrors.confirmPassword)}
                      aria-describedby={fieldErrors.confirmPassword ? 'sr-confirm-err' : undefined}
                      minLength={8}
                      value={form.confirmPassword}
                      onChange={e => setField('confirmPassword', e.target.value)}
                      onBlur={() => handleBlur('confirmPassword')}
                      className="form-input"
                    />
                    <InlineFieldError id="sr-confirm-err" error={fieldErrors.confirmPassword} />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary btn-full"
                  style={{ marginTop: 'var(--space-2)' }}
                >
                  {loading ? 'Submitting Application...' : 'Submit Seller Verification Application'}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
