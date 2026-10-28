// Admin Routes — Product CRUD, category management, inventory, orders, reports
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticate, isAdmin } = require('../middleware/auth.middleware');
const { createError } = require('../middleware/error.middleware');
const { body, param, query, validationResult } = require('express-validator');

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
  body('name').trim().notEmpty(),
  body('sku').trim().notEmpty(),
  body('categoryId').isUUID(),
  body('basePriceCentavos').isInt({ min: 0 }),
  body('audience').isIn(['MEN', 'WOMEN', 'UNISEX']),
  body('shoeType').isIn(['RUNNING', 'LIFESTYLE', 'BASKETBALL', 'TRAINING'])
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const {
      name, sku, categoryId, description, features, basePriceCentavos,
      compareAtPriceCentavos, audience, shoeType, isFeatured
    } = req.body;

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

    const {
      name, categoryId, description, features, basePriceCentavos,
      compareAtPriceCentavos, audience, shoeType, isFeatured, isActive
    } = req.body;

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
router.post('/products/:id/variants', [
  body('variantSku').trim().notEmpty(),
  body('size').trim().notEmpty(),
  body('color').trim().notEmpty(),
  body('stockQuantity').isInt({ min: 0 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { variantSku, size, color, colorHex, priceOverrideCentavos, stockQuantity } = req.body;

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
          sellerStatus: true,
          storeName: true,
          storeDescription: true,
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
router.post('/brands', [
  body('name').trim().notEmpty().withMessage('Brand name required'),
  body('slug').trim().notEmpty().withMessage('Slug required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { name, slug, description, logoUrl, sellerId } = req.body;

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

module.exports = router;
