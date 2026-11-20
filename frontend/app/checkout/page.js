'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  getMe,
  createOrder,
  createPaymentSession,
  confirmSandboxPayment,
  failSandboxPayment,
  simulatePayment
} from '../../lib/api';

const STEPS = ['Customer Info', 'Shipping', 'Payment Method', 'E-Wallet Payment'];

const WALLETS = [
  { id: 'gcash', label: 'GCash', color: '#007DFE', desc: 'Instant QR & Mobile Number Authorization' },
  { id: 'maya', label: 'Maya', color: '#00B14F', desc: 'Maya E-Wallet & Virtual Card Checkout' },
  { id: 'paypal', label: 'PayPal', color: '#003087', desc: 'PayPal Philippines Sandbox Express' }
];

export default function CheckoutPage() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [order, setOrder] = useState(null);
  const [paymentSession, setPaymentSession] = useState(null);
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [paymentFailedMsg, setPaymentFailedMsg] = useState(null);

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '+63 ',
    addressLine1: '', addressLine2: '', city: '', province: '', postalCode: '',
    notes: '', promotionCode: '', paymentMethod: 'gcash'
  });

  const PH_MOBILE_REGEX = /^\+63 9\d{2}-\d{3}-\d{4}$/;

  const formatPhMobile = (raw) => {
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('63')) digits = digits.slice(2);
    else if (digits.startsWith('0')) digits = digits.slice(1);
    digits = digits.slice(0, 10);
    let formatted = digits.slice(0, 3);
    if (digits.length > 3) formatted += '-' + digits.slice(3, 6);
    if (digits.length > 6) formatted += '-' + digits.slice(6, 10);
    return '+63 ' + formatted;
  };

  useEffect(() => {
    getMe()
      .then(res => {
        if (res?.data) {
          const u = res.data;
          const defaultAddr = u.addresses?.[0];
          setForm(prev => ({
            ...prev,
            firstName: u.firstName || prev.firstName,
            lastName: u.lastName || prev.lastName,
            email: u.email || prev.email,
            phone: u.phone || defaultAddr?.phone || prev.phone,
            addressLine1: defaultAddr?.addressLine1 || prev.addressLine1,
            addressLine2: defaultAddr?.addressLine2 || prev.addressLine2,
            city: defaultAddr?.city || prev.city,
            province: defaultAddr?.province || prev.province,
            postalCode: defaultAddr?.postalCode || prev.postalCode
          }));
        }
      })
      .catch(() => {});
  }, []);

  const setField = (key, val) => setForm(p => ({ ...p, [key]: val }));

  const handleSubmitOrder = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await createOrder({
        shippingFullName: `${form.firstName} ${form.lastName}`,
        shippingPhone: form.phone,
        shippingAddressLine1: form.addressLine1,
        shippingAddressLine2: form.addressLine2,
        shippingCity: form.city,
        shippingProvince: form.province,
        shippingPostalCode: form.postalCode,
        guestEmail: form.email,
        notes: form.notes,
        promotionCode: form.promotionCode || undefined,
        paymentMethod: form.paymentMethod
      });
      setOrder(res.data);
      setStep(3);
      // Automatically initialize e-wallet payment session (FR-4.2, FR-4.3)
      const sessionRes = await createPaymentSession(res.data.orderNumber, form.paymentMethod);
      setPaymentSession(sessionRes.data);
    } catch (e) {
      setError(e.message || 'Order creation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleInitSession = async (methodOverride) => {
    if (!order) return;
    setLoading(true);
    setError(null);
    setPaymentFailedMsg(null);
    const method = methodOverride || form.paymentMethod;
    try {
      const res = await createPaymentSession(order.orderNumber, method);
      if (res.data?.checkoutUrl) {
        window.location.href = res.data.checkoutUrl;
      } else {
        setPaymentSession(res.data);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmEWallet = async () => {
    if (!order) return;
    setLoading(true);
    setError(null);
    setPaymentFailedMsg(null);
    try {
      await confirmSandboxPayment(order.orderNumber, form.paymentMethod, paymentSession?.paymentId);
      setPaymentCompleted(true);
    } catch (e) {
      setError(e.message || 'Payment confirmation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleFailEWallet = async () => {
    if (!order) return;
    setLoading(true);
    setError(null);
    try {
      const res = await failSandboxPayment(order.orderNumber, 'Simulated e-wallet authorization declined / timeout');
      setPaymentFailedMsg(res.message);
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
      await simulatePayment(order.orderNumber);
      setPaymentCompleted(true);
    } catch (e) {
      setError(e.message || 'Admin simulation requires ADMIN role and DEMO_MODE=true.');
    } finally {
      setLoading(false);
    }
  };

  const selectedWalletObj = WALLETS.find(w => w.id === form.paymentMethod) || WALLETS[0];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', paddingBlock: 'var(--space-8)' }}>
      <div className="container" style={{ maxWidth: 740 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
          <Link href="/shop" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            ← Back to Shop
          </Link>
          <Link href="/account/orders" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-brand-primary)', fontWeight: 600 }}>
            My Orders →
          </Link>
        </div>

        {/* Stepper */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 'var(--space-8)', borderBottom: '2px solid var(--color-border)' }} role="tablist" aria-label="Checkout steps">
          {STEPS.map((s, i) => (
            <div
              key={s}
              role="tab"
              aria-selected={step === i}
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
                marginBottom: '-2px'
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
                <input id="firstName" className="form-input" placeholder="e.g. Juan" value={form.firstName} onChange={e => setField('firstName', e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="lastName">Last Name *</label>
                <input id="lastName" className="form-input" placeholder="e.g. Dela Cruz" value={form.lastName} onChange={e => setField('lastName', e.target.value)} required />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="email">Email Address (@gmail.com) *</label>
              <input id="email" type="email" className="form-input" placeholder="e.g. juan.delacruz@gmail.com" value={form.email} onChange={e => setField('email', e.target.value)} required />
              {form.email && !form.email.trim().toLowerCase().endsWith('@gmail.com') && (
                <span className="form-error" style={{ color: 'var(--color-error)' }}>Must be a valid @gmail.com address</span>
              )}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="phone">Mobile Number (PH International) *</label>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                maxLength={16}
                className="form-input"
                placeholder="+63 917-123-4567"
                value={form.phone}
                onKeyDown={e => {
                  if ((e.key === 'Backspace' || e.key === 'Delete') && (e.currentTarget.selectionStart ?? 0) <= 4 && (e.currentTarget.selectionEnd ?? 0) <= 4) {
                    e.preventDefault();
                  }
                }}
                onChange={e => setField('phone', formatPhMobile(e.target.value))}
                required
              />
              <span className="form-error" style={{ color: form.phone.length > 4 && !PH_MOBILE_REGEX.test(form.phone) ? 'var(--color-error)' : 'var(--color-text-subtle)' }}>
                Format: +63 9XX-XXX-YYYY (e.g. +63 917-123-4567)
              </span>
            </div>
            <button
              className="btn btn-primary btn-lg btn-full"
              onClick={() => {
                setError(null);
                if (!/^[A-Za-z\s\-'.]+$/.test(form.firstName.trim())) {
                  setError('First name must contain only letters');
                  return;
                }
                if (!/^[A-Za-z\s\-'.]+$/.test(form.lastName.trim())) {
                  setError('Last name must contain only letters');
                  return;
                }
                if (!form.email.trim().toLowerCase().endsWith('@gmail.com')) {
                  setError('Email must be an @gmail.com address');
                  return;
                }
                if (!PH_MOBILE_REGEX.test(form.phone)) {
                  setError('Phone must be a valid Philippine mobile number (+63 9XX-XXX-YYYY)');
                  return;
                }
                setStep(1);
              }}
              disabled={!form.firstName || !form.lastName || !form.email || !PH_MOBILE_REGEX.test(form.phone)}
            >
              Continue to Shipping
            </button>
          </div>
        )}

        {/* STEP 1: Shipping */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-6)' }}>Shipping Address (FR-3.5)</h2>
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
              <label className="form-label" htmlFor="postalCode">Postal Code (4 Digits) *</label>
              <input
                id="postalCode"
                type="text"
                inputMode="numeric"
                maxLength={4}
                className="form-input"
                placeholder="e.g. 1000, 1200"
                value={form.postalCode}
                onChange={e => setField('postalCode', e.target.value.replace(/\D/g, '').slice(0, 4))}
                required
              />
              <span className="form-error" style={{ color: form.postalCode && form.postalCode.length !== 4 ? 'var(--color-error)' : 'var(--color-text-subtle)' }}>
                Philippine postal code must be exactly 4 digits
              </span>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="promoCode">Promo Code (Try STRIDE10 or LAUNCH500)</label>
              <input id="promoCode" className="form-input" placeholder="e.g. STRIDE10" value={form.promotionCode} onChange={e => setField('promotionCode', e.target.value.toUpperCase())} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="notes">Delivery Instructions</label>
              <textarea id="notes" className="form-textarea" rows={2} placeholder="Gate code, landmark, or instructions for rider" value={form.notes} onChange={e => setField('notes', e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <button className="btn btn-outline" onClick={() => setStep(0)}>Back</button>
              <button
                className="btn btn-primary btn-lg"
                style={{ flex: 1 }}
                onClick={() => {
                  setError(null);
                  if (!/^\d{4}$/.test(form.postalCode)) {
                    setError('Postal code must be exactly 4 digits');
                    return;
                  }
                  setStep(2);
                }}
                disabled={!form.addressLine1 || !form.city || !form.province || form.postalCode.length !== 4}
              >
                Continue to Payment Method
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Select E-Wallet & Place Order (FR-4.1, FR-4.2) */}
        {step === 2 && (
          <div>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-6)' }}>Review &amp; Select E-Wallet (FR-4.1)</h2>

            <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', marginBottom: 'var(--space-6)', border: '1px solid var(--color-border)' }}>
              <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-3)' }}>Delivery Recipient</h3>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', lineHeight: 'var(--leading-relaxed)' }}>
                <strong>{form.firstName} {form.lastName}</strong> ({form.phone})<br />
                {form.email}<br />
                {form.addressLine1}, {form.addressLine2 && form.addressLine2 + ', '}{form.city}, {form.province} {form.postalCode}
              </p>
              {form.promotionCode && (
                <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--color-brand-primary)', fontWeight: 600 }}>
                  🏷️ Promo Code Applied: {form.promotionCode}
                </p>
              )}
            </div>

            <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', marginBottom: 'var(--space-6)', border: '1px solid var(--color-border)' }}>
              <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-4)' }}>Select E-Wallet Provider (FR-4.1)</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)' }}>
                {WALLETS.map(w => {
                  const active = form.paymentMethod === w.id;
                  return (
                    <button
                      type="button"
                      key={w.id}
                      onClick={() => setField('paymentMethod', w.id)}
                      style={{
                        padding: 'var(--space-4)',
                        borderRadius: 'var(--radius-md)',
                        border: `2px solid ${active ? w.color : 'var(--color-border)'}`,
                        background: active ? 'rgba(26,58,107,0.06)' : 'var(--color-bg)',
                        textAlign: 'left',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: 'var(--text-base)', color: w.color, marginBottom: 4 }}>
                        {active ? '● ' : '○ '}{w.label}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{w.desc}</div>
                    </button>
                  );
                })}
              </div>
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
                {loading ? 'Creating Order & E-Wallet Session…' : `Place Order & Pay with ${selectedWalletObj.label}`}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: E-Wallet QR Session & Confirmation (FR-4.2 to FR-4.12) */}
        {step === 3 && order && (
          <div style={{ textAlign: 'center', padding: 'var(--space-4) 0' }}>
            {paymentCompleted ? (
              <div style={{
                background: 'var(--color-surface)',
                borderRadius: 'var(--radius-xl)',
                padding: 'var(--space-8)',
                boxShadow: 'var(--shadow-md)',
                maxWidth: '540px',
                margin: '0 auto',
                border: '2px solid var(--color-success)'
              }}>
                <div style={{ fontSize: '3.5rem', marginBottom: 'var(--space-3)' }}>✅</div>
                <h2 style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, color: 'var(--color-success)', marginBottom: 'var(--space-2)' }}>
                  E-Wallet Payment Verified!
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
                  ● PAID VIA {selectedWalletObj.label.toUpperCase()} &amp; ORDER CONFIRMED
                </div>
                <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' }}>
                  Order Number: <strong>{order.orderNumber}</strong>
                </p>
                <p style={{ fontWeight: 700, fontSize: 'var(--text-xl)', marginBottom: 'var(--space-4)' }}>
                  Total Paid: {order.grandTotalFormatted}
                </p>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)', marginBottom: 'var(--space-6)', lineHeight: 1.6 }}>
                  Your payment has been verified, seller order slices have been transitioned to PAID, and inventory movements have been logged.
                </p>
                <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <Link href={`/account/orders/${order.orderNumber}`} className="btn btn-primary">
                    Track Order #{order.orderNumber}
                  </Link>
                  <Link href="/account/orders" className="btn btn-outline">All My Orders</Link>
                  <Link href="/shop" className="btn btn-ghost">Continue Shopping</Link>
                </div>
              </div>
            ) : (
              <div style={{
                background: 'var(--color-surface)',
                borderRadius: 'var(--radius-xl)',
                padding: 'var(--space-8)',
                border: '1px solid var(--color-border)',
                maxWidth: 560,
                margin: '0 auto'
              }}>
                <span style={{
                  display: 'inline-block',
                  background: selectedWalletObj.color,
                  color: '#fff',
                  padding: '4px 14px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  marginBottom: 'var(--space-3)'
                }}>
                  {selectedWalletObj.label} E-WALLET CHECKOUT SESSION
                </span>

                <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, marginBottom: 'var(--space-1)' }}>
                  Order #{order.orderNumber}
                </h2>
                <p style={{ fontWeight: 800, fontSize: 'var(--text-2xl)', color: 'var(--color-brand-primary)', marginBottom: 'var(--space-4)' }}>
                  {order.grandTotalFormatted}
                </p>

                {paymentFailedMsg && (
                  <div role="alert" style={{
                    background: 'rgba(239,68,68,0.1)', border: '1px solid var(--color-error)',
                    borderRadius: 'var(--radius-md)', padding: 'var(--space-3)',
                    color: 'var(--color-error)', fontSize: 'var(--text-xs)', fontWeight: 600,
                    marginBottom: 'var(--space-4)'
                  }}>
                    ⚠️ {paymentFailedMsg}
                  </div>
                )}

                {/* Simulated E-Wallet QR Code Box (FR-4.2) */}
                <div style={{
                  background: '#fff',
                  border: `3px solid ${selectedWalletObj.color}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-5)',
                  maxWidth: 280,
                  margin: '0 auto var(--space-5)'
                }}>
                  <div style={{
                    width: 160, height: 160, margin: '0 auto var(--space-3)',
                    background: 'repeating-conic-gradient(#0f172a 0% 25%, #ffffff 0% 50%) 50% / 20px 20px',
                    borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '4px solid #0f172a'
                  }}>
                    <span style={{
                      background: selectedWalletObj.color, color: '#fff',
                      padding: '6px 12px', borderRadius: 6, fontWeight: 800, fontSize: 'var(--text-xs)'
                    }}>
                      {selectedWalletObj.label} QR
                    </span>
                  </div>
                  <p style={{ fontSize: '11px', color: '#334155', fontWeight: 700, wordBreak: 'break-all' }}>
                    {paymentSession?.referenceNumber || `${selectedWalletObj.label.toUpperCase()}-SANDBOX-SESSION`}
                  </p>
                  <p style={{ fontSize: '10px', color: '#64748b', marginTop: 4 }}>
                    Scan QR or click Authorize below to complete payment
                  </p>
                </div>

                {/* Switch E-Wallet Option */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 'var(--space-5)' }}>
                  {WALLETS.map(w => (
                    <button
                      key={w.id}
                      type="button"
                      className="btn btn-sm"
                      onClick={() => { setField('paymentMethod', w.id); handleInitSession(w.id); }}
                      style={{
                        background: form.paymentMethod === w.id ? w.color : 'var(--color-bg)',
                        color: form.paymentMethod === w.id ? '#fff' : 'var(--color-text)',
                        border: `1px solid ${w.color}`,
                        fontSize: '11px'
                      }}
                    >
                      Use {w.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', maxWidth: 360, margin: '0 auto' }}>
                  <button
                    className="btn btn-primary btn-lg btn-full"
                    onClick={handleConfirmEWallet}
                    disabled={loading}
                    id="pay-now-btn"
                    style={{ background: selectedWalletObj.color, borderColor: selectedWalletObj.color }}
                  >
                    {loading ? 'Verifying E-Wallet Payment…' : `✅ Authorize & Pay with ${selectedWalletObj.label}`}
                  </button>

                  <button
                    className="btn btn-outline btn-sm btn-full"
                    onClick={handleFailEWallet}
                    disabled={loading}
                    style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}
                  >
                    ❌ Test Payment Failure &amp; Retry (FR-4.7)
                  </button>

                  <button
                    className="btn btn-ghost btn-sm btn-full"
                    onClick={handleSimulatePayment}
                    disabled={loading}
                    id="simulate-payment-btn"
                    style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}
                  >
                    ⚡ Admin Demo Override (Requires Admin Login)
                  </button>
                </div>

                <div style={{
                  marginTop: 'var(--space-5)',
                  fontSize: '11px',
                  color: 'var(--color-text-muted)'
                }}>
                  🛡️ Sandbox E-Wallet Mode — No real financial credentials or funds are charged (FR-4.12).
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
