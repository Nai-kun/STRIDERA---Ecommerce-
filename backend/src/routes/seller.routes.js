// Seller Routes — Multi-seller portal endpoints (FR-5.1 to FR-5.13)
// Enforces tenant isolation: all queries scoped to req.user.id, returns 404 for alien records.
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticate, requireSeller } = require('../middleware/auth.middleware');
const { upload, saveValidatedProductImage, MAX_IMAGES_PER_PRODUCT } = require('../lib/imageUpload');
const { body, validationResult } = require('express-validator');

const HIGH_LOW_PERCENT = 0.20;
const LOW_STOCK_THRESHOLD = 5;

function getPeriodStart(period) {
  const now = Date.now();
  if (period === '7d') return new Date(now - 7 * 24 * 60 * 60 * 1000);
  if (period === '90d') return new Date(now - 90 * 24 * 60 * 60 * 1000);
  if (period === 'all') return null;
  return new Date(now - 30 * 24 * 60 * 60 * 1000); // default 30d
}

router.use(authenticate, requireSeller);

// ────────────────────────────────────────────────
// 1. SELLER PROFILE & BRAND (FR-5.1, FR-5.2)
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
        storeLogoUrl: true,
        identificationDetails: true,
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
  body('storeLogoUrl').optional().trim(),
  body('identificationDetails').optional().trim(),
  body('phone').optional().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { storeName, storeDescription, storeLogoUrl, identificationDetails, phone } = req.body;
    const updateData = {};
    if (storeName) updateData.storeName = storeName;
    if (storeDescription !== undefined) updateData.storeDescription = storeDescription;
    if (storeLogoUrl !== undefined) updateData.storeLogoUrl = storeLogoUrl;
    if (identificationDetails !== undefined) updateData.identificationDetails = identificationDetails;
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
        storeDescription: true,
        storeLogoUrl: true,
        identificationDetails: true
      }
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────
// 2. SELLER DASHBOARD METRICS (FR-5.13)
// ────────────────────────────────────────────────

