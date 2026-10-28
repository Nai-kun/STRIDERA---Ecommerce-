'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getCart, updateCartItem, removeCartItem } from '../../lib/api';

export default function CartPage() {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [promoCode, setPromoCode] = useState('');
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoError, setPromoError] = useState(null);
  const [promoApplied, setPromoApplied] = useState(null);
  const [notification, setNotification] = useState(null);

  const notify = (msg, isError = false) => {
    setNotification({ msg, isError });
    setTimeout(() => setNotification(null), 3000);
  };

  const loadCart = async () => {
    try {
      setLoading(true);
      const res = await getCart();
      if (res.success) {
        setCart(res.data);
      }
    } catch (err) {
      console.error(err);
      notify('Failed to load cart', true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCart();
  }, []);

  const handleUpdateQty = async (itemId, newQty) => {
    try {
      const res = await updateCartItem(itemId, newQty);
      if (res.success) {
        setCart(res.data);
      }
    } catch (err) {
      notify(err.message || 'Cannot update quantity', true);
    }
  };

  const handleRemove = async (itemId) => {
    try {
      const res = await removeCartItem(itemId);
      if (res.success) {
        setCart(res.data);
        notify('Item removed from cart');
      }
    } catch (err) {
      notify(err.message || 'Failed to remove item', true);
    }
  };

  const handleApplyPromo = (e) => {
    e.preventDefault();
    setPromoError(null);

    const code = promoCode.trim().toUpperCase();
    if (!code) return;

    const subtotal = cart?.subtotalCentavos || 0;

    if (code === 'STRIDE10') {
      const disc = Math.min(Math.floor((subtotal * 10) / 100), 50000);
      setPromoDiscount(disc);
      setPromoApplied('STRIDE10 (10% off, max ₱500)');
      notify('Promotion code STRIDE10 applied!');
    } else if (code === 'LAUNCH500') {
      if (subtotal < 300000) {
        setPromoError('Minimum order of ₱3,000.00 required for LAUNCH500');
        return;
      }
      setPromoDiscount(50000);
      setPromoApplied('LAUNCH500 (₱500 off)');
      notify('Promotion code LAUNCH500 applied!');
    } else {
      setPromoError('Invalid or expired promo code');
    }
  };

  const subtotalCentavos = cart?.subtotalCentavos || 0;
  const isFreeShipping = subtotalCentavos >= 300000;
  const shippingFeeCentavos = subtotalCentavos > 0 ? (isFreeShipping ? 0 : 15000) : 0;
  const grandTotalCentavos = Math.max(0, subtotalCentavos - promoDiscount + shippingFeeCentavos);

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Toast Notification */}
      {notification && (
        <div style={{
          position: 'fixed',
          bottom: 'var(--space-6)',
          right: 'var(--space-6)',
          background: notification.isError ? 'var(--color-error)' : 'var(--color-text)',
          color: '#fff',
          padding: 'var(--space-3) var(--space-6)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 9999,
          fontSize: 'var(--text-sm)'
        }}>
          {notification.msg}
        </div>
      )}

      {/* Navigation */}
      <header style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', padding: 'var(--space-4) 0' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" style={{ color: 'var(--color-text)', textDecoration: 'none', fontWeight: 700, fontSize: 'var(--text-xl)' }}>
            STRIDERA
          </Link>
          <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
            <Link href="/shop" className="btn btn-ghost btn-sm">Continue Shopping</Link>
          </div>
        </div>
      </header>

      {/* Main Cart Body */}
      <main className="container" style={{ flex: 1, padding: 'var(--space-8) var(--space-4) var(--space-16)' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-4xl)', marginBottom: 'var(--space-6)' }}>
          Shopping Cart ({cart?.itemCount || 0})
        </h1>

        {loading ? (
          <p style={{ textAlign: 'center', padding: 'var(--space-16) 0', color: 'var(--color-text-muted)' }}>
            Loading your cart...
          </p>
        ) : !cart || cart.items.length === 0 ? (
          <div style={{
            background: 'var(--color-surface)',
            padding: 'var(--space-16)',
            borderRadius: 'var(--radius-xl)',
            textAlign: 'center',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: 'var(--space-3)' }}>🛒</div>
            <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>Your Cart is Empty</h2>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-6)' }}>
              Explore our performance running shoes and lifestyle sneakers.
            </p>
            <Link href="/shop" className="btn btn-primary btn-lg">Explore Footwear Catalog</Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 'var(--space-8)', alignItems: 'flex-start' }}>
            {/* Items List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {cart.items.map((item) => (
                <div key={item.id} style={{
                  background: 'var(--color-surface)',
                  padding: 'var(--space-4)',
                  borderRadius: 'var(--radius-lg)',
                  display: 'flex',
                  gap: 'var(--space-4)',
                  alignItems: 'center',
                  boxShadow: 'var(--shadow-sm)'
                }}>
                  {/* Image */}
                  <div style={{ width: 90, height: 90, borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--color-surface-raised)', flexShrink: 0 }}>
                    <img
                      src={item.imageUrl || '/assets/products/running-men-1.jpg'}
                      alt={item.productName}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>

                  {/* Details */}
                  <div style={{ flex: 1 }}>
                    <Link href={`/products/${item.productSlug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>{item.productName}</h3>
                    </Link>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>
                      Size: <strong>US {item.size}</strong> &bull; Color: <strong>{item.color}</strong> &bull; SKU: {item.variantSku}
                    </div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-brand-primary)', marginTop: 'var(--space-2)' }}>
                      ₱{(item.unitPriceCentavos / 100).toFixed(2)}
                    </div>
                  </div>

                  {/* Quantity & Total */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-2)' }}>
                    <div className="qty-control">
                      <button
                        className="qty-btn"
                        onClick={() => item.quantity > 1 ? handleUpdateQty(item.id, item.quantity - 1) : handleRemove(item.id)}
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <span className="qty-value">{item.quantity}</span>
                      <button
                        className="qty-btn"
                        disabled={item.quantity >= item.stockAvailable}
                        onClick={() => handleUpdateQty(item.id, item.quantity + 1)}
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>

                    <div style={{ fontWeight: 700, fontSize: 'var(--text-base)' }}>
                      ₱{(item.lineTotalCentavos / 100).toFixed(2)}
                    </div>

                    <button
                      onClick={() => handleRemove(item.id)}
                      style={{ background: 'none', border: 'none', color: 'var(--color-error)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Order Summary Sidebar */}
            <div style={{
              background: 'var(--color-surface)',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-6)',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Order Summary</h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                  <span>Subtotal</span>
                  <span>{cart.subtotalFormatted}</span>
                </div>

                {promoDiscount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--color-success)' }}>
                    <span>Promo Discount ({promoApplied})</span>
                    <span>-₱{(promoDiscount / 100).toFixed(2)}</span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                  <span>Estimated Shipping</span>
                  <span>{isFreeShipping ? <strong style={{ color: 'var(--color-success)' }}>FREE</strong> : `₱${(shippingFeeCentavos / 100).toFixed(2)}`}</span>
                </div>

                {isFreeShipping ? (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success)', background: 'rgba(34,197,94,0.08)', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)' }}>
                    🎉 Qualified for Free Shipping in the Philippines!
                  </div>
                ) : (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    Add ₱{((300000 - subtotalCentavos) / 100).toFixed(2)} more to qualify for Free Shipping!
                  </div>
                )}
              </div>

              {/* Promo Code Form */}
              <form onSubmit={handleApplyPromo} style={{ margin: 'var(--space-4) 0' }}>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <input
                    type="text"
                    placeholder="Promo code (e.g. STRIDE10)"
                    value={promoCode}
                    onChange={e => setPromoCode(e.target.value)}
                    style={{
                      flex: 1,
                      padding: 'var(--space-2) var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      fontSize: 'var(--text-sm)'
                    }}
                  />
                  <button type="submit" className="btn btn-outline btn-sm">Apply</button>
                </div>
                {promoError && (
                  <p style={{ color: 'var(--color-error)', fontSize: 'var(--text-xs)', marginTop: 'var(--space-1)' }}>
                    {promoError}
                  </p>
                )}
              </form>

              {/* Total & Checkout */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xl)', fontWeight: 800, margin: 'var(--space-4) 0' }}>
                <span>Estimated Total</span>
                <span>₱{(grandTotalCentavos / 100).toFixed(2)}</span>
              </div>

              <Link href="/checkout" className="btn btn-primary btn-full btn-lg" style={{ textAlign: 'center' }}>
                Proceed to Checkout
              </Link>

              <div style={{ marginTop: 'var(--space-4)', textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>
                🔒 Secure E-Wallet Checkout via PayMongo Sandbox (GCash, Maya, GrabPay)
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
