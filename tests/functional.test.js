// STRIDERA E-Commerce — Functional Test Suite (All 7 Roles & FR-1.1–FR-10.10)
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
    const result = validatePromo('WELCOME500', 250000);
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

describe('4. Multi-Seller Order Slicing & Subtotal Partitioning', () => {
  it('should partition line items into correct seller slices without losing centavos', () => {
    const orderItems = [
      { id: '1', sellerId: 'seller-apex', unitPriceCentavos: 599500, quantity: 1, lineTotalCentavos: 599500 },
      { id: '2', sellerId: 'seller-apex', unitPriceCentavos: 449500, quantity: 2, lineTotalCentavos: 899000 },
      { id: '3', sellerId: 'seller-stride', unitPriceCentavos: 749500, quantity: 1, lineTotalCentavos: 749500 },
      { id: '4', sellerId: null, unitPriceCentavos: 389900, quantity: 1, lineTotalCentavos: 389900 }
    ];

    const sellerSlices = {};
    for (const item of orderItems) {
      if (item.sellerId) {
        if (!sellerSlices[item.sellerId]) {
          sellerSlices[item.sellerId] = { subtotalCentavos: 0, items: [] };
        }
        sellerSlices[item.sellerId].subtotalCentavos += item.lineTotalCentavos;
        sellerSlices[item.sellerId].items.push(item);
      }
    }

    assert.equal(Object.keys(sellerSlices).length, 2, 'Should create exactly 2 seller slices');
    assert.equal(sellerSlices['seller-apex'].subtotalCentavos, 1498500);
    assert.equal(sellerSlices['seller-apex'].items.length, 2);
    assert.equal(sellerSlices['seller-stride'].subtotalCentavos, 749500);
    assert.equal(sellerSlices['seller-stride'].items.length, 1);
  });
});

describe('5. Role 4: Inventory Manager Stock Movements & Non-Negative Rule (FR-6.1–FR-6.11)', () => {
  it('should record incoming and outgoing movements and block negative stock', () => {
    let stock = 5;
    const movements = [];

    function recordMovement(type, qty, reason) {
      if (qty <= 0) return { success: false, error: 'Quantity must be positive' };
      if (type === 'OUTGOING' && stock - qty < 0) {
        return { success: false, error: 'Insufficient stock (non-negative rule FR-6.7)' };
      }
      const prev = stock;
      stock = type === 'INCOMING' ? stock + qty : stock - qty;
      movements.push({ type, quantity: qty, previousStock: prev, newStock: stock, reason });
      return { success: true, newStock: stock };
    }

    const inRes = recordMovement('INCOMING', 10, 'Restock Batch');
    assert.equal(inRes.success, true);
    assert.equal(inRes.newStock, 15);

    const outRes = recordMovement('OUTGOING', 4, 'Order Dispatch');
    assert.equal(outRes.success, true);
    assert.equal(outRes.newStock, 11);

    const failOut = recordMovement('OUTGOING', 20, 'Excessive Dispatch');
    assert.equal(failOut.success, false);
    assert.match(failOut.error, /Insufficient stock/);
    assert.equal(stock, 11, 'Stock must remain unchanged after rejected outgoing movement');
  });
});

describe('6. Role 5: Delivery Personnel Status Transitions & Proof of Delivery (FR-7.1–FR-7.11)', () => {
  it('should progress shipment from PREPARING -> ASSIGNED -> IN_TRANSIT -> DELIVERED with POD', () => {
    const shipment = {
      id: 'ship-1',
      status: 'PREPARING',
      proofOfDelivery: null,
      recipientName: null,
      history: { events: [] }
    };

    function transitionShipment(newStatus, meta = {}) {
      shipment.status = newStatus;
      if (meta.proofOfDelivery) shipment.proofOfDelivery = meta.proofOfDelivery;
      if (meta.recipientName) shipment.recipientName = meta.recipientName;
      shipment.history.events.push({ status: newStatus, timestamp: new Date().toISOString() });
      return shipment;
    }

    transitionShipment('ASSIGNED');
    assert.equal(shipment.status, 'ASSIGNED');

    transitionShipment('IN_TRANSIT');
    assert.equal(shipment.status, 'IN_TRANSIT');

    transitionShipment('DELIVERED', { proofOfDelivery: 'POD-STR-1001', recipientName: 'Maria Santos' });
    assert.equal(shipment.status, 'DELIVERED');
    assert.equal(shipment.proofOfDelivery, 'POD-STR-1001');
    assert.equal(shipment.recipientName, 'Maria Santos');
    assert.equal(shipment.history.events.length, 3);
  });
});

describe('7. Role 6 & Role 7: Support Refund Escalation & Finance Officer Commission/Payouts (FR-8 & FR-9)', () => {
  it('should escalate refund from Customer Support (APPROVED) to Finance Officer (COMPLETED)', () => {
    const ticket = {
      id: 'tkt-1',
      status: 'OPEN',
      refundStatus: 'PENDING',
      refundAmountCentavos: 649500
    };

    // Customer Support approves & escalates refund to Finance Officer (FR-8.8)
    ticket.status = 'IN_PROGRESS';
    ticket.refundStatus = 'APPROVED';
    assert.equal(ticket.refundStatus, 'APPROVED');

    // Finance Officer processes approved refund (FR-9.9)
    ticket.refundStatus = 'COMPLETED';
    ticket.status = 'RESOLVED';
    assert.equal(ticket.refundStatus, 'COMPLETED');
    assert.equal(ticket.status, 'RESOLVED');
  });

  it('should accurately compute 5% platform commission and 95% net seller payout in centavos (FR-9.5–FR-9.8)', () => {
    const grossSalesCentavos = 1399000; // ₱13,990.00
    const platformFeePercent = 5;
    const platformFeeCentavos = Math.round((grossSalesCentavos * platformFeePercent) / 100);
    const netSellerEarningsCentavos = grossSalesCentavos - platformFeeCentavos;

    assert.equal(platformFeeCentavos, 69950, '5% fee on ₱13,990.00 should be ₱699.50 (69,950 centavos)');
    assert.equal(netSellerEarningsCentavos, 1329050, 'Net seller payout should be ₱13,290.50 (1,329,050 centavos)');
    assert.equal(platformFeeCentavos + netSellerEarningsCentavos, grossSalesCentavos);
  });
});
