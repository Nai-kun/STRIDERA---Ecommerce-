// Brand Routes — Public Brand directory & storefront endpoints
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

// GET /api/brands — List all active brands
router.get('/', async (req, res, next) => {
  try {
    const brands = await prisma.brand.findMany({
      where: { isActive: true },
      include: {
        seller: {
          select: { id: true, storeName: true, storeDescription: true }
        },
        _count: {
          select: { products: { where: { isActive: true } } }
        }
      },
      orderBy: { name: 'asc' }
    });

    res.json({
      success: true,
      data: brands.map(b => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        description: b.description,
        logoUrl: b.logoUrl,
        productCount: b._count.products,
        seller: b.seller
      }))
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/brands/:slug — Brand profile & catalog
router.get('/:slug', async (req, res, next) => {
  try {
    const brand = await prisma.brand.findUnique({
      where: { slug: req.params.slug },
      include: {
        seller: {
          select: { id: true, storeName: true, storeDescription: true, phone: true }
        },
        products: {
          where: { isActive: true },
          include: {
            category: { select: { id: true, name: true, slug: true } },
            images: { where: { isPrimary: true }, take: 1 },
            variants: {
              where: { isActive: true },
              select: { id: true, size: true, color: true, stockQuantity: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!brand || !brand.isActive) {
      return res.status(404).json({ success: false, message: 'Brand not found' });
    }

    res.json({
      success: true,
      data: {
        id: brand.id,
        name: brand.name,
        slug: brand.slug,
        description: brand.description,
        logoUrl: brand.logoUrl,
        seller: brand.seller,
        products: brand.products.map(p => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          sku: p.sku,
          category: p.category,
          basePriceCentavos: p.basePriceCentavos,
          basePriceFormatted: `₱${(p.basePriceCentavos / 100).toFixed(2)}`,
          compareAtPriceCentavos: p.compareAtPriceCentavos,
          primaryImage: p.images[0]?.url || null,
          totalStock: p.variants.reduce((sum, v) => sum + v.stockQuantity, 0),
          availableSizes: [...new Set(p.variants.map(v => v.size))],
          availableColors: [...new Set(p.variants.map(v => v.color))]
        }))
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

