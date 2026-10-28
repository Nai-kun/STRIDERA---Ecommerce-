// Auth Routes — Registration, Login, Logout, Profile
const express = require('express');
const router = express.Router();
const argon2 = require('argon2');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { authenticate, generateToken, setTokenCookie } = require('../middleware/auth.middleware');
const { createError } = require('../middleware/error.middleware');
const rateLimit = require('express-rate-limit');

// Rate limit login attempts
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: { success: false, error: { message: 'Too many login attempts, try again later' } },
});

// POST /api/auth/register
router.post('/register', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('firstName').trim().notEmpty().withMessage('First name required'),
  body('lastName').trim().notEmpty().withMessage('Last name required'),
  body('phone').optional().trim(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: { message: 'Validation failed', details: errors.array() } });
    }

    const { email, password, firstName, lastName, phone } = req.body;

    // Check existing user
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw createError('An account with this email already exists', 409);
    }

    const passwordHash = await argon2.hash(password);

    const user = await prisma.user.create({
      data: { email, passwordHash, firstName, lastName, phone },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });

    const token = generateToken(user.id);
    setTokenCookie(res, token);

    res.status(201).json({
      success: true,
      data: { user, token },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/register-seller
router.post('/register-seller', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('firstName').trim().notEmpty().withMessage('First name required'),
  body('lastName').trim().notEmpty().withMessage('Last name required'),
  body('storeName').trim().notEmpty().withMessage('Store name required'),
  body('storeDescription').optional().trim(),
  body('phone').optional().trim(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: { message: 'Validation failed', details: errors.array() } });
    }

    const { email, password, firstName, lastName, phone, storeName, storeDescription } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw createError('An account with this email already exists', 409);
    }

    const passwordHash = await argon2.hash(password);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        phone,
        role: 'SELLER',
        sellerStatus: 'PENDING',
        storeName,
        storeDescription
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        sellerStatus: true,
        storeName: true
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'SELLER_REGISTRATION',
        entityType: 'User',
        entityId: user.id,
        newValues: { storeName, email },
        ipAddress: req.ip
      }
    });

    const token = generateToken(user.id);
    setTokenCookie(res, token);

    res.status(201).json({
      success: true,
      message: 'Seller application submitted and is pending administrator approval.',
      data: { user, token },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/login
router.post('/login', loginLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: { message: 'Validation failed', details: errors.array() } });
    }

    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        sellerStatus: true,
        storeName: true,
        brand: {
          select: { id: true, name: true, slug: true, logoUrl: true }
        }
      },
    });

    if (!user || !user.isActive) {
      throw createError('Invalid email or password', 401);
    }

    const validPassword = await argon2.verify(user.passwordHash, password);
    if (!validPassword) {
      throw createError('Invalid email or password', 401);
    }

    const token = generateToken(user.id);
    setTokenCookie(res, token);

    const { passwordHash, ...userData } = user;
    res.json({
      success: true,
      data: { user: userData, token },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out' });
});

// GET /api/auth/me — Get current user
router.get('/me', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      phone: true, role: true, sellerStatus: true, storeName: true,
      storeDescription: true, createdAt: true,
      brand: {
        select: { id: true, name: true, slug: true, description: true, logoUrl: true }
      },
      addresses: { orderBy: { isDefault: 'desc' } },
    },
  });
  res.json({ success: true, data: user });
});

// PUT /api/auth/profile — Update profile
router.put('/profile', authenticate, [
  body('firstName').optional().trim().notEmpty(),
  body('lastName').optional().trim().notEmpty(),
  body('phone').optional().trim(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: { message: 'Validation failed', details: errors.array() } });
    }

    const { firstName, lastName, phone } = req.body;
    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (phone !== undefined) updateData.phone = phone;

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true },
    });

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/addresses — Add address
router.post('/addresses', authenticate, [
  body('fullName').trim().notEmpty().withMessage('Full name required'),
  body('phone').trim().notEmpty().withMessage('Phone required'),
  body('addressLine1').trim().notEmpty().withMessage('Address required'),
  body('city').trim().notEmpty().withMessage('City required'),
  body('province').trim().notEmpty().withMessage('Province required'),
  body('postalCode').trim().notEmpty().withMessage('Postal code required'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: { message: 'Validation failed', details: errors.array() } });
    }

    const { fullName, phone, addressLine1, addressLine2, city, province, postalCode, label, isDefault } = req.body;

    // If setting as default, unset other defaults
    if (isDefault) {
      await prisma.address.updateMany({
        where: { userId: req.user.id },
        data: { isDefault: false },
      });
    }

    const address = await prisma.address.create({
      data: {
        userId: req.user.id,
        fullName, phone, addressLine1, addressLine2, city, province, postalCode, label,
        isDefault: isDefault || false,
      },
    });

    res.status(201).json({ success: true, data: address });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/auth/addresses/:id
router.delete('/addresses/:id', authenticate, async (req, res, next) => {
  try {
    const address = await prisma.address.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!address) throw createError('Address not found', 404);

    await prisma.address.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Address deleted' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
