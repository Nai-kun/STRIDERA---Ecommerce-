// Order Routes — Checkout, order creation, order history
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticate, optionalAuth } = require('../middleware/auth.middleware');
const { createError } = require('../middleware/error.middleware');
const { body, param, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

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
  body('shippingFullName').trim().notEmpty().withMessage('Full name required'),
  body('shippingPhone').trim().notEmpty().withMessage('Phone required'),
  body('shippingAddressLine1').trim().notEmpty().withMessage('Address line 1 required'),
  body('shippingCity').trim().notEmpty().withMessage('City required'),
  body('shippingProvince').trim().notEmpty().withMessage('Province required'),
  body('shippingPostalCode').trim().notEmpty().withMessage('Postal code required'),
  body('guestEmail').optional().isEmail().withMessage('Valid email required'),
  body('promotionCode').optional().trim(),
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
      promotionCode, notes, addressId
    } = req.body;

    // Guest must provide email
    if (!userId && !guestEmail) {
      return res.status(400).json({ success: false, message: 'Email is required for guest checkout' });
    }

    // Find cart
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

    // Validate stock and compute server-side totals inside a transaction
    const result = await prisma.$transaction(async (tx) => {
      let subtotalCentavos = 0;
      const orderItems = [];

      for (const item of cart.items) {
        // Lock the variant row and check stock
        const variant = await tx.productVariant.findUnique({
          where: { id: item.productVariantId },
          include: { product: true }
        });

        if (!variant || !variant.isActive || !variant.product.isActive) {
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
          lineTotalCentavos
        });

        // Decrement stock
        const updated = await tx.productVariant.updateMany({
          where: { id: variant.id, stockQuantity: { gte: item.quantity } },
          data: { stockQuantity: { decrement: item.quantity } }
        });

        if (updated.count === 0) {
          throw createError(`Race condition: stock depleted for ${variant.product.name}`, 409);
        }

        // Record stock movement
        const afterVariant = await tx.productVariant.findUnique({ where: { id: variant.id } });
        await tx.stockMovement.create({
          data: {
            productVariantId: variant.id,
            quantityChange: -item.quantity,
            stockAfter: afterVariant.stockQuantity,
            reason: 'ORDER_PLACED'
          }
        });
      }

      // Apply promotion if provided
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

      // Configurable shipping fee (default ₱150.00)
      const shippingFeeCentavos = parseInt(process.env.SHIPPING_FEE_CENTAVOS || '15000');
      const grandTotalCentavos = subtotalCentavos - discountTotalCentavos + shippingFeeCentavos;

      // Create order
      const order = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          userId,
          guestEmail: guestEmail || null,
          orderStatus: 'PENDING',
          paymentStatus: 'UNPAID',
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
            create: orderItems
          }
        },
        include: { items: true }
      });

      // Clear the cart
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

// GET /api/orders — List user's orders
router.get('/', authenticate, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: { userId: req.user.id },
        include: {
          items: true,
          payments: { select: { id: true, status: true, provider: true, isDemo: true, verifiedAt: true } }
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

// GET /api/orders/:orderNumber — Get order details
router.get('/:orderNumber', optionalAuth, async (req, res, next) => {
  try {
    const { orderNumber } = req.params;

    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: {
        items: true,
        payments: {
          select: {
            id: true, provider: true, status: true, amountCentavos: true,
            currency: true, isDemo: true, verifiedAt: true, createdAt: true
          }
        },
        shipments: true
      }
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Verify access: owner, admin, or guest with matching email
    const userId = req.user?.id;
    const isAdmin = req.user?.role === 'ADMIN';
    if (!isAdmin && order.userId !== userId) {
      // Could be guest — they need to provide email via query param
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

// PATCH /api/orders/:orderNumber/cancel — Cancel a pending order
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

    if (order.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (order.orderStatus !== 'PENDING') {
      return res.status(400).json({ success: false, message: `Cannot cancel order in ${order.orderStatus} status` });
    }

    // Restore stock in a transaction
    await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
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
            reason: 'ORDER_CANCELLED'
          }
        });
      }

      await tx.order.update({
        where: { id: order.id },
        data: { orderStatus: 'CANCELLED' }
      });
    });

    res.json({ success: true, message: 'Order cancelled and stock restored' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
