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
import PhilippineAddressPicker from '../../components/PhilippineAddressPicker';
import InlineFieldError from '../../components/InlineFieldError';
import DeliveryEstimateBanner from '../../components/DeliveryEstimateBanner';
import {
  EMAIL_POLICY,
  formatPhMobileInput,
  handlePhMobileKeyDown,
  normalizePhMobile,
  validateEmail,
  validatePersonName,
  validateStreet,
  validateCityOrProvince,
  validatePostalCode,
  validateOptionalText,
  focusFirstInvalidField
} from '../../lib/validation';

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
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '+63 ',
    addressLine1: '', addressLine2: '',
    region: '', barangay: '', city: '', province: '', postalCode: '',
    regionCode: '', provinceCode: '', cityCode: '', barangayCode: '', addressSource: 'MANUAL',
    notes: '', promotionCode: '', paymentMethod: 'gcash'
  });
  const [fieldErrors, setFieldErrors] = useState({});

  const validateStep0Field = (key, val) => {
    switch (key) {
      case 'firstName':
        return validatePersonName(val, 'First name').error;
      case 'lastName':
        return validatePersonName(val, 'Last name').error;
      case 'email':
        return validateEmail(val, { required: true, applyPolicy: !isLoggedIn, policy: EMAIL_POLICY }).error;
      case 'phone':
        return normalizePhMobile(val, { required: true }).error;
      default:
        return null;
    }
  };

  const validateStep1Field = (key, val) => {
    switch (key) {
      case 'addressLine1':
        return validateStreet(val).error;
      case 'addressLine2':
        return validateOptionalText(val, 'Address line 2', { max: 200 }).error;
      case 'city':
        return validateCityOrProvince(val, 'City / Municipality').error;
      case 'province':
        return validateCityOrProvince(val, 'Province').error;
      case 'postalCode':
        return validatePostalCode(val).error;
      case 'notes':
        return validateOptionalText(val, 'Delivery notes', { max: 500 }).error;
      case 'promotionCode':
        return validateOptionalText(val, 'Promo code', { max: 40 }).error;
      default:
        return null;
    }
  };

  useEffect(() => {
    getMe()
      .then(res => {
        if (res?.data) {
          setIsLoggedIn(true);
          const u = res.data;
          const defaultAddr = u.addresses?.[0];
          const rawPhone = u.phone || defaultAddr?.phone || '';
          const normalizedPhone = rawPhone ? formatPhMobileInput(rawPhone) : '+63 ';
          setForm(prev => ({
            ...prev,
            firstName: u.firstName || prev.firstName,
            lastName: u.lastName || prev.lastName,
            email: u.email || prev.email,
            phone: normalizedPhone,
            addressLine1: defaultAddr?.addressLine1 || prev.addressLine1,
            addressLine2: defaultAddr?.addressLine2 || prev.addressLine2,
            region: defaultAddr?.region || prev.region,
            barangay: defaultAddr?.barangay || prev.barangay,
            city: defaultAddr?.city || prev.city,
            province: defaultAddr?.province || prev.province,
            regionCode: defaultAddr?.regionCode || prev.regionCode,
            provinceCode: defaultAddr?.provinceCode || prev.provinceCode,
            cityCode: defaultAddr?.cityCode || prev.cityCode,
            barangayCode: defaultAddr?.barangayCode || prev.barangayCode,
            addressSource: defaultAddr?.addressSource || prev.addressSource,
            postalCode: defaultAddr?.postalCode || prev.postalCode
          }));
        }
      })
      .catch(() => { setIsLoggedIn(false); });
  }, []);

  const setField = (key, val) => {
    setForm(p => ({ ...p, [key]: val }));
    if (fieldErrors[key]) {
      const err = ['firstName', 'lastName', 'email', 'phone'].includes(key)
        ? validateStep0Field(key, val)
        : validateStep1Field(key, val);
      setFieldErrors(fe => ({ ...fe, [key]: err }));
    }
  };

  const handleSubmitOrder = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const phoneNormalized = normalizePhMobile(form.phone, { required: true });
      const emailNormalized = validateEmail(form.email, { required: !isLoggedIn, applyPolicy: !isLoggedIn, policy: EMAIL_POLICY });
      const res = await createOrder({
        shippingFullName: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
        shippingPhone: phoneNormalized.value || form.phone,
        shippingAddressLine1: form.addressLine1.trim(),
        shippingAddressLine2: form.addressLine2.trim() || undefined,
        shippingBarangay: form.barangay || undefined,
        shippingCity: form.city.trim(),
        shippingProvince: form.province.trim(),
        shippingRegion: form.region || undefined,
        shippingRegionCode: form.regionCode || undefined,
        shippingProvinceCode: form.provinceCode || undefined,
        shippingCityCode: form.cityCode || undefined,
        shippingBarangayCode: form.barangayCode || undefined,
        shippingAddressSource: form.addressSource || 'MANUAL',
        shippingPostalCode: form.postalCode.trim(),
        ...(isLoggedIn ? {} : { guestEmail: emailNormalized.value || form.email.trim().toLowerCase() }),
        notes: form.notes.trim() || undefined,
        promotionCode: form.promotionCode.trim() || undefined,
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
          <form
            noValidate
            onSubmit={e => {
              e.preventDefault();
              setError(null);
              const errors = {
                firstName: validateStep0Field('firstName', form.firstName),
                lastName: validateStep0Field('lastName', form.lastName),
                email: validateStep0Field('email', form.email),
                phone: validateStep0Field('phone', form.phone)
              };
              setFieldErrors(prev => ({ ...prev, ...errors }));
              if (Object.values(errors).some(Boolean)) {
                focusFirstInvalidField(errors, { firstName: 'firstName', lastName: 'lastName', email: 'email', phone: 'phone' });
                return;
              }
              setStep(1);
            }}
          >
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-6)' }}>Customer Information</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="firstName">First Name *</label>
                <input
                  id="firstName"
                  className="form-input"
                  placeholder="e.g. Juan"
                  value={form.firstName}
                  onChange={e => setField('firstName', e.target.value)}
                  onBlur={() => setFieldErrors(p => ({ ...p, firstName: validateStep0Field('firstName', form.firstName) }))}
                  required
                  aria-required="true"
                  aria-invalid={Boolean(fieldErrors.firstName)}
                  aria-describedby={fieldErrors.firstName ? 'firstName-err' : undefined}
                  maxLength={60}
                />
                <InlineFieldError id="firstName-err" error={fieldErrors.firstName} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="lastName">Last Name *</label>
                <input
                  id="lastName"
                  className="form-input"
                  placeholder="e.g. Dela Cruz"
                  value={form.lastName}
                  onChange={e => setField('lastName', e.target.value)}
                  onBlur={() => setFieldErrors(p => ({ ...p, lastName: validateStep0Field('lastName', form.lastName) }))}
                  required
                  aria-required="true"
                  aria-invalid={Boolean(fieldErrors.lastName)}
                  aria-describedby={fieldErrors.lastName ? 'lastName-err' : undefined}
                  maxLength={60}
                />
                <InlineFieldError id="lastName-err" error={fieldErrors.lastName} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="email">
                Email Address *
              </label>
              <input
                id="email"
                type="email"
                className="form-input"
                placeholder="name@gmail.com"
                value={form.email}
                onChange={e => setField('email', e.target.value)}
                onBlur={() => setFieldErrors(p => ({ ...p, email: validateStep0Field('email', form.email) }))}
                required
                aria-required="true"
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'email-err' : undefined}
                readOnly={isLoggedIn}
                autoComplete="email"
                maxLength={254}
              />
              <InlineFieldError id="email-err" error={fieldErrors.email} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="phone">Mobile Number (PH International) *</label>
              <input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={16}
                className="form-input"
                placeholder="+63 9XX-XXX-YYYY"
                value={form.phone}
                onKeyDown={handlePhMobileKeyDown}
                onChange={e => setField('phone', formatPhMobileInput(e.target.value))}
                onBlur={() => setFieldErrors(p => ({ ...p, phone: validateStep0Field('phone', form.phone) }))}
                required
                aria-required="true"
                aria-invalid={Boolean(fieldErrors.phone)}
                aria-describedby={fieldErrors.phone ? 'phone-err' : 'phone-hint'}
              />
              <InlineFieldError id="phone-err" error={fieldErrors.phone} />
              <span id="phone-hint" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)', display: 'block', marginTop: 3 }}>
                Format: +63 9XX-XXX-YYYY (e.g. +63 917-123-4567)
              </span>
            </div>
            <button type="submit" className="btn btn-primary btn-lg btn-full">
              Continue to Shipping
            </button>
          </form>
        )}

        {/* STEP 1: Shipping */}
        {step === 1 && (
          <form
            noValidate
            onSubmit={e => {
              e.preventDefault();
              setError(null);
              const errors = {
                addressLine1: validateStep1Field('addressLine1', form.addressLine1),
                addressLine2: validateStep1Field('addressLine2', form.addressLine2),
                city: validateStep1Field('city', form.city),
                province: validateStep1Field('province', form.province),
                postalCode: validateStep1Field('postalCode', form.postalCode),
                notes: validateStep1Field('notes', form.notes),
                promotionCode: validateStep1Field('promotionCode', form.promotionCode)
              };
              if (form.regionCode && !form.barangayCode) {
                errors.city = errors.city || 'Please complete Region, City, and Barangay selection or switch to manual entry.';
              }
              setFieldErrors(prev => ({ ...prev, ...errors }));
              if (Object.values(errors).some(Boolean)) {
                focusFirstInvalidField(errors, {
                  addressLine1: 'addressLine1',
                  addressLine2: 'addressLine2',
                  city: 'psgc-city',
                  province: 'psgc-province',
                  postalCode: 'postalCode',
                  promotionCode: 'promoCode',
                  notes: 'notes'
                });
                return;
              }
              setStep(2);
            }}
          >
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-6)' }}>Shipping Address (FR-3.5)</h2>
            <div className="form-group">
              <label className="form-label" htmlFor="addressLine1">Street Address *</label>
              <input
                id="addressLine1"
                className="form-input"
                placeholder="Street, building, house/unit no."
                value={form.addressLine1}
                onChange={e => setField('addressLine1', e.target.value)}
                onBlur={() => setFieldErrors(p => ({ ...p, addressLine1: validateStep1Field('addressLine1', form.addressLine1) }))}
                required
                aria-required="true"
                aria-invalid={Boolean(fieldErrors.addressLine1)}
                aria-describedby={fieldErrors.addressLine1 ? 'addressLine1-err' : undefined}
                maxLength={200}
              />
              <InlineFieldError id="addressLine1-err" error={fieldErrors.addressLine1} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="addressLine2">Address Line 2 / Landmark <span className="form-optional">(optional)</span></label>
              <input
                id="addressLine2"
                className="form-input"
                placeholder="Building, landmark, floor"
                value={form.addressLine2}
                onChange={e => setField('addressLine2', e.target.value)}
                onBlur={() => setFieldErrors(p => ({ ...p, addressLine2: validateStep1Field('addressLine2', form.addressLine2) }))}
                aria-invalid={Boolean(fieldErrors.addressLine2)}
                aria-describedby={fieldErrors.addressLine2 ? 'addressLine2-err' : undefined}
                maxLength={200}
              />
              <InlineFieldError id="addressLine2-err" error={fieldErrors.addressLine2} />
            </div>
            <PhilippineAddressPicker value={form} onChange={setForm} />
            {(fieldErrors.city || fieldErrors.province) && (
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <InlineFieldError id="shipping-loc-err" error={fieldErrors.city || fieldErrors.province} />
              </div>
            )}
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
                onBlur={() => setFieldErrors(p => ({ ...p, postalCode: validateStep1Field('postalCode', form.postalCode) }))}
                required
                aria-required="true"
                aria-invalid={Boolean(fieldErrors.postalCode)}
                aria-describedby={fieldErrors.postalCode ? 'postalCode-err' : undefined}
              />
              <InlineFieldError id="postalCode-err" error={fieldErrors.postalCode} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="promoCode">Promo Code <span className="form-optional">(optional — try STRIDE10 or LAUNCH500)</span></label>
              <input
                id="promoCode"
                className="form-input"
                placeholder="e.g. STRIDE10"
                value={form.promotionCode}
                onChange={e => setField('promotionCode', e.target.value.toUpperCase())}
                onBlur={() => setFieldErrors(p => ({ ...p, promotionCode: validateStep1Field('promotionCode', form.promotionCode) }))}
                aria-invalid={Boolean(fieldErrors.promotionCode)}
                aria-describedby={fieldErrors.promotionCode ? 'promoCode-err' : undefined}
                maxLength={40}
              />
              <InlineFieldError id="promoCode-err" error={fieldErrors.promotionCode} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="notes">Delivery Instructions <span className="form-optional">(optional)</span></label>
              <textarea
                id="notes"
                className="form-textarea"
                rows={2}
                placeholder="Gate code, landmark, or instructions for rider"
                value={form.notes}
                onChange={e => setField('notes', e.target.value)}
                onBlur={() => setFieldErrors(p => ({ ...p, notes: validateStep1Field('notes', form.notes) }))}
                aria-invalid={Boolean(fieldErrors.notes)}
                aria-describedby={fieldErrors.notes ? 'notes-err' : undefined}
                maxLength={500}
              />
              <InlineFieldError id="notes-err" error={fieldErrors.notes} />
            </div>
            <DeliveryEstimateBanner
              regionCode={form.regionCode}
              province={form.province}
              city={form.city}
            />
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <button type="button" className="btn btn-outline" onClick={() => setStep(0)}>Back</button>
              <button type="submit" className="btn btn-primary btn-lg" style={{ flex: 1 }}>
                Continue to Payment Method
              </button>
            </div>
          </form>
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
                {form.addressLine1}, {form.addressLine2 && form.addressLine2 + ', '}
                {form.barangay && `Brgy. ${form.barangay}, `}
                {form.city}, {form.province}{form.region ? `, ${form.region}` : ''} {form.postalCode}
                {form.addressSource === 'PSGC_VERIFIED' && form.cityCode && (
                  <span style={{ display: 'inline-block', marginLeft: 8, background: 'rgba(22,163,74,0.12)', color: '#166534', padding: '1px 7px', borderRadius: 99, fontSize: '11px', fontWeight: 700 }}>
                    ✓ PSGC Verified
                  </span>
                )}
              </p>
              {form.promotionCode && (
                <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--color-brand-primary)', fontWeight: 600 }}>
                  🏷️ Promo Code Applied: {form.promotionCode}
                </p>
              )}
              <div style={{ marginTop: 'var(--space-3)' }}>
                <DeliveryEstimateBanner
                  regionCode={form.regionCode}
                  province={form.province}
                  city={form.city}
                  compact
                />
              </div>
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
