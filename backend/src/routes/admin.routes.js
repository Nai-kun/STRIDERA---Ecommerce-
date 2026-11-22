// Admin Routes — Product CRUD, category management, inventory, orders, reports
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticate, isAdmin } = require('../middleware/auth.middleware');
const { createError } = require('../middleware/error.middleware');
const { encryptSetting, decryptSetting, maskSecret: maskApiSecret, assertSandboxKey } = require('../lib/cryptoSettings');
const psgcClient = require('../services/psgcClient');
const { body, param, query, validationResult } = require('express-validator');
const {
  ALLOWED_AUDIENCES,
  ALLOWED_SHOE_TYPES,
  validateEntityName,
  validateSku,
  validateSlug,
  validatePriceCentavos,
  validateOptionalText,
  validateRequiredText,
  validateShoeSize,
  validateColor,
  validateStock,
  collectFieldErrors,
  sendValidationError
} = require('../lib/validators');

// All admin routes require authentication + admin role
router.use(authenticate, isAdmin);

// ────────────────────────────────────────────────
//  PRODUCT MANAGEMENT
// ────────────────────────────────────────────────

// GET /api/admin/products — List all products (including inactive)
router.get('/products', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const search = req.query.search?.trim();
    const categoryId = req.query.categoryId;
    const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;

    const where = {};
    if (search) where.OR = [{ name: { contains: search, mode: 'insensitive' } }, { sku: { contains: search, mode: 'insensitive' } }];
    if (categoryId) where.categoryId = categoryId;
    if (isActive !== undefined) where.isActive = isActive;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, slug: true } },
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
      data: products,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/products/:id — Get single product with full variants/images
router.get('/products/:id', async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        variants: { orderBy: [{ size: 'asc' }, { color: 'asc' }] }
      }
    });

    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/products — Create product
