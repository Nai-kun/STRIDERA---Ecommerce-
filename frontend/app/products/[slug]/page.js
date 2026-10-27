'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export default function ProductDetailPage() {
  const { slug } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedColor, setSelectedColor] = useState(null);
  const [selectedSize, setSelectedSize] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState(null);
  const [wishlistLoading, setWishlistLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API}/products/${slug}`);
        const data = await res.json();
        setProduct(data.data);
        if (data.data?.availableColors?.[0]) setSelectedColor(data.data.availableColors[0]);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', width: 600 }}>
        <div className="skeleton" style={{ height: 480, borderRadius: 'var(--radius-xl)' }} />
        <div className="skeleton" style={{ height: 24, width: '60%' }} />
        <div className="skeleton" style={{ height: 32, width: '40%' }} />
      </div>
    </div>
  );

  if (!product) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-4)' }}>
      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>Product not found</h1>
      <Link href="/shop" className="btn btn-primary">Back to Shop</Link>
    </div>
  );

  const images = product.images || [];
  const displayImage = images[activeImage]?.url || '/assets/products/running-men-1.jpg';

  // Get unique colors and sizes from variants
  const colors = [...new Set((product.variants || []).map(v => v.color))];
  const sizesForColor = selectedColor
    ? [...new Set((product.variants || []).filter(v => v.color === selectedColor).map(v => v.size))]
    : [];

  const selectedVariant = selectedColor && selectedSize
    ? (product.variants || []).find(v => v.color === selectedColor && v.size === selectedSize)
    : null;

  const inStock = selectedVariant ? selectedVariant.stockQuantity > 0 : null;
  const priceDisplay = selectedVariant?.priceOverrideCentavos || product.basePriceCentavos;
  const discount = product.compareAtPriceCentavos && product.compareAtPriceCentavos > priceDisplay
    ? Math.round((1 - priceDisplay / product.compareAtPriceCentavos) * 100) : null;

  const handleAddToCart = async () => {
    if (!selectedVariant) {
      setMessage({ type: 'error', text: 'Please select a size and color first.' });
      return;
    }
    if (!inStock) {
      setMessage({ type: 'error', text: 'This variant is out of stock.' });
      return;
    }

    setAdding(true);
    try {
      const res = await fetch(`${API}/cart/items`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productVariantId: selectedVariant.id, quantity })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `${product.name} added to cart!` });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to add to cart.' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Failed to add to cart. Please try again.' });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* Breadcrumb */}
      <div className="container" style={{ paddingBlock: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
        <nav aria-label="Breadcrumb">
          <ol style={{ listStyle: 'none', display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
            <li><Link href="/" style={{ color: 'var(--color-text-muted)' }}>Home</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link href="/shop" style={{ color: 'var(--color-text-muted)' }}>Shop</Link></li>
            <li aria-hidden="true">/</li>
            <li style={{ color: 'var(--color-text)', fontWeight: 500 }} aria-current="page">{product.name}</li>
          </ol>
        </nav>
      </div>

      <div className="container" style={{ paddingBottom: 'var(--space-16)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-12)', alignItems: 'flex-start' }}>

          {/* ── GALLERY ── */}
          <div>
            {/* Main image */}
            <div style={{
              borderRadius: 'var(--radius-xl)',
              overflow: 'hidden',
              background: 'var(--color-surface)',
              aspectRatio: '4/3',
              marginBottom: 'var(--space-4)',
              boxShadow: 'var(--shadow-lg)'
            }}>
              <img
                src={displayImage}
                alt={images[activeImage]?.altText || product.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'opacity 0.2s' }}
              />
            </div>
            {/* Thumbnails */}
            {images.length > 1 && (
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }} role="listbox" aria-label="Product images">
                {images.map((img, i) => (
                  <button
                    key={img.id || i}
                    onClick={() => setActiveImage(i)}
                    role="option"
                    aria-selected={activeImage === i}
                    style={{
                      width: 72, height: 72,
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden',
                      border: `2px solid ${activeImage === i ? 'var(--color-brand-primary)' : 'var(--color-border)'}`,
                      transition: 'border-color var(--transition-fast)',
                      padding: 0,
                      cursor: 'pointer'
                    }}
                  >
                    <img src={img.url} alt={img.altText || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── PRODUCT INFO ── */}
          <div>
            {/* Brand/Category */}
            <p style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-brand-primary)', marginBottom: 'var(--space-2)' }}>
              {product.category?.name} &bull; {product.audience} &bull; {product.shoeType}
            </p>

            <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, lineHeight: 'var(--leading-tight)', marginBottom: 'var(--space-3)' }}>
              {product.name}
            </h1>

            {product.sku && (
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)', marginBottom: 'var(--space-4)' }}>SKU: {product.sku}</p>
            )}

            {/* Price */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
              <span style={{ fontSize: 'var(--text-3xl)', fontWeight: 800 }}>
                ₱{(priceDisplay / 100).toFixed(2)}
              </span>
              {product.compareAtPriceCentavos > priceDisplay && (
                <>
                  <span className="price-original" style={{ fontSize: 'var(--text-xl)' }}>
                    ₱{(product.compareAtPriceCentavos / 100).toFixed(2)}
                  </span>
                  {discount && <span className="price-badge" style={{ fontSize: 'var(--text-sm)', padding: '2px 8px' }}>-{discount}%</span>}
                </>
              )}
            </div>

            {/* Message */}
            {message && (
              <div role="alert" style={{
                padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-4)',
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                background: message.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                color: message.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
                border: `1px solid ${message.type === 'success' ? 'var(--color-success)' : 'var(--color-error)'}`,
              }}>
                {message.text}
              </div>
            )}

            {/* Color selector */}
            <div style={{ marginBottom: 'var(--space-6)' }}>
              <p style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>
                Color: {selectedColor && <span style={{ fontWeight: 400 }}>{selectedColor}</span>}
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }} role="radiogroup" aria-label="Select color">
                {colors.map(color => {
                  const variant = (product.variants || []).find(v => v.color === color);
                  return (
                    <button
                      key={color}
                      role="radio"
                      aria-checked={selectedColor === color}
                      onClick={() => { setSelectedColor(color); setSelectedSize(null); }}
                      title={color}
                      style={{
                        width: 32, height: 32,
                        borderRadius: '50%',
                        background: variant?.colorHex || '#999',
                        border: `3px solid ${selectedColor === color ? 'var(--color-text)' : 'transparent'}`,
                        outline: selectedColor === color ? '2px solid var(--color-text)' : '2px solid var(--color-border)',
                        outlineOffset: 2,
                        transition: 'all var(--transition-fast)',
                        cursor: 'pointer'
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Size selector */}
            {selectedColor && (
              <div style={{ marginBottom: 'var(--space-6)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                  <p style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                    Size (US): {selectedSize && <span style={{ fontWeight: 400 }}>US {selectedSize}</span>}
                  </p>
                  <a href="#size-guide" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-brand-primary)', textDecoration: 'underline' }}>Size guide</a>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }} role="radiogroup" aria-label="Select size">
                  {sizesForColor.map(size => {
                    const variant = (product.variants || []).find(v => v.color === selectedColor && v.size === size);
                    const outOfStock = !variant || variant.stockQuantity === 0;
                    return (
                      <button
                        key={size}
                        role="radio"
                        aria-checked={selectedSize === size}
                        aria-disabled={outOfStock}
                        onClick={() => !outOfStock && setSelectedSize(size)}
                        title={outOfStock ? `US ${size} — Out of stock` : `US ${size}`}
                        style={{
                          width: 48, height: 48,
                          borderRadius: 'var(--radius-md)',
                          border: `2px solid ${selectedSize === size ? 'var(--color-text)' : outOfStock ? 'var(--color-border)' : 'var(--color-border-strong)'}`,
                          background: selectedSize === size ? 'var(--color-text)' : 'transparent',
                          color: selectedSize === size ? '#fff' : outOfStock ? 'var(--color-text-subtle)' : 'var(--color-text)',
                          fontSize: 'var(--text-sm)',
                          fontWeight: 600,
                          opacity: outOfStock ? 0.5 : 1,
                          cursor: outOfStock ? 'not-allowed' : 'pointer',
                          textDecoration: outOfStock ? 'line-through' : 'none',
                          transition: 'all var(--transition-fast)',
                          position: 'relative'
                        }}
                      >{size}</button>
                    );
                  })}
                </div>
                {selectedVariant && (
                  <p style={{ fontSize: 'var(--text-xs)', color: selectedVariant.stockQuantity <= 3 ? 'var(--color-warning)' : 'var(--color-success)', marginTop: 'var(--space-2)', fontWeight: 600 }}>
                    {selectedVariant.stockQuantity === 0 ? 'Out of stock' :
                     selectedVariant.stockQuantity <= 3 ? `Only ${selectedVariant.stockQuantity} left!` :
                     'In stock'}
                  </p>
                )}
              </div>
            )}

            {/* Quantity */}
            {selectedVariant && inStock && (
              <div style={{ marginBottom: 'var(--space-6)' }}>
                <p style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>Quantity</p>
                <div className="qty-control">
                  <button className="qty-btn" onClick={() => setQuantity(q => Math.max(1, q - 1))} aria-label="Decrease quantity">−</button>
                  <span className="qty-value" aria-live="polite">{quantity}</span>
                  <button className="qty-btn" onClick={() => setQuantity(q => Math.min(selectedVariant.stockQuantity, q + 1, 10))} aria-label="Increase quantity">+</button>
                </div>
              </div>
            )}

            {/* Add to Cart */}
            <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
              <button
                className="btn btn-primary btn-lg"
                style={{ flex: 1 }}
                onClick={handleAddToCart}
                disabled={adding || !selectedVariant || !inStock}
                aria-label={!selectedVariant ? 'Select size and color first' : adding ? 'Adding to cart' : 'Add to cart'}
                id="add-to-cart-btn"
              >
                {adding ? 'Adding…' :
                 !selectedColor ? 'Select Color' :
                 !selectedSize ? 'Select Size' :
                 !inStock ? 'Out of Stock' :
                 'Add to Cart'}
              </button>
            </div>

            {/* Description */}
            {product.description && (
              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-6)', marginTop: 'var(--space-4)' }}>
                <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 700, marginBottom: 'var(--space-3)' }}>Description</h2>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', lineHeight: 'var(--leading-relaxed)' }}>{product.description}</p>
              </div>
            )}

            {/* Features */}
            {product.features && (
              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-6)', marginTop: 'var(--space-4)' }}>
                <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 700, marginBottom: 'var(--space-3)' }}>Features</h2>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {product.features.split(' • ').map((f, i) => (
                    <li key={i} style={{ display: 'flex', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                      <span style={{ color: 'var(--color-brand-primary)', fontWeight: 700 }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Delivery info */}
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-6)', marginTop: 'var(--space-4)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 'var(--text-xl)' }}>🚚</span>
                  <div><strong style={{ color: 'var(--color-text)' }}>Free shipping</strong> on orders ₱3,000+. Standard delivery 3-7 days.</div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 'var(--text-xl)' }}>↩️</span>
                  <div><strong style={{ color: 'var(--color-text)' }}>30-day returns</strong> — in original condition.</div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 'var(--text-xl)' }}>🔒</span>
                  <div><strong style={{ color: 'var(--color-text)' }}>Secure sandbox payments</strong> via GCash, Maya, GrabPay.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
