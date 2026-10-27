// Wishlist Routes — Save products for later
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth.middleware');
const { body, param, validationResult } = require('express-validator');

// GET /api/wishlist — Get user's wishlist
router.get('/', authenticate, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    const [items, total] = await Promise.all([
      prisma.wishlistItem.findMany({
        where: { userId: req.user.id },
        include: {
          product: {
            include: {
              images: { where: { isPrimary: true }, take: 1 },
              category: { select: { name: true, slug: true } },
              variants: {
                where: { isActive: true },
                select: { id: true, size: true, color: true, colorHex: true, stockQuantity: true, priceOverrideCentavos: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.wishlistItem.count({ where: { userId: req.user.id } })
    ]);

    const data = items.map(item => {
      const p = item.product;
      const minPrice = Math.min(
        p.basePriceCentavos,
        ...p.variants.filter(v => v.priceOverrideCentavos).map(v => v.priceOverrideCentavos)
      );
      const inStock = p.variants.some(v => v.stockQuantity > 0);

      return {
        id: item.id,
        addedAt: item.createdAt,
        product: {
          id: p.id,
          name: p.name,
          slug: p.slug,
          category: p.category?.name,
          categorySlug: p.category?.slug,
          imageUrl: p.images[0]?.url || null,
          priceCentavos: minPrice,
          priceFormatted: `₱${(minPrice / 100).toFixed(2)}`,
          compareAtPriceCentavos: p.compareAtPriceCentavos,
          inStock,
          isActive: p.isActive,
          availableColors: [...new Set(p.variants.map(v => v.color))],
          availableSizes: [...new Set(p.variants.map(v => v.size))]
        }
      };
    });

    res.json({
      success: true,
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/wishlist — Add product to wishlist
router.post('/', [
  authenticate,
  body('productId').isUUID().withMessage('Valid product ID required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { productId } = req.body;

    // Verify product exists
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || !product.isActive) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Check if already in wishlist
    const existing = await prisma.wishlistItem.findUnique({
      where: { userId_productId: { userId: req.user.id, productId } }
    });

    if (existing) {
      return res.json({ success: true, message: 'Already in wishlist', data: { id: existing.id } });
    }

    const item = await prisma.wishlistItem.create({
      data: { userId: req.user.id, productId }
    });

    res.status(201).json({ success: true, data: { id: item.id } });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/wishlist/:productId — Remove product from wishlist
router.delete('/:productId', authenticate, async (req, res, next) => {
  try {
    const { productId } = req.params;

    const item = await prisma.wishlistItem.findUnique({
      where: { userId_productId: { userId: req.user.id, productId } }
    });

    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not in wishlist' });
    }

    await prisma.wishlistItem.delete({ where: { id: item.id } });

    res.json({ success: true, message: 'Removed from wishlist' });
  } catch (err) {
    next(err);
  }
});

// GET /api/wishlist/check/:productId — Check if product is in wishlist
router.get('/check/:productId', authenticate, async (req, res, next) => {
  try {
    const item = await prisma.wishlistItem.findUnique({
      where: { userId_productId: { userId: req.user.id, productId: req.params.productId } }
    });

    res.json({ success: true, data: { inWishlist: !!item } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
