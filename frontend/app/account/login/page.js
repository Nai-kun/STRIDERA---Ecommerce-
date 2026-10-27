'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Login failed');
      router.push('/');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
      {/* Left panel — form */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-12)', background: 'var(--color-bg)' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <Link href="/" style={{ display: 'inline-block', marginBottom: 'var(--space-8)' }}>
            <img src="/assets/logo/stridera-logo.png" alt="STRIDERA" style={{ height: 40 }} />
          </Link>

          <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, marginBottom: 'var(--space-2)' }}>Welcome back</h1>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-8)' }}>Sign in to your STRIDERA account</p>

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
                <a href="#forgot" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-brand-primary)', textDecoration: 'underline' }}>Forgot password?</a>
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

          <p style={{ textAlign: 'center', marginTop: 'var(--space-6)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            Don't have an account?{' '}
            <Link href="/account/register" style={{ color: 'var(--color-brand-primary)', fontWeight: 600 }}>Create one</Link>
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
          background: 'linear-gradient(135deg, rgba(26,58,107,0.6), rgba(74,144,196,0.3))',
          display: 'flex', alignItems: 'flex-end', padding: 'var(--space-12)'
        }}>
          <blockquote style={{ color: '#fff' }}>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-4xl)', lineHeight: 1.1 }}>
              Every Stride.<br />Every Story.
            </p>
            <footer style={{ fontSize: 'var(--text-sm)', opacity: 0.7, marginTop: 'var(--space-3)' }}>— STRIDERA 2024</footer>
          </blockquote>
        </div>
      </div>
    </div>
  );
}
