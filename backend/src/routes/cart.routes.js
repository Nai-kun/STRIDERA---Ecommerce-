// Cart Routes — Shopping Cart Management
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticate, optionalAuth } = require('../middleware/auth.middleware');
const { body, param, validationResult } = require('express-validator');
const { validateQuantity } = require('../lib/validators');
const { v4: uuidv4 } = require('uuid');

/**
 * Helper: find or create a cart for the current user/session
 */
async function getOrCreateCart(userId, sessionId) {
  let cart;
  if (userId) {
    cart = await prisma.cart.findFirst({
      where: { userId },
      include: {
        items: {
          include: {
            productVariant: {
              include: {
                product: {
                  include: { images: { where: { isPrimary: true }, take: 1 } }
                }
              }
            }
          }
        }
      }
    });
  } else if (sessionId) {
    cart = await prisma.cart.findFirst({
      where: { sessionId },
      include: {
        items: {
          include: {
            productVariant: {
              include: {
                product: {
                  include: { images: { where: { isPrimary: true }, take: 1 } }
                }
              }
            }
          }
        }
      }
    });
  }

  if (!cart) {
    cart = await prisma.cart.create({
      data: {
        userId: userId || null,
        sessionId: userId ? null : (sessionId || uuidv4()),
        expiresAt: userId ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days for guest
      },
      include: { items: { include: { productVariant: { include: { product: { include: { images: { where: { isPrimary: true }, take: 1 } } } } } } } }
    });
  }

  return cart;
}

/**
 * Helper: format cart response with server-verified prices
 */
function formatCartResponse(cart) {
  const items = cart.items.map(item => {
    const variant = item.productVariant;
    const product = variant.product;
    const unitPriceCentavos = variant.priceOverrideCentavos || product.basePriceCentavos;
    const lineTotalCentavos = unitPriceCentavos * item.quantity;

    return {
      id: item.id,
      productVariantId: item.productVariantId,
      productId: product.id,
      productName: product.name,
      productSlug: product.slug,
      variantSku: variant.variantSku,
      size: variant.size,
      color: variant.color,
      colorHex: variant.colorHex,
      imageUrl: product.images[0]?.url || null,
      unitPriceCentavos,
      quantity: item.quantity,
      lineTotalCentavos,
      stockAvailable: variant.stockQuantity,
      isActive: variant.isActive && product.isActive
    };
  });

  const subtotalCentavos = items.reduce((sum, i) => sum + i.lineTotalCentavos, 0);

  return {
    id: cart.id,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    items,
    subtotalCentavos,
    subtotalFormatted: `₱${(subtotalCentavos / 100).toFixed(2)}`
  };
}

// GET /api/cart — Get current cart
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id || null;
    const sessionId = req.cookies?.cart_session || req.headers['x-cart-session'] || null;

    const cart = await getOrCreateCart(userId, sessionId);

    // Set session cookie for guests
    if (!userId && cart.sessionId) {
      res.cookie('cart_session', cart.sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });
    }

    res.json({ success: true, data: formatCartResponse(cart) });
  } catch (err) {
    next(err);
  }
});

