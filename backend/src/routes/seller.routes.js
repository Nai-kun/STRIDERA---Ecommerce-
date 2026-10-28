// Seller Routes — Multi-seller portal endpoints
// Enforces tenant isolation: all queries scoped to req.user.id, returns 404 for alien records.
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticate, requireSeller } = require('../middleware/auth.middleware');
const { createError } = require('../middleware/error.middleware');
const { body, param, query, validationResult } = require('express-validator');

// All seller routes require authentication and APPROVED seller status
router.use(authenticate, requireSeller);

// ────────────────────────────────────────────────
// 1. SELLER PROFILE & BRAND
// ────────────────────────────────────────────────

// GET /api/seller/profile
router.get('/profile', async (req, res, next) => {
  try {
    const seller = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        sellerStatus: true,
        storeName: true,
        storeDescription: true,
        createdAt: true,
        brand: {
          select: { id: true, name: true, slug: true, description: true, logoUrl: true, isActive: true }
        }
      }
    });

    if (!seller) return res.status(404).json({ success: false, message: 'Seller not found' });
    res.json({ success: true, data: seller });
  } catch (err) {
    next(err);
  }
});

// PUT /api/seller/profile
router.put('/profile', [
  body('storeName').optional().trim().notEmpty().withMessage('Store name cannot be empty'),
  body('storeDescription').optional().trim(),
  body('phone').optional().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { storeName, storeDescription, phone } = req.body;
    const updateData = {};
    if (storeName) updateData.storeName = storeName;
    if (storeDescription !== undefined) updateData.storeDescription = storeDescription;
    if (phone !== undefined) updateData.phone = phone;

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        sellerStatus: true,
        storeName: true,
        storeDescription: true
      }
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────
// 2. SELLER DASHBOARD METRICS
// ────────────────────────────────────────────────

// GET /api/seller/dashboard
router.get('/dashboard', async (req, res, next) => {
  try {
    const sellerId = req.user.id;

    const [
      totalProducts,
      totalOrders,
      shippedOrders,
      revenueResult,
      lowStockVariants,
      recentOrders
    ] = await Promise.all([
      prisma.product.count({ where: { sellerId, isActive: true } }),
      prisma.sellerOrder.count({ where: { sellerId } }),
      prisma.sellerOrder.count({ where: { sellerId, status: 'SHIPPED' } }),
      prisma.sellerOrder.aggregate({
        where: { sellerId, status: { in: ['PAID', 'SHIPPED', 'DELIVERED'] } },
        _sum: { subtotalCentavos: true }
      }),
      prisma.productVariant.findMany({
        where: {
          product: { sellerId, isActive: true },
          stockQuantity: { lte: 5 },
          isActive: true
        },
        include: { product: { select: { name: true, sku: true } } },
        orderBy: { stockQuantity: 'asc' },
        take: 10
      }),
      prisma.sellerOrder.findMany({
        where: { sellerId },
        include: {
          order: { select: { orderNumber: true, createdAt: true, shippingCity: true, shippingProvince: true } },
          items: { select: { productName: true, quantity: true, lineTotalCentavos: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 5
      })
    ]);

    const totalRevenueCentavos = revenueResult._sum.subtotalCentavos || 0;

    res.json({
      success: true,
      data: {
        totalProducts,
        totalOrders,
        shippedOrders,
        pendingOrders: totalOrders - shippedOrders,
        totalRevenueCentavos,
        totalRevenueFormatted: `₱${(totalRevenueCentavos / 100).toFixed(2)}`,
        lowStockAlerts: lowStockVariants.map(v => ({
          variantId: v.id,
          productName: v.product.name,
          sku: v.product.sku,
          variantSku: v.variantSku,
          size: v.size,
          color: v.color,
          stockQuantity: v.stockQuantity
        })),
        recentOrders: recentOrders.map(so => ({
          id: so.id,
          orderNumber: so.order.orderNumber,
          status: so.status,
          subtotalFormatted: `₱${(so.subtotalCentavos / 100).toFixed(2)}`,
          itemCount: so.items.reduce((acc, it) => acc + it.quantity, 0),
          createdAt: so.createdAt
        }))
      }
    });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────
// 3. SELLER PRODUCT MANAGEMENT (Scoped to Seller)
// ────────────────────────────────────────────────

// GET /api/seller/products
router.get('/products', async (req, res, next) => {
  try {
    const sellerId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const search = req.query.search?.trim();
    const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;

    const where = { sellerId };
    if (isActive !== undefined) where.isActive = isActive;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          brand: { select: { id: true, name: true, slug: true } },
          images: { where: { isPrimary: true }, take: 1 },
          variants: { select: { id: true, size: true, color: true, stockQuantity: true, isActive: true } },
          _count: { select: { variants: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.product.count({ where })
    ]);

    res.json({
      success: true,
      data: products.map(p => ({
        ...p,
        basePriceFormatted: `₱${(p.basePriceCentavos / 100).toFixed(2)}`,
        totalStock: p.variants.reduce((sum, v) => sum + v.stockQuantity, 0)
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/seller/products/:id
router.get('/products/:id', async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, sellerId: req.user.id },
      include: {
        category: true,
        brand: true,
        images: { orderBy: { sortOrder: 'asc' } },
        variants: { orderBy: [{ size: 'asc' }, { color: 'asc' }] }
      }
    });

    if (!product) {
      // Per skill §4: Return 404, not 403, for another seller's records
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
});

// POST /api/seller/products — Create product for this seller
router.post('/products', [
  body('name').trim().notEmpty().withMessage('Product name required'),
  body('sku').trim().notEmpty().withMessage('SKU required'),
  body('categoryId').isUUID().withMessage('Valid category ID required'),
  body('basePriceCentavos').isInt({ min: 100 }).withMessage('Base price must be at least ₱1.00 (100 centavos)'),
  body('audience').isIn(['MEN', 'WOMEN', 'UNISEX']).withMessage('Valid audience required'),
  body('shoeType').isIn(['RUNNING', 'LIFESTYLE', 'BASKETBALL', 'TRAINING']).withMessage('Valid shoe type required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const sellerId = req.user.id;

    // Retrieve seller's assigned brand if any
    const seller = await prisma.user.findUnique({
      where: { id: sellerId },
      include: { brand: true }
    });

    const {
      name, sku, categoryId, description, features,
      basePriceCentavos, compareAtPriceCentavos, audience, shoeType
    } = req.body;

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now();

    const existingSku = await prisma.product.findUnique({ where: { sku } });
    if (existingSku) return res.status(400).json({ success: false, message: 'SKU already exists' });

    const product = await prisma.product.create({
      data: {
        name,
        sku,
        slug,
        categoryId,
        sellerId,
        brandId: seller.brand?.id || null,
        description: description || null,
        features: features || null,
        basePriceCentavos,
        compareAtPriceCentavos: compareAtPriceCentavos || null,
        audience,
        shoeType,
        isFeatured: false,
        isActive: true
      },
      include: { category: true, brand: true, variants: true, images: true }
    });

    await prisma.auditLog.create({
      data: {
        userId: sellerId,
        action: 'SELLER_CREATE_PRODUCT',
        entityType: 'Product',
        entityId: product.id,
        newValues: { name, sku, sellerId },
        ipAddress: req.ip
      }
    });

    res.status(201).json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
});

// PUT /api/seller/products/:id — Update own product
router.put('/products/:id', async (req, res, next) => {
  try {
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, sellerId: req.user.id }
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const {
      name, categoryId, description, features, basePriceCentavos,
      compareAtPriceCentavos, audience, shoeType, isActive
    } = req.body;

    const updated = await prisma.product.update({
      where: { id: existing.id },
      data: {
        ...(name && { name }),
        ...(categoryId && { categoryId }),
        ...(description !== undefined && { description }),
        ...(features !== undefined && { features }),
        ...(basePriceCentavos !== undefined && { basePriceCentavos }),
        ...(compareAtPriceCentavos !== undefined && { compareAtPriceCentavos }),
        ...(audience && { audience }),
        ...(shoeType && { shoeType }),
        ...(isActive !== undefined && { isActive })
      },
      include: { category: true, brand: true, variants: true }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'SELLER_UPDATE_PRODUCT',
        entityType: 'Product',
        entityId: existing.id,
        newValues: req.body,
        ipAddress: req.ip
      }
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/seller/products/:id — Deactivate own product
router.delete('/products/:id', async (req, res, next) => {
  try {
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, sellerId: req.user.id }
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    await prisma.product.update({
      where: { id: existing.id },
      data: { isActive: false }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'SELLER_DEACTIVATE_PRODUCT',
        entityType: 'Product',
        entityId: existing.id,
        ipAddress: req.ip
      }
    });

    res.json({ success: true, message: 'Product deactivated' });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────
// 4. SELLER VARIANT & STOCK MANAGEMENT
// ────────────────────────────────────────────────

// POST /api/seller/products/:id/variants
router.post('/products/:id/variants', [
  body('variantSku').trim().notEmpty().withMessage('Variant SKU required'),
  body('size').trim().notEmpty().withMessage('Size required'),
  body('color').trim().notEmpty().withMessage('Color required'),
  body('stockQuantity').isInt({ min: 0 }).withMessage('Stock must be at least 0')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const product = await prisma.product.findFirst({
      where: { id: req.params.id, sellerId: req.user.id }
    });

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const { variantSku, size, color, colorHex, priceOverrideCentavos, stockQuantity } = req.body;

    const existingSku = await prisma.productVariant.findUnique({ where: { variantSku } });
    if (existingSku) return res.status(400).json({ success: false, message: 'Variant SKU already exists' });

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        variantSku,
        size,
        color,
        colorHex: colorHex || null,
        priceOverrideCentavos: priceOverrideCentavos || null,
        stockQuantity
      }
    });

    if (stockQuantity > 0) {
      await prisma.stockMovement.create({
        data: {
          productVariantId: variant.id,
          quantityChange: stockQuantity,
          stockAfter: stockQuantity,
          reason: 'SELLER_INITIAL_STOCK',
          referenceId: req.user.id
        }
      });
    }

    res.status(201).json({ success: true, data: variant });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/seller/variants/:variantId/stock — Adjust stock for own variant
router.patch('/variants/:variantId/stock', [
  body('quantityChange').isInt().withMessage('Quantity change must be an integer'),
  body('reason').trim().notEmpty().withMessage('Adjustment reason is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { quantityChange, reason } = req.body;

    // Verify ownership through product.sellerId
    const variant = await prisma.productVariant.findUnique({
      where: { id: req.params.variantId },
      include: { product: true }
    });

    if (!variant || variant.product.sellerId !== req.user.id) {
      return res.status(404).json({ success: false, message: 'Variant not found' });
    }

    const newStock = variant.stockQuantity + quantityChange;
    if (newStock < 0) {
      return res.status(400).json({
        success: false,
        message: `Adjustment would result in negative stock (current: ${variant.stockQuantity}, delta: ${quantityChange})`
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.productVariant.update({
        where: { id: variant.id },
        data: { stockQuantity: newStock }
      });

      await tx.stockMovement.create({
        data: {
          productVariantId: variant.id,
          quantityChange,
          stockAfter: newStock,
          reason: `SELLER_ADJUSTMENT: ${reason.toUpperCase().replace(/\s+/g, '_')}`,
          referenceId: req.user.id
        }
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'SELLER_ADJUST_STOCK',
          entityType: 'ProductVariant',
          entityId: variant.id,
          oldValues: { stockQuantity: variant.stockQuantity },
          newValues: { stockQuantity: newStock, quantityChange, reason },
          ipAddress: req.ip
        }
      });

      return updated;
    });

    res.json({
      success: true,
      data: {
        variantId: variant.id,
        variantSku: variant.variantSku,
        stockBefore: variant.stockQuantity,
        stockAfter: result.stockQuantity,
        quantityChange
      }
    });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────
// 5. SELLER ORDERS & FULFILLMENT (Per DFD 5.0)
// ────────────────────────────────────────────────

// GET /api/seller/orders — List own order slices
router.get('/orders', async (req, res, next) => {
  try {
    const sellerId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const status = req.query.status;

    const where = { sellerId };
    if (status) where.status = status;

    const [orders, total] = await Promise.all([
      prisma.sellerOrder.findMany({
        where,
        include: {
          order: {
            select: {
              orderNumber: true,
              paymentStatus: true,
              createdAt: true,
              shippingFullName: true,
              shippingCity: true,
              shippingProvince: true,
              shippingCountry: true
            }
          },
          items: {
            select: {
              id: true,
              productName: true,
              variantSku: true,
              size: true,
              color: true,
              unitPriceCentavos: true,
              quantity: true,
              lineTotalCentavos: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.sellerOrder.count({ where })
    ]);

    res.json({
      success: true,
      data: orders.map(so => ({
        ...so,
        subtotalFormatted: `₱${(so.subtotalCentavos / 100).toFixed(2)}`
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/seller/orders/:id — Detail of a specific seller order slice
router.get('/orders/:id', async (req, res, next) => {
  try {
    const sellerOrder = await prisma.sellerOrder.findFirst({
      where: { id: req.params.id, sellerId: req.user.id },
      include: {
        order: true,
        items: true
      }
    });

    if (!sellerOrder) {
      return res.status(404).json({ success: false, message: 'Seller order slice not found' });
    }

    res.json({
      success: true,
      data: {
        ...sellerOrder,
        subtotalFormatted: `₱${(sellerOrder.subtotalCentavos / 100).toFixed(2)}`
      }
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/seller/orders/:id/fulfill — Mark slice SHIPPED (with tracking)
router.patch('/orders/:id/fulfill', [
  body('trackingNumber').trim().notEmpty().withMessage('Tracking number is required'),
  body('trackingUrl').optional().trim(),
  body('notes').optional().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const sellerOrder = await prisma.sellerOrder.findFirst({
      where: { id: req.params.id, sellerId: req.user.id },
      include: { order: true }
    });

    if (!sellerOrder) {
      return res.status(404).json({ success: false, message: 'Seller order slice not found' });
    }

    if (sellerOrder.status === 'SHIPPED' || sellerOrder.status === 'DELIVERED') {
      return res.status(400).json({ success: false, message: `Slice is already ${sellerOrder.status}` });
    }

    if (sellerOrder.status === 'CANCELLED') {
      return res.status(400).json({ success: false, message: 'Cannot fulfill a cancelled order slice' });
    }

    const { trackingNumber, trackingUrl, notes } = req.body;

    const updatedSlice = await prisma.$transaction(async (tx) => {
      const slice = await tx.sellerOrder.update({
        where: { id: sellerOrder.id },
        data: {
          status: 'SHIPPED',
          trackingNumber,
          trackingUrl: trackingUrl || null,
          notes: notes || null,
          shippedAt: new Date()
        }
      });

      // Check if all slices for the parent order are now SHIPPED
      const siblingSlices = await tx.sellerOrder.findMany({
        where: { orderId: sellerOrder.orderId }
      });

      const allShipped = siblingSlices.every(s => s.status === 'SHIPPED' || s.status === 'DELIVERED');
      if (allShipped) {
        await tx.order.update({
          where: { id: sellerOrder.orderId },
          data: { shippingStatus: 'SHIPPED', orderStatus: 'SHIPPED' }
        });
      } else {
        await tx.order.update({
          where: { id: sellerOrder.orderId },
          data: { shippingStatus: 'PREPARING' }
        });
      }

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'SELLER_FULFILL_SLICE',
          entityType: 'SellerOrder',
          entityId: sellerOrder.id,
          newValues: { trackingNumber, status: 'SHIPPED' },
          ipAddress: req.ip
        }
      });

      return slice;
    });

    res.json({ success: true, message: 'Order marked as shipped', data: updatedSlice });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/seller/orders/:id/cancel — Cancel paid slice and restore stock (per DFD 5.4)
router.patch('/orders/:id/cancel', [
  body('reason').trim().notEmpty().withMessage('Cancellation reason is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const sellerOrder = await prisma.sellerOrder.findFirst({
      where: { id: req.params.id, sellerId: req.user.id },
      include: { items: true, order: true }
    });

    if (!sellerOrder) {
      return res.status(404).json({ success: false, message: 'Seller order slice not found' });
    }

    if (sellerOrder.status === 'CANCELLED') {
      return res.status(400).json({ success: false, message: 'Slice is already cancelled' });
    }

    if (sellerOrder.status === 'SHIPPED' || sellerOrder.status === 'DELIVERED') {
      return res.status(400).json({ success: false, message: 'Cannot cancel an order slice that has already been shipped' });
    }

    const { reason } = req.body;

    await prisma.$transaction(async (tx) => {
      // 1. Mark seller order cancelled
      await tx.sellerOrder.update({
        where: { id: sellerOrder.id },
        data: {
          status: 'CANCELLED',
          notes: `Cancelled by seller. Reason: ${reason}`
        }
      });

      // 2. Restore stock for all items in this slice
      for (const item of sellerOrder.items) {
        await tx.productVariant.update({
          where: { id: item.productVariantId },
          data: { stockQuantity: { increment: item.quantity } }
        });

        const afterVariant = await tx.productVariant.findUnique({ where: { id: item.productVariantId } });

        await tx.stockMovement.create({
          data: {
            productVariantId: item.productVariantId,
            quantityChange: item.quantity,
            stockAfter: afterVariant.stockQuantity,
            reason: `SELLER_CANCEL_RESTORE: ${reason.toUpperCase().replace(/\s+/g, '_')}`,
            referenceId: req.user.id
          }
        });
      }

      // 3. Log audit entry
      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'SELLER_CANCEL_ORDER_SLICE',
          entityType: 'SellerOrder',
          entityId: sellerOrder.id,
          newValues: { reason, restoredItems: sellerOrder.items.length },
          ipAddress: req.ip
        }
      });
    });

    res.json({ success: true, message: 'Order slice cancelled and inventory restored' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
