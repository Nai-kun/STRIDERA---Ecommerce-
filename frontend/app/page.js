'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getProducts, getCategories } from '../lib/api';

// ─── NAV ────────────────────────────────────────────────
function Nav({ cartCount = 0, onCartOpen }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <>
      <nav className={`nav${scrolled ? ' scrolled' : ''}`} role="navigation" aria-label="Main navigation">
        <div className="container nav-inner">
          <Link href="/" className="nav-logo" aria-label="STRIDERA homepage">
            <img src="/assets/logo/stridera-logo.png" alt="STRIDERA" height="36" />
          </Link>

          <ul className="nav-links" role="list" style={{ display: mobileOpen ? 'flex' : undefined }}>
            {[
              ['/', 'Home'],
              ['/shop', 'Shop'],
              ['/shop?category=running', 'Running'],
              ['/shop?category=lifestyle', 'Lifestyle'],
            ].map(([href, label]) => (
              <li key={href}>
                <Link href={href}>{label}</Link>
              </li>
            ))}
          </ul>

          <div className="nav-actions">
            <Link href="/account/login" className="btn btn-ghost btn-sm" aria-label="Account">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <span style={{display:'none'}}>Account</span>
            </Link>

            <Link href="/shop/wishlist" className="btn btn-ghost btn-sm" aria-label="Wishlist">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </Link>

            <button
              className="btn btn-ghost btn-sm"
              onClick={onCartOpen}
              aria-label={`Cart, ${cartCount} items`}
              id="cart-toggle-btn"
              style={{ position: 'relative' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
              </svg>
              {cartCount > 0 && (
                <span style={{
                  position: 'absolute', top: '-2px', right: '-2px',
                  background: 'var(--color-brand-primary)', color: '#fff',
                  borderRadius: '9999px', width: '16px', height: '16px',
                  fontSize: '10px', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }} aria-live="polite">{cartCount}</span>
              )}
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}

// ─── CART DRAWER ─────────────────────────────────────────
function CartDrawer({ open, onClose, cartData, onUpdateQty, onRemove }) {
  const items = cartData?.items || [];

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      <div
        className={`cart-overlay${open ? ' open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`cart-drawer${open ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
        tabIndex={-1}
      >
        <div className="cart-drawer-header">
          <h2 className="cart-drawer-title">Your Cart ({cartData?.itemCount || 0})</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close cart">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="cart-drawer-body">
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-12) 0' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-border-strong)" strokeWidth="1.5" style={{margin:'0 auto var(--space-4)'}}>
                <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
              </svg>
              <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>Your cart is empty</p>
              <Link href="/shop" className="btn btn-primary" onClick={onClose}>Shop Now</Link>
            </div>
          ) : (
            items.map(item => (
              <div className="cart-item" key={item.id}>
                <div className="cart-item-image">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.productName} loading="lazy" />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'var(--color-surface-raised)' }} />
                  )}
                </div>
                <div>
                  <p className="cart-item-name">{item.productName}</p>
                  <p className="cart-item-variant">{item.size} / {item.color}</p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--space-2)' }}>
                    <div className="qty-control">
                      <button className="qty-btn" onClick={() => item.quantity > 1 ? onUpdateQty(item.id, item.quantity - 1) : onRemove(item.id)} aria-label="Decrease quantity">−</button>
                      <span className="qty-value" aria-live="polite">{item.quantity}</span>
                      <button className="qty-btn" onClick={() => onUpdateQty(item.id, item.quantity + 1)} disabled={item.quantity >= item.stockAvailable} aria-label="Increase quantity">+</button>
                    </div>
                    <p className="cart-item-price">₱{(item.lineTotalCentavos / 100).toFixed(2)}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="cart-drawer-footer">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-4)', fontWeight: 600 }}>
              <span>Subtotal</span>
              <span>{cartData?.subtotalFormatted}</span>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
              Shipping calculated at checkout.
            </p>
            <Link href="/checkout" className="btn btn-primary btn-full btn-lg" onClick={onClose}>
              Checkout
            </Link>
          </div>
        )}
      </aside>
    </>
  );
}

