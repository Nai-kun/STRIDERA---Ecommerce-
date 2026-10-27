'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

function ShopPageContent() {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);

  // Filter state
  const [filters, setFilters] = useState({
    search: searchParams.get('search') || '',
    category: searchParams.get('category') || '',
    audience: searchParams.get('audience') || '',
    shoeType: searchParams.get('shoeType') || '',
    sort: searchParams.get('sort') || 'newest',
    page: 1
  });

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const fetchProducts = useCallback(async (f) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (f.search) params.set('search', f.search);
      if (f.category) params.set('category', f.category);
      if (f.audience) params.set('audience', f.audience);
      if (f.shoeType) params.set('shoeType', f.shoeType);
      if (f.sort) params.set('sort', f.sort);
      params.set('page', f.page);
      params.set('limit', '12');

      const res = await fetch(`${API}/products?${params}`);
      const data = await res.json();
      setProducts(data.data || []);
      setPagination(data.pagination || { page: 1, pages: 1, total: 0 });
    } catch (e) {
      console.error('Failed to load products', e);
      // Fallback static products
      setProducts([
        { id: '1', name: 'Stridera Velocity Pro', slug: 'stridera-velocity-pro', category: 'Running', priceCentavos: 599500, compareAtPriceCentavos: 699500, imageUrl: '/assets/products/running-men-1.jpg', isActive: true },
        { id: '2', name: 'Stridera Stride Fusion', slug: 'stridera-stride-fusion', category: 'Running', priceCentavos: 549500, compareAtPriceCentavos: 649500, imageUrl: '/assets/products/running-women-1.jpg', isActive: true },
        { id: '3', name: 'Stridera Heritage Classic', slug: 'stridera-heritage-classic', category: 'Lifestyle', priceCentavos: 699500, imageUrl: '/assets/products/sneaker-men-1.jpg', isActive: true },
        { id: '4', name: 'Stridera Cloud Step', slug: 'stridera-cloud-step', category: 'Lifestyle', priceCentavos: 549500, imageUrl: '/assets/products/sneaker-women-1.jpg', isActive: true },
        { id: '5', name: 'Stridera Max Energy X', slug: 'stridera-max-energy-x', category: 'Running', priceCentavos: 749500, imageUrl: '/assets/products/running-men-3.jpg', isActive: true },
        { id: '6', name: 'Stridera Aero Flow', slug: 'stridera-aero-flow', category: 'Running', priceCentavos: 499500, imageUrl: '/assets/products/running-women-3.jpg', isActive: true },
        { id: '7', name: 'Stridera Soft Walk', slug: 'stridera-soft-walk', category: 'Lifestyle', priceCentavos: 449500, imageUrl: '/assets/products/sneaker-women-3.jpg', isActive: true },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch(`${API}/categories`).then(r => r.json()).then(d => setCategories(d.data || [])).catch(() => {
      setCategories([
        { id: '1', name: 'Running', slug: 'running' },
        { id: '2', name: 'Lifestyle', slug: 'lifestyle' },
        { id: '3', name: 'Basketball', slug: 'basketball' },
        { id: '4', name: 'Training', slug: 'training' }
      ]);
    });
  }, []);

  useEffect(() => {
    fetchProducts(filters);
  }, [filters, fetchProducts]);

  const setFilter = (key, val) => setFilters(prev => ({ ...prev, [key]: val, page: 1 }));
  const clearFilters = () => setFilters({ search: '', category: '', audience: '', shoeType: '', sort: 'newest', page: 1 });
  const hasActiveFilters = filters.search || filters.category || filters.audience || filters.shoeType;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* ── PAGE HEADER ── */}
      <div style={{ background: 'var(--color-text)', padding: 'var(--space-10) 0' }}>
        <div className="container">
          <h1 className="display display-md" style={{ color: '#fff' }}>
            {filters.search ? `Search: "${filters.search}"` :
             filters.category ? `${filters.category.charAt(0).toUpperCase() + filters.category.slice(1)} Shoes` :
             'All Shoes'}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', marginTop: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
            {pagination.total} styles
          </p>
        </div>
      </div>

      <div className="container" style={{ paddingBlock: 'var(--space-8)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-8)', alignItems: 'flex-start' }}>

          {/* ── SIDEBAR FILTERS ── */}
          <aside style={{
            width: 220, flexShrink: 0,
            position: 'sticky', top: 'calc(var(--nav-height) + var(--space-4))',
          }} aria-label="Product filters">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Filters</h2>
              {hasActiveFilters && (
                <button className="btn btn-ghost btn-sm" onClick={clearFilters} style={{ fontSize: 'var(--text-xs)' }}>
                  Clear all
                </button>
              )}
            </div>

            {/* Search */}
            <div className="form-group">
              <label className="form-label" htmlFor="shop-search">Search</label>
              <input
                id="shop-search"
                type="search"
                className="form-input"
                placeholder="Search shoes…"
                value={filters.search}
                onChange={e => setFilter('search', e.target.value)}
              />
            </div>

            {/* Category */}
            <div style={{ marginBottom: 'var(--space-6)' }}>
              <p style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-3)', color: 'var(--color-text-muted)' }}>Category</p>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }} role="list">
                <li>
                  <button
                    className={filters.category === '' ? 'btn btn-primary btn-sm w-full' : 'btn btn-ghost btn-sm w-full'}
                    onClick={() => setFilter('category', '')}
                    style={{ justifyContent: 'flex-start' }}
                  >All</button>
                </li>
                {categories.map(cat => (
                  <li key={cat.id}>
                    <button
                      className={filters.category === cat.slug ? 'btn btn-primary btn-sm w-full' : 'btn btn-ghost btn-sm w-full'}
                      onClick={() => setFilter('category', cat.slug)}
                      style={{ justifyContent: 'flex-start' }}
                    >{cat.name}</button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Audience */}
            <div style={{ marginBottom: 'var(--space-6)' }}>
              <p style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-3)', color: 'var(--color-text-muted)' }}>For</p>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }} role="list">
                {[['', 'All'], ['MEN', 'Men'], ['WOMEN', 'Women'], ['UNISEX', 'Unisex']].map(([val, label]) => (
                  <li key={val}>
                    <button
                      className={filters.audience === val ? 'btn btn-primary btn-sm w-full' : 'btn btn-ghost btn-sm w-full'}
                      onClick={() => setFilter('audience', val)}
                      style={{ justifyContent: 'flex-start' }}
                    >{label}</button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Sort */}
            <div className="form-group">
              <label className="form-label" htmlFor="shop-sort">Sort by</label>
              <select id="shop-sort" className="form-select" value={filters.sort} onChange={e => setFilter('sort', e.target.value)}>
                <option value="newest">Newest</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="popular">Most Popular</option>
              </select>
            </div>
          </aside>

          {/* ── PRODUCT GRID ── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {loading ? (
              <div className="grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i}>
                    <div className="skeleton" style={{ aspectRatio: '4/3', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-4)' }} />
                    <div className="skeleton" style={{ height: 16, borderRadius: 4, marginBottom: 'var(--space-2)', width: '60%' }} />
                    <div className="skeleton" style={{ height: 20, borderRadius: 4, marginBottom: 'var(--space-2)' }} />
                    <div className="skeleton" style={{ height: 16, borderRadius: 4, width: '40%' }} />
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-16) 0' }}>
                <p style={{ fontSize: 'var(--text-xl)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>No products found</p>
                <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-6)' }}>Try adjusting your filters</p>
                <button className="btn btn-primary" onClick={clearFilters}>Clear Filters</button>
              </div>
            ) : (
              <>
                <div className="grid-cols-3">
                  {products.map(p => {
                    const discount = p.compareAtPriceCentavos && p.compareAtPriceCentavos > p.priceCentavos
                      ? Math.round((1 - p.priceCentavos / p.compareAtPriceCentavos) * 100) : null;
                    return (
                      <article key={p.id} className="product-card">
                        <Link href={`/products/${p.slug}`} aria-label={p.name}>
                          <div className="product-card-image" style={{ position: 'relative' }}>
                            <img src={p.imageUrl || '/assets/products/running-men-1.jpg'} alt={p.name} loading="lazy" />
                            {discount && (
                              <span className="price-badge" style={{ position: 'absolute', top: 'var(--space-3)', left: 'var(--space-3)' }}>
                                -{discount}%
                              </span>
                            )}
                          </div>
                        </Link>
                        <div className="product-card-body">
                          <p className="product-card-category">{p.category}</p>
                          <Link href={`/products/${p.slug}`}>
                            <h3 className="product-card-name">{p.name}</h3>
                          </Link>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--space-2)' }}>
                            <div className="product-card-price">
                              <span className="price-current">₱{(p.priceCentavos / 100).toFixed(2)}</span>
                              {p.compareAtPriceCentavos > p.priceCentavos && (
                                <span className="price-original">₱{(p.compareAtPriceCentavos / 100).toFixed(2)}</span>
                              )}
                            </div>
                            <Link href={`/products/${p.slug}`} className="btn btn-outline btn-sm">Select</Link>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {/* Pagination */}
                {pagination.pages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-10)' }} role="navigation" aria-label="Pagination">
                    {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(page => (
                      <button
                        key={page}
                        className={filters.page === page ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                        onClick={() => setFilters(p => ({ ...p, page }))}
                        aria-label={`Page ${page}`}
                        aria-current={filters.page === page ? 'page' : undefined}
                      >{page}</button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p>Loading shop…</p></div>}>
      <ShopPageContent />
    </Suspense>
  );
}
