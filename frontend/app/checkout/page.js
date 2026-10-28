'use client';

import { useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const STEPS = ['Customer Info', 'Shipping', 'Payment', 'Confirmation'];

export default function CheckoutPage() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [order, setOrder] = useState(null);
  const [promoCode, setPromoCode] = useState('');
  const [simulationSuccess, setSimulationSuccess] = useState(false);

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    addressLine1: '', addressLine2: '', city: '', province: '', postalCode: '',
    notes: '', promotionCode: ''
  });

  const setField = (key, val) => setForm(p => ({ ...p, [key]: val }));

  const handleSubmitOrder = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/orders`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingFullName: `${form.firstName} ${form.lastName}`,
          shippingPhone: form.phone,
          shippingAddressLine1: form.addressLine1,
          shippingAddressLine2: form.addressLine2,
          shippingCity: form.city,
          shippingProvince: form.province,
          shippingPostalCode: form.postalCode,
          guestEmail: form.email,
          notes: form.notes,
          promotionCode: form.promotionCode || undefined
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Order failed');
      setOrder(data.data);
      setStep(3);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSimulatePayment = async () => {
    if (!order) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/payments/simulate`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber: order.orderNumber })
      });
      const data = await res.json();
      if (data.success) {
        setSimulationSuccess(true);
      } else {
        setError(data.message || 'Payment simulation failed. Note: DEMO_MODE=true and admin authentication required for simulation fallback.');
      }
    } catch (e) {
      setError(e.message || 'Payment simulation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    if (!order) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/payments/create-session`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber: order.orderNumber })
      });
      const data = await res.json();
      if (data.success && data.data.checkoutUrl) {
        window.location.href = data.data.checkoutUrl;
      } else {
        setError(data.message || 'Payment session could not be created. Check that PAYMONGO_SECRET_KEY is configured.');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSimulatePayment = async () => {
    if (!order) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/payments/simulate`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber: order.orderNumber })
      });
      const data = await res.json();
      if (data.success) {
        setSimulationSuccess(true);
      } else {
        setError(data.message || 'Payment simulation failed. Note: DEMO_MODE=true and admin authentication required for simulation fallback.');
      }
    } catch (e) {
      setError(e.message || 'Payment simulation failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', paddingBlock: 'var(--space-8)' }}>
      <div className="container" style={{ maxWidth: 720 }}>
        <Link href="/cart" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-6)' }}>
          ← Back to Cart
        </Link>

        {/* Stepper */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 'var(--space-8)', borderBottom: '2px solid var(--color-border)' }} role="tablist" aria-label="Checkout steps">
          {STEPS.map((s, i) => (
            <div
              key={s}
              role="tab"
              aria-selected={step === i}
              aria-current={step === i ? 'step' : undefined}
              style={{
                flex: 1,
                paddingBottom: 'var(--space-3)',
                textAlign: 'center',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: step >= i ? 'var(--color-text)' : 'var(--color-text-subtle)',
                borderBottom: `3px solid ${step >= i ? 'var(--color-brand-primary)' : 'transparent'}`,
                marginBottom: '-2px',
                transition: 'all var(--transition-base)'
              }}
            >
              <span style={{
                display: 'inline-block',
                width: 24, height: 24,
                borderRadius: '50%',
                background: step > i ? 'var(--color-brand-primary)' : step === i ? 'var(--color-text)' : 'var(--color-border)',
                color: step >= i ? '#fff' : 'var(--color-text-muted)',
                fontSize: 'var(--text-xs)', fontWeight: 700,
                lineHeight: '24px',
                marginBottom: 'var(--space-1)',
                marginRight: 'var(--space-2)'
              }}>{step > i ? '✓' : i + 1}</span>
              {s}
            </div>
          ))}
        </div>

        {error && (
          <div role="alert" style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid var(--color-error)',
            borderRadius: 'var(--radius-md)', padding: 'var(--space-4)',
            color: 'var(--color-error)', fontSize: 'var(--text-sm)', fontWeight: 500,
            marginBottom: 'var(--space-6)'
          }}>
            {error}
          </div>
        )}

        {/* STEP 0: Customer Info */}
        {step === 0 && (
          <div>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-6)' }}>Customer Information</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="firstName">First Name *</label>
                <input id="firstName" className="form-input" value={form.firstName} onChange={e => setField('firstName', e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="lastName">Last Name *</label>
                <input id="lastName" className="form-input" value={form.lastName} onChange={e => setField('lastName', e.target.value)} required />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="email">Email Address *</label>
              <input id="email" type="email" className="form-input" value={form.email} onChange={e => setField('email', e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="phone">Phone *</label>
              <input id="phone" type="tel" className="form-input" placeholder="+63 9XX XXX XXXX" value={form.phone} onChange={e => setField('phone', e.target.value)} required />
            </div>
            <button
              className="btn btn-primary btn-lg btn-full"
              onClick={() => setStep(1)}
              disabled={!form.firstName || !form.lastName || !form.email || !form.phone}
            >
              Continue to Shipping
            </button>
          </div>
        )}

        {/* STEP 1: Shipping */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-6)' }}>Shipping Address</h2>
            <div className="form-group">
              <label className="form-label" htmlFor="addressLine1">Address Line 1 *</label>
              <input id="addressLine1" className="form-input" placeholder="Street, building, unit" value={form.addressLine1} onChange={e => setField('addressLine1', e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="addressLine2">Address Line 2</label>
              <input id="addressLine2" className="form-input" placeholder="Barangay, landmark (optional)" value={form.addressLine2} onChange={e => setField('addressLine2', e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="city">City / Municipality *</label>
                <input id="city" className="form-input" value={form.city} onChange={e => setField('city', e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="province">Province *</label>
                <input id="province" className="form-input" value={form.province} onChange={e => setField('province', e.target.value)} required />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="postalCode">Postal Code *</label>
              <input id="postalCode" className="form-input" placeholder="e.g. 1200" value={form.postalCode} onChange={e => setField('postalCode', e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="promoCode">Promo Code</label>
              <input id="promoCode" className="form-input" placeholder="e.g. STRIDE10" value={form.promotionCode} onChange={e => setField('promotionCode', e.target.value.toUpperCase())} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="notes">Order Notes</label>
              <textarea id="notes" className="form-textarea" rows={3} placeholder="Special instructions (optional)" value={form.notes} onChange={e => setField('notes', e.target.value)} style={{resize:'vertical'}} />
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <button className="btn btn-outline" onClick={() => setStep(0)}>Back</button>
              <button
                className="btn btn-primary btn-lg"
                style={{ flex: 1 }}
                onClick={() => setStep(2)}
                disabled={!form.addressLine1 || !form.city || !form.province || !form.postalCode}
              >
                Review Order
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Review + Place Order */}
        {step === 2 && (
          <div>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-6)' }}>Review & Pay</h2>

            <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', marginBottom: 'var(--space-6)', boxShadow: 'var(--shadow-sm)' }}>
              <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-4)' }}>Delivery Details</h3>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', lineHeight: 'var(--leading-relaxed)' }}>
                {form.firstName} {form.lastName}<br />
                {form.email}<br />
                {form.phone}<br />
                {form.addressLine1}, {form.addressLine2 && form.addressLine2 + ', '}{form.city}, {form.province} {form.postalCode}
              </p>
              {form.promotionCode && (
                <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--color-brand-primary)', fontWeight: 600 }}>
                  🏷️ Promo: {form.promotionCode}
                </p>
              )}
            </div>

            <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', marginBottom: 'var(--space-6)', boxShadow: 'var(--shadow-sm)' }}>
              <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-4)' }}>Payment Method</h3>
              <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                {['GCash', 'Maya', 'GrabPay'].map(method => (
                  <div key={method} style={{
                    padding: 'var(--space-3) var(--space-5)',
                    borderRadius: 'var(--radius-md)',
                    border: '2px solid var(--color-brand-primary)',
                    background: 'rgba(74,144,196,0.05)',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 600,
                    color: 'var(--color-brand-primary)'
                  }}>{method}</div>
                ))}
              </div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-3)' }}>
                You will be redirected to the PayMongo payment page to complete your purchase via your preferred e-wallet.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <button className="btn btn-outline" onClick={() => setStep(1)}>Back</button>
              <button
                className="btn btn-primary btn-lg"
                style={{ flex: 1 }}
                onClick={handleSubmitOrder}
                disabled={loading}
                id="place-order-btn"
              >
                {loading ? 'Placing Order…' : 'Place Order'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Confirmation / Payment */}
        {step === 3 && order && (
          <div style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
            {simulationSuccess ? (
              <div style={{
                background: 'var(--color-surface)',
                borderRadius: 'var(--radius-xl)',
                padding: 'var(--space-8)',
                boxShadow: 'var(--shadow-md)',
                maxWidth: '500px',
                margin: '0 auto'
              }}>
                <div style={{ fontSize: '3.5rem', marginBottom: 'var(--space-3)' }}>✅</div>
                <h2 style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, color: 'var(--color-success)', marginBottom: 'var(--space-2)' }}>
                  Payment Verified!
                </h2>
                <div style={{
                  display: 'inline-block',
                  background: 'rgba(34,197,94,0.1)',
                  color: 'var(--color-success)',
                  padding: '4px 12px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  marginBottom: 'var(--space-4)'
                }}>
                  ● PAID & CONFIRMED (DEMO SIMULATION)
                </div>
                <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' }}>
                  Order Number: <strong>{order.orderNumber}</strong>
                </p>
                <p style={{ fontWeight: 700, fontSize: 'var(--text-xl)', marginBottom: 'var(--space-6)' }}>
                  Amount: {order.grandTotalFormatted}
                </p>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)', marginBottom: 'var(--space-6)', lineHeight: 1.6 }}>
                  Order and seller slices have been transitioned to PAID in the database with inventory movements logged to the audit trail.
                </p>
                <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' }}>
                  <Link href="/account/orders" className="btn btn-primary">View My Orders</Link>
                  <Link href="/shop" className="btn btn-outline">Continue Shopping</Link>
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>🎉</div>
                <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, marginBottom: 'var(--space-2)' }}>Order Created!</h2>
                <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' }}>
                  Order #{order.orderNumber}
                </p>
                <p style={{ fontWeight: 700, fontSize: 'var(--text-xl)', marginBottom: 'var(--space-6)' }}>
                  Total: {order.grandTotalFormatted}
                </p>
                <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-8)', fontSize: 'var(--text-sm)', maxWidth: '40ch', marginInline: 'auto' }}>
                  Click below to complete payment via GCash, Maya, or GrabPay through our secure PayMongo checkout.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', alignItems: 'center', maxWidth: '300px', margin: '0 auto' }}>
                  <button
                    className="btn btn-primary btn-lg btn-full"
                    onClick={handlePayment}
                    disabled={loading}
                    id="pay-now-btn"
                  >
                    {loading ? 'Processing…' : '💳 Pay with PayMongo Sandbox'}
                  </button>

                  <button
                    className="btn btn-outline btn-full"
                    onClick={handleSimulatePayment}
                    disabled={loading}
                    id="simulate-payment-btn"
                    style={{ borderColor: 'var(--color-warning)', color: 'var(--color-warning)' }}
                  >
                    ⚡ Demo: Simulate Payment Success
                  </button>
                </div>

                {error && (
                  <p style={{ color: 'var(--color-error)', marginTop: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
                    {error}
                  </p>
                )}

                <div style={{
                  marginTop: 'var(--space-6)',
                  padding: 'var(--space-3)',
                  background: 'var(--color-surface)',
                  borderRadius: 'var(--radius-md)',
                  display: 'inline-block',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-muted)'
                }}>
                  🛡️ Sandbox mode — No real financial credentials or funds are used.
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