// ─── PRODUCT CARD ─────────────────────────────────────────
function ProductCard({ product, onAddToCart }) {
  const discount = product.compareAtPriceCentavos && product.compareAtPriceCentavos > product.priceCentavos
    ? Math.round((1 - product.priceCentavos / product.compareAtPriceCentavos) * 100)
    : null;

  return (
    <article className="product-card" role="article">
      <Link href={`/products/${product.slug}`} aria-label={`View ${product.name}`}>
        <div className="product-card-image">
          <img
            src={product.imageUrl || '/assets/products/running-men-1.jpg'}
            alt={product.name}
            loading="lazy"
          />
          {discount && (
            <span className="price-badge" style={{ position: 'absolute', top: 'var(--space-3)', left: 'var(--space-3)' }}>
              -{discount}%
            </span>
          )}
        </div>
      </Link>
      <div className="product-card-body">
        <p className="product-card-category">{product.category}</p>
        <Link href={`/products/${product.slug}`}>
          <h3 className="product-card-name">{product.name}</h3>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--space-3)' }}>
          <div className="product-card-price">
            <span className="price-current">₱{(product.priceCentavos / 100).toFixed(2)}</span>
            {product.compareAtPriceCentavos > product.priceCentavos && (
              <span className="price-original">₱{(product.compareAtPriceCentavos / 100).toFixed(2)}</span>
            )}
          </div>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => onAddToCart(product)}
            aria-label={`Quick add ${product.name} to cart`}
          >
            Add
          </button>
        </div>
      </div>
    </article>
  );
}

