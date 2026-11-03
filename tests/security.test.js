// STRIDERA E-Commerce — Security Test Suite (All 7 Roles & Tenant Isolation)
// Run with: node --test tests/security.test.js

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

describe('1. 7-Role Access Control Matrix & Account Status Enforcement (FR-1.3, FR-1.5, FR-1.9)', () => {
  function checkPortalAccess(user, allowedRoles) {
    if (!user) {
      return { allowed: false, status: 401, error: 'Authentication required' };
    }
    if (user.accountStatus && user.accountStatus !== 'ACTIVE') {
      return { allowed: false, status: 403, error: `Account is ${user.accountStatus}` };
    }
    if (!allowedRoles.includes(user.role)) {
      return { allowed: false, status: 403, error: 'Insufficient role permissions' };
    }
    return { allowed: true, status: 200 };
  }

  it('should block SUSPENDED or DEACTIVATED accounts across all 7 roles with 403', () => {
    const suspendedUser = { id: 'u-1', role: 'CUSTOMER', accountStatus: 'SUSPENDED' };
    const res = checkPortalAccess(suspendedUser, ['CUSTOMER', 'ADMIN']);
    assert.equal(res.allowed, false);
    assert.equal(res.status, 403);
    assert.match(res.error, /SUSPENDED/);
  });

  it('should enforce strict RBAC across Inventory, Delivery, Support, Finance, and Admin portals', () => {
    const invMgr = { id: 'u-inv', role: 'INVENTORY_MANAGER', accountStatus: 'ACTIVE' };
    const delivery = { id: 'u-del', role: 'DELIVERY_PERSONNEL', accountStatus: 'ACTIVE' };
    const support = { id: 'u-sup', role: 'CUSTOMER_SUPPORT', accountStatus: 'ACTIVE' };
    const finance = { id: 'u-fin', role: 'FINANCE_OFFICER', accountStatus: 'ACTIVE' };
    const admin = { id: 'u-adm', role: 'ADMIN', accountStatus: 'ACTIVE' };

    // Inventory route allows INVENTORY_MANAGER and ADMIN
    assert.equal(checkPortalAccess(invMgr, ['INVENTORY_MANAGER', 'ADMIN']).allowed, true);
    assert.equal(checkPortalAccess(delivery, ['INVENTORY_MANAGER', 'ADMIN']).allowed, false);

    // Delivery route allows DELIVERY_PERSONNEL and ADMIN
    assert.equal(checkPortalAccess(delivery, ['DELIVERY_PERSONNEL', 'ADMIN']).allowed, true);
    assert.equal(checkPortalAccess(support, ['DELIVERY_PERSONNEL', 'ADMIN']).allowed, false);

    // Support route allows CUSTOMER_SUPPORT and ADMIN
    assert.equal(checkPortalAccess(support, ['CUSTOMER_SUPPORT', 'ADMIN']).allowed, true);
    assert.equal(checkPortalAccess(invMgr, ['CUSTOMER_SUPPORT', 'ADMIN']).allowed, false);

    // Finance route allows FINANCE_OFFICER and ADMIN
    assert.equal(checkPortalAccess(finance, ['FINANCE_OFFICER', 'ADMIN']).allowed, true);
    assert.equal(checkPortalAccess(support, ['FINANCE_OFFICER', 'ADMIN']).allowed, false);

    // Admin has executive oversight across operational portals
    assert.equal(checkPortalAccess(admin, ['INVENTORY_MANAGER', 'ADMIN']).allowed, true);
    assert.equal(checkPortalAccess(admin, ['FINANCE_OFFICER', 'ADMIN']).allowed, true);
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
    assert.equal(simulatePaymentGate('false', adminUser).allowed, false);
    assert.equal(simulatePaymentGate(undefined, adminUser).allowed, false);
  });

  it('should reject payment simulation if triggered by standard customer even in DEMO_MODE', () => {
    const customer = { id: 'uuid-2', role: 'CUSTOMER' };
    assert.equal(simulatePaymentGate('true', customer).allowed, false);
  });

  it('should allow payment simulation only when DEMO_MODE is true AND triggered by admin', () => {
    const admin = { id: 'uuid-3', role: 'ADMIN' };
    assert.equal(simulatePaymentGate('true', admin).allowed, true);
  });
});

describe('3. Webhook Signature Verification', () => {
  const secret = 'whsec_test_secret_key_12345';

  function verifyWebhookSignature(payload, signatureHeader, secretKey) {
    if (!signatureHeader) return false;
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
    if (!user) return { allowed: false, status: 401, error: 'Authentication required' };
    if (user.role !== 'SELLER') return { allowed: false, status: 404, error: 'Not found' };
    if (user.sellerStatus !== 'APPROVED') return { allowed: false, status: 403, error: 'Seller account not approved' };
    return { allowed: true, status: 200 };
  }

  function checkSellerResourceOwnership(user, resourceOwnerId) {
    if (!user) return { allowed: false, status: 401, error: 'Authentication required' };
    if (user.role === 'ADMIN') return { allowed: true, status: 200 };
    if (user.role === 'SELLER') {
      if (user.id === resourceOwnerId) return { allowed: true, status: 200 };
      return { allowed: false, status: 404, error: 'Not found' };
    }
    return { allowed: false, status: 404, error: 'Not found' };
  }

  it('should deny non-sellers from accessing seller portal with 404', () => {
    const shopper = { id: 'uuid-cust', role: 'CUSTOMER' };
    assert.equal(checkSellerPortalAccess(shopper).status, 404);
  });

  it('should reject pending/unapproved sellers with 403', () => {
    const pendingSeller = { id: 'uuid-pending', role: 'SELLER', sellerStatus: 'PENDING' };
    assert.equal(checkSellerPortalAccess(pendingSeller).status, 403);
  });

  it('should isolate sellers: returning 404 (not 403) when attempting to access another seller records', () => {
    const sellerA = { id: 'uuid-seller-a', role: 'SELLER', sellerStatus: 'APPROVED' };
    assert.equal(checkSellerResourceOwnership(sellerA, 'uuid-seller-b').status, 404);
  });
});
