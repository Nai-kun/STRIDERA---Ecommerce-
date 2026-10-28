'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getBrand } from '../../../lib/api';

export default function BrandStorefrontPage() {
  const { slug } = useParams();
  const [brand, setBrand] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await getBrand(slug);
        if (res.success) {
          setBrand(res.data);
        } else {
          setError('Brand not found');
        }
      } catch (err) {
        setError(err.message || 'Brand not found');
      } finally {
        setLoading(false);
      }
    }
    if (slug) load();
  }, [slug]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--color-text-muted)' }}>Loading brand storefront...</p>
      </div>
    );
  }

  if (error || !brand) {
    return (
      <div className="container" style={{ padding: 'var(--space-16) 0', textAlign: 'center' }}>
        <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Brand Not Found</h1>
        <Link href="/brands" className="btn btn-primary">Browse All Brands</Link>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Navigation */}
      <header style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', padding: 'var(--space-4) 0' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" style={{ color: 'var(--color-text)', textDecoration: 'none', fontWeight: 700, fontSize: 'var(--text-xl)' }}>
            STRIDERA
          </Link>
          <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
            <Link href="/brands" className="btn btn-ghost btn-sm">All Brands</Link>
            <Link href="/shop" className="btn btn-outline btn-sm">Shop All</Link>
          </div>
        </div>
      </header>

      {/* Brand Hero Header */}
      <section style={{
        background: 'linear-gradient(135deg, var(--color-brand-dark) 0%, var(--color-brand-primary) 100%)',
        color: '#fff',
        padding: 'var(--space-12) 0'
      }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
          <div style={{
            width: 88, height: 88, borderRadius: 'var(--radius-xl)',
            background: '#fff', padding: 'var(--space-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--shadow-lg)'
          }}>
            {brand.logoUrl ? (
              <img src={brand.logoUrl} alt={brand.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-4xl)', color: 'var(--color-brand-dark)' }}>
                {brand.name.charAt(0)}
              </span>
            )}
          </div>

          <div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
              <span style={{
                background: 'rgba(255,255,255,0.2)',
                fontSize: 'var(--text-xs)',
                padding: '2px 10px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 600,
                letterSpacing: '0.05em',
                textTransform: 'uppercase'
              }}>
                Verified Brand Store
              </span>
              {brand.seller && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'rgba(255,255,255,0.85)' }}>
                  Merchant: <strong>{brand.seller.storeName}</strong>
                </span>
              )}
            </div>

            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-5xl)', marginTop: 'var(--space-2)', lineHeight: 1 }}>
              {brand.name}
            </h1>

            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 'var(--text-sm)', maxWidth: '600px', marginTop: 'var(--space-2)' }}>
              {brand.description || 'Exclusive footwear designed and fulfilled by this merchant partner.'}
            </p>
          </div>
        </div>
      </section>

      {/* Catalog Grid */}
      <main className="container" style={{ flex: 1, padding: 'var(--space-12) var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-8)' }}>
          <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>
            {brand.name} Footwear Collection ({brand.products?.length || 0})
          </h2>
          <Link href={`/shop?brand=${brand.slug}`} className="btn btn-outline btn-sm">
            Filter in Shop Catalog
          </Link>
        </div>

        {(!brand.products || brand.products.length === 0) ? (
          <div style={{
            background: 'var(--color-surface)',
            padding: 'var(--space-12)',
            borderRadius: 'var(--radius-xl)',
            textAlign: 'center'
          }}>
            <p style={{ color: 'var(--color-text-muted)' }}>No products listed under this brand yet.</p>
          </div>
        ) : (
          <div className="grid-cols-4">
            {brand.products.map(product => (
              <article key={product.id} className="product-card">
                <Link href={`/products/${product.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="product-card-image">
                    <img
                      src={product.primaryImage || '/assets/products/running-men-1.jpg'}
                      alt={product.name}
                      loading="lazy"
                    />
                  </div>
                  <div className="product-card-body">
                    <p className="product-card-category">{product.category?.name}</p>
                    <h3 className="product-card-name">{product.name}</h3>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-2)' }}>
                      <span className="price-current">{product.basePriceFormatted}</span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                        {product.availableSizes?.length} sizes
                      </span>
                    </div>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
