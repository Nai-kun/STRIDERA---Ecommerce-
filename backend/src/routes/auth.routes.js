// Auth Routes — Registration, Seller Onboarding, Login, Logout, Profile, Password Recovery (FR-1.1 to FR-1.10)
const express = require('express');
const router = express.Router();
const argon2 = require('argon2');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const {
  authenticate,
  optionalAuth,
  issuePersistentSession,
  clearPersistentSession
} = require('../middleware/auth.middleware');
const { createError } = require('../middleware/error.middleware');
const rateLimit = require('express-rate-limit');

// Rate limit login attempts (FR-1.5, NFR-11)
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: { success: false, error: { message: 'Too many login attempts, try again later' } },
});

// POST /api/auth/register — Shopper Registration (FR-1.1)
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

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw createError('An account with this email already exists', 409);
    }

    const passwordHash = await argon2.hash(password);

    const user = await prisma.user.create({
      data: { email, passwordHash, firstName, lastName, phone, accountStatus: 'ACTIVE' },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, accountStatus: true },
    });

    const { jwtToken: token } = await issuePersistentSession(res, user.id, true);

    res.status(201).json({
      success: true,
      data: { user, token },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/register-seller — Seller Registration & Verification Request (FR-5.1, FR-5.2)
router.post('/register-seller', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('firstName').trim().notEmpty().withMessage('First name required'),
  body('lastName').trim().notEmpty().withMessage('Last name required'),
  body('storeName').trim().notEmpty().withMessage('Store name required'),
  body('storeDescription').optional().trim(),
  body('storeLogoUrl').optional().trim(),
  body('identificationDetails').optional().trim(),
  body('phone').optional().trim(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: { message: 'Validation failed', details: errors.array() } });
    }

    const { email, password, firstName, lastName, phone, storeName, storeDescription, storeLogoUrl, identificationDetails } = req.body;

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
        accountStatus: 'ACTIVE',
        sellerStatus: 'PENDING',
        storeName,
        storeDescription,
        storeLogoUrl: storeLogoUrl || null,
        identificationDetails: identificationDetails || 'Pending DTI/Business ID Verification'
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        accountStatus: true,
        sellerStatus: true,
        storeName: true,
        storeDescription: true,
        storeLogoUrl: true,
        identificationDetails: true
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'SELLER_REGISTRATION',
        entityType: 'User',
        entityId: user.id,
        newValues: { storeName, email, identificationDetails: user.identificationDetails },
        ipAddress: req.ip
      }
    });

    const { jwtToken: token } = await issuePersistentSession(res, user.id, true);

    res.status(201).json({
      success: true,
      message: 'Seller application submitted and is pending administrator approval.',
      data: { user, token },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/login — User Login across all 7 Roles (FR-1.2, FR-1.3, FR-1.4, FR-1.9)
router.post('/login', loginLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: { message: 'Validation failed', details: errors.array() } });
    }

    const { email, password, keepSignedIn = true } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
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
        brand: {
          select: { id: true, name: true, slug: true, logoUrl: true }
        }
      },
    });

    if (!user || !user.isActive || (user.accountStatus && user.accountStatus !== 'ACTIVE')) {
      throw createError('Invalid email/password or account is deactivated/suspended', 401);
    }

    const validPassword = await argon2.verify(user.passwordHash, password);
    if (!validPassword) {
      throw createError('Invalid email or password', 401);
    }

    const { jwtToken: token } = await issuePersistentSession(res, user.id, keepSignedIn !== false);

    const { passwordHash, ...userData } = user;
    res.json({
      success: true,
      data: { user: userData, token },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout — User Logout (FR-1.8, D4)
router.post('/logout', optionalAuth, async (req, res) => {
  await clearPersistentSession(res, req.user?.id || null);
  res.json({ success: true, message: 'Logged out' });
});

// GET /api/auth/me — Get current user (FR-1.6)
router.get('/me', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      phone: true, role: true, accountStatus: true, sellerStatus: true, storeName: true,
      storeDescription: true, storeLogoUrl: true, identificationDetails: true, createdAt: true,
      brand: {
        select: { id: true, name: true, slug: true, description: true, logoUrl: true }
      },
      addresses: { orderBy: { isDefault: 'desc' } },
    },
  });
  res.json({ success: true, data: user });
});

// PUT /api/auth/profile — Update profile (FR-1.6)
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
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true, accountStatus: true },
    });

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// PUT /api/auth/password — Change password for logged-in user (FR-1.7)
router.put('/password', authenticate, [
  body('currentPassword').notEmpty().withMessage('Current password required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: { message: 'Validation failed', details: errors.array() } });
    }

    const { currentPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) throw createError('User not found', 404);

    const valid = await argon2.verify(user.passwordHash, currentPassword);
    if (!valid) {
      throw createError('Current password is incorrect', 400);
    }

    const passwordHash = await argon2.hash(newPassword);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash, sessionTokenHash: null, sessionExpiresAt: null },
    });
    res.clearCookie('token');
    res.clearCookie('stridera_session');

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'PASSWORD_CHANGE',
        entityType: 'User',
        entityId: req.user.id,
        ipAddress: req.ip,
      },
    });

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/forgot-password — Password Recovery / Reset (FR-1.7)
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('newPassword').optional().isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: { message: 'Validation failed', details: errors.array() } });
    }

    const { email, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    if (user && newPassword) {
      const passwordHash = await argon2.hash(newPassword);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, sessionTokenHash: null, sessionExpiresAt: null },
      });
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'PASSWORD_RECOVERY_RESET',
          entityType: 'User',
          entityId: user.id,
          ipAddress: req.ip,
        },
      });
      return res.json({
        success: true,
        message: 'Password has been reset successfully. You may now sign in with your new password.',
      });
    }

    res.json({
      success: true,
      message: 'If an account with that email exists, password recovery instructions have been verified.',
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/addresses — Add address (FR-1.6)
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
