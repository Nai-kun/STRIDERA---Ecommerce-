// STRIDERA E-Commerce — Functional Test Suite
// Run with: node --test tests/functional.test.js

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('1. Monetary Calculations & Minor Units (Centavos)', () => {
  it('should accurately calculate subtotal in integer centavos without floating-point errors', () => {
    const items = [
      { unitPriceCentavos: 459900, quantity: 2 }, // ₱4,599.00 x 2 = ₱9,198.00
      { unitPriceCentavos: 389900, quantity: 1 }, // ₱3,899.00 x 1 = ₱3,899.00
    ];

    const subtotal = items.reduce((acc, item) => acc + (item.unitPriceCentavos * item.quantity), 0);
    assert.equal(subtotal, 1309700, 'Subtotal should be exactly 1,309,700 centavos (₱13,097.00)');
  });

  it('should calculate flat discounts correctly without reducing total below zero', () => {
    const subtotal = 50000; // ₱500.00
    const flatDiscount = 60000; // ₱600.00 promo
    const appliedDiscount = Math.min(subtotal, flatDiscount);
    const total = subtotal - appliedDiscount;

    assert.equal(appliedDiscount, 50000);
    assert.equal(total, 0, 'Grand total must never be negative');
  });

  it('should calculate percentage discount correctly with floor rounding to centavos', () => {
    const subtotal = 459900; // ₱4,599.00
    const percentage = 10; // 10%
    const discount = Math.floor((subtotal * percentage) / 100); // 45990 centavos = ₱459.90
    const total = subtotal - discount;

    assert.equal(discount, 45990);
    assert.equal(total, 413910);
  });
});

describe('2. Promo Code Engine Rules', () => {
  const promoCodes = {
    'STRIDE10': { type: 'PERCENTAGE', value: 10, minOrder: 0, isActive: true },
    'WELCOME500': { type: 'FLAT', value: 50000, minOrder: 300000, isActive: true }, // Min ₱3,000
    'EXPIRED50': { type: 'PERCENTAGE', value: 50, minOrder: 0, isActive: false },
  };

  function validatePromo(code, subtotalCentavos) {
    const promo = promoCodes[code?.toUpperCase()];
    if (!promo || !promo.isActive) {
      return { valid: false, error: 'Invalid or expired promo code' };
    }
    if (promo.minOrder && subtotalCentavos < promo.minOrder) {
      return { valid: false, error: `Minimum order of ₱${(promo.minOrder / 100).toFixed(2)} required` };
    }

    let discount = 0;
    if (promo.type === 'PERCENTAGE') {
      discount = Math.floor((subtotalCentavos * promo.value) / 100);
    } else if (promo.type === 'FLAT') {
      discount = Math.min(subtotalCentavos, promo.value);
    }

    return { valid: true, discountCentavos: discount };
  }

  it('should accept valid percentage promo code', () => {
    const result = validatePromo('STRIDE10', 400000);
    assert.equal(result.valid, true);
    assert.equal(result.discountCentavos, 40000);
  });

  it('should reject flat discount promo if order subtotal is below minimum threshold', () => {
    const result = validatePromo('WELCOME500', 250000); // ₱2,500 < ₱3,000 min
    assert.equal(result.valid, false);
    assert.match(result.error, /Minimum order/);
  });

  it('should reject expired or deactivated promo code', () => {
    const result = validatePromo('EXPIRED50', 500000);
    assert.equal(result.valid, false);
    assert.equal(result.error, 'Invalid or expired promo code');
  });
});

describe('3. Order & Stock Validation Rules', () => {
  it('should reject quantities less than 1 or non-integers', () => {
    const isQtyValid = (qty) => Number.isInteger(qty) && qty > 0;
    assert.equal(isQtyValid(1), true);
    assert.equal(isQtyValid(5), true);
    assert.equal(isQtyValid(0), false);
    assert.equal(isQtyValid(-3), false);
    assert.equal(isQtyValid(1.5), false);
  });

  it('should validate Philippine mobile numbers properly', () => {
    const isValidPHPhone = (phone) => /^(09|\+639)\d{9}$/.test(phone?.replace(/[\s-]/g, ''));
    assert.equal(isValidPHPhone('09171234567'), true);
    assert.equal(isValidPHPhone('+63 917 123 4567'), true);
    assert.equal(isValidPHPhone('12345'), false);
    assert.equal(isValidPHPhone(''), false);
  });

  it('should correctly build idempotency keys for checkout session requests', () => {
    const crypto = require('crypto');
    const orderNumber = 'STR-20261028-001';
    const key = crypto.createHash('sha256').update(orderNumber + '-v1').digest('hex');
    assert.equal(typeof key, 'string');
    assert.equal(key.length, 64);
  });
});