// POST /api/cart/items — Add item to cart
router.post('/items', [
  optionalAuth,
  body('productVariantId').isUUID().withMessage('Valid variant ID required'),
  body('quantity').custom(val => {
    const chk = validateQuantity(val);
    if (!chk.valid) throw new Error(chk.error);
    return true;
  })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { productVariantId, quantity } = req.body;
    const userId = req.user?.id || null;
    const sessionId = req.cookies?.cart_session || req.headers['x-cart-session'] || null;

    // Validate variant exists, is active, and has stock
    const variant = await prisma.productVariant.findUnique({
      where: { id: productVariantId },
      include: { product: true }
    });

    if (!variant || !variant.isActive || !variant.product.isActive) {
      return res.status(404).json({ success: false, message: 'Product variant not found or unavailable' });
    }

    if (variant.stockQuantity < quantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${variant.stockQuantity} units available`,
        availableStock: variant.stockQuantity
      });
    }

    const cart = await getOrCreateCart(userId, sessionId);

    // Set session cookie for guests
    if (!userId && cart.sessionId) {
      res.cookie('cart_session', cart.sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });
    }

    // Check if variant already in cart
    const existingItem = await prisma.cartItem.findUnique({
      where: { cartId_productVariantId: { cartId: cart.id, productVariantId } }
    });

    if (existingItem) {
      const newQty = existingItem.quantity + quantity;
      if (newQty > variant.stockQuantity) {
        return res.status(400).json({
          success: false,
          message: `Cannot add ${quantity} more. Cart already has ${existingItem.quantity}, only ${variant.stockQuantity} available.`
        });
      }
      if (newQty > 10) {
        return res.status(400).json({ success: false, message: 'Maximum 10 per item' });
      }
      await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: newQty }
      });
    } else {
      await prisma.cartItem.create({
        data: { cartId: cart.id, productVariantId, quantity }
      });
    }

    // Refetch full cart
    const updatedCart = await prisma.cart.findUnique({
      where: { id: cart.id },
      include: { items: { include: { productVariant: { include: { product: { include: { images: { where: { isPrimary: true }, take: 1 } } } } } } } }
    });

    res.status(201).json({ success: true, data: formatCartResponse(updatedCart) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/cart/items/:itemId — Update item quantity
router.patch('/items/:itemId', [
  optionalAuth,
  param('itemId').isUUID(),
  body('quantity').custom(val => {
    const chk = validateQuantity(val);
    if (!chk.valid) throw new Error(chk.error);
    return true;
  })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { itemId } = req.params;
    const { quantity } = req.body;

    const item = await prisma.cartItem.findUnique({
      where: { id: itemId },
      include: {
        cart: true,
        productVariant: true
      }
    });

    if (!item) {
      return res.status(404).json({ success: false, message: 'Cart item not found' });
    }

    // Verify ownership
    const userId = req.user?.id || null;
    const sessionId = req.cookies?.cart_session || req.headers['x-cart-session'] || null;
    if (item.cart.userId !== userId && item.cart.sessionId !== sessionId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Check stock
    if (quantity > item.productVariant.stockQuantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${item.productVariant.stockQuantity} available`,
        availableStock: item.productVariant.stockQuantity
      });
    }

    await prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity }
    });

    const updatedCart = await prisma.cart.findUnique({
      where: { id: item.cartId },
      include: { items: { include: { productVariant: { include: { product: { include: { images: { where: { isPrimary: true }, take: 1 } } } } } } } }
    });

    res.json({ success: true, data: formatCartResponse(updatedCart) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/cart/items/:itemId — Remove item from cart
router.delete('/items/:itemId', optionalAuth, async (req, res, next) => {
  try {
    const { itemId } = req.params;

    const item = await prisma.cartItem.findUnique({
      where: { id: itemId },
      include: { cart: true }
    });

    if (!item) {
      return res.status(404).json({ success: false, message: 'Cart item not found' });
    }

    // Verify ownership
    const userId = req.user?.id || null;
    const sessionId = req.cookies?.cart_session || req.headers['x-cart-session'] || null;
    if (item.cart.userId !== userId && item.cart.sessionId !== sessionId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await prisma.cartItem.delete({ where: { id: itemId } });

    const updatedCart = await prisma.cart.findUnique({
      where: { id: item.cartId },
      include: { items: { include: { productVariant: { include: { product: { include: { images: { where: { isPrimary: true }, take: 1 } } } } } } } }
    });

    res.json({ success: true, data: formatCartResponse(updatedCart) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/cart — Clear entire cart
router.delete('/', optionalAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id || null;
    const sessionId = req.cookies?.cart_session || req.headers['x-cart-session'] || null;

    let cart;
    if (userId) {
      cart = await prisma.cart.findFirst({ where: { userId } });
    } else if (sessionId) {
      cart = await prisma.cart.findFirst({ where: { sessionId } });
    }

    if (cart) {
      await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    }

    res.json({ success: true, data: { id: cart?.id, itemCount: 0, items: [], subtotalCentavos: 0, subtotalFormatted: '₱0.00' } });
  } catch (err) {
    next(err);
  }
});

// POST /api/cart/merge — Merge guest cart into user cart on login
router.post('/merge', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const sessionId = req.cookies?.cart_session || req.body.sessionId;

    if (!sessionId) {
      const cart = await getOrCreateCart(userId, null);
      return res.json({ success: true, data: formatCartResponse(cart) });
    }

    const guestCart = await prisma.cart.findFirst({
      where: { sessionId },
      include: { items: true }
    });

    if (!guestCart || guestCart.items.length === 0) {
      const cart = await getOrCreateCart(userId, null);
      return res.json({ success: true, data: formatCartResponse(cart) });
    }

    const userCart = await getOrCreateCart(userId, null);

    // Merge guest items into user cart
    for (const guestItem of guestCart.items) {
      const existing = await prisma.cartItem.findUnique({
        where: { cartId_productVariantId: { cartId: userCart.id, productVariantId: guestItem.productVariantId } }
      });

      if (existing) {
        const newQty = Math.min(existing.quantity + guestItem.quantity, 10);
        await prisma.cartItem.update({
          where: { id: existing.id },
          data: { quantity: newQty }
        });
      } else {
        await prisma.cartItem.create({
          data: {
            cartId: userCart.id,
            productVariantId: guestItem.productVariantId,
            quantity: Math.min(guestItem.quantity, 10)
          }
        });
      }
    }

    // Delete guest cart
    await prisma.cart.delete({ where: { id: guestCart.id } });
    res.clearCookie('cart_session');

    const merged = await prisma.cart.findUnique({
      where: { id: userCart.id },
      include: { items: { include: { productVariant: { include: { product: { include: { images: { where: { isPrimary: true }, take: 1 } } } } } } } }
    });

    res.json({ success: true, data: formatCartResponse(merged) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
