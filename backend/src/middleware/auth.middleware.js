// Authentication middleware — JWT verification and role checks
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { createError } = require('./error.middleware');

/**
 * Verify JWT token from cookie or Authorization header
 * Sets req.user with { id, email, role }
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
      select: { id: true, email: true, role: true, isActive: true, firstName: true, lastName: true },
    });

    if (!user || !user.isActive) {
      throw createError('User not found or deactivated', 401);
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
        select: { id: true, email: true, role: true, isActive: true, firstName: true, lastName: true },
      });
      if (user && user.isActive) {
        req.user = user;
      }
    }
  } catch {
    // Silently ignore invalid tokens for optional auth
  }
  next();
}

/**
 * Require admin role
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return next(createError('Admin access required', 403));
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

module.exports = { authenticate, optionalAuth, requireAdmin, generateToken, setTokenCookie };
