// Order Routes — Multi-Seller Checkout, Order Creation, Order History, Receipt Confirmation & Cancellation (FR-3.1 to FR-3.12)
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticate, optionalAuth } = require('../middleware/auth.middleware');
const { createError } = require('../middleware/error.middleware');
const { body, validationResult } = require('express-validator');

/**
 * Generate human-readable order number: STR-YYYYMMDD-XXXXX
 */
function generateOrderNumber() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `STR-${dateStr}-${rand}`;
}

// POST /api/orders — Create order from cart (checkout)
router.post('/', [
  optionalAuth,
  body('shippingFullName')
    .trim()
    .notEmpty()
    .withMessage('Full name required')
    .matches(/^[A-Za-z\s\-'.]+$/)
    .withMessage('Full name must contain only letters'),
  body('shippingPhone')
    .trim()
    .notEmpty()
    .withMessage('Phone required')
    .matches(/^\+63 9\d{2}-\d{3}-\d{4}$/)
    .withMessage('Mobile number must be in Philippine international format: +63 9XX-XXX-YYYY (e.g. +63 917-123-4567)'),
  body('shippingAddressLine1').trim().notEmpty().withMessage('Address line 1 required'),
  body('shippingCity').trim().notEmpty().withMessage('City required'),
  body('shippingProvince').trim().notEmpty().withMessage('Province required'),
  body('shippingPostalCode')
    .trim()
    .notEmpty()
    .withMessage('Postal code required')
    .matches(/^\d{4}$/)
    .withMessage('Philippine postal code must be 4 digits (e.g. 1000, 1200)'),
  body('guestEmail')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Valid email required')
    .custom(val => {
      if (val && !val.toLowerCase().endsWith('@gmail.com')) {
        throw new Error('Only @gmail.com email addresses are accepted');
      }
      return true;
    }),
  body('promotionCode').optional().trim(),
  body('paymentMethod').optional().trim(),
  body('notes').optional().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const userId = req.user?.id || null;
    const sessionId = req.cookies?.cart_session || req.headers['x-cart-session'] || null;
    const {
      shippingFullName, shippingPhone, shippingAddressLine1,
      shippingAddressLine2, shippingCity, shippingProvince,
      shippingPostalCode, shippingCountry, guestEmail,
      promotionCode, notes, paymentMethod = 'gcash'
    } = req.body;

    if (!userId && !guestEmail) {
      return res.status(400).json({ success: false, message: 'Email is required for guest checkout' });
    }

    let cart;
    if (userId) {
      cart = await prisma.cart.findFirst({
        where: { userId },
        include: { items: { include: { productVariant: { include: { product: true } } } } }
      });
    } else if (sessionId) {
      cart = await prisma.cart.findFirst({
        where: { sessionId },
        include: { items: { include: { productVariant: { include: { product: true } } } } }
      });
    }

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    const result = await prisma.$transaction(async (tx) => {
      let subtotalCentavos = 0;
      const orderItems = [];

      for (const item of cart.items) {
        const variant = await tx.productVariant.findUnique({
          where: { id: item.productVariantId },
          include: { product: true }
        });

        if (!variant || !variant.isActive || !variant.product.isActive || variant.product.status === 'ARCHIVED') {
          throw createError(`Product "${variant?.product?.name || 'Unknown'}" is no longer available`, 400);
        }

        if (variant.stockQuantity < item.quantity) {
          throw createError(
            `Insufficient stock for ${variant.product.name} (${variant.size}/${variant.color}): only ${variant.stockQuantity} available`,
            400
          );
        }

        const unitPriceCentavos = variant.priceOverrideCentavos || variant.product.basePriceCentavos;
        const lineTotalCentavos = unitPriceCentavos * item.quantity;
        subtotalCentavos += lineTotalCentavos;

        orderItems.push({
          productVariantId: variant.id,
          productName: variant.product.name,
          variantSku: variant.variantSku,
          size: variant.size,
          color: variant.color,
          unitPriceCentavos,
          quantity: item.quantity,
          lineTotalCentavos,
          _sellerId: variant.product.sellerId || null
        });
        // Note (D9): Stock is validated here at checkout and atomically decremented inside finalizePayment() upon payment confirmation.
      }

      let discountTotalCentavos = 0;
      let promotionId = null;

      if (promotionCode) {
        const promo = await tx.promotion.findUnique({ where: { code: promotionCode.toUpperCase() } });

        if (!promo || !promo.isActive) {
          throw createError('Invalid or expired promotion code', 400);
        }

        const now = new Date();
        if (promo.startsAt && now < promo.startsAt) throw createError('Promotion not yet active', 400);
        if (promo.expiresAt && now > promo.expiresAt) throw createError('Promotion has expired', 400);
        if (promo.usageLimit && promo.timesUsed >= promo.usageLimit) throw createError('Promotion usage limit reached', 400);
        if (promo.minOrderCentavos && subtotalCentavos < promo.minOrderCentavos) {
          throw createError(`Minimum order of ₱${(promo.minOrderCentavos / 100).toFixed(2)} required`, 400);
        }

        if (promo.discountType === 'PERCENTAGE') {
          discountTotalCentavos = Math.floor(subtotalCentavos * promo.discountValue / 100);
        } else {
          discountTotalCentavos = promo.discountValue;
        }

        if (promo.maxDiscountCentavos) {
          discountTotalCentavos = Math.min(discountTotalCentavos, promo.maxDiscountCentavos);
        }
        discountTotalCentavos = Math.min(discountTotalCentavos, subtotalCentavos);

        await tx.promotion.update({
          where: { id: promo.id },
          data: { timesUsed: { increment: 1 } }
        });

        promotionId = promo.id;
      }

      // Check PlatformConfig for shipping fee & free shipping threshold
      const config = await tx.platformConfig.findUnique({ where: { id: 'default' } });
      const baseShipping = config ? config.shippingFeeCentavos : parseInt(process.env.SHIPPING_FEE_CENTAVOS || '15000');
      const freeThreshold = config ? config.freeShippingThresholdCentavos : 300000;
      const shippingFeeCentavos = subtotalCentavos >= freeThreshold ? 0 : baseShipping;
      const grandTotalCentavos = subtotalCentavos - discountTotalCentavos + shippingFeeCentavos;

      const order = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          userId,
          guestEmail: guestEmail || null,
          orderStatus: 'PENDING',
          paymentStatus: 'UNPAID',
          paymentMethod: ['gcash', 'maya', 'paypal'].includes(String(paymentMethod).toLowerCase())
            ? String(paymentMethod).toLowerCase()
            : 'gcash',
          shippingStatus: 'UNFULFILLED',
          subtotalCentavos,
          discountTotalCentavos,
          shippingFeeCentavos,
          grandTotalCentavos,
          shippingFullName,
          shippingPhone,
          shippingAddressLine1,
          shippingAddressLine2: shippingAddressLine2 || null,
          shippingCity,
          shippingProvince,
          shippingPostalCode,
          shippingCountry: shippingCountry || 'PH',
          promotionId,
          notes: notes || null,
          items: {
            create: orderItems.map(({ _sellerId, ...rest }) => rest)
          }
        },
        include: { items: true }
      });

      // Split order into seller slices (SellerOrder per distinct merchant, FR-5.9)
      const sellerMap = new Map();
      for (const item of orderItems) {
        if (item._sellerId) {
          if (!sellerMap.has(item._sellerId)) {
            sellerMap.set(item._sellerId, []);
          }
          sellerMap.get(item._sellerId).push(item);
        }
      }

      for (const [sellerId, sItems] of sellerMap.entries()) {
        const sliceSubtotal = sItems.reduce((acc, it) => acc + it.lineTotalCentavos, 0);
        const sellerOrder = await tx.sellerOrder.create({
          data: {
            orderId: order.id,
            sellerId: sellerId,
            subtotalCentavos: sliceSubtotal,
            status: 'PENDING'
          }
        });

        await tx.orderItem.updateMany({
          where: {
            orderId: order.id,
            productVariantId: { in: sItems.map(it => it.productVariantId) }
          },
          data: { sellerOrderId: sellerOrder.id }
        });
      }

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return order;
    });

    res.status(201).json({
      success: true,
      data: {
        ...result,
        subtotalFormatted: `₱${(result.subtotalCentavos / 100).toFixed(2)}`,
        discountFormatted: `₱${(result.discountTotalCentavos / 100).toFixed(2)}`,
        shippingFormatted: `₱${(result.shippingFeeCentavos / 100).toFixed(2)}`,
        grandTotalFormatted: `₱${(result.grandTotalCentavos / 100).toFixed(2)}`
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders — List user's orders (FR-3.10)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: { userId: req.user.id },
        include: {
          items: true,
          payments: { select: { id: true, status: true, provider: true, paymentMethod: true, isDemo: true, verifiedAt: true } },
          shipments: true,
          sellerOrders: {
            include: {
              seller: { select: { id: true, storeName: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.order.count({ where: { userId: req.user.id } })
    ]);

    res.json({
      success: true,
      data: orders.map(o => ({
        ...o,
        grandTotalFormatted: `₱${(o.grandTotalCentavos / 100).toFixed(2)}`
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:orderNumber — Get order details with Seller slices, Shipments & Support Tickets (FR-3.11)
router.get('/:orderNumber', optionalAuth, async (req, res, next) => {
  try {
    const { orderNumber } = req.params;

    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: {
        items: true,
        payments: {
          select: {
            id: true, provider: true, paymentMethod: true, providerPaymentId: true, status: true, amountCentavos: true,
            currency: true, isDemo: true, verifiedAt: true, financeVerified: true, createdAt: true
          }
        },
        shipments: {
          include: {
            deliveryPersonnel: { select: { id: true, firstName: true, lastName: true, phone: true } },
            sellerOrder: { include: { seller: { select: { id: true, storeName: true } } } }
          }
        },
        sellerOrders: {
          include: {
            seller: { select: { id: true, storeName: true, email: true } },
            items: true
          }
        },
        supportTickets: {
          include: {
            messages: { orderBy: { createdAt: 'asc' } }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const userId = req.user?.id;
    const role = req.user?.role;
    const isStaff = ['ADMIN', 'CUSTOMER_SUPPORT', 'DELIVERY_PERSONNEL', 'FINANCE_OFFICER', 'INVENTORY_MANAGER'].includes(role);
    const isSellerInOrder = role === 'SELLER' && order.sellerOrders.some(so => so.sellerId === userId);

    if (!isStaff && !isSellerInOrder && order.userId !== userId) {
      const emailCheck = req.query.email;
      if (!order.guestEmail || order.guestEmail !== emailCheck) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    res.json({
      success: true,
      data: {
        ...order,
        subtotalFormatted: `₱${(order.subtotalCentavos / 100).toFixed(2)}`,
        discountFormatted: `₱${(order.discountTotalCentavos / 100).toFixed(2)}`,
        shippingFormatted: `₱${(order.shippingFeeCentavos / 100).toFixed(2)}`,
        grandTotalFormatted: `₱${(order.grandTotalCentavos / 100).toFixed(2)}`
      }
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/orders/:orderNumber/confirm-receipt — Shopper confirms package receipt (FR-7.7 & Process Flow 1)
router.patch('/:orderNumber/confirm-receipt', authenticate, async (req, res, next) => {
  try {
    const { orderNumber } = req.params;
    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: { shipments: true }
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const now = new Date();
    const updatedOrder = await prisma.$transaction(async (tx) => {
      const o = await tx.order.update({
        where: { id: order.id },
        data: {
          receivedConfirmedAt: now,
          orderStatus: 'DELIVERED',
          shippingStatus: 'DELIVERED'
        }
      });

      await tx.sellerOrder.updateMany({
        where: { orderId: order.id, status: { not: 'CANCELLED' } },
        data: { status: 'DELIVERED', deliveredAt: now }
      });

      for (const s of order.shipments) {
        const prevEvents = Array.isArray(s.history?.events) ? s.history.events : [];
        await tx.shipment.update({
          where: { id: s.id },
          data: {
            status: 'DELIVERED',
            deliveredAt: s.deliveredAt || now,
            recipientName: s.recipientName || `${req.user.firstName} ${req.user.lastName}`,
            history: {
              events: [
                ...prevEvents,
                {
                  status: 'DELIVERED',
                  note: 'Customer confirmed package receipt',
                  actor: req.user.email,
                  timestamp: now.toISOString()
                }
              ]
            }
          }
        });
      }

      return o;
    });

    res.json({
      success: true,
      message: 'Order receipt confirmed. Thank you for shopping with STRIDERA!',
      data: updatedOrder
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/orders/:orderNumber/cancel — Cancel a pending or unshipped order (FR-3.12)
router.patch('/:orderNumber/cancel', authenticate, async (req, res, next) => {
  try {
    const { orderNumber } = req.params;

    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: { items: true }
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.userId !== req.user.id && !['ADMIN', 'CUSTOMER_SUPPORT'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (!['PENDING', 'CONFIRMED'].includes(order.orderStatus)) {
      return res.status(400).json({ success: false, message: `Cannot cancel order in ${order.orderStatus} status` });
    }

    await prisma.$transaction(async (tx) => {
      // Restore stock only if it was already decremented upon payment (D9)
      if (order.stockDecremented) {
        for (const item of order.items) {
          if (item.fulfillmentStatus === 'CANCELLED' || item.stockConflict) continue;
          await tx.productVariant.update({
            where: { id: item.productVariantId },
            data: { stockQuantity: { increment: item.quantity } }
          });

          const variant = await tx.productVariant.findUnique({ where: { id: item.productVariantId } });
          await tx.stockMovement.create({
            data: {
              productVariantId: item.productVariantId,
              quantityChange: item.quantity,
              stockAfter: variant.stockQuantity,
              movementType: 'INCOMING',
              reason: 'ORDER_CANCELLED',
              referenceId: order.orderNumber
            }
          });
        }
      }

      await tx.orderItem.updateMany({
        where: { orderId: order.id },
        data: { fulfillmentStatus: 'CANCELLED' }
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          orderStatus: 'CANCELLED',
          paymentStatus: order.paymentStatus === 'PAID' ? 'REFUNDED' : order.paymentStatus
        }
      });

      await tx.sellerOrder.updateMany({
        where: { orderId: order.id },
        data: { status: 'CANCELLED', notes: 'Parent order cancelled' }
      });
    });

    res.json({ success: true, message: order.stockDecremented ? 'Order cancelled and stock restored' : 'Order cancelled' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
