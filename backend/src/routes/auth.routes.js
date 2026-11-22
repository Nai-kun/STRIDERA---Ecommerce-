// Auth Routes — Registration, Seller Onboarding, Login, Logout, Profile, Password Recovery (FR-1.1 to FR-1.10)
const express = require('express');
const router = express.Router();
const argon2 = require('argon2');
const prisma = require('../lib/prisma');
const psgcClient = require('../services/psgcClient');
const {
  normalizePhMobile,
  validateEmail,
  validatePersonName,
  validateEntityName,
  validatePassword,
  validateStreet,
  validateCityOrProvince,
  validatePostalCode,
  validateOptionalText,
  validateRequiredText,
  validateOptionalUrl,
  collectFieldErrors,
  sendValidationError
} = require('../lib/validators');
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
router.post('/register', async (req, res, next) => {
  try {
    const bodyData = req.body || {};
    const collected = collectFieldErrors({
      firstName: validatePersonName(bodyData.firstName, 'First name'),
      lastName: validatePersonName(bodyData.lastName, 'Last name'),
      email: validateEmail(bodyData.email, { required: true, applyPolicy: true }),
      phone: normalizePhMobile(bodyData.phone, { required: true }),
      password: validatePassword(bodyData.password, { required: true, checkStrength: true })
    });
    if (bodyData.confirmPassword !== undefined && bodyData.confirmPassword !== bodyData.password) {
      collected.fieldErrors.confirmPassword = 'Passwords do not match.';
      collected.ok = false;
      collected.firstError = collected.firstError || collected.fieldErrors.confirmPassword;
    }
    if (!collected.ok) {
      return sendValidationError(res, collected);
    }

    const { firstName, lastName, email, phone, password } = collected.values;

    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } }
    });
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
router.post('/register-seller', async (req, res, next) => {
  try {
    const bodyData = req.body || {};
    const collected = collectFieldErrors({
      storeName: validateEntityName(bodyData.storeName, 'Store name', { min: 2, max: 80 }),
      storeDescription: validateOptionalText(bodyData.storeDescription, 'Store description', { max: 1000 }),
      storeLogoUrl: validateOptionalUrl(bodyData.storeLogoUrl, 'Store logo URL'),
      identificationDetails: validateRequiredText(bodyData.identificationDetails, 'Business / DTI / TIN ID details', { min: 3, max: 300 }),
      firstName: validatePersonName(bodyData.firstName, 'First name'),
      lastName: validatePersonName(bodyData.lastName, 'Last name'),
      email: validateEmail(bodyData.email, { required: true, applyPolicy: true }),
      phone: normalizePhMobile(bodyData.phone, { required: true }),
      password: validatePassword(bodyData.password, { required: true, checkStrength: true })
    });
    if (bodyData.confirmPassword !== undefined && bodyData.confirmPassword !== bodyData.password) {
      collected.fieldErrors.confirmPassword = 'Passwords do not match.';
      collected.ok = false;
      collected.firstError = collected.firstError || collected.fieldErrors.confirmPassword;
    }
    if (!collected.ok) {
      return sendValidationError(res, collected);
    }

    const {
      email, password, firstName, lastName, phone,
      storeName, storeDescription, storeLogoUrl, identificationDetails
    } = collected.values;

    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } }
    });
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
        identificationDetails
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
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const bodyData = req.body || {};
    // Note: applyPolicy=false so existing accounts on any domain are never locked out by EMAIL_POLICY
    const collected = collectFieldErrors({
      email: validateEmail(bodyData.email, { required: true, applyPolicy: false }),
      password: validatePassword(bodyData.password, { required: true, checkStrength: false })
    });
    if (!collected.ok) {
      return sendValidationError(res, collected);
    }

    const { email, password } = collected.values;
    const keepSignedIn = bodyData.keepSignedIn !== false;

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
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

    const validPassword = user ? await argon2.verify(user.passwordHash, password) : false;
    if (!user || !user.isActive || (user.accountStatus && user.accountStatus !== 'ACTIVE') || !validPassword) {
      throw createError('Invalid email or password.', 401);
    }

    const { jwtToken: token } = await issuePersistentSession(res, user.id, keepSignedIn);

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
router.put('/profile', authenticate, async (req, res, next) => {
  try {
    const bodyData = req.body || {};
    const collected = collectFieldErrors({
      firstName: validatePersonName(bodyData.firstName, 'First name', { required: bodyData.firstName !== undefined }),
      lastName: validatePersonName(bodyData.lastName, 'Last name', { required: bodyData.lastName !== undefined }),
      ...(bodyData.email !== undefined ? { email: validateEmail(bodyData.email, { required: true, applyPolicy: true }) } : {}),
      phone: normalizePhMobile(bodyData.phone, { required: false })
    });
    if (!collected.ok) {
      return sendValidationError(res, collected);
    }

    const updateData = {};
    if (bodyData.firstName !== undefined) updateData.firstName = collected.values.firstName;
    if (bodyData.lastName !== undefined) updateData.lastName = collected.values.lastName;
    if (bodyData.phone !== undefined) updateData.phone = collected.values.phone;
    if (bodyData.email !== undefined) {
      const dup = await prisma.user.findFirst({
        where: { email: { equals: collected.values.email, mode: 'insensitive' }, id: { not: req.user.id } }
      });
      if (dup) throw createError('An account with this email already exists', 409);
      updateData.email = collected.values.email;
    }

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
router.put('/password', authenticate, async (req, res, next) => {
  try {
    const bodyData = req.body || {};
    const currentPassword = typeof bodyData.currentPassword === 'string' ? bodyData.currentPassword : '';
    const newPassword = typeof bodyData.newPassword === 'string' ? bodyData.newPassword : '';
    const confirmPassword = typeof bodyData.confirmPassword === 'string' ? bodyData.confirmPassword : undefined;

    const currentCheck = validatePassword(currentPassword, { required: true, checkStrength: false, label: 'Current password' });
    const newCheck = validatePassword(newPassword, { required: true, checkStrength: true, label: 'New password' });

    const checks = {
      currentPassword: currentCheck,
      newPassword: newCheck,
    };

    if (confirmPassword !== undefined && newCheck.valid && newPassword !== confirmPassword) {
      checks.confirmPassword = { valid: false, value: null, error: 'Passwords do not match.' };
    }

    const collected = collectFieldErrors(checks);
    if (!collected.ok) {
      return sendValidationError(res, collected);
    }

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
router.post('/forgot-password', async (req, res, next) => {
  try {
    const bodyData = req.body || {};
    const collected = collectFieldErrors({
      email: validateEmail(bodyData.email, { required: true, applyPolicy: false }),
      newPassword: validatePassword(bodyData.newPassword, { required: false, checkStrength: true, label: 'New password' })
    });
    if (bodyData.confirmPassword !== undefined && bodyData.newPassword && bodyData.confirmPassword !== bodyData.newPassword) {
      collected.fieldErrors.confirmPassword = 'Passwords do not match.';
      collected.ok = false;
      collected.firstError = collected.firstError || collected.fieldErrors.confirmPassword;
    }
    if (!collected.ok) {
      return sendValidationError(res, collected);
    }

    const { email, newPassword } = collected.values;
    const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });

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
router.post('/addresses', authenticate, async (req, res, next) => {
  try {
    const bodyData = req.body || {};
    const collected = collectFieldErrors({
      fullName: validatePersonName(bodyData.fullName, 'Recipient full name'),
      phone: normalizePhMobile(bodyData.phone, { required: true }),
      addressLine1: validateStreet(bodyData.addressLine1),
      addressLine2: validateOptionalText(bodyData.addressLine2, 'Address line 2', { max: 200 }),
      city: validateCityOrProvince(bodyData.city, 'City'),
      province: validateCityOrProvince(bodyData.province, 'Province'),
      postalCode: validatePostalCode(bodyData.postalCode),
      label: validateOptionalText(bodyData.label, 'Address label', { max: 50 })
    });
    if (!collected.ok) {
      return sendValidationError(res, collected);
    }

    const {
      region, barangay,
      regionCode, provinceCode, cityCode, barangayCode, addressSource,
      isDefault
    } = bodyData;
    const {
      fullName, phone, addressLine1, addressLine2,
      city, province, postalCode, label
    } = collected.values;

    let resolvedCity = city;
    let resolvedProvince = province;
    let resolvedRegion = region || null;
    let resolvedBarangay = barangay || null;
    let resolvedRegionCode = regionCode || null;
    let resolvedProvinceCode = provinceCode || null;
    let resolvedCityCode = cityCode || null;
    let resolvedBarangayCode = barangayCode || null;
    let resolvedAddressSource = addressSource === 'MANUAL_FALLBACK' ? 'MANUAL_FALLBACK' : 'MANUAL';

    if (resolvedRegionCode || resolvedProvinceCode || resolvedCityCode || resolvedBarangayCode) {
      let verified;
      try {
        verified = await psgcClient.validateAddressHierarchy({
          regionCode: resolvedRegionCode,
          provinceCode: resolvedProvinceCode,
          cityCode: resolvedCityCode,
          barangayCode: resolvedBarangayCode
        });
      } catch (psgcErr) {
        if (psgcErr instanceof psgcClient.PsgcError || psgcErr?.name === 'PsgcError') {
          return res.status(psgcErr.statusCode || 400).json({
            success: false,
            code: psgcErr.code || 'PSGC_ERROR',
            message: psgcErr.message,
            degraded: (psgcErr.statusCode || 500) >= 500
          });
        }
        throw psgcErr;
      }
      resolvedRegion = verified.regionName;
      resolvedProvince = verified.provinceName;
      resolvedCity = verified.cityName;
      resolvedBarangay = verified.barangayName || resolvedBarangay;
      resolvedRegionCode = verified.regionCode;
      resolvedProvinceCode = verified.provinceCode;
      resolvedCityCode = verified.cityCode;
      resolvedBarangayCode = verified.barangayCode;
      resolvedAddressSource = 'PSGC_VERIFIED';
    }

    if (isDefault) {
      await prisma.address.updateMany({
        where: { userId: req.user.id },
        data: { isDefault: false },
      });
    }

    const address = await prisma.address.create({
      data: {
        userId: req.user.id,
        fullName,
        phone,
        addressLine1,
        addressLine2,
        barangay: resolvedBarangay,
        city: resolvedCity,
        province: resolvedProvince,
        region: resolvedRegion,
        regionCode: resolvedRegionCode,
        provinceCode: resolvedProvinceCode,
        cityCode: resolvedCityCode,
        barangayCode: resolvedBarangayCode,
        addressSource: resolvedAddressSource,
        postalCode,
        label,
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
