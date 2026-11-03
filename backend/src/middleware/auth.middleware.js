// Authentication middleware — JWT verification and role checks across all 7 roles (FR-1.3, FR-1.4, FR-1.9)
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { createError } = require('./error.middleware');

const USER_SELECT = {
  id: true,
  email: true,
  role: true,
  isActive: true,
  accountStatus: true,
  firstName: true,
  lastName: true,
  phone: true,
  sellerStatus: true,
  storeName: true,
  storeDescription: true,
  storeLogoUrl: true,
  identificationDetails: true
};

/**
 * Verify JWT token from cookie or Authorization header
 * Sets req.user with full role and accountStatus context
 */
async function authenticate(req, res, next) {
  try {
    let token = req.cookies?.token;

    // Fallback to Authorization header
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      throw createError('Authentication required', 401);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: USER_SELECT,
    });

    if (!user || !user.isActive || (user.accountStatus && user.accountStatus !== 'ACTIVE')) {
      throw createError('User account not found, deactivated, or suspended', 401);
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(createError('Invalid or expired token', 401));
    }
    next(error);
  }
}

/**
 * Optional authentication — sets req.user if token is present, but doesn't fail
 */
async function optionalAuth(req, res, next) {
  try {
    let token = req.cookies?.token;
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: USER_SELECT,
      });
      if (user && user.isActive && (!user.accountStatus || user.accountStatus === 'ACTIVE')) {
        req.user = user;
      }
    }
  } catch {
    // Silently ignore invalid tokens for optional auth
  }
  next();
}

/**
 * Require Administrator role (FR-10.1)
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return next(createError('Admin access required', 403));
  }
  next();
}

/**
 * Require Seller role with APPROVED status (FR-5.1)
 * Returns 404 (not 403) for non-sellers per seller isolation rules
 */
function requireSeller(req, res, next) {
  if (!req.user || req.user.role !== 'SELLER') {
    return next(createError('Not found', 404));
  }
  if (req.user.sellerStatus !== 'APPROVED') {
    return next(createError('Seller account not approved', 403));
  }
  next();
}

/**
 * Require Admin OR Approved Seller role
 */
function requireAdminOrSeller(req, res, next) {
  if (!req.user) {
    return next(createError('Authentication required', 401));
  }
  if (req.user.role === 'ADMIN') return next();
  if (req.user.role === 'SELLER' && req.user.sellerStatus === 'APPROVED') return next();
  return next(createError('Not found', 404));
}

/**
 * Require Inventory Manager or Admin role (FR-6.1)
 */
function requireInventoryManager(req, res, next) {
  if (!req.user || !['INVENTORY_MANAGER', 'ADMIN'].includes(req.user.role)) {
    return next(createError('Inventory Manager access required', 403));
  }
  next();
}

/**
 * Require Delivery Personnel or Admin role (FR-7.1)
 */
function requireDelivery(req, res, next) {
  if (!req.user || !['DELIVERY_PERSONNEL', 'ADMIN'].includes(req.user.role)) {
    return next(createError('Delivery Personnel access required', 403));
  }
  next();
}

/**
 * Require Customer Support Personnel or Admin role (FR-8.1)
 */
function requireSupport(req, res, next) {
  if (!req.user || !['CUSTOMER_SUPPORT', 'ADMIN'].includes(req.user.role)) {
    return next(createError('Customer Support access required', 403));
  }
  next();
}

/**
 * Require Finance Officer or Admin role (FR-9.1)
 */
function requireFinance(req, res, next) {
  if (!req.user || !['FINANCE_OFFICER', 'ADMIN'].includes(req.user.role)) {
    return next(createError('Finance Officer access required', 403));
  }
  next();
}

/**
 * Generate JWT token
 */
function generateToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

/**
 * Set JWT as httpOnly cookie
 */
function setTokenCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

module.exports = {
  authenticate,
  optionalAuth,
  requireAdmin,
  isAdmin: requireAdmin,
  requireSeller,
  isSeller: requireSeller,
  requireAdminOrSeller,
  requireInventoryManager,
  requireDelivery,
  requireSupport,
  requireFinance,
  generateToken,
  setTokenCookie
};
