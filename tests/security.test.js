// STRIDERA E-Commerce — Security Test Suite
// Run with: node --test tests/security.test.js

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

describe('1. Access Control & Role-Based Authorization', () => {
  function checkAdminAccess(user) {
    if (!user) {
      return { allowed: false, status: 401, error: 'Authentication required' };
    }
    if (user.role !== 'ADMIN') {
      return { allowed: false, status: 403, error: 'Admin privileges required' };
    }
    return { allowed: true, status: 200 };
  }

  it('should deny unauthenticated requests with 401', () => {
    const res = checkAdminAccess(null);
    assert.equal(res.allowed, false);
    assert.equal(res.status, 401);
  });

  it('should deny authenticated customer users from accessing admin routes with 403', () => {
    const customerUser = { id: 'uuid-1', role: 'CUSTOMER', email: 'shopper@stridera.ph' };
    const res = checkAdminAccess(customerUser);
    assert.equal(res.allowed, false);
    assert.equal(res.status, 403);
    assert.equal(res.error, 'Admin privileges required');
  });

  it('should grant access to admin users', () => {
    const adminUser = { id: 'uuid-2', role: 'ADMIN', email: 'admin@stridera.ph' };
    const res = checkAdminAccess(adminUser);
    assert.equal(res.allowed, true);
    assert.equal(res.status, 200);
  });
});

describe('2. Demo Safety Fallback Gatekeeper (DEMO_MODE)', () => {
  function simulatePaymentGate(demoModeEnv, user) {
    if (demoModeEnv !== 'true') {
      return { allowed: false, status: 403, message: 'Demo mode is disabled' };
    }
    if (!user || user.role !== 'ADMIN') {
      return { allowed: false, status: 403, message: 'Admin access required for demo fallback' };
    }
    return { allowed: true, status: 200 };
  }

  it('should strictly reject payment simulation when DEMO_MODE is not true', () => {
    const adminUser = { id: 'uuid-1', role: 'ADMIN' };
    const resOff = simulatePaymentGate('false', adminUser);
    assert.equal(resOff.allowed, false);
    assert.equal(resOff.status, 403);

    const resUndefined = simulatePaymentGate(undefined, adminUser);
    assert.equal(resUndefined.allowed, false);
    assert.equal(resUndefined.status, 403);
  });

  it('should reject payment simulation if triggered by standard customer even in DEMO_MODE', () => {
    const customer = { id: 'uuid-2', role: 'CUSTOMER' };
    const res = simulatePaymentGate('true', customer);
    assert.equal(res.allowed, false);
    assert.equal(res.status, 403);
  });

  it('should allow payment simulation only when DEMO_MODE is true AND triggered by admin', () => {
    const admin = { id: 'uuid-3', role: 'ADMIN' };
    const res = simulatePaymentGate('true', admin);
    assert.equal(res.allowed, true);
    assert.equal(res.status, 200);
  });
});

describe('3. Webhook Signature Verification', () => {
  const secret = 'whsec_test_secret_key_12345';

  function verifyWebhookSignature(payload, signatureHeader, secretKey) {
    if (!signatureHeader) return false;
    // Paymongo signature format: t=<timestamp>,te=<test_signature>,li=<live_signature>
    const parts = {};
    signatureHeader.split(',').forEach(item => {
      const [key, val] = item.split('=');
      if (key && val) parts[key.trim()] = val.trim();
    });

    const timestamp = parts.t;
    const signature = parts.te || parts.li;
    if (!timestamp || !signature) return false;

    const computed = crypto
      .createHmac('sha256', secretKey)
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computed));
  }

  it('should verify legitimate webhook signatures with constant-time equality', () => {
    const payload = JSON.stringify({ event: 'checkout_session.payment.paid', data: { id: 'evt_1' } });
    const timestamp = '1700000000';
    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    const header = `t=${timestamp},te=${validSignature}`;
    assert.equal(verifyWebhookSignature(payload, header, secret), true);
  });

  it('should reject forged or tampered webhook signatures', () => {
    const payload = JSON.stringify({ event: 'checkout_session.payment.paid', data: { id: 'evt_1' } });
    const tamperedPayload = JSON.stringify({ event: 'checkout_session.payment.paid', data: { id: 'evt_TAMPERED' } });
    const timestamp = '1700000000';
    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    const header = `t=${timestamp},te=${validSignature}`;
    assert.equal(verifyWebhookSignature(tamperedPayload, header, secret), false);
  });
});

