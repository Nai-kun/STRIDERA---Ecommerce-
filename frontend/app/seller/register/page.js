'use client';

import { useState } from 'react';
import Link from 'next/link';
import { registerSeller } from '../../../lib/api';

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
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
    setError(null);

    if (!PH_MOBILE_REGEX.test(form.phone)) {
      setError('Contact mobile number must be in Philippine international format: +63 9XX-XXX-YYYY (e.g. +63 917-123-4567)');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      setLoading(true);
      const res = await registerSeller({
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        storeName: form.storeName,
        storeDescription: form.storeDescription,
        storeLogoUrl: form.storeLogoUrl,
        identificationDetails: form.identificationDetails
      });

      if (res.success) {
        setSubmitted(true);
      }
    } catch (err) {
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
                <div style={{
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

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Store / Merchant Brand Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Apex Footwear Hub"
                    value={form.storeName}
                    onChange={e => setForm({ ...form, storeName: e.target.value })}
                    className="form-input"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Store Overview &amp; Specialty</label>
                  <textarea
                    rows="2"
                    placeholder="Authorized distributor of performance and marathon running shoes..."
                    value={form.storeDescription}
                    onChange={e => setForm({ ...form, storeDescription: e.target.value })}
                    className="form-input"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Business / DTI / TIN ID Details (FR-5.2) *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. DTI-NCR-2026-884120 / TIN 412-889-102"
                      value={form.identificationDetails}
                      onChange={e => setForm({ ...form, identificationDetails: e.target.value })}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Store Logo URL (Optional)</label>
                    <input
                      type="text"
                      placeholder="/assets/logo/stridera-logo.png"
                      value={form.storeLogoUrl}
                      onChange={e => setForm({ ...form, storeLogoUrl: e.target.value })}
                      className="form-input"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Representative First Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="Juan"
                      value={form.firstName}
                      onChange={e => setForm({ ...form, firstName: e.target.value })}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Last Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="Dela Cruz"
                      value={form.lastName}
                      onChange={e => setForm({ ...form, lastName: e.target.value })}
                      className="form-input"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Business Email *</label>
                    <input
                      type="email"
                      required
                      placeholder="vendor@company.ph"
                      value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Contact Mobile (+63 9XX-XXX-YYYY) *</label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={16}
                      pattern="^\+63 9\d{2}-\d{3}-\d{4}$"
                      required
                      placeholder="+63 917-123-4567"
                      value={form.phone}
                      onKeyDown={e => {
                        if ((e.key === 'Backspace' || e.key === 'Delete') && (e.currentTarget.selectionStart ?? 0) <= 4 && (e.currentTarget.selectionEnd ?? 0) <= 4) {
                          e.preventDefault();
                        }
                      }}
                      onChange={e => setForm({ ...form, phone: formatPhMobile(e.target.value) })}
                      className="form-input"
                    />
                    <span style={{ fontSize: '11px', color: form.phone.length > 4 && !PH_MOBILE_REGEX.test(form.phone) ? 'var(--color-error)' : 'var(--color-text-muted)' }}>
                      {form.phone.replace(/\D/g, '').length}/12 digits (Format: +63 9XX-XXX-YYYY)
                    </span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Password (min 8 chars) *</label>
                    <input
                      type="password"
                      required
                      minLength="8"
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Confirm Password *</label>
                    <input
                      type="password"
                      required
                      minLength="8"
                      value={form.confirmPassword}
                      onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
                      className="form-input"
                    />
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
