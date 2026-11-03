// Inventory Management Routes — Inventory Manager Portal (Feature 6: FR-6.1 to FR-6.11 & Process Flow 4)
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticate, requireInventoryManager } = require('../middleware/auth.middleware');
const { body, validationResult } = require('express-validator');

router.use(authenticate, requireInventoryManager);

// GET /api/inventory/dashboard — Overview metrics, low-stock alerts & recent movements (FR-6.1, FR-6.2, FR-6.5)
router.get('/dashboard', async (req, res, next) => {
  try {
    const [
      totalProducts,
      variants,
      recentMovements,
      sellers
    ] = await Promise.all([
      prisma.product.count({ where: { isActive: true } }),
      prisma.productVariant.findMany({
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              isActive: true,
              category: { select: { name: true } },
              seller: { select: { id: true, storeName: true, email: true } }
            }
          }
        },
        orderBy: { stockQuantity: 'asc' }
      }),
      prisma.stockMovement.findMany({
        take: 25,
        orderBy: { createdAt: 'desc' },
        include: {
          productVariant: {
            include: {
              product: {
                select: { name: true, sku: true, seller: { select: { storeName: true } } }
              }
            }
          }
        }
      }),
      prisma.user.findMany({
        where: { role: 'SELLER', sellerStatus: 'APPROVED' },
        select: { id: true, storeName: true, email: true }
      })
    ]);

    const totalVariants = variants.length;
    const totalUnits = variants.reduce((sum, v) => sum + v.stockQuantity, 0);
    const outOfStockVariants = variants.filter(v => v.stockQuantity === 0);
    const lowStockVariants = variants.filter(v => v.stockQuantity > 0 && v.stockQuantity <= (v.lowStockThreshold || 5));

    res.json({
      success: true,
      data: {
        totalProducts,
        totalVariants,
        totalUnits,
        lowStockCount: lowStockVariants.length,
        outOfStockCount: outOfStockVariants.length,
        healthyCount: totalVariants - lowStockVariants.length - outOfStockVariants.length,
        sellers,
        lowStockAlerts: [...outOfStockVariants, ...lowStockVariants].slice(0, 20).map(v => ({
          id: v.id,
          variantSku: v.variantSku,
          size: v.size,
          color: v.color,
          stockQuantity: v.stockQuantity,
          lowStockThreshold: v.lowStockThreshold,
          isActive: v.isActive,
          productName: v.product?.name,
          productSku: v.product?.sku,
          categoryName: v.product?.category?.name,
          sellerName: v.product?.seller?.storeName || 'STRIDERA Official'
        })),
        recentMovements
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/variants — Full variant inventory table with filters (FR-6.2)
router.get('/variants', async (req, res, next) => {
  try {
    const { sellerId, stockStatus, search } = req.query;

    const where = {};
    if (sellerId) {
      where.product = { sellerId };
    }
    if (stockStatus === 'out') {
      where.stockQuantity = 0;
    } else if (stockStatus === 'low') {
      where.stockQuantity = { gt: 0, lte: 5 };
    } else if (stockStatus === 'healthy') {
      where.stockQuantity = { gt: 5 };
    }

    if (search) {
      where.OR = [
        { variantSku: { contains: search, mode: 'insensitive' } },
        { color: { contains: search, mode: 'insensitive' } },
        { product: { name: { contains: search, mode: 'insensitive' } } },
        { product: { sku: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const variants = await prisma.productVariant.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            basePriceCentavos: true,
            isActive: true,
            category: { select: { id: true, name: true } },
            seller: { select: { id: true, storeName: true, email: true } }
          }
        }
      },
      orderBy: [{ stockQuantity: 'asc' }, { variantSku: 'asc' }]
    });

    res.json({
      success: true,
      data: variants
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory/incoming — Record incoming stock receipt (FR-6.3)
router.post('/incoming', [
  body('variantId').isUUID().withMessage('Valid variant ID required'),
  body('quantity').isInt({ min: 1 }).withMessage('Incoming quantity must be at least 1'),
  body('reason').trim().notEmpty().withMessage('Receipt reference or reason is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { variantId, quantity, reason } = req.body;
    const qty = parseInt(quantity);

    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: true }
    });
    if (!variant) return res.status(404).json({ success: false, message: 'Variant not found' });

    const newStock = variant.stockQuantity + qty;

    const updated = await prisma.$transaction(async (tx) => {
      const v = await tx.productVariant.update({
        where: { id: variantId },
        data: { stockQuantity: newStock, isActive: true }
      });

      await tx.stockMovement.create({
        data: {
          productVariantId: variantId,
          quantityChange: qty,
          stockAfter: newStock,
          movementType: 'INCOMING',
          reason: `INCOMING_STOCK: ${reason}`,
          referenceId: req.user.id
        }
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'INVENTORY_INCOMING_STOCK',
          entityType: 'ProductVariant',
          entityId: variantId,
          oldValues: { stockQuantity: variant.stockQuantity },
          newValues: { stockQuantity: newStock, added: qty, reason },
          ipAddress: req.ip
        }
      });

      return v;
    });

    res.json({
      success: true,
      message: `Recorded +${qty} incoming units for ${variant.product.name} (${variant.variantSku}). New stock: ${newStock}.`,
      data: updated
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory/outgoing — Record outgoing stock reduction (FR-6.4, FR-6.7)
router.post('/outgoing', [
  body('variantId').isUUID().withMessage('Valid variant ID required'),
  body('quantity').isInt({ min: 1 }).withMessage('Outgoing quantity must be at least 1'),
  body('reason').trim().notEmpty().withMessage('Outgoing dispatch/reduction reason is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { variantId, quantity, reason } = req.body;
    const qty = parseInt(quantity);

    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: true }
    });
    if (!variant) return res.status(404).json({ success: false, message: 'Variant not found' });

    if (variant.stockQuantity < qty) {
      return res.status(400).json({
        success: false,
        message: `Prevented negative stock (FR-6.7): Only ${variant.stockQuantity} units available for ${variant.variantSku}.`
      });
    }

    const newStock = variant.stockQuantity - qty;

    const updated = await prisma.$transaction(async (tx) => {
      const v = await tx.productVariant.update({
        where: { id: variantId },
        data: { stockQuantity: newStock }
      });

      await tx.stockMovement.create({
        data: {
          productVariantId: variantId,
          quantityChange: -qty,
          stockAfter: newStock,
          movementType: 'OUTGOING',
          reason: `OUTGOING_STOCK: ${reason}`,
          referenceId: req.user.id
        }
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'INVENTORY_OUTGOING_STOCK',
          entityType: 'ProductVariant',
          entityId: variantId,
          oldValues: { stockQuantity: variant.stockQuantity },
          newValues: { stockQuantity: newStock, deducted: qty, reason },
          ipAddress: req.ip
        }
      });

      return v;
    });

    res.json({
      success: true,
      message: `Recorded -${qty} outgoing units for ${variant.product.name} (${variant.variantSku}). New stock: ${newStock}.`,
      data: updated
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/inventory/variants/:id/adjust — Manual stock adjustment for damaged/returned/recounted items (FR-6.6, FR-6.7)
router.patch('/variants/:id/adjust', [
  body('quantityChange').isInt().withMessage('Quantity change integer required'),
  body('reason').trim().notEmpty().withMessage('Adjustment reason is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { quantityChange, reason, lowStockThreshold } = req.body;
    const delta = parseInt(quantityChange);

    const variant = await prisma.productVariant.findUnique({
      where: { id: req.params.id },
      include: { product: true }
    });
    if (!variant) return res.status(404).json({ success: false, message: 'Variant not found' });

    const newStock = variant.stockQuantity + delta;
    if (newStock < 0) {
      return res.status(400).json({
        success: false,
        message: `Adjustment rejected: resulting stock (${newStock}) cannot be negative (FR-6.7)`
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updateData = { stockQuantity: newStock };
      if (lowStockThreshold !== undefined) {
        updateData.lowStockThreshold = Math.max(1, parseInt(lowStockThreshold) || 5);
      }

      const v = await tx.productVariant.update({
        where: { id: variant.id },
        data: updateData
      });

      await tx.stockMovement.create({
        data: {
          productVariantId: variant.id,
          quantityChange: delta,
          stockAfter: newStock,
          movementType: 'ADJUSTMENT',
          reason: `MANUAL_ADJUSTMENT: ${reason}`,
          referenceId: req.user.id
        }
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'INVENTORY_MANUAL_ADJUSTMENT',
          entityType: 'ProductVariant',
          entityId: variant.id,
          oldValues: { stockQuantity: variant.stockQuantity },
          newValues: { stockQuantity: newStock, quantityChange: delta, reason },
          ipAddress: req.ip
        }
      });

      return v;
    });

    res.json({
      success: true,
      message: `Stock adjusted by ${delta >= 0 ? '+' + delta : delta}. New stock: ${newStock}.`,
      data: updated
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/inventory/variants/:id/availability — Toggle variant availability status (FR-6.8)
router.patch('/variants/:id/availability', async (req, res, next) => {
  try {
    const { isActive } = req.body;
    const variant = await prisma.productVariant.findUnique({ where: { id: req.params.id } });
    if (!variant) return res.status(404).json({ success: false, message: 'Variant not found' });

    const nextActive = typeof isActive === 'boolean' ? isActive : !variant.isActive;
    const updated = await prisma.productVariant.update({
      where: { id: variant.id },
      data: { isActive: nextActive }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'INVENTORY_TOGGLE_AVAILABILITY',
        entityType: 'ProductVariant',
        entityId: variant.id,
        oldValues: { isActive: variant.isActive },
        newValues: { isActive: nextActive },
        ipAddress: req.ip
      }
    });

    res.json({
      success: true,
      message: `Variant ${variant.variantSku} marked as ${nextActive ? 'AVAILABLE' : 'UNAVAILABLE'}`,
      data: updated
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/movements — Stock movement history (FR-6.9)
router.get('/movements', async (req, res, next) => {
  try {
    const { movementType, limit = 50 } = req.query;
    const where = {};
    if (movementType) where.movementType = movementType;

    const movements = await prisma.stockMovement.findMany({
      where,
      take: Math.min(parseInt(limit) || 50, 200),
      orderBy: { createdAt: 'desc' },
      include: {
        productVariant: {
          include: {
            product: {
              select: { name: true, sku: true, seller: { select: { storeName: true } } }
            }
          }
        }
      }
    });

    res.json({ success: true, data: movements });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/report — Comprehensive Inventory Report by Seller & Stock Status (FR-6.10)
router.get('/report', async (req, res, next) => {
  try {
    const [variants, movements] = await Promise.all([
      prisma.productVariant.findMany({
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              basePriceCentavos: true,
              category: { select: { name: true } },
              seller: { select: { id: true, storeName: true } }
            }
          }
        }
      }),
      prisma.stockMovement.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100
      })
    ]);

    const bySeller = {};
    let totalInventoryValuationCentavos = 0;

    for (const v of variants) {
      const sellerName = v.product?.seller?.storeName || 'STRIDERA Official';
      const unitPrice = v.priceOverrideCentavos || v.product?.basePriceCentavos || 0;
      const valueCentavos = unitPrice * v.stockQuantity;
      totalInventoryValuationCentavos += valueCentavos;

      if (!bySeller[sellerName]) {
        bySeller[sellerName] = {
          sellerName,
          variantCount: 0,
          totalUnits: 0,
          lowStockCount: 0,
          outOfStockCount: 0,
          valuationCentavos: 0
        };
      }
      bySeller[sellerName].variantCount += 1;
      bySeller[sellerName].totalUnits += v.stockQuantity;
      bySeller[sellerName].valuationCentavos += valueCentavos;
      if (v.stockQuantity === 0) bySeller[sellerName].outOfStockCount += 1;
      else if (v.stockQuantity <= (v.lowStockThreshold || 5)) bySeller[sellerName].lowStockCount += 1;
    }

    const movementSummary = {
      INCOMING: movements.filter(m => m.movementType === 'INCOMING').reduce((s, m) => s + m.quantityChange, 0),
      OUTGOING: movements.filter(m => m.movementType === 'OUTGOING').reduce((s, m) => s + Math.abs(m.quantityChange), 0),
      ADJUSTMENT: movements.filter(m => m.movementType === 'ADJUSTMENT').length
    };

    res.json({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        totalVariants: variants.length,
        totalUnits: variants.reduce((s, v) => s + v.stockQuantity, 0),
        totalInventoryValuationCentavos,
        totalInventoryValuationFormatted: `₱${(totalInventoryValuationCentavos / 100).toFixed(2)}`,
        bySeller: Object.values(bySeller).map(s => ({
          ...s,
          valuationFormatted: `₱${(s.valuationCentavos / 100).toFixed(2)}`
        })),
        movementSummary
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

