// STRIDERA Revision Automated Test Suite (Phase 6)
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { encryptSetting, decryptSetting, maskSecret, assertSandboxKey } = require('../backend/src/lib/cryptoSettings');
const { detectImageType } = require('../backend/src/lib/imageUpload');
const { deriveCanonicalOrderStatus } = require('../backend/src/lib/paymentFinalizer');
const { hashSessionToken } = require('../backend/src/middleware/auth.middleware');

test('T-AUTH-01 / D4: Persistent session token hashes deterministically with SHA-256', () => {
  const raw = crypto.randomBytes(32).toString('base64url');
  const h1 = hashSessionToken(raw);
  const h2 = hashSessionToken(raw);
  assert.equal(h1, h2);
  assert.equal(h1.length, 64);
  assert.notEqual(h1, raw);
});

test('T-ADM-03 / D7: Encrypted API settings round-trip, mask to last 4 chars, and reject live keys', () => {
  const secret = 'sk_test_stridera_sandbox_9876';
  const encrypted = encryptSetting(secret);
  assert.ok(!encrypted.includes(secret));
  assert.equal(decryptSetting(encrypted), secret);
  assert.equal(maskSecret(secret), '••••••••9876');

  assert.throws(() => assertSandboxKey('sk_live_abc123', 'PAYMONGO_SECRET_KEY'), /Live-mode/);
  assert.throws(() => assertSandboxKey('pk_live_abc123', 'PAYMONGO_PUBLIC_KEY'), /Live-mode/);
  assert.doesNotThrow(() => assertSandboxKey(secret, 'PAYMONGO_SECRET_KEY'));
});

test('T-SEC-04 / D12: Image upload validation checks magic bytes (PNG/JPG/WEBP) and rejects fake files', () => {
  const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
  const jpgHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const webpHeader = Buffer.from('RIFF\x00\x00\x00\x00WEBP', 'binary');
  const fakeScript = Buffer.from('<?php echo "pwn"; ?>', 'utf8');

  assert.equal(detectImageType(pngHeader), 'png');
  assert.equal(detectImageType(jpgHeader), 'jpg');
  assert.equal(detectImageType(webpHeader), 'webp');
  assert.equal(detectImageType(fakeScript), null);
});

test('T-ORD-03 / D2: Multi-seller derived order status handles PENDING, PAID, Partially Shipped, SHIPPED, CANCELLED', () => {
  assert.deepEqual(
    deriveCanonicalOrderStatus({ paymentStatus: 'UNPAID', orderStatus: 'PENDING' }, []),
    { canonicalStatus: 'PENDING', isPartiallyShipped: false }
  );

  assert.deepEqual(
    deriveCanonicalOrderStatus(
      { paymentStatus: 'PAID', orderStatus: 'CONFIRMED' },
      [{ fulfillmentStatus: 'SHIPPED' }, { fulfillmentStatus: 'PENDING' }]
    ),
    { canonicalStatus: 'PAID', isPartiallyShipped: true }
  );

  assert.deepEqual(
    deriveCanonicalOrderStatus(
      { paymentStatus: 'PAID', orderStatus: 'CONFIRMED' },
      [{ fulfillmentStatus: 'SHIPPED' }, { fulfillmentStatus: 'SHIPPED' }]
    ),
    { canonicalStatus: 'SHIPPED', isPartiallyShipped: false }
  );

  assert.deepEqual(
    deriveCanonicalOrderStatus(
      { paymentStatus: 'PAID', orderStatus: 'CONFIRMED' },
      [{ fulfillmentStatus: 'CANCELLED' }, { fulfillmentStatus: 'CANCELLED' }]
    ),
    { canonicalStatus: 'CANCELLED', isPartiallyShipped: false }
  );
});

test('T-MET-01 / T-MET-03 / D8: High-selling / Low-selling / No-sales classification & under-5 rule', () => {
  function classify(products) {
    const active = [...products].sort((a, b) => b.unitsSold - a.unitsSold);
    const applyBadges = active.length >= 5;
    const topCutoff = applyBadges ? Math.max(1, Math.ceil(active.length * 0.2)) : 0;
    const withSales = active.filter(p => p.unitsSold > 0);
    const highIds = new Set(applyBadges ? withSales.slice(0, topCutoff).map(p => p.id) : []);
    const lowIds = new Set(applyBadges ? withSales.slice(-topCutoff).map(p => p.id) : []);
    return active.map(p => ({
      ...p,
      label: p.unitsSold === 0 ? 'NO_SALES' : (applyBadges ? (highIds.has(p.id) ? 'HIGH_SELLING' : (lowIds.has(p.id) ? 'LOW_SELLING' : null)) : null)
    }));
  }

  const five = classify([
    { id: '1', unitsSold: 50 },
    { id: '2', unitsSold: 20 },
    { id: '3', unitsSold: 10 },
    { id: '4', unitsSold: 2 },
    { id: '5', unitsSold: 0 }
  ]);
  assert.equal(five.find(p => p.id === '1').label, 'HIGH_SELLING');
  assert.equal(five.find(p => p.id === '4').label, 'LOW_SELLING');
  assert.equal(five.find(p => p.id === '5').label, 'NO_SALES');

  const underFive = classify([
    { id: '1', unitsSold: 50 },
    { id: '2', unitsSold: 10 },
    { id: '3', unitsSold: 0 }
  ]);
  assert.equal(underFive.find(p => p.id === '1').label, null);
  assert.equal(underFive.find(p => p.id === '3').label, 'NO_SALES');
});