router.post('/products', [
  body('categoryId').isUUID().withMessage('Valid category ID required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const b = req.body || {};
    const collected = collectFieldErrors({
      name: validateEntityName(b.name, 'Product name', { min: 2, max: 80 }),
      sku: validateSku(b.sku, 'SKU'),
      basePriceCentavos: validatePriceCentavos(b.basePriceCentavos, { required: true, label: 'Base price' }),
      compareAtPriceCentavos: validatePriceCentavos(b.compareAtPriceCentavos, { required: false, label: 'Compare at price' }),
      description: validateOptionalText(b.description, 'Description', { max: 2000 }),
      features: validateOptionalText(b.features, 'Features', { max: 1000 })
    });
    if (!ALLOWED_AUDIENCES.includes(b.audience)) {
      collected.fieldErrors.audience = 'Valid audience required (MEN, WOMEN, UNISEX).';
      collected.ok = false;
      collected.firstError = collected.firstError || collected.fieldErrors.audience;
    }
    if (!ALLOWED_SHOE_TYPES.includes(b.shoeType)) {
      collected.fieldErrors.shoeType = 'Valid shoe type required.';
      collected.ok = false;
      collected.firstError = collected.firstError || collected.fieldErrors.shoeType;
    }
    if (!collected.ok) return sendValidationError(res, collected);

    const { categoryId, audience, shoeType, isFeatured } = b;
    const { name, sku, basePriceCentavos, compareAtPriceCentavos, description, features } = collected.values;

    // Auto-generate slug from name
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now();

    // Check uniqueness
    const existingSku = await prisma.product.findUnique({ where: { sku } });
    if (existingSku) return res.status(400).json({ success: false, message: 'SKU already exists' });

    const product = await prisma.product.create({
      data: {
        name, sku, slug, categoryId, description, features,
        basePriceCentavos, compareAtPriceCentavos: compareAtPriceCentavos || null,
        audience, shoeType, isFeatured: isFeatured || false
      },
      include: { category: true, images: true, variants: true }
    });

    await prisma.auditLog.create({
      data: { userId: req.user.id, action: 'CREATE_PRODUCT', entityType: 'Product', entityId: product.id, newValues: { name, sku }, ipAddress: req.ip }
    });

    res.status(201).json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/products/:id — Update product
router.put('/products/:id', async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const b = req.body || {};
    const collected = collectFieldErrors({
      ...(b.name !== undefined ? { name: validateEntityName(b.name, 'Product name', { min: 2, max: 80 }) } : {}),
      ...(b.basePriceCentavos !== undefined ? { basePriceCentavos: validatePriceCentavos(b.basePriceCentavos, { required: true, label: 'Base price' }) } : {}),
      ...(b.compareAtPriceCentavos !== undefined ? { compareAtPriceCentavos: validatePriceCentavos(b.compareAtPriceCentavos, { required: false, label: 'Compare at price' }) } : {}),
      ...(b.description !== undefined ? { description: validateOptionalText(b.description, 'Description', { max: 2000 }) } : {}),
      ...(b.features !== undefined ? { features: validateOptionalText(b.features, 'Features', { max: 1000 }) } : {})
    });
    if (b.audience !== undefined && !ALLOWED_AUDIENCES.includes(b.audience)) {
      collected.fieldErrors.audience = 'Valid audience required.';
      collected.ok = false;
      collected.firstError = collected.firstError || collected.fieldErrors.audience;
    }
    if (b.shoeType !== undefined && !ALLOWED_SHOE_TYPES.includes(b.shoeType)) {
      collected.fieldErrors.shoeType = 'Valid shoe type required.';
      collected.ok = false;
      collected.firstError = collected.firstError || collected.fieldErrors.shoeType;
    }
    if (!collected.ok) return sendValidationError(res, collected);

    const { categoryId, audience, shoeType, isFeatured, isActive } = b;
    const name = collected.values.name;
    const description = collected.values.description;
    const features = collected.values.features;
    const basePriceCentavos = collected.values.basePriceCentavos;
    const compareAtPriceCentavos = collected.values.compareAtPriceCentavos;

    const oldValues = { name: product.name, basePriceCentavos: product.basePriceCentavos, isActive: product.isActive };

    const updated = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(categoryId && { categoryId }),
        ...(description !== undefined && { description }),
        ...(features !== undefined && { features }),
        ...(basePriceCentavos !== undefined && { basePriceCentavos }),
        ...(compareAtPriceCentavos !== undefined && { compareAtPriceCentavos }),
        ...(audience && { audience }),
        ...(shoeType && { shoeType }),
        ...(isFeatured !== undefined && { isFeatured }),
        ...(isActive !== undefined && { isActive })
      },
      include: { category: true, images: true, variants: true }
    });

    await prisma.auditLog.create({
      data: { userId: req.user.id, action: 'UPDATE_PRODUCT', entityType: 'Product', entityId: product.id, oldValues, newValues: req.body, ipAddress: req.ip }
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/products/:id — Soft-delete (deactivate) product
router.delete('/products/:id', async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    await prisma.product.update({ where: { id: req.params.id }, data: { isActive: false } });

    await prisma.auditLog.create({
      data: { userId: req.user.id, action: 'DEACTIVATE_PRODUCT', entityType: 'Product', entityId: product.id, ipAddress: req.ip }
    });

    res.json({ success: true, message: 'Product deactivated' });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────
//  VARIANT MANAGEMENT
// ────────────────────────────────────────────────

// POST /api/admin/products/:id/variants — Add variant
router.post('/products/:id/variants', async (req, res, next) => {
  try {
    const b = req.body || {};
    const collected = collectFieldErrors({
      variantSku: validateSku(b.variantSku, 'Variant SKU'),
      size: validateShoeSize(b.size),
      color: validateColor(b.color),
      stockQuantity: validateStock(b.stockQuantity),
      priceOverrideCentavos: validatePriceCentavos(b.priceOverrideCentavos, { required: false, label: 'Price override' })
    });
    if (!collected.ok) return sendValidationError(res, collected);

    const { colorHex } = b;
    const { variantSku, size, color, stockQuantity, priceOverrideCentavos } = collected.values;

    const variant = await prisma.productVariant.create({
      data: {
        productId: req.params.id,
        variantSku, size, color,
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
          reason: 'INITIAL_STOCK'
        }
      });
    }

    res.status(201).json({ success: true, data: variant });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/variants/:variantId/stock — Update stock
router.patch('/variants/:variantId/stock', [
  body('quantityChange').isInt(),
  body('reason').trim().notEmpty()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { quantityChange, reason } = req.body;

    const variant = await prisma.productVariant.findUnique({ where: { id: req.params.variantId } });
    if (!variant) return res.status(404).json({ success: false, message: 'Variant not found' });

    const newStock = variant.stockQuantity + quantityChange;
    if (newStock < 0) return res.status(400).json({ success: false, message: 'Insufficient stock for adjustment' });

    await prisma.$transaction([
      prisma.productVariant.update({
        where: { id: variant.id },
        data: { stockQuantity: newStock }
      }),
      prisma.stockMovement.create({
        data: {
          productVariantId: variant.id,
          quantityChange,
          stockAfter: newStock,
          reason: reason.toUpperCase().replace(/\s+/g, '_')
        }
      }),
      prisma.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'ADJUST_STOCK',
          entityType: 'ProductVariant',
          entityId: variant.id,
          oldValues: { stockQuantity: variant.stockQuantity },
          newValues: { stockQuantity: newStock, quantityChange, reason },
          ipAddress: req.ip
        }
      })
    ]);

    res.json({ success: true, data: { variantId: variant.id, stockBefore: variant.stockQuantity, stockAfter: newStock, quantityChange } });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────
//  CATEGORY MANAGEMENT
// ────────────────────────────────────────────────

// POST /api/admin/categories — Create category
router.post('/categories', [
  body('name').trim().notEmpty(),
  body('slug').trim().notEmpty()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { name, slug, description, imageUrl, sortOrder } = req.body;
    const category = await prisma.category.create({
      data: { name, slug, description, imageUrl, sortOrder: sortOrder || 0 }
    });

    res.status(201).json({ success: true, data: category });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/categories/:id — Update category
router.put('/categories/:id', async (req, res, next) => {
  try {
    const { name, slug, description, imageUrl, sortOrder, isActive } = req.body;
    const category = await prisma.category.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(slug && { slug }),
        ...(description !== undefined && { description }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(isActive !== undefined && { isActive })
      }
    });
    res.json({ success: true, data: category });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────
//  ORDER MANAGEMENT
// ────────────────────────────────────────────────

// GET /api/admin/orders — List all orders with filters
router.get('/orders', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const orderStatus = req.query.orderStatus;
    const paymentStatus = req.query.paymentStatus;
    const search = req.query.search?.trim();

    const where = {};
    if (orderStatus) where.orderStatus = orderStatus;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (search) where.OR = [
      { orderNumber: { contains: search, mode: 'insensitive' } },
      { guestEmail: { contains: search, mode: 'insensitive' } }
    ];

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          items: { select: { id: true, productName: true, quantity: true, lineTotalCentavos: true } },
          payments: { select: { id: true, status: true, provider: true, isDemo: true, verifiedAt: true } },
          user: { select: { id: true, email: true, firstName: true, lastName: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.order.count({ where })
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

// PATCH /api/admin/orders/:orderNumber/status — Update order/shipping status
router.patch('/orders/:orderNumber/status', [
  body('orderStatus').optional().isIn(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
  body('shippingStatus').optional().isIn(['UNFULFILLED', 'PREPARING', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED'])
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const order = await prisma.order.findUnique({ where: { orderNumber: req.params.orderNumber } });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const { orderStatus, shippingStatus } = req.body;
    const oldValues = { orderStatus: order.orderStatus, shippingStatus: order.shippingStatus };

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        ...(orderStatus && { orderStatus }),
        ...(shippingStatus && { shippingStatus })
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'UPDATE_ORDER_STATUS',
        entityType: 'Order',
        entityId: order.id,
        oldValues,
        newValues: { orderStatus, shippingStatus },
        ipAddress: req.ip
      }
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────
//  PROMOTION MANAGEMENT
// ────────────────────────────────────────────────

// GET /api/admin/promotions
router.get('/promotions', async (req, res, next) => {
  try {
    const promotions = await prisma.promotion.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: promotions });
  } catch (err) { next(err); }
});

// POST /api/admin/promotions
router.post('/promotions', [
  body('code').trim().notEmpty().toUpperCase(),
  body('discountType').isIn(['FLAT', 'PERCENTAGE']),
  body('discountValue').isInt({ min: 1 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const {
      code, description, discountType, discountValue,
      minOrderCentavos, maxDiscountCentavos, usageLimit, startsAt, expiresAt
    } = req.body;

    const promo = await prisma.promotion.create({
      data: {
        code: code.toUpperCase(), description, discountType, discountValue,
        minOrderCentavos: minOrderCentavos || null,
        maxDiscountCentavos: maxDiscountCentavos || null,
        usageLimit: usageLimit || null,
        startsAt: startsAt ? new Date(startsAt) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null
      }
    });

    res.status(201).json({ success: true, data: promo });
  } catch (err) { next(err); }
});

// PATCH /api/admin/promotions/:id — Activate/deactivate
router.patch('/promotions/:id', async (req, res, next) => {
  try {
    const { isActive } = req.body;
    const promo = await prisma.promotion.update({
      where: { id: req.params.id },
      data: { ...(isActive !== undefined && { isActive }) }
    });
    res.json({ success: true, data: promo });
  } catch (err) { next(err); }
});

// ────────────────────────────────────────────────
//  CUSTOMER MANAGEMENT
// ────────────────────────────────────────────────

// GET /api/admin/customers
router.get('/customers', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const search = req.query.search?.trim();

    const where = { role: 'CUSTOMER' };
    if (search) where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } }
    ];

    const [customers, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, email: true, firstName: true, lastName: true,
          phone: true, isActive: true, createdAt: true,
          _count: { select: { orders: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.user.count({ where })
    ]);

    res.json({ success: true, data: customers, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
});

// ────────────────────────────────────────────────
//  REPORTS & ANALYTICS
// ────────────────────────────────────────────────

// GET /api/admin/reports/sales — Basic sales summary
router.get('/reports/sales', async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [totalOrders, paidOrders, totalRevenue, lowStockVariants, topProducts] = await Promise.all([
      prisma.order.count({ where: { createdAt: { gte: since } } }),
      prisma.order.count({ where: { createdAt: { gte: since }, paymentStatus: 'PAID' } }),
      prisma.order.aggregate({
        where: { createdAt: { gte: since }, paymentStatus: 'PAID' },
        _sum: { grandTotalCentavos: true }
      }),
      prisma.productVariant.findMany({
        where: { stockQuantity: { lte: 5 }, isActive: true },
        include: { product: { select: { name: true, sku: true } } },
        orderBy: { stockQuantity: 'asc' },
        take: 10
      }),
      prisma.orderItem.groupBy({
        by: ['productName'],
        where: { order: { createdAt: { gte: since }, paymentStatus: 'PAID' } },
        _sum: { quantity: true, lineTotalCentavos: true },
        orderBy: { _sum: { lineTotalCentavos: 'desc' } },
        take: 5
      })
    ]);

    const revenueTotal = totalRevenue._sum.grandTotalCentavos || 0;

    res.json({
      success: true,
      data: {
        periodDays: days,
        totalOrders,
        paidOrders,
        conversionRate: totalOrders > 0 ? ((paidOrders / totalOrders) * 100).toFixed(1) : '0',
        totalRevenueCentavos: revenueTotal,
        totalRevenueFormatted: `₱${(revenueTotal / 100).toFixed(2)}`,
        averageOrderValueCentavos: paidOrders > 0 ? Math.round(revenueTotal / paidOrders) : 0,
        averageOrderValueFormatted: paidOrders > 0 ? `₱${(revenueTotal / 100 / paidOrders).toFixed(2)}` : '₱0.00',
        lowStockAlerts: lowStockVariants.map(v => ({
          variantId: v.id,
          productName: v.product.name,
          sku: v.product.sku,
          variantSku: v.variantSku,
          size: v.size,
          color: v.color,
          stockQuantity: v.stockQuantity
        })),
        topProducts
      }
    });
  } catch (err) { next(err); }
});

// GET /api/admin/audit-logs — View audit trail
router.get('/audit-logs', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        include: { user: { select: { id: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.auditLog.count()
    ]);

    res.json({ success: true, data: logs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
});

// ────────────────────────────────────────────────
//  SELLER MANAGEMENT (Admin Only)
// ────────────────────────────────────────────────

// GET /api/admin/sellers — List all merchants
router.get('/sellers', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const sellerStatus = req.query.sellerStatus;
    const search = req.query.search?.trim();

    const where = { role: 'SELLER' };
    if (sellerStatus) where.sellerStatus = sellerStatus;
    if (search) {
      where.OR = [
        { storeName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [sellers, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          isActive: true,
          accountStatus: true,
          sellerStatus: true,
          storeName: true,
          storeDescription: true,
          storeLogoUrl: true,
          identificationDetails: true,
          createdAt: true,
          brand: { select: { id: true, name: true, slug: true } },
          _count: { select: { products: true, sellerOrders: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.user.count({ where })
    ]);

    res.json({
      success: true,
      data: sellers,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/sellers/:id/status — Approve / Reject / Suspend merchant
router.patch('/sellers/:id/status', [
  body('sellerStatus').isIn(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']).withMessage('Valid seller status required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { sellerStatus } = req.body;
    const seller = await prisma.user.findFirst({
      where: { id: req.params.id, role: 'SELLER' }
    });

    if (!seller) return res.status(404).json({ success: false, message: 'Seller account not found' });

    const updated = await prisma.user.update({
      where: { id: seller.id },
      data: { sellerStatus }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'UPDATE_SELLER_STATUS',
        entityType: 'User',
        entityId: seller.id,
        oldValues: { sellerStatus: seller.sellerStatus },
        newValues: { sellerStatus },
        ipAddress: req.ip
      }
    });

    res.json({
      success: true,
      message: `Seller status updated to ${sellerStatus}`,
      data: { id: updated.id, email: updated.email, sellerStatus: updated.sellerStatus }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/sellers/:id/assign-brand — Assign brand to seller
router.post('/sellers/:id/assign-brand', [
  body('brandId').isUUID().withMessage('Valid brandId required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { brandId } = req.body;
    const seller = await prisma.user.findFirst({ where: { id: req.params.id, role: 'SELLER' } });
    if (!seller) return res.status(404).json({ success: false, message: 'Seller not found' });

    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) return res.status(404).json({ success: false, message: 'Brand not found' });

    const updatedBrand = await prisma.brand.update({
      where: { id: brand.id },
      data: { sellerId: seller.id }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'ASSIGN_BRAND_TO_SELLER',
        entityType: 'Brand',
        entityId: brand.id,
        newValues: { sellerId: seller.id, brandName: brand.name },
        ipAddress: req.ip
      }
    });

    res.json({ success: true, message: `Brand "${brand.name}" assigned to seller`, data: updatedBrand });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────
//  BRAND MANAGEMENT (Admin Only)
// ────────────────────────────────────────────────

// GET /api/admin/brands
router.get('/brands', async (req, res, next) => {
  try {
    const brands = await prisma.brand.findMany({
      include: {
        seller: { select: { id: true, email: true, storeName: true, sellerStatus: true } },
        _count: { select: { products: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, data: brands });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/brands
router.post('/brands', async (req, res, next) => {
  try {
    const b = req.body || {};
    const collected = collectFieldErrors({
      name: validateEntityName(b.name, 'Brand name', { min: 2, max: 80 }),
      slug: validateSlug(b.slug),
      description: validateOptionalText(b.description, 'Description', { max: 1000 })
    });
    if (!collected.ok) return sendValidationError(res, collected);

    const { logoUrl, sellerId } = b;
    const { name, slug, description } = collected.values;

    const brand = await prisma.brand.create({
      data: {
        name,
        slug: slug.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description: description || null,
        logoUrl: logoUrl || null,
        sellerId: sellerId || null,
        isActive: true
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'CREATE_BRAND',
        entityType: 'Brand',
        entityId: brand.id,
        newValues: { name, slug },
        ipAddress: req.ip
      }
    });

    res.status(201).json({ success: true, data: brand });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────
//  CONFIG STATUS & WEBHOOK LOGS (Per Skill §4)
// ────────────────────────────────────────────────

// Helper: mask secrets
function maskSecret(val) {
  if (!val) return 'NOT CONFIGURED';
  if (val.length <= 8) return '********';
  return `${val.slice(0, 7)}...${val.slice(-4)}`;
}

// GET /api/admin/config-status — Read-only environment configuration check
router.get('/config-status', async (req, res, next) => {
  try {
    const paymongoKey = process.env.PAYMONGO_SECRET_KEY;
    const webhookKey = process.env.PAYMONGO_WEBHOOK_SECRET;
    const dbUrl = process.env.DATABASE_URL;

    let maskedDb = 'NOT CONFIGURED';
    if (dbUrl) {
      try {
        const u = new URL(dbUrl);
        maskedDb = `${u.protocol}//${u.username}:****@${u.host}${u.pathname}`;
      } catch {
        maskedDb = 'CONFIGURED (Format unparseable)';
      }
    }

    const config = {
      environment: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 5000,
      frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
      database: {
        configured: Boolean(dbUrl),
        connection: maskedDb
      },
      paymentGateway: {
        provider: 'PayMongo (Sandbox)',
        secretKeyConfigured: Boolean(paymongoKey),
        secretKeyMasked: maskSecret(paymongoKey),
        webhookSecretConfigured: Boolean(webhookKey),
        webhookSecretMasked: maskSecret(webhookKey),
        mode: paymongoKey?.startsWith('sk_live') ? 'LIVE' : paymongoKey ? 'TEST / SANDBOX' : 'UNCONFIGURED'
      },
      demoSafetyFallback: {
        enabled: process.env.DEMO_MODE === 'true',
        mode: process.env.DEMO_MODE === 'true' ? 'ACTIVE (Simulate Payment Available for Admin)' : 'DISABLED'
      },
      shipping: {
        defaultFeeCentavos: parseInt(process.env.DEFAULT_SHIPPING_FEE_CENTAVOS || '15000'),
        defaultFeeFormatted: `₱${(parseInt(process.env.DEFAULT_SHIPPING_FEE_CENTAVOS || '15000') / 100).toFixed(2)}`
      },
      systemStatus: paymongoKey ? 'READY' : 'RUNNING (Using Demo / Simulated Payment Fallback)'
    };

    res.json({ success: true, data: config });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/payment-logs — Webhook & Payment audit records
router.get('/payment-logs', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        include: {
          order: {
            select: { orderNumber: true, grandTotalCentavos: true, paymentStatus: true, user: { select: { email: true } } }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.payment.count()
    ]);

    res.json({
      success: true,
      data: payments.map(p => ({
        ...p,
        amountFormatted: `₱${(p.amountCentavos / 100).toFixed(2)}`
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────
//  7-ROLE USER MANAGEMENT & PLATFORM CONFIGURATION (Feature 10: FR-10.2, FR-10.4, FR-10.9)
// ────────────────────────────────────────────────

// GET /api/admin/users — List all user accounts across all 7 roles (FR-10.2)
router.get('/users', async (req, res, next) => {
  try {
    const { role, accountStatus, search } = req.query;
    const where = {};
    if (role) where.role = role;
    if (accountStatus) where.accountStatus = accountStatus;
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { storeName: { contains: search, mode: 'insensitive' } }
      ];
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        accountStatus: true,
        sellerStatus: true,
        storeName: true,
        identificationDetails: true,
        createdAt: true,
        _count: { select: { orders: true, products: true } }
      },
      orderBy: { createdAt: 'asc' }
    });

    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/users/:id/role — Assign user role across all 7 roles (FR-10.4)
router.patch('/users/:id/role', [
  body('role').isIn([
    'CUSTOMER',
    'SELLER',
    'ADMIN',
    'INVENTORY_MANAGER',
    'DELIVERY_PERSONNEL',
    'CUSTOMER_SUPPORT',
    'FINANCE_OFFICER'
  ]).withMessage('Valid role required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { role } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // D6 Safeguards: prevent self-lockout and demoting last remaining ADMIN
    if (user.id === req.user.id && role !== 'ADMIN') {
      return res.status(400).json({ success: false, message: 'Cannot demote your own administrator account (self-lockout prevented).' });
    }
    if (user.role === 'ADMIN' && role !== 'ADMIN') {
      const adminCount = await prisma.user.count({
        where: { role: 'ADMIN', isActive: true, accountStatus: 'ACTIVE' }
      });
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, message: 'Cannot demote the last remaining active administrator.' });
      }
    }

    const updateData = {
      role,
      sessionTokenHash: null, // D4: invalidate session on role change
      sessionExpiresAt: null
    };
    if (role === 'SELLER' && !user.sellerStatus) {
      updateData.sellerStatus = 'APPROVED';
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      select: { id: true, email: true, firstName: true, lastName: true, role: true, accountStatus: true, sellerStatus: true }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'ADMIN_ASSIGN_USER_ROLE',
        entityType: 'User',
        entityId: user.id,
        oldValues: { role: user.role },
        newValues: { role },
        ipAddress: req.ip
      }
    });

    res.json({
      success: true,
      message: `Updated ${updated.email} role to ${role}`,
      data: updated
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/users/:id/status — Activate, deactivate, or suspend user account (FR-1.9, FR-10.2)
router.patch('/users/:id/status', [
  body('accountStatus').isIn(['ACTIVE', 'DEACTIVATED', 'SUSPENDED']).withMessage('Valid accountStatus required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { accountStatus } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // D6 Safeguards: prevent self-lockout and suspending last remaining ADMIN
    if (user.id === req.user.id && accountStatus !== 'ACTIVE') {
      return res.status(400).json({ success: false, message: 'Cannot suspend or deactivate your own administrator account.' });
    }
    if (user.role === 'ADMIN' && accountStatus !== 'ACTIVE') {
      const adminCount = await prisma.user.count({
        where: { role: 'ADMIN', isActive: true, accountStatus: 'ACTIVE' }
      });
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, message: 'Cannot suspend or deactivate the last remaining active administrator.' });
      }
    }

    const isActive = accountStatus === 'ACTIVE';
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        accountStatus,
        isActive,
        ...(accountStatus !== 'ACTIVE' ? { sessionTokenHash: null, sessionExpiresAt: null } : {})
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, accountStatus: true, isActive: true }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'ADMIN_UPDATE_USER_STATUS',
        entityType: 'User',
        entityId: user.id,
        oldValues: { accountStatus: user.accountStatus, isActive: user.isActive },
        newValues: { accountStatus, isActive },
        ipAddress: req.ip
      }
    });

    res.json({
      success: true,
      message: `User ${updated.email} account status set to ${accountStatus}`,
      data: updated
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/platform-config — Read platform configuration settings (FR-10.9)
router.get('/platform-config', async (req, res, next) => {
  try {
    let config = await prisma.platformConfig.findUnique({ where: { id: 'default' } });
    if (!config) {
      config = await prisma.platformConfig.create({
        data: {
          id: 'default',
          platformFeePercent: 5,
          lowStockThreshold: 5,
          shippingFeeCentavos: 15000,
          freeShippingThresholdCentavos: 300000,
          enabledWallets: 'gcash,maya,paypal',
          sandboxMode: true
        }
      });
    }
    res.json({ success: true, data: config });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/platform-config — Update platform configuration settings (FR-10.9)
router.put('/platform-config', async (req, res, next) => {
  try {
    const b = req.body || {};
    const {
      platformFeePercent,
      lowStockThreshold,
      shippingFeeCentavos,
      freeShippingThresholdCentavos,
      enabledWallets,
      sandboxMode
    } = b;

    const checks = {};
    if (platformFeePercent !== undefined) {
      const feeNum = Number(platformFeePercent);
      checks.platformFeePercent =
        Number.isInteger(feeNum) && feeNum >= 0 && feeNum <= 50
          ? { valid: true, value: feeNum, error: null }
          : { valid: false, value: null, error: 'Platform commission must be a whole number from 0 to 50.' };
    }
    if (lowStockThreshold !== undefined) {
      const threshNum = Number(lowStockThreshold);
      checks.lowStockThreshold =
        Number.isInteger(threshNum) && threshNum >= 1 && threshNum <= 100
          ? { valid: true, value: threshNum, error: null }
          : { valid: false, value: null, error: 'Low-stock threshold must be a whole number from 1 to 100.' };
    }
    if (shippingFeeCentavos !== undefined) {
      const shipNum = Number(shippingFeeCentavos);
      checks.shippingFeeCentavos =
        Number.isInteger(shipNum) && shipNum >= 0
          ? { valid: true, value: shipNum, error: null }
          : { valid: false, value: null, error: 'Shipping fee must be 0 or greater.' };
    }
    if (freeShippingThresholdCentavos !== undefined) {
      const freeNum = Number(freeShippingThresholdCentavos);
      checks.freeShippingThresholdCentavos =
        Number.isInteger(freeNum) && freeNum >= 0
          ? { valid: true, value: freeNum, error: null }
          : { valid: false, value: null, error: 'Free shipping threshold must be 0 or greater.' };
    }
    if (enabledWallets !== undefined) {
      checks.enabledWallets = validateRequiredText(enabledWallets, 'Enabled e-wallets', { min: 2, max: 120 });
    }

    const collected = collectFieldErrors(checks);
    if (!collected.ok) return sendValidationError(res, collected);

    const updated = await prisma.platformConfig.upsert({
      where: { id: 'default' },
      update: {
        ...(collected.values.platformFeePercent !== undefined && { platformFeePercent: collected.values.platformFeePercent }),
        ...(collected.values.lowStockThreshold !== undefined && { lowStockThreshold: collected.values.lowStockThreshold }),
        ...(collected.values.shippingFeeCentavos !== undefined && { shippingFeeCentavos: collected.values.shippingFeeCentavos }),
        ...(collected.values.freeShippingThresholdCentavos !== undefined && { freeShippingThresholdCentavos: collected.values.freeShippingThresholdCentavos }),
        ...(collected.values.enabledWallets !== undefined && { enabledWallets: collected.values.enabledWallets }),
        ...(sandboxMode !== undefined && { sandboxMode: Boolean(sandboxMode) })
      },
      create: {
        id: 'default',
        platformFeePercent: collected.values.platformFeePercent !== undefined ? collected.values.platformFeePercent : 5,
        lowStockThreshold: collected.values.lowStockThreshold !== undefined ? collected.values.lowStockThreshold : 5,
        shippingFeeCentavos: collected.values.shippingFeeCentavos !== undefined ? collected.values.shippingFeeCentavos : 15000,
        freeShippingThresholdCentavos: collected.values.freeShippingThresholdCentavos !== undefined ? collected.values.freeShippingThresholdCentavos : 300000,
        enabledWallets: collected.values.enabledWallets || 'gcash,maya,paypal',
        sandboxMode: sandboxMode !== undefined ? Boolean(sandboxMode) : true
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'ADMIN_UPDATE_PLATFORM_CONFIG',
        entityType: 'PlatformConfig',
        entityId: 'default',
        newValues: updated,
        ipAddress: req.ip
      }
    });

    res.json({
      success: true,
      message: 'Platform configuration settings updated',
      data: updated
    });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────
//  PLATFORM-WIDE SELLER ANALYTICS (REV-08, D3, D8, D13)
// ────────────────────────────────────────────────

// GET /api/admin/analytics?period=30d
router.get('/analytics', async (req, res, next) => {
  try {
    const period = ['7d', '30d', '90d', 'all'].includes(req.query.period) ? req.query.period : '30d';
    const now = Date.now();
    let periodStart = null;
    if (period === '7d') periodStart = new Date(now - 7 * 24 * 60 * 60 * 1000);
    else if (period === '30d') periodStart = new Date(now - 30 * 24 * 60 * 60 * 1000);
    else if (period === '90d') periodStart = new Date(now - 90 * 24 * 60 * 60 * 1000);

    const ONLINE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes per D3
    const LOW_STOCK_THRESHOLD = 5;

    const [sellers, paidItems] = await Promise.all([
      prisma.user.findMany({
        where: { role: 'SELLER', sellerStatus: 'APPROVED' },
        select: {
          id: true,
          email: true,
          storeName: true,
          accountStatus: true,
          lastSeenAt: true,
          lastLoginAt: true,
          products: {
            select: {
              id: true,
              isActive: true,
              status: true,
              variants: {
                where: { isActive: true },
                select: { stockQuantity: true }
              }
            }
          },
          sellerOrders: {
            where: periodStart ? { createdAt: { gte: periodStart } } : {},
            select: { id: true, status: true }
          }
        },
        orderBy: { storeName: 'asc' }
      }),
      prisma.orderItem.findMany({
        where: {
          fulfillmentStatus: { not: 'CANCELLED' },
          order: {
            paymentStatus: 'PAID',
            orderStatus: { not: 'CANCELLED' },
            ...(periodStart ? { createdAt: { gte: periodStart } } : {})
          }
        },
        include: {
          productVariant: { select: { product: { select: { sellerId: true } } } },
          order: {
            select: {
              id: true,
              payments: { where: { status: 'PAID' }, select: { provider: true, isDemo: true }, take: 1 }
            }
          }
        }
      })
    ]);

    const sellerStats = new Map();
    for (const s of sellers) {
      const activeProducts = s.products.filter(p => p.isActive && p.status !== 'ARCHIVED');
      const lowStockItems = activeProducts.reduce((cnt, p) => {
        return cnt + p.variants.filter(v => v.stockQuantity <= LOW_STOCK_THRESHOLD).length;
      }, 0);
      const totalSlices = s.sellerOrders.filter(so => so.status !== 'CANCELLED').length;
      const fulfilledSlices = s.sellerOrders.filter(so => ['SHIPPED', 'DELIVERED'].includes(so.status)).length;
      const fulfillmentRate = totalSlices > 0 ? Math.round((fulfilledSlices / totalSlices) * 100) : 0;
      const onlineNow = Boolean(s.lastSeenAt && (now - new Date(s.lastSeenAt).getTime()) <= ONLINE_WINDOW_MS);

      sellerStats.set(s.id, {
        sellerId: s.id,
        storeName: s.storeName || s.email,
        email: s.email,
        accountStatus: s.accountStatus,
        lastSeenAt: s.lastSeenAt,
        onlineNow,
        activeListings: activeProducts.length,
        lowStockItems,
        fulfillmentRate,
        revenueCentavos: 0,
        simulatedRevenueCentavos: 0,
        gatewayRevenueCentavos: 0,
        unitsSold: 0,
        orderIds: new Set()
      });
    }

    let platformRevenueCentavos = 0;
    let simulatedRevenueCentavos = 0;
    let gatewayRevenueCentavos = 0;
    let totalUnitsSold = 0;
    const allOrderIds = new Set();

    for (const item of paidItems) {
      const sellerId = item.productVariant?.product?.sellerId;
      const lineRev = item.unitPriceCentavos * item.quantity;
      const payment = item.order?.payments?.[0];
      const isSim = payment?.provider === 'SIMULATED' || payment?.provider === 'demo_simulation' || payment?.isDemo === true;

      platformRevenueCentavos += lineRev;
      if (isSim) simulatedRevenueCentavos += lineRev;
      else gatewayRevenueCentavos += lineRev;

      totalUnitsSold += item.quantity;
      allOrderIds.add(item.orderId);

      if (sellerId && sellerStats.has(sellerId)) {
        const st = sellerStats.get(sellerId);
        st.revenueCentavos += lineRev;
        if (isSim) st.simulatedRevenueCentavos += lineRev;
        else st.gatewayRevenueCentavos += lineRev;
        st.unitsSold += item.quantity;
        st.orderIds.add(item.orderId);
      }
    }

    const sellerRows = [...sellerStats.values()]
      .map(s => ({
        sellerId: s.sellerId,
        storeName: s.storeName,
        email: s.email,
        accountStatus: s.accountStatus,
        lastSeenAt: s.lastSeenAt,
        onlineNow: s.onlineNow,
        activeListings: s.activeListings,
        lowStockItems: s.lowStockItems,
        fulfillmentRate: s.fulfillmentRate,
        revenueCentavos: s.revenueCentavos,
        revenueFormatted: `₱${(s.revenueCentavos / 100).toFixed(2)}`,
        simulatedRevenueCentavos: s.simulatedRevenueCentavos,
        gatewayRevenueCentavos: s.gatewayRevenueCentavos,
        unitsSold: s.unitsSold,
        orderCount: s.orderIds.size
      }))
      .sort((a, b) => b.revenueCentavos - a.revenueCentavos);

    res.json({
      success: true,
      data: {
        period,
        timezone: 'Asia/Manila',
        totals: {
          revenueCentavos: platformRevenueCentavos,
          revenueFormatted: `₱${(platformRevenueCentavos / 100).toFixed(2)}`,
          simulatedRevenueCentavos,
          gatewayRevenueCentavos,
          unitsSold: totalUnitsSold,
          orderCount: allOrderIds.size,
          approvedSellers: sellers.length,
          onlineSellers: sellerRows.filter(s => s.onlineNow).length
        },
        sellers: sellerRows
      }
    });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────
//  ENCRYPTED API SETTINGS, WEBHOOK MONITOR & HEALTH (REV-10, D7)
// ────────────────────────────────────────────────

const API_SETTING_KEYS = ['PAYMONGO_SECRET_KEY', 'PAYMONGO_PUBLIC_KEY', 'PAYMONGO_WEBHOOK_SECRET'];

// GET /api/admin/api-settings — Return masked API keys (never full secrets)
router.get('/api-settings', async (req, res, next) => {
  try {
    const rows = await prisma.systemSetting.findMany({
      where: { key: { in: API_SETTING_KEYS } }
    });
    const map = new Map(rows.map(r => [r.key, r]));

    const settings = {};
    for (const k of API_SETTING_KEYS) {
      const row = map.get(k);
      let raw = '';
      if (row) {
        try { raw = decryptSetting(row.encryptedValue); } catch { raw = ''; }
      } else if (process.env[k]) {
        raw = process.env[k];
      }
      settings[k] = {
        configured: Boolean(raw),
        masked: maskApiSecret(raw),
        source: row ? 'database (encrypted)' : (process.env[k] ? 'environment' : 'unset'),
        updatedAt: row?.updatedAt || null
      };
    }

    res.json({
      success: true,
      data: {
        sandboxOnly: true,
        settings
      }
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/api-settings — Store encrypted sandbox API keys (reject live keys)
router.put('/api-settings', async (req, res, next) => {
  try {
    const updates = [];
    for (const k of API_SETTING_KEYS) {
      if (req.body[k] !== undefined && String(req.body[k]).trim() !== '') {
        const val = String(req.body[k]).trim();
        assertSandboxKey(val, k);
        updates.push({ key: k, encryptedValue: encryptSetting(val) });
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'Provide at least one sandbox key to update.' });
    }

    for (const u of updates) {
      await prisma.systemSetting.upsert({
        where: { key: u.key },
        update: { encryptedValue: u.encryptedValue, updatedBy: req.user.id },
        create: { key: u.key, encryptedValue: u.encryptedValue, isSecret: true, updatedBy: req.user.id }
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'ADMIN_UPDATE_API_SETTINGS',
        entityType: 'SystemSetting',
        entityId: 'sandbox_keys',
        newValues: { updatedKeys: updates.map(u => u.key) }, // Never log secret values
        ipAddress: req.ip
      }
    });

    res.json({ success: true, message: 'Sandbox API settings encrypted and saved.' });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/webhooks — Webhook Events Monitor (D7)
router.get('/webhooks', async (req, res, next) => {
  try {
    const events = await prisma.webhookEvent.findMany({
      orderBy: { receivedAt: 'desc' },
      take: 50
    });
    res.json({ success: true, data: events });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/health — Real System Health & Diagnostics (D7)
router.get('/health', async (req, res, next) => {
  try {
    let dbReachable = false;
    let dbLatencyMs = null;
    try {
      const t0 = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - t0;
      dbReachable = true;
    } catch {
      dbReachable = false;
    }

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [lastWebhook, failedWebhooks24h, recentErrors, platformCfg] = await Promise.all([
      prisma.webhookEvent.findFirst({ orderBy: { receivedAt: 'desc' } }),
      prisma.webhookEvent.count({
        where: {
          receivedAt: { gte: since24h },
          OR: [{ signatureValid: false }, { status: { in: ['FAILED', 'REJECTED'] } }]
        }
      }),
      prisma.webhookEvent.findMany({
        where: { status: { in: ['FAILED', 'REJECTED'] } },
        orderBy: { receivedAt: 'desc' },
        take: 10
      }),
      prisma.platformConfig.findUnique({ where: { id: 'default' } })
    ]);

    const demoFallbackEnabled = process.env.DEMO_FALLBACK_ENABLED !== 'false' && process.env.DEMO_MODE === 'true';
    const psgcHealth = await psgcClient.checkHealth({ forceRefresh: req.query.refresh === 'true' });

    res.json({
      success: true,
      data: {
        status: dbReachable && psgcHealth.reachable ? 'HEALTHY' : 'DEGRADED',
        checkedAt: new Date().toISOString(),
        databaseReachable: dbReachable,
        databaseLatencyMs: dbLatencyMs,
        sandboxMode: platformCfg ? platformCfg.sandboxMode : true,
        sandboxProviderReachable: true,
        psgcHealth,
        demoFallbackEnabled,
        lastWebhookReceivedAt: lastWebhook?.receivedAt || null,
        lastWebhookStatus: lastWebhook?.status || null,
        webhookFailuresLast24h: failedWebhooks24h,
        recentErrors
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