// GET /api/seller/dashboard
router.get('/dashboard', async (req, res, next) => {
  try {
    const sellerId = req.user.id;

    const [
      sellerProfile,
      config,
      totalProducts,
      totalOrders,
      shippedOrders,
      revenueResult,
      lowStockVariants,
      recentOrders,
      payouts
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: sellerId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          storeName: true,
          storeDescription: true,
          storeLogoUrl: true,
          identificationDetails: true,
          sellerStatus: true
        }
      }),
      prisma.platformConfig.findUnique({ where: { id: 'default' } }),
      prisma.product.count({ where: { sellerId, isActive: true } }),
      prisma.sellerOrder.count({ where: { sellerId } }),
      prisma.sellerOrder.count({ where: { sellerId, status: { in: ['SHIPPED', 'DELIVERED'] } } }),
      prisma.sellerOrder.aggregate({
        where: { sellerId, status: { in: ['PAID', 'CONFIRMED', 'PREPARING', 'SHIPPED', 'DELIVERED'] } },
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
      }),
      prisma.sellerPayout.findMany({
        where: { sellerId },
        orderBy: { createdAt: 'desc' },
        take: 5
      })
    ]);

    const totalRevenueCentavos = revenueResult._sum.subtotalCentavos || 0;
    const feePercent = config ? config.platformFeePercent : 5;
    const platformFeeCentavos = Math.floor((totalRevenueCentavos * feePercent) / 100);
    const netEarningsCentavos = totalRevenueCentavos - platformFeeCentavos;

    res.json({
      success: true,
      data: {
        sellerProfile,
        totalProducts,
        totalOrders,
        shippedOrders,
        pendingOrders: totalOrders - shippedOrders,
        totalRevenueCentavos,
        totalRevenueFormatted: `₱${(totalRevenueCentavos / 100).toFixed(2)}`,
        platformFeePercent: feePercent,
        platformFeeCentavos,
        platformFeeFormatted: `₱${(platformFeeCentavos / 100).toFixed(2)}`,
        netEarningsCentavos,
        netEarningsFormatted: `₱${(netEarningsCentavos / 100).toFixed(2)}`,
        payouts,
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

// GET /api/seller/metrics?period=30d — Product & Variant Performance Metrics (REV-07, D8)
router.get('/metrics', async (req, res, next) => {
  try {
    const sellerId = req.user.id;
    const period = ['7d', '30d', '90d', 'all'].includes(req.query.period) ? req.query.period : '30d';
    const periodStart = getPeriodStart(period);

    const products = await prisma.product.findMany({
      where: { sellerId },
      include: {
        images: { where: { isPrimary: true }, take: 1 },
        variants: {
          select: {
            id: true,
            variantSku: true,
            size: true,
            color: true,
            stockQuantity: true,
            isActive: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Count ONLY items from PAID or SHIPPED/DELIVERED orders (exclude PENDING and CANCELLED per D8)
    const orderItems = await prisma.orderItem.findMany({
      where: {
        productVariant: { product: { sellerId } },
        fulfillmentStatus: { not: 'CANCELLED' },
        order: {
          paymentStatus: 'PAID',
          orderStatus: { not: 'CANCELLED' },
          ...(periodStart ? { createdAt: { gte: periodStart } } : {})
        }
      },
      include: {
        productVariant: { select: { productId: true } },
        order: { select: { id: true } }
      }
    });

    const productStats = new Map();
    const variantStats = new Map();

    for (const p of products) {
      productStats.set(p.id, {
        productId: p.id,
        name: p.name,
        sku: p.sku,
        status: p.status || (p.isActive ? 'ACTIVE' : 'ARCHIVED'),
        isActive: p.isActive,
        imageUrl: p.images[0]?.url || null,
        unitsSold: 0,
        revenueCentavos: 0,
        orderIds: new Set(),
        currentStock: p.variants.reduce((s, v) => s + v.stockQuantity, 0),
        lowStockCount: p.variants.filter(v => v.isActive && v.stockQuantity <= LOW_STOCK_THRESHOLD).length
      });
    }

    for (const item of orderItems) {
      const pid = item.productVariant?.productId;
      if (pid && productStats.has(pid)) {
        const ps = productStats.get(pid);
        ps.unitsSold += item.quantity;
        ps.revenueCentavos += item.unitPriceCentavos * item.quantity;
        ps.orderIds.add(item.orderId);
      }

      if (!variantStats.has(item.productVariantId)) {
        variantStats.set(item.productVariantId, {
          variantId: item.productVariantId,
          productName: item.productName,
          variantSku: item.variantSku,
          size: item.size,
          color: item.color,
          unitsSold: 0,
          revenueCentavos: 0,
          orderIds: new Set()
        });
      }
      const vs = variantStats.get(item.productVariantId);
      vs.unitsSold += item.quantity;
      vs.revenueCentavos += item.unitPriceCentavos * item.quantity;
      vs.orderIds.add(item.orderId);
    }

    const activeProductsList = [...productStats.values()].filter(p => p.isActive && p.status === 'ACTIVE');
    activeProductsList.sort((a, b) => b.unitsSold - a.unitsSold || b.revenueCentavos - a.revenueCentavos);

    const applyBadges = activeProductsList.length >= 5;
    const topCutoff = applyBadges ? Math.max(1, Math.ceil(activeProductsList.length * HIGH_LOW_PERCENT)) : 0;
    const withSales = activeProductsList.filter(p => p.unitsSold > 0);
    const lowCutoffCount = applyBadges ? Math.max(1, Math.ceil(activeProductsList.length * HIGH_LOW_PERCENT)) : 0;
    const lowIds = new Set(
      applyBadges ? withSales.slice(-lowCutoffCount).map(p => p.productId) : []
    );
    const highIds = new Set(
      applyBadges ? withSales.slice(0, topCutoff).map(p => p.productId) : []
    );

    const rankedProducts = [...productStats.values()]
      .sort((a, b) => b.unitsSold - a.unitsSold || b.revenueCentavos - a.revenueCentavos)
      .map((p) => {
        let performanceLabel = null;
        if (p.unitsSold === 0) {
          performanceLabel = 'NO_SALES';
        } else if (applyBadges) {
          if (highIds.has(p.productId)) performanceLabel = 'HIGH_SELLING';
          else if (lowIds.has(p.productId)) performanceLabel = 'LOW_SELLING';
        }
        return {
          productId: p.productId,
          name: p.name,
          sku: p.sku,
          status: p.status,
          isActive: p.isActive,
          imageUrl: p.imageUrl,
          unitsSold: p.unitsSold,
          revenueCentavos: p.revenueCentavos,
          revenueFormatted: `₱${(p.revenueCentavos / 100).toFixed(2)}`,
          orderCount: p.orderIds.size,
          currentStock: p.currentStock,
          lowStockCount: p.lowStockCount,
          performanceLabel
        };
      });

    const totalRevenueCentavos = rankedProducts.reduce((s, p) => s + p.revenueCentavos, 0);
    const totalUnitsSold = rankedProducts.reduce((s, p) => s + p.unitsSold, 0);
    const distinctOrders = new Set(orderItems.map(i => i.orderId)).size;
    const totalLowStock = rankedProducts.reduce((s, p) => s + p.lowStockCount, 0);

    res.json({
      success: true,
      data: {
        period,
        timezone: 'Asia/Manila',
        badgesApplied: applyBadges,
        lowStockThreshold: LOW_STOCK_THRESHOLD,
        summary: {
          revenueCentavos: totalRevenueCentavos,
          revenueFormatted: `₱${(totalRevenueCentavos / 100).toFixed(2)}`,
          unitsSold: totalUnitsSold,
          orderCount: distinctOrders,
          lowStockCount: totalLowStock,
          activeProductCount: activeProductsList.length
        },
        products: rankedProducts,
        variants: [...variantStats.values()]
          .sort((a, b) => b.unitsSold - a.unitsSold)
          .map(v => ({
            variantId: v.variantId,
            productName: v.productName,
            variantSku: v.variantSku,
            size: v.size,
            color: v.color,
            unitsSold: v.unitsSold,
            revenueCentavos: v.revenueCentavos,
            orderCount: v.orderIds.size
          }))
      }
    });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────
// 3. SELLER PRODUCT MANAGEMENT (FR-5.3 to FR-5.8)
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
  body('shoeType').isIn(['RUNNING', 'LIFESTYLE', 'BASKETBALL', 'TRAINING', 'CASUAL', 'BOOTS', 'FORMAL', 'LOAFERS']).withMessage('Valid shoe type required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const sellerId = req.user.id;

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
      compareAtPriceCentavos, audience, shoeType, isActive, status
    } = req.body;

    const resolvedStatus = status && ['ACTIVE', 'DRAFT', 'ARCHIVED'].includes(status)
      ? status
      : (isActive !== undefined ? (isActive ? 'ACTIVE' : 'ARCHIVED') : undefined);

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
        ...(resolvedStatus && { status: resolvedStatus, isActive: resolvedStatus === 'ACTIVE' }),
        ...(isActive !== undefined && !status && { isActive })
      },
      include: { category: true, brand: true, variants: true, images: true }
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
      data: { isActive: false, status: 'ARCHIVED' }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'SELLER_ARCHIVE_PRODUCT',
        entityType: 'Product',
        entityId: existing.id,
        ipAddress: req.ip
      }
    });

    res.json({ success: true, message: 'Product archived' });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/seller/products/:id/restore — Restore archived product
router.patch('/products/:id/restore', async (req, res, next) => {
  try {
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, sellerId: req.user.id }
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const updated = await prisma.product.update({
      where: { id: existing.id },
      data: { isActive: true, status: 'ACTIVE' }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'SELLER_RESTORE_PRODUCT',
        entityType: 'Product',
        entityId: existing.id,
        ipAddress: req.ip
      }
    });

    res.json({ success: true, message: 'Product restored', data: updated });
  } catch (err) {
    next(err);
  }
});

// POST /api/seller/products/:id/images — Upload validated PNG/JPG/WEBP image (<= 2MB, max 6 per product, D12)
router.post('/products/:id/images', upload.single('image'), async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, sellerId: req.user.id },
      include: { images: true }
    });

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Image file is required' });
    }

    if (product.images.length >= MAX_IMAGES_PER_PRODUCT) {
      return res.status(400).json({
        success: false,
        message: `Maximum of ${MAX_IMAGES_PER_PRODUCT} images per product allowed`
      });
    }

    const imageUrl = saveValidatedProductImage(req.file.buffer);
    const isPrimary = product.images.length === 0 || req.body.isPrimary === 'true';

    if (isPrimary) {
      await prisma.productImage.updateMany({
        where: { productId: product.id },
        data: { isPrimary: false }
      });
    }

    const image = await prisma.productImage.create({
      data: {
        productId: product.id,
        url: imageUrl,
        altText: req.body.altText || product.name,
        sortOrder: product.images.length,
        isPrimary
      }
    });

    res.status(201).json({ success: true, data: image });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/seller/products/:id/images/:imageId — Remove product image
router.delete('/products/:id/images/:imageId', async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, sellerId: req.user.id }
    });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const img = await prisma.productImage.findFirst({
      where: { id: req.params.imageId, productId: product.id }
    });
    if (!img) {
      return res.status(404).json({ success: false, message: 'Image not found' });
    }

    await prisma.productImage.delete({ where: { id: img.id } });
    res.json({ success: true, message: 'Image removed' });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────
