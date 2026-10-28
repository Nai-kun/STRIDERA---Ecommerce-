'use client';

import { useState } from 'react';
import Link from 'next/link';
import { registerSeller } from '../../../lib/api';

export default function SellerRegisterPage() {
  const [form, setForm] = useState({
    storeName: '',
    storeDescription: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: ''
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

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
        storeDescription: form.storeDescription
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
      {/* Header */}
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

      {/* Main Container */}
      <main className="container" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-12) var(--space-4)' }}>
        <div style={{
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-8)',
          boxShadow: 'var(--shadow-md)',
          maxWidth: '560px',
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
                Application Submitted!
              </h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)', lineHeight: 1.6 }}>
                Your merchant application for <strong>{form.storeName}</strong> has been received and is queued for platform administrator review. You will be notified once your brand profile is activated.
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
                  Become a STRIDERA Merchant
                </h1>
                <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>
                  Sell your curated footwear brand on the Philippines' premier athletic marketplace.
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
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Store / Merchant Brand Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Apex Footwear Hub"
                    value={form.storeName}
                    onChange={e => setForm({ ...form, storeName: e.target.value })}
                    style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Store Overview & Specialty</label>
                  <textarea
                    rows="2"
                    placeholder="Authorized distributor of performance and marathon running shoes..."
                    value={form.storeDescription}
                    onChange={e => setForm({ ...form, storeDescription: e.target.value })}
                    style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Representative First Name</label>
                    <input
                      type="text"
                      required
                      placeholder="Juan"
                      value={form.firstName}
                      onChange={e => setForm({ ...form, firstName: e.target.value })}
                      style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Last Name</label>
                    <input
                      type="text"
                      required
                      placeholder="Dela Cruz"
                      value={form.lastName}
                      onChange={e => setForm({ ...form, lastName: e.target.value })}
                      style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Business Email</label>
                    <input
                      type="email"
                      required
                      placeholder="vendor@company.ph"
                      value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Contact Phone</label>
                    <input
                      type="tel"
                      required
                      placeholder="+63 917 123 4567"
                      value={form.phone}
                      onChange={e => setForm({ ...form, phone: e.target.value })}
                      style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Password (min 8 chars)</label>
                    <input
                      type="password"
                      required
                      minLength="8"
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Confirm Password</label>
                    <input
                      type="password"
                      required
                      minLength="8"
                      value={form.confirmPassword}
                      onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
                      style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                    />
                  </div>
                </div>

                <div style={{
                  background: 'var(--color-surface-raised)',
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-muted)'
                }}>
                  🛡️ All merchant accounts undergo administrative approval before listings become visible to shoppers.
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary btn-full"
                  style={{ marginTop: 'var(--space-2)' }}
                >
                  {loading ? 'Submitting Application...' : 'Register as Merchant'}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