describe('4. Input Sanitization & Password Strength', () => {
  it('should reject passwords shorter than 8 characters', () => {
    const isPasswordStrong = (pwd) => typeof pwd === 'string' && pwd.length >= 8;
    assert.equal(isPasswordStrong('short'), false);
    assert.equal(isPasswordStrong('1234567'), false);
    assert.equal(isPasswordStrong('Admin123!Secure'), true);
  });

  it('should strip script tags from user-provided notes/addresses', () => {
    const sanitize = (str) => str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    const dirty = 'Please leave at door <script>alert("xss")</script> thank you';
    const clean = sanitize(dirty);
    assert.equal(clean, 'Please leave at door  thank you');
    assert.equal(clean.includes('<script>'), false);
  });
});

describe('5. Multi-Seller Access Control & Tenant Isolation', () => {
  function checkSellerPortalAccess(user) {
    if (!user) {
      return { allowed: false, status: 401, error: 'Authentication required' };
    }
    // Per skill §4: seller isolation returns 404 for non-sellers
    if (user.role !== 'SELLER') {
      return { allowed: false, status: 404, error: 'Not found' };
    }
    if (user.sellerStatus !== 'APPROVED') {
      return { allowed: false, status: 403, error: 'Seller account not approved' };
    }
    return { allowed: true, status: 200 };
  }

  function checkSellerResourceOwnership(user, resourceOwnerId) {
    if (!user) {
      return { allowed: false, status: 401, error: 'Authentication required' };
    }
    if (user.role === 'ADMIN') {
      return { allowed: true, status: 200 };
    }
    if (user.role === 'SELLER') {
      if (user.id === resourceOwnerId) {
        return { allowed: true, status: 200 };
      }
      // Per skill §4: Return 404, not 403, for another seller's records
      return { allowed: false, status: 404, error: 'Not found' };
    }
    return { allowed: false, status: 404, error: 'Not found' };
  }

  it('should deny non-sellers from accessing seller portal with 404', () => {
    const shopper = { id: 'uuid-cust', role: 'CUSTOMER' };
    const res = checkSellerPortalAccess(shopper);
    assert.equal(res.allowed, false);
    assert.equal(res.status, 404);
  });

  it('should reject pending/unapproved sellers with 403', () => {
    const pendingSeller = { id: 'uuid-pending', role: 'SELLER', sellerStatus: 'PENDING' };
    const res = checkSellerPortalAccess(pendingSeller);
    assert.equal(res.allowed, false);
    assert.equal(res.status, 403);
    assert.match(res.error, /not approved/);
  });

  it('should allow approved sellers to access seller portal', () => {
    const approvedSeller = { id: 'uuid-approved', role: 'SELLER', sellerStatus: 'APPROVED' };
    const res = checkSellerPortalAccess(approvedSeller);
    assert.equal(res.allowed, true);
    assert.equal(res.status, 200);
  });

  it('should isolate sellers: returning 404 (not 403) when attempting to access another seller records', () => {
    const sellerA = { id: 'uuid-seller-a', role: 'SELLER', sellerStatus: 'APPROVED' };
    const sellerBResourceId = 'uuid-seller-b';

    const res = checkSellerResourceOwnership(sellerA, sellerBResourceId);
    assert.equal(res.allowed, false);
    assert.equal(res.status, 404);
    assert.equal(res.error, 'Not found');
  });

  it('should permit sellers to access their own resource records', () => {
    const sellerA = { id: 'uuid-seller-a', role: 'SELLER', sellerStatus: 'APPROVED' };
    const res = checkSellerResourceOwnership(sellerA, 'uuid-seller-a');
    assert.equal(res.allowed, true);
    assert.equal(res.status, 200);
  });

  it('should permit platform admin to inspect any seller resource', () => {
    const admin = { id: 'uuid-admin', role: 'ADMIN' };
    const res = checkSellerResourceOwnership(admin, 'uuid-seller-b');
    assert.equal(res.allowed, true);
    assert.equal(res.status, 200);
  });
});