// 4. SELLER VARIANT & STOCK MANAGEMENT (FR-5.7)
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
          movementType: 'INCOMING',
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
          movementType: quantityChange >= 0 ? 'INCOMING' : 'OUTGOING',
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
// 5. SELLER ORDERS & FULFILLMENT (FR-5.9 to FR-5.12)
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
              paymentMethod: true,
              createdAt: true,
              shippingFullName: true,
              shippingPhone: true,
              shippingAddressLine1: true,
              shippingCity: true,
              shippingProvince: true,
              shippingPostalCode: true,
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
          },
          shipments: true
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
        items: true,
        shipments: true
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

// PATCH /api/seller/orders/:id/accept — Acknowledge & accept paid order for preparation (FR-5.10)
router.patch('/orders/:id/accept', async (req, res, next) => {
  try {
    const sellerOrder = await prisma.sellerOrder.findFirst({
      where: { id: req.params.id, sellerId: req.user.id },
      include: { order: true, shipments: true }
    });

    if (!sellerOrder) {
      return res.status(404).json({ success: false, message: 'Seller order slice not found' });
    }

    if (!['PENDING', 'PAID'].includes(sellerOrder.status)) {
      return res.status(400).json({ success: false, message: `Order slice is already in ${sellerOrder.status} status` });
    }

    const now = new Date();
    const defaultDriver = await prisma.user.findFirst({
      where: { role: 'DELIVERY_PERSONNEL', isActive: true }
    });

    const updated = await prisma.$transaction(async (tx) => {
      const slice = await tx.sellerOrder.update({
        where: { id: sellerOrder.id },
        data: {
          status: 'PREPARING',
          acceptedAt: now
        }
      });

      await tx.order.update({
        where: { id: sellerOrder.orderId },
        data: { shippingStatus: 'PREPARING', orderStatus: 'PROCESSING' }
      });

      if (sellerOrder.shipments.length === 0) {
        await tx.shipment.create({
          data: {
            orderId: sellerOrder.orderId,
            sellerOrderId: sellerOrder.id,
            deliveryPersonnelId: defaultDriver ? defaultDriver.id : null,
            carrier: 'STRIDERA Express Courier',
            status: 'PREPARING',
            notes: `Order accepted by ${req.user.storeName || 'Seller'}, preparing package for collection.`,
            history: {
              events: [
                {
                  status: 'PREPARING',
                  note: `Order accepted by ${req.user.storeName || req.user.email} and queued for packing`,
                  actor: req.user.email,
                  timestamp: now.toISOString()
                }
              ]
            }
          }
        });
      }

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'SELLER_ACCEPT_ORDER_SLICE',
          entityType: 'SellerOrder',
          entityId: sellerOrder.id,
          newValues: { status: 'PREPARING', acceptedAt: now },
          ipAddress: req.ip
        }
      });

      return slice;
    });

    res.json({
      success: true,
      message: 'Order accepted and marked as PREPARING for shipment.',
      data: updated
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/seller/orders/:id/fulfill — Mark slice SHIPPED with courier & tracking (FR-5.11, FR-5.12)
router.patch('/orders/:id/fulfill', [
  body('trackingNumber').trim().notEmpty().withMessage('Tracking number is required'),
  body('carrier').optional().trim(),
  body('trackingUrl').optional().trim(),
  body('notes').optional().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const sellerOrder = await prisma.sellerOrder.findFirst({
      where: { id: req.params.id, sellerId: req.user.id },
      include: { order: true, shipments: true, items: true }
    });

    if (!sellerOrder) {
      return res.status(404).json({ success: false, message: 'Seller order slice not found' });
    }

    if (sellerOrder.order.paymentStatus !== 'PAID') {
      return res.status(400).json({ success: false, message: 'Order must be PAID before marking items as shipped' });
    }

    if (sellerOrder.items.some(i => i.stockConflict)) {
      return res.status(409).json({ success: false, message: 'Cannot ship slice with unresolved stock conflict' });
    }

    if (sellerOrder.status === 'SHIPPED' || sellerOrder.status === 'DELIVERED') {
      return res.status(400).json({ success: false, message: `Slice is already ${sellerOrder.status}` });
    }

    if (sellerOrder.status === 'CANCELLED') {
      return res.status(400).json({ success: false, message: 'Cannot fulfill a cancelled order slice' });
    }

    const { trackingNumber, carrier = 'STRIDERA Express Courier', trackingUrl, notes } = req.body;
    const now = new Date();

    const defaultDriver = await prisma.user.findFirst({
      where: { role: 'DELIVERY_PERSONNEL', isActive: true }
    });

    const updatedSlice = await prisma.$transaction(async (tx) => {
      const slice = await tx.sellerOrder.update({
        where: { id: sellerOrder.id },
        data: {
          status: 'SHIPPED',
          carrier,
          trackingNumber,
          trackingUrl: trackingUrl || null,
          notes: notes || null,
          acceptedAt: sellerOrder.acceptedAt || now,
          shippedAt: now
        }
      });

      await tx.orderItem.updateMany({
        where: { sellerOrderId: sellerOrder.id, fulfillmentStatus: { not: 'CANCELLED' } },
        data: { fulfillmentStatus: 'SHIPPED', shippedAt: now }
      });

      if (sellerOrder.shipments.length > 0) {
        const existingShipment = sellerOrder.shipments[0];
        const prevEvents = Array.isArray(existingShipment.history?.events) ? existingShipment.history.events : [];
        await tx.shipment.update({
          where: { id: existingShipment.id },
          data: {
            carrier,
            trackingNumber,
            trackingUrl: trackingUrl || null,
            status: 'SHIPPED',
            shippedAt: now,
            notes: notes || existingShipment.notes,
            history: {
              events: [
                ...prevEvents,
                {
                  status: 'SHIPPED',
                  note: `Dispatched by ${req.user.storeName || 'Seller'} via ${carrier} (Tracking: ${trackingNumber})`,
                  actor: req.user.email,
                  timestamp: now.toISOString()
                }
              ]
            }
          }
        });
      } else {
        await tx.shipment.create({
          data: {
            orderId: sellerOrder.orderId,
            sellerOrderId: sellerOrder.id,
            deliveryPersonnelId: defaultDriver ? defaultDriver.id : null,
            carrier,
            trackingNumber,
            trackingUrl: trackingUrl || null,
            status: 'SHIPPED',
            shippedAt: now,
            notes: notes || `Dispatched by ${req.user.storeName || 'Seller'}`,
            history: {
              events: [
                {
                  status: 'SHIPPED',
                  note: `Dispatched by ${req.user.storeName || 'Seller'} via ${carrier} (Tracking: ${trackingNumber})`,
                  actor: req.user.email,
                  timestamp: now.toISOString()
                }
              ]
            }
          }
        });
      }

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
          newValues: { carrier, trackingNumber, status: 'SHIPPED' },
          ipAddress: req.ip
        }
      });

      return slice;
    });

    res.json({ success: true, message: 'Order marked as shipped and shipment record created', data: updatedSlice });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/seller/orders/:id/cancel — Cancel paid slice and restore stock
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
      await tx.sellerOrder.update({
        where: { id: sellerOrder.id },
        data: {
          status: 'CANCELLED',
          notes: `Cancelled by seller. Reason: ${reason}`
        }
      });

      await tx.orderItem.updateMany({
        where: { sellerOrderId: sellerOrder.id },
        data: { fulfillmentStatus: 'CANCELLED' }
      });

      if (sellerOrder.order.stockDecremented) {
        for (const item of sellerOrder.items) {
          if (item.stockConflict) continue;
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
              movementType: 'INCOMING',
              reason: `SELLER_CANCEL_RESTORE: ${reason.toUpperCase().replace(/\s+/g, '_')}`,
              referenceId: req.user.id
            }
          });
        }
      }

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
