// Authentication middleware — Persistent Session_Token (SHA-256), JWT & RBAC across roles (REV-02, REV-12, D3, D4, D10)
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { createError } = require('./error.middleware');

const JWT_SECRET = process.env.JWT_SECRET || 'stridera-dev-secret-key-2026';

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
  identificationDetails: true,
  sessionTokenHash: true,
  sessionExpiresAt: true,
  lastSeenAt: true
};

function hashSessionToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

function touchLastSeen(user) {
  const now = Date.now();
  const last = user.lastSeenAt ? new Date(user.lastSeenAt).getTime() : 0;
  if (now - last > 60 * 1000) {
    prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date(now) }
    }).catch(() => {});
  }
}

async function resolveUserFromRequest(req) {
  const rawSession = req.cookies?.stridera_session;
  if (rawSession) {
    const tokenHash = hashSessionToken(rawSession);
    const user = await prisma.user.findFirst({
      where: { sessionTokenHash: tokenHash },
      select: USER_SELECT,
    });
    if (user && (!user.sessionExpiresAt || new Date(user.sessionExpiresAt) > new Date())) {
      return user;
    }
    return null;
  }

  let token = req.cookies?.token;
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) return null;

  const decoded = jwt.verify(token, JWT_SECRET);
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: USER_SELECT,
  });

  if (!user) return null;
  // If token carries a session id prefix, enforce active session match (supports logout/password/role invalidation)
  if (decoded.sid) {
    if (!user.sessionTokenHash || !user.sessionTokenHash.startsWith(decoded.sid)) {
      return null;
    }
    if (user.sessionExpiresAt && new Date(user.sessionExpiresAt) <= new Date()) {
      return null;
    }
  }
  return user;
}

/**
 * Verify persistent session cookie or JWT Authorization header
 */
async function authenticate(req, res, next) {
  try {
    const user = await resolveUserFromRequest(req);

    if (!user || !user.isActive || (user.accountStatus && user.accountStatus !== 'ACTIVE')) {
      throw createError('Authentication required or session expired', 401);
    }

    touchLastSeen(user);
    const { sessionTokenHash, sessionExpiresAt, ...safeUser } = user;
    req.user = safeUser;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(createError('Invalid or expired token', 401));
    }
    next(error);
  }
}

/**
 * Optional authentication — sets req.user if valid session/token is present, but doesn't fail
 */
async function optionalAuth(req, res, next) {
  try {
    const user = await resolveUserFromRequest(req);
    if (user && user.isActive && (!user.accountStatus || user.accountStatus === 'ACTIVE')) {
      touchLastSeen(user);
      const { sessionTokenHash, sessionExpiresAt, ...safeUser } = user;
      req.user = safeUser;
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
 * Generate JWT token (linked to session hash prefix when provided)
 */
function generateToken(userId, sessionHashPrefix = null) {
  const payload = sessionHashPrefix ? { userId, sid: sessionHashPrefix } : { userId };
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });
}

/**
 * Set persistent HttpOnly cookies (stridera_session + legacy token)
 */
function setTokenCookie(res, token, rawSessionToken = null, keepSignedIn = true) {
  const secure = process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';
  const maxAge = keepSignedIn ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

  res.cookie('token', token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge,
  });

  if (rawSessionToken) {
    res.cookie('stridera_session', rawSessionToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge,
    });
  }
}

/**
 * Rotate & persist opaque Session_Token (SHA-256) in DB + set cookies + return JWT
 */
async function issuePersistentSession(res, userId, keepSignedIn = true) {
  const rawSessionToken = crypto.randomBytes(32).toString('base64url');
  const sessionTokenHash = hashSessionToken(rawSessionToken);
  const ttlMs = keepSignedIn ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const sessionExpiresAt = new Date(Date.now() + ttlMs);
  const now = new Date();

  await prisma.user.update({
    where: { id: userId },
    data: {
      sessionTokenHash,
      sessionExpiresAt,
      lastLoginAt: now,
      lastSeenAt: now,
    }
  });

  const jwtToken = generateToken(userId, sessionTokenHash.slice(0, 16));
  setTokenCookie(res, jwtToken, rawSessionToken, keepSignedIn);
  return { jwtToken, rawSessionToken, sessionExpiresAt };
}

/**
 * Clear persistent session in DB and cookies
 */
async function clearPersistentSession(res, userId = null) {
  res.clearCookie('token');
  res.clearCookie('stridera_session');
  if (userId) {
    await prisma.user.update({
      where: { id: userId },
      data: { sessionTokenHash: null, sessionExpiresAt: null }
    }).catch(() => {});
  }
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
  setTokenCookie,
  issuePersistentSession,
  clearPersistentSession,
  hashSessionToken
};
