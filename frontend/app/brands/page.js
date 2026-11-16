'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getBrands } from '../../lib/api';
import HeaderAuthActions from '../../components/HeaderAuthActions';

export default function BrandsDirectoryPage() {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await getBrands();
        if (res.success) setBrands(res.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Navigation */}
      <header style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', padding: 'var(--space-4) 0' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" style={{ color: 'var(--color-text)', textDecoration: 'none', fontWeight: 700, fontSize: 'var(--text-xl)' }}>
            STRIDERA
          </Link>
          <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
            <Link href="/shop" className="btn btn-ghost btn-sm">Shop All</Link>
            <Link href="/seller/register" className="btn btn-outline btn-sm">Become a Merchant</Link>
            <HeaderAuthActions />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container" style={{ flex: 1, padding: 'var(--space-12) var(--space-4)' }}>
        <div style={{ textAlign: 'center', maxWidth: '700px', margin: '0 auto var(--space-12)' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-5xl)', color: 'var(--color-brand-dark)', marginBottom: 'var(--space-2)' }}>
            Featured Footwear Brands
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-base)', lineHeight: 1.6 }}>
            Browse curated performance and lifestyle footwear from STRIDERA in-house labs and authorized independent merchant partners across the Philippines.
          </p>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading brand directory...</p>
        ) : brands.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No brands currently listed.</p>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 'var(--space-6)'
          }}>
            {brands.map((b) => (
              <Link
                key={b.id}
                href={`/brands/${b.slug}`}
                style={{
                  background: 'var(--color-surface)',
                  borderRadius: 'var(--radius-xl)',
                  padding: 'var(--space-6)',
                  boxShadow: 'var(--shadow-sm)',
                  textDecoration: 'none',
                  color: 'inherit',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  border: '1px solid var(--color-border)',
                  transition: 'transform var(--transition-base), box-shadow var(--transition-base)'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: 'var(--radius-lg)',
                      background: 'var(--color-surface-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden'
                    }}>
                      {b.logoUrl ? (
                        <img src={b.logoUrl} alt={b.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      ) : (
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', color: 'var(--color-brand-primary)' }}>
                          {b.name.charAt(0)}
                        </span>
                      )}
                    </div>

                    <span style={{
                      fontSize: 'var(--text-xs)',
                      background: 'rgba(74, 144, 196, 0.1)',
                      color: 'var(--color-brand-primary)',
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-full)',
                      fontWeight: 600
                    }}>
                      {b.productCount} models
                    </span>
                  </div>

                  <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>{b.name}</h2>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', lineHeight: 1.5, marginBottom: 'var(--space-4)' }}>
                    {b.description || 'Curated high-performance footwear.'}
                  </p>
                </div>

                <div style={{
                  borderTop: '1px solid var(--color-border)',
                  paddingTop: 'var(--space-3)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-subtle)'
                }}>
                  <span>Merchant: <strong>{b.seller?.storeName || 'STRIDERA Direct'}</strong></span>
                  <span style={{ color: 'var(--color-brand-primary)', fontWeight: 600 }}>Explore Brand &rarr;</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

