// Product Routes — Multi-Seller Catalog, Search, Filters, PDP, Reviews (FR-2.1 to FR-2.12)
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticate, optionalAuth } = require('../middleware/auth.middleware');

// GET /api/products — List products with filters, search, sort, pagination
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 12,
      category,
      brand,
      seller,
      audience,
      shoeType,
      search,
      minPrice,
      maxPrice,
      color,
      size,
      sort = 'newest',
      featured,
      inStock,
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = Math.min(parseInt(limit), 48);

    const where = { isActive: true };

    if (category) {
      where.category = { slug: category };
    }
    if (brand) {
      where.brand = { slug: brand };
    }
    if (seller) {
      where.sellerId = seller;
    }
    if (audience) {
      where.audience = audience.toUpperCase();
    }
    if (shoeType) {
      where.shoeType = shoeType.toUpperCase();
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { seller: { storeName: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (minPrice || maxPrice) {
      where.basePriceCentavos = {};
      if (minPrice) where.basePriceCentavos.gte = Math.round(parseFloat(minPrice) * 100);
      if (maxPrice) where.basePriceCentavos.lte = Math.round(parseFloat(maxPrice) * 100);
    }
    if (featured === 'true') {
      where.isFeatured = true;
    }

    if (color || size || inStock === 'true') {
      where.variants = { some: { isActive: true } };
      if (color) where.variants.some.color = { contains: color, mode: 'insensitive' };
      if (size) where.variants.some.size = size;
      if (inStock === 'true') where.variants.some.stockQuantity = { gt: 0 };
    }

    let orderBy;
    switch (sort) {
      case 'price-asc':
      case 'price_asc':
        orderBy = { basePriceCentavos: 'asc' };
        break;
      case 'price-desc':
      case 'price_desc':
        orderBy = { basePriceCentavos: 'desc' };
        break;
      case 'name-asc':
      case 'name_asc':
        orderBy = { name: 'asc' };
        break;
      case 'oldest':
        orderBy = { createdAt: 'asc' };
        break;
      case 'newest':
      default:
        orderBy = { createdAt: 'desc' };
        break;
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          brand: { select: { id: true, name: true, slug: true, logoUrl: true } },
          seller: { select: { id: true, storeName: true, storeLogoUrl: true } },
          images: { where: { isPrimary: true }, take: 1 },
          variants: {
            where: { isActive: true },
            select: { id: true, size: true, color: true, colorHex: true, stockQuantity: true, priceOverrideCentavos: true },
          },
          _count: { select: { wishlistItems: true, reviews: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    const formattedProducts = products.map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      sku: p.sku,
      category: p.category,
      brand: p.brand,
      seller: p.seller,
      audience: p.audience,
      shoeType: p.shoeType,
      basePriceCentavos: p.basePriceCentavos,
      compareAtPriceCentavos: p.compareAtPriceCentavos,
      isFeatured: p.isFeatured,
      primaryImage: p.images[0]?.url || null,
      primaryImageAlt: p.images[0]?.altText || p.name,
      availableColors: [...new Set(p.variants.map(v => v.color))],
      availableSizes: [...new Set(p.variants.map(v => v.size))],
      totalStock: p.variants.reduce((sum, v) => sum + v.stockQuantity, 0),
      wishlistCount: p._count.wishlistItems,
      reviewCount: p._count.reviews,
    }));

    res.json({
      success: true,
      data: {
        products: formattedProducts,
        pagination: {
          page: parseInt(page),
          limit: take,
          total,
          totalPages: Math.ceil(total / take),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/products/featured — Featured products for homepage
router.get('/featured', async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true, isFeatured: true },
      take: 8,
      orderBy: { createdAt: 'desc' },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        seller: { select: { id: true, storeName: true } },
        images: { where: { isPrimary: true }, take: 1 },
        variants: {
          where: { isActive: true },
          select: { stockQuantity: true, color: true },
        },
      },
    });

    const formatted = products.map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      category: p.category,
      seller: p.seller,
      basePriceCentavos: p.basePriceCentavos,
      compareAtPriceCentavos: p.compareAtPriceCentavos,
      primaryImage: p.images[0]?.url || null,
      primaryImageAlt: p.images[0]?.altText || p.name,
      totalStock: p.variants.reduce((sum, v) => sum + v.stockQuantity, 0),
      availableColors: [...new Set(p.variants.map(v => v.color))],
    }));

    res.json({ success: true, data: formatted });
  } catch (error) {
    next(error);
  }
});

