// Category Routes
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

// GET /api/categories — List all categories
router.get('/', async (req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: { select: { products: { where: { isActive: true } } } },
      },
    });

    const formatted = categories.map(c => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      imageUrl: c.imageUrl,
      productCount: c._count.products,
    }));

    res.json({ success: true, data: formatted });
  } catch (error) {
    next(error);
  }
});

// GET /api/categories/:slug — Category detail with products
router.get('/:slug', async (req, res, next) => {
  try {
    const category = await prisma.category.findUnique({
      where: { slug: req.params.slug },
    });

    if (!category || !category.isActive) {
      return res.status(404).json({ success: false, error: { message: 'Category not found' } });
    }

    res.json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