// ─── CATEGORY CARD ────────────────────────────────────────
function CategoryCard({ name, slug, imageUrl }) {
  return (
    <Link href={`/shop?category=${slug}`} className="category-card" aria-label={`Shop ${name}`}>
      {imageUrl ? (
        <img src={imageUrl} alt={name} loading="lazy" />
      ) : (
        <div style={{
          width: '100%', height: '100%',
          background: 'linear-gradient(135deg, var(--color-brand-dark), var(--color-brand-primary))',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-6xl)', color: 'rgba(255,255,255,0.15)' }}>S</span>
        </div>
      )}
      <div className="category-card-overlay">
        <span className="category-card-name">{name}</span>
      </div>
    </Link>
  );
}

// ─── HOMEPAGE ────────────────────────────────────────────
export default function HomePage() {
  const [cart, setCart] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [newArrivals, setNewArrivals] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingToCart, setAddingToCart] = useState(null);
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [catsRes, featuredRes, newRes] = await Promise.allSettled([
          fetch('/api/categories').then(r => r.json()).catch(() => ({ data: [] })),
          fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api') + '/products?featured=true&limit=4').then(r => r.json()).catch(() => ({ data: [] })),
          fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api') + '/products?limit=8&sort=newest').then(r => r.json()).catch(() => ({ data: [] })),
        ]);

        if (catsRes.status === 'fulfilled') setCategories(catsRes.value?.data || []);
        if (featuredRes.status === 'fulfilled') setFeaturedProducts(featuredRes.value?.data || []);
        if (newRes.status === 'fulfilled') setNewArrivals(newRes.value?.data || []);
      } catch (e) {
        console.error('Failed to load homepage data', e);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const showNotification = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 2500);
  };

  const handleAddToCart = async (product) => {
    // Navigate to PDP for variant selection (size/color required)
    window.location.href = `/products/${product.slug}`;
  };

  const handleUpdateQty = async (itemId, qty) => {
    try {
      const res = await fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api') + `/cart/items/${itemId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: qty })
      });
      const data = await res.json();
      if (data.success) setCart(data.data);
    } catch (e) { console.error(e); }
  };

  const handleRemoveItem = async (itemId) => {
    try {
      const res = await fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api') + `/cart/items/${itemId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) setCart(data.data);
    } catch (e) { console.error(e); }
  };

  // Fallback static data for when API is not connected
  const displayCategories = categories.length > 0 ? categories : [
    { id: '1', name: 'Running', slug: 'running', imageUrl: '/assets/products/running-men-1.jpg' },
    { id: '2', name: 'Lifestyle', slug: 'lifestyle', imageUrl: '/assets/products/sneaker-women-1.jpg' },
    { id: '3', name: 'Basketball', slug: 'basketball', imageUrl: null },
    { id: '4', name: 'Training', slug: 'training', imageUrl: null }
  ];

  const displayFeatured = featuredProducts.length > 0 ? featuredProducts : [
    { id: '1', name: 'Stridera Velocity Pro', slug: 'stridera-velocity-pro', category: 'Running', priceCentavos: 599500, compareAtPriceCentavos: 699500, imageUrl: '/assets/products/running-men-1.jpg' },
    { id: '2', name: 'Stridera Stride Fusion', slug: 'stridera-stride-fusion', category: 'Running', priceCentavos: 549500, compareAtPriceCentavos: 649500, imageUrl: '/assets/products/running-women-1.jpg' },
    { id: '3', name: 'Stridera Heritage Classic', slug: 'stridera-heritage-classic', category: 'Lifestyle', priceCentavos: 699500, imageUrl: '/assets/products/sneaker-men-1.jpg' },
    { id: '4', name: 'Stridera Cloud Step', slug: 'stridera-cloud-step', category: 'Lifestyle', priceCentavos: 549500, imageUrl: '/assets/products/sneaker-women-1.jpg' },
  ];

  return (
    <>
      {/* Toast notification */}
      {notification && (
        <div role="status" aria-live="polite" style={{
          position: 'fixed', bottom: 'var(--space-6)', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--color-text)', color: '#fff', padding: 'var(--space-3) var(--space-6)',
          borderRadius: 'var(--radius-full)', zIndex: 9999, fontSize: 'var(--text-sm)', fontWeight: 500,
          boxShadow: 'var(--shadow-xl)', animation: 'fadeIn 0.2s ease'
        }}>
          {notification}
        </div>
      )}

      {/* Announcement bar */}
      <div className="announcement-bar" role="complementary" aria-label="Promotions">
        🎉 Free shipping on orders ₱3,000+ &nbsp;|&nbsp; Use code <strong>STRIDE10</strong> for 10% off
      </div>

      {/* Navigation */}
      <Nav cartCount={cart?.itemCount || 0} onCartOpen={() => setCartOpen(true)} />

      {/* Cart Drawer */}
      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cartData={cart}
        onUpdateQty={handleUpdateQty}
        onRemove={handleRemoveItem}
      />

      <main id="main-content">

        {/* ── HERO ───────────────────────────────── */}
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-content">
            <p className="hero-eyebrow">New Collection 2024</p>
            <h1 id="hero-title" className="hero-title">
              Move with<br/>
              <span>Purpose</span>
            </h1>
            <p className="hero-desc">
              Performance footwear engineered for the streets of the Philippines.
              Every stride counts.
            </p>
            <div className="hero-ctas">
              <Link href="/shop" className="btn btn-primary btn-lg">Shop Collection</Link>
              <Link href="/shop?category=running" className="btn btn-outline btn-lg">Running Shoes</Link>
            </div>
          </div>
          <div className="hero-image">
            <img
              src="/assets/products/running-men-1.jpg"
              alt="STRIDERA Velocity Pro — performance running shoes"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div className="hero-image-overlay" />
          </div>
        </section>

        {/* ── CATEGORIES ────────────────────────── */}
        <section className="section container" aria-labelledby="categories-title">
          <div className="section-header">
            <div>
              <h2 id="categories-title" className="section-title">Shop by Category</h2>
              <p className="section-subtitle">Find your perfect pair</p>
            </div>
            <Link href="/shop" className="btn btn-outline">View All</Link>
          </div>
          <div className="grid-cols-4">
            {displayCategories.map(cat => (
              <CategoryCard key={cat.id} name={cat.name} slug={cat.slug} imageUrl={cat.imageUrl} />
            ))}
          </div>
        </section>

        {/* ── FEATURED / BESTSELLERS ─────────────── */}
        <section className="section" style={{ background: 'var(--color-surface)' }} aria-labelledby="featured-title">
          <div className="container">
            <div className="section-header">
              <div>
                <h2 id="featured-title" className="section-title">Bestsellers</h2>
                <p className="section-subtitle">The styles everyone's wearing</p>
              </div>
              <Link href="/shop?featured=true" className="btn btn-outline">See All</Link>
            </div>
            <div className="grid-cols-4">
              {displayFeatured.map(p => (
                <ProductCard key={p.id} product={p} onAddToCart={handleAddToCart} />
              ))}
            </div>
          </div>
        </section>

        {/* ── EDITORIAL BANNER ──────────────────── */}
        <section className="section container" aria-label="Women's collection">
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--space-4)',
            borderRadius: 'var(--radius-xl)',
            overflow: 'hidden',
          }}>
            {/* Left panel */}
            <div style={{ position: 'relative', minHeight: 480, borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
              <img
                src="/assets/products/running-women-1.jpg"
                alt="Women's running collection"
                style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
              />
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(135deg, rgba(26,58,107,0.75) 0%, transparent 60%)',
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                padding: 'var(--space-8)'
              }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-4xl)', color: '#fff', lineHeight: 1 }}>
                  Women's<br/>Running
                </span>
                <Link href="/shop?audience=WOMEN&shoeType=RUNNING" className="btn btn-accent btn-sm" style={{ marginTop: 'var(--space-4)', alignSelf: 'flex-start' }}>
                  Shop Now
                </Link>
              </div>
            </div>
            {/* Right panel */}
            <div style={{ position: 'relative', minHeight: 480, borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
              <img
                src="/assets/products/sneaker-women-1.jpg"
                alt="Women's lifestyle sneakers"
                style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
              />
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(135deg, rgba(74,144,196,0.7) 0%, transparent 60%)',
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                padding: 'var(--space-8)'
              }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-4xl)', color: '#fff', lineHeight: 1 }}>
                  Women's<br/>Lifestyle
                </span>
                <Link href="/shop?audience=WOMEN&shoeType=LIFESTYLE" className="btn btn-accent btn-sm" style={{ marginTop: 'var(--space-4)', alignSelf: 'flex-start' }}>
                  Explore
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── MEN'S COLLECTION STRIP ─────────────── */}
        <section className="section" style={{ background: 'var(--color-text)', color: '#fff' }} aria-labelledby="mens-title">
          <div className="container">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-8)' }}>
              <h2 id="mens-title" className="section-title" style={{ color: '#fff' }}>Men's Collection</h2>
              <Link href="/shop?audience=MEN" className="btn" style={{ background: 'var(--color-brand-accent)', color: 'var(--color-text)' }}>
                View All
              </Link>
            </div>
            <div className="grid-cols-4">
              {[
                { src: '/assets/products/running-men-3.jpg', name: 'Max Energy X', slug: 'stridera-max-energy-x', price: '₱7,495' },
                { src: '/assets/products/running-men-4.jpg', name: 'Velocity Pro', slug: 'stridera-velocity-pro', price: '₱5,995' },
                { src: '/assets/products/sneaker-men-1.jpg', name: 'Heritage Classic', slug: 'stridera-heritage-classic', price: '₱6,995' },
                { src: '/assets/products/running-men-5.jpg', name: 'Aero Sprint', slug: 'stridera-max-energy-x', price: '₱5,495' }
              ].map(item => (
                <Link href={`/products/${item.slug}`} key={item.slug + item.name} style={{ display: 'block' }}>
                  <div style={{
                    borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'rgba(255,255,255,0.05)',
                    transition: 'transform var(--transition-base)'
                  }}>
                    <div style={{ aspectRatio: '1', overflow: 'hidden' }}>
                      <img src={item.src} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform var(--transition-slow)' }} />
                    </div>
                    <div style={{ padding: 'var(--space-4)' }}>
                      <p style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: '#fff', marginBottom: 'var(--space-1)' }}>{item.name}</p>
                      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-brand-accent)', fontWeight: 700 }}>{item.price}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── PROMO CODES STRIP ─────────────────── */}
        <section className="section-sm" style={{ background: 'var(--color-brand-primary)' }}>
          <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-8)', flexWrap: 'wrap' }}>
            {[
              { icon: '🏃', text: 'Performance Guarantee' },
              { icon: '🚚', text: 'Free Shipping ₱3,000+' },
              { icon: '↩️', text: '30-Day Returns' },
              { icon: '🔒', text: 'Secure Payments' },
            ].map(({ icon, text }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: '#fff', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                <span style={{ fontSize: 'var(--text-xl)' }}>{icon}</span>
                {text}
              </div>
            ))}
          </div>
        </section>

      </main>

      {/* ── FOOTER ──────────────────────────────── */}
      <footer className="footer" role="contentinfo">
        <div className="container">
          <div className="footer-grid">
            <div>
              <img src="/assets/logo/stridera-logo.png" alt="STRIDERA" style={{ height: 40, marginBottom: 'var(--space-4)' }} />
              <p className="footer-brand-desc">
                Premium footwear engineered for Filipino athletes and street style enthusiasts.
                Every pair is built to perform.
              </p>
            </div>
            <div>
              <h3 className="footer-heading">Shop</h3>
              <ul className="footer-links" role="list">
                <li><Link href="/shop?category=running">Running</Link></li>
                <li><Link href="/shop?category=lifestyle">Lifestyle</Link></li>
                <li><Link href="/shop?category=basketball">Basketball</Link></li>
                <li><Link href="/shop?category=training">Training</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="footer-heading">Account</h3>
              <ul className="footer-links" role="list">
                <li><Link href="/account/login">Sign In</Link></li>
                <li><Link href="/account/register">Create Account</Link></li>
                <li><Link href="/account/orders">Order History</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="footer-heading">Help</h3>
              <ul className="footer-links" role="list">
                <li><a href="#size-guide">Size Guide</a></li>
                <li><a href="#returns">Returns</a></li>
                <li><a href="#shipping">Shipping Info</a></li>
                <li><a href="#contact">Contact Us</a></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <p>© {new Date().getFullYear()} STRIDERA. All rights reserved. Philippines.</p>
            <p>Sandbox payments only — no real transactions.</p>
          </div>
        </div>
      </footer>
    </>
  );
}