// GET /api/products/filters — Available filter options (including Sellers per FR-2.6)
router.get('/filters', async (req, res, next) => {
  try {
    const [categories, brands, sellers, colors, sizes, priceRange] = await Promise.all([
      prisma.category.findMany({
        where: { isActive: true },
        select: { id: true, name: true, slug: true },
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.brand.findMany({
        where: { isActive: true },
        select: { id: true, name: true, slug: true, logoUrl: true },
        orderBy: { name: 'asc' },
      }),
      prisma.user.findMany({
        where: { role: 'SELLER', sellerStatus: 'APPROVED', isActive: true },
        select: { id: true, storeName: true, storeLogoUrl: true },
        orderBy: { storeName: 'asc' },
      }),
      prisma.productVariant.findMany({
        where: { isActive: true, product: { isActive: true } },
        distinct: ['color'],
        select: { color: true, colorHex: true },
      }),
      prisma.productVariant.findMany({
        where: { isActive: true, product: { isActive: true } },
        distinct: ['size'],
        select: { size: true },
        orderBy: { size: 'asc' },
      }),
      prisma.product.aggregate({
        where: { isActive: true },
        _min: { basePriceCentavos: true },
        _max: { basePriceCentavos: true },
      }),
    ]);

    res.json({
      success: true,
      data: {
        categories,
        brands,
        sellers,
        colors: colors.map(c => ({ name: c.color, hex: c.colorHex })),
        sizes: sizes.map(s => s.size),
        audiences: ['MEN', 'WOMEN', 'UNISEX'],
        shoeTypes: ['RUNNING', 'LIFESTYLE', 'BASKETBALL', 'TRAINING', 'CASUAL', 'BOOTS'],
        priceRange: {
          min: priceRange._min.basePriceCentavos ? priceRange._min.basePriceCentavos / 100 : 0,
          max: priceRange._max.basePriceCentavos ? priceRange._max.basePriceCentavos / 100 : 10000,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/products/:slug — Product detail page with Seller info & Reviews
router.get('/:slug', optionalAuth, async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({
      where: { slug: req.params.slug },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        brand: { select: { id: true, name: true, slug: true, description: true, logoUrl: true } },
        seller: { select: { id: true, storeName: true, storeDescription: true, storeLogoUrl: true, sellerStatus: true } },
        images: { orderBy: { sortOrder: 'asc' } },
        variants: {
          where: { isActive: true },
          orderBy: [{ color: 'asc' }, { size: 'asc' }],
        },
        reviews: {
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!product || !product.isActive) {
      return res.status(404).json({ success: false, error: { message: 'Product not found' } });
    }

    let isWishlisted = false;
    if (req.user) {
      const wishlistItem = await prisma.wishlistItem.findUnique({
        where: { userId_productId: { userId: req.user.id, productId: product.id } },
      });
      isWishlisted = !!wishlistItem;
    }

    const related = await prisma.product.findMany({
      where: {
        categoryId: product.categoryId,
        id: { not: product.id },
        isActive: true,
      },
      take: 4,
      include: {
        images: { where: { isPrimary: true }, take: 1 },
        category: { select: { name: true, slug: true } },
        seller: { select: { id: true, storeName: true } },
        variants: { where: { isActive: true }, select: { stockQuantity: true } },
      },
    });

    const colorGroups = {};
    for (const variant of product.variants) {
      if (!colorGroups[variant.color]) {
        colorGroups[variant.color] = {
          color: variant.color,
          colorHex: variant.colorHex,
          sizes: [],
        };
      }
      colorGroups[variant.color].sizes.push({
        id: variant.id,
        size: variant.size,
        variantSku: variant.variantSku,
        stockQuantity: variant.stockQuantity,
        priceCentavos: variant.priceOverrideCentavos || product.basePriceCentavos,
      });
    }

    const avgRating = product.reviews.length > 0
      ? Number((product.reviews.reduce((s, r) => s + r.rating, 0) / product.reviews.length).toFixed(1))
      : 5.0;

    res.json({
      success: true,
      data: {
        ...product,
        averageRating: avgRating,
        isWishlisted,
        colorGroups: Object.values(colorGroups),
        relatedProducts: related.map(r => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
          category: r.category,
          seller: r.seller,
          basePriceCentavos: r.basePriceCentavos,
          compareAtPriceCentavos: r.compareAtPriceCentavos,
          primaryImage: r.images[0]?.url || null,
          totalStock: r.variants.reduce((sum, v) => sum + v.stockQuantity, 0),
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/products/:slug/reviews — Submit product & seller rating/review (Section B.1 & Process Flow 1)
router.post('/:slug/reviews', authenticate, async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({ where: { slug: req.params.slug } });
    if (!product || !product.isActive) {
      return res.status(404).json({ success: false, error: { message: 'Product not found' } });
    }

    const { rating = 5, sellerRating = 5, comment, orderNumber } = req.body;
    if (!comment || !comment.trim()) {
      return res.status(400).json({ success: false, error: { message: 'Review comment is required' } });
    }

    const review = await prisma.productReview.create({
      data: {
        productId: product.id,
        userId: req.user.id,
        orderNumber: orderNumber || null,
        rating: Math.min(5, Math.max(1, parseInt(rating) || 5)),
        sellerRating: Math.min(5, Math.max(1, parseInt(sellerRating) || 5)),
        comment: comment.trim(),
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    res.status(201).json({ success: true, data: review });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
