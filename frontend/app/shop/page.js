'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

function ShopPageContent() {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [availableSizes, setAvailableSizes] = useState([]);
  const [availableColors, setAvailableColors] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState({
    search: searchParams.get('search') || '',
    category: searchParams.get('category') || '',
    brand: searchParams.get('brand') || '',
    seller: searchParams.get('seller') || '',
    audience: searchParams.get('audience') || '',
    shoeType: searchParams.get('shoeType') || '',
    size: searchParams.get('size') || '',
    color: searchParams.get('color') || '',
    minPrice: searchParams.get('minPrice') || '',
    maxPrice: searchParams.get('maxPrice') || '',
    sort: searchParams.get('sort') || 'newest',
    page: 1
  });

  const fetchProducts = useCallback(async (f) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (f.search) params.set('search', f.search);
      if (f.category) params.set('category', f.category);
      if (f.brand) params.set('brand', f.brand);
      if (f.seller) params.set('seller', f.seller);
      if (f.audience) params.set('audience', f.audience);
      if (f.shoeType) params.set('shoeType', f.shoeType);
      if (f.size) params.set('size', f.size);
      if (f.color) params.set('color', f.color);
      if (f.minPrice) params.set('minPrice', f.minPrice);
      if (f.maxPrice) params.set('maxPrice', f.maxPrice);
      if (f.sort) params.set('sort', f.sort);
      params.set('page', f.page);
      params.set('limit', '12');

      const res = await fetch(`${API}/products?${params}`);
      const data = await res.json();
      setProducts(data.data?.products || data.data || []);
      setPagination(data.data?.pagination || data.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (e) {
      console.error('Failed to load products', e);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch(`${API}/products/filters`)
      .then(r => r.json())
      .then(d => {
        if (d.data) {
          setCategories(d.data.categories || []);
          setBrands(d.data.brands || []);
          setSellers(d.data.sellers || []);
          setAvailableSizes(d.data.sizes || []);
          setAvailableColors(d.data.colors || []);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchProducts(filters);
  }, [filters, fetchProducts]);

  const setFilter = (key, val) => setFilters(prev => ({ ...prev, [key]: val, page: 1 }));
  const clearFilters = () => setFilters({
    search: '', category: '', brand: '', seller: '', audience: '', shoeType: '',
    size: '', color: '', minPrice: '', maxPrice: '', sort: 'newest', page: 1
  });
  const hasActiveFilters = filters.search || filters.category || filters.brand || filters.seller ||
    filters.audience || filters.shoeType || filters.size || filters.color || filters.minPrice || filters.maxPrice;

  const totalPages = pagination.totalPages || pagination.pages || 1;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* Top Bar */}
      <header style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', padding: 'var(--space-3) 0' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: 'var(--color-text)', textDecoration: 'none' }}>
            <img src="/assets/logo/stridera-logo.png" alt="STRIDERA" height="28" />
          </Link>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
            <Link href="/brands" className="btn btn-ghost btn-sm">Brands</Link>
            <Link href="/checkout" className="btn btn-outline btn-sm">Checkout</Link>
            <Link href="/account/orders" className="btn btn-ghost btn-sm">My Orders</Link>
            <Link href="/account/login" className="btn btn-primary btn-sm">Sign In / Portals</Link>
          </div>
        </div>
      </header>

      {/* ── PAGE HEADER ── */}
      <div style={{ background: 'var(--color-text)', padding: 'var(--space-10) 0' }}>
        <div className="container">
          <h1 className="display display-md" style={{ color: '#fff' }}>
            {filters.search ? `Search: "${filters.search}"` :
             filters.category ? `${filters.category.charAt(0).toUpperCase() + filters.category.slice(1)} Footwear` :
             'Multi-Seller Footwear Catalog'}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', marginTop: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
            {pagination.total} verified styles from authorized merchants
          </p>
        </div>
      </div>

      <div className="container" style={{ paddingBlock: 'var(--space-8)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-8)', alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* ── SIDEBAR FILTERS (FR-2.5 to FR-2.9) ── */}
          <aside style={{
            width: 240, flexShrink: 0,
            background: 'var(--color-surface)',
            padding: 'var(--space-5)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)'
          }} aria-label="Product filters">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Filters</h2>
              {hasActiveFilters && (
                <button className="btn btn-ghost btn-sm" onClick={clearFilters} style={{ fontSize: 'var(--text-xs)' }}>
                  Clear all
                </button>
              )}
            </div>

            {/* Search (FR-2.5) */}
            <div className="form-group">
              <label className="form-label" htmlFor="shop-search">Keyword Search</label>
              <input
                id="shop-search"
                type="search"
                className="form-input"
                placeholder="Shoe, SKU, or seller…"
                value={filters.search}
                onChange={e => setFilter('search', e.target.value)}
              />
            </div>

            {/* Sort (FR-2.9) */}
            <div className="form-group">
              <label className="form-label" htmlFor="shop-sort">Sort by</label>
              <select id="shop-sort" className="form-select" value={filters.sort} onChange={e => setFilter('sort', e.target.value)}>
                <option value="newest">Newest Arrivals</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="name-asc">Name: A to Z</option>
              </select>
            </div>

            {/* Seller Filter (FR-2.6) */}
            {sellers.length > 0 && (
              <div className="form-group">
                <label className="form-label" htmlFor="shop-seller">Merchant / Seller</label>
                <select id="shop-seller" className="form-select" value={filters.seller} onChange={e => setFilter('seller', e.target.value)}>
                  <option value="">All Verified Sellers</option>
                  {sellers.map(s => (
                    <option key={s.id} value={s.id}>{s.storeName}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Category */}
            <div style={{ marginBottom: 'var(--space-5)' }}>
              <p style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-2)', color: 'var(--color-text-muted)' }}>Category</p>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }} role="list">
                <li>
                  <button
                    className={filters.category === '' ? 'btn btn-primary btn-sm w-full' : 'btn btn-ghost btn-sm w-full'}
                    onClick={() => setFilter('category', '')}
                    style={{ justifyContent: 'flex-start' }}
                  >All Categories</button>
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

            {/* Brand Filter */}
            {brands.length > 0 && (
              <div className="form-group">
                <label className="form-label" htmlFor="shop-brand">Brand</label>
                <select id="shop-brand" className="form-select" value={filters.brand} onChange={e => setFilter('brand', e.target.value)}>
                  <option value="">All Brands</option>
                  {brands.map(b => (
                    <option key={b.id} value={b.slug}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Audience */}
            <div className="form-group">
              <label className="form-label" htmlFor="shop-audience">Audience</label>
              <select id="shop-audience" className="form-select" value={filters.audience} onChange={e => setFilter('audience', e.target.value)}>
                <option value="">All Audiences</option>
                <option value="MEN">Men</option>
                <option value="WOMEN">Women</option>
                <option value="UNISEX">Unisex</option>
              </select>
            </div>

            {/* Size Filter (FR-2.6) */}
            {availableSizes.length > 0 && (
              <div className="form-group">
                <label className="form-label" htmlFor="shop-size">Size (US)</label>
                <select id="shop-size" className="form-select" value={filters.size} onChange={e => setFilter('size', e.target.value)}>
                  <option value="">Any Size</option>
                  {availableSizes.map(sz => (
                    <option key={sz} value={sz}>US {sz}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Color Filter (FR-2.6) */}
            {availableColors.length > 0 && (
              <div className="form-group">
                <label className="form-label" htmlFor="shop-color">Color</label>
                <select id="shop-color" className="form-select" value={filters.color} onChange={e => setFilter('color', e.target.value)}>
                  <option value="">Any Color</option>
                  {availableColors.map(c => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Price Range (FR-2.6) */}
            <div className="form-group">
              <label className="form-label">Price Range (₱)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                <input
                  type="number"
                  className="form-input"
                  placeholder="Min ₱"
                  min="0"
                  value={filters.minPrice}
                  onChange={e => setFilter('minPrice', e.target.value)}
                />
                <input
                  type="number"
                  className="form-input"
                  placeholder="Max ₱"
                  min="0"
                  value={filters.maxPrice}
                  onChange={e => setFilter('maxPrice', e.target.value)}
                />
              </div>
            </div>
          </aside>

          {/* ── PRODUCT GRID ── */}
          <div style={{ flex: 1, minWidth: 280 }}>
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
              <div style={{ textAlign: 'center', padding: 'var(--space-16) 0', background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)' }}>
                <p style={{ fontSize: 'var(--text-xl)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>No products match your filters</p>
                <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-6)' }}>Try adjusting your search or filter criteria</p>
                <button className="btn btn-primary" onClick={clearFilters}>Reset All Filters</button>
              </div>
            ) : (
              <>
                <div className="grid-cols-3">
                  {products.map(p => {
                    const priceVal = p.basePriceCentavos || p.priceCentavos || 0;
                    const discount = p.compareAtPriceCentavos && p.compareAtPriceCentavos > priceVal
                      ? Math.round((1 - priceVal / p.compareAtPriceCentavos) * 100) : null;
                    const displayImg = p.primaryImage || p.imageUrl || '/assets/products/running-men-1.jpg';
                    const categoryName = p.category?.name || p.category || 'Footwear';
                    const sellerName = p.seller?.storeName || p.brand?.name || 'STRIDERA Official';
                    const outOfStock = p.totalStock !== undefined && p.totalStock <= 0;

                    return (
                      <article key={p.id} className="product-card">
                        <Link href={`/products/${p.slug}`} aria-label={p.name}>
                          <div className="product-card-image" style={{ position: 'relative' }}>
                            <img src={displayImg} alt={p.name} loading="lazy" />
                            {discount && (
                              <span className="price-badge" style={{ position: 'absolute', top: 'var(--space-3)', left: 'var(--space-3)' }}>
                                -{discount}%
                              </span>
                            )}
                            {outOfStock && (
                              <span style={{
                                position: 'absolute', top: 'var(--space-3)', right: 'var(--space-3)',
                                background: 'rgba(15,23,42,0.85)', color: '#fff', fontSize: '10px',
                                fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--radius-full)'
                              }}>
                                OUT OF STOCK
                              </span>
                            )}
                          </div>
                        </Link>
                        <div className="product-card-body">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                            <p className="product-card-category">{categoryName}</p>
                            <span style={{
                              fontSize: '10px',
                              color: 'var(--color-brand-primary)',
                              background: 'rgba(26,58,107,0.08)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 600
                            }}>
                              🏪 {sellerName}
                            </span>
                          </div>
                          <Link href={`/products/${p.slug}`}>
                            <h3 className="product-card-name">{p.name}</h3>
                          </Link>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--space-2)' }}>
                            <div className="product-card-price">
                              <span className="price-current">₱{(priceVal / 100).toFixed(2)}</span>
                              {p.compareAtPriceCentavos > priceVal && (
                                <span className="price-original">₱{(p.compareAtPriceCentavos / 100).toFixed(2)}</span>
                              )}
                            </div>
                            <Link href={`/products/${p.slug}`} className="btn btn-outline btn-sm">
                              {outOfStock ? 'Details' : 'Select'}
                            </Link>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-10)' }} role="navigation" aria-label="Pagination">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
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
