// Payment Routes — Built-in Prototype E-Wallet Sandbox (GCash, Maya, PayPal) (FR-4.1 to FR-4.12)
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticate, optionalAuth } = require('../middleware/auth.middleware');
const { finalizePayment } = require('../lib/paymentFinalizer');
const { v4: uuidv4 } = require('uuid');

const isDemoFallbackEnabled = () =>
  process.env.DEMO_FALLBACK_ENABLED !== 'false' && process.env.DEMO_MODE === 'true';

// POST /api/payments/create-session — Create an E-Wallet Sandbox Checkout Session (FR-4.1 to FR-4.5)
router.post('/create-session', optionalAuth, async (req, res, next) => {
  try {
    const { orderNumber, paymentMethod: rawMethod } = req.body;

    if (!orderNumber) {
      return res.status(400).json({ success: false, message: 'Order number required' });
    }

    const order = await prisma.order.findUnique({ where: { orderNumber } });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.userId && req.user && order.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (order.paymentStatus === 'PAID') {
      return res.status(400).json({ success: false, message: 'Order is already paid' });
    }

    const paymentMethod = ['gcash', 'maya', 'paypal'].includes(String(rawMethod || order.paymentMethod || 'gcash').toLowerCase())
      ? String(rawMethod || order.paymentMethod || 'gcash').toLowerCase()
      : 'gcash';

    // Check for existing pending payment (idempotency per FR-4.10)
    const existingPayment = await prisma.payment.findFirst({
      where: { orderId: order.id, status: 'PENDING', paymentMethod }
    });

    const walletLabel = paymentMethod === 'gcash' ? 'GCash' : paymentMethod === 'maya' ? 'Maya' : 'PayPal';
    const qrPayload = `STRIDERA-EWALLET|${walletLabel}|${order.orderNumber}|PHP|${(order.grandTotalCentavos / 100).toFixed(2)}`;

    if (existingPayment) {
      return res.json({
        success: true,
        data: {
          paymentId: existingPayment.id,
          paymentMethod,
          walletLabel,
          checkoutUrl: existingPayment.providerCheckoutUrl || null,
          sandboxMode: true,
          qrCodeData: qrPayload,
          referenceNumber: existingPayment.providerPaymentId || `${walletLabel.toUpperCase()}-REF-${existingPayment.id.slice(0, 8).toUpperCase()}`,
          amountCentavos: order.grandTotalCentavos,
          amountFormatted: `₱${(order.grandTotalCentavos / 100).toFixed(2)}`,
          status: 'PENDING',
          demoModeAvailable: isDemoFallbackEnabled()
        }
      });
    }

    const idempotencyKey = uuidv4();
    const referenceNumber = `${walletLabel.toUpperCase()}-REF-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: `${paymentMethod}_sandbox`,
        paymentMethod,
        providerPaymentId: referenceNumber,
        idempotencyKey,
        amountCentavos: order.grandTotalCentavos,
        currency: 'PHP',
        status: 'PENDING',
        isDemo: true
      }
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: 'PENDING', paymentMethod }
    });

    return res.json({
      success: true,
      message: `${walletLabel} Sandbox Session initialized. Scan QR or confirm payment below.`,
      data: {
        paymentId: payment.id,
        paymentMethod,
        walletLabel,
        checkoutUrl: null,
        sandboxMode: true,
        qrCodeData: qrPayload,
        referenceNumber,
        amountCentavos: order.grandTotalCentavos,
        amountFormatted: `₱${(order.grandTotalCentavos / 100).toFixed(2)}`,
        status: 'PENDING',
        demoModeAvailable: isDemoFallbackEnabled()
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/payments/confirm-sandbox — Confirm E-Wallet Sandbox Payment (FR-4.4, FR-4.6, FR-4.8, FR-4.10)
router.post('/confirm-sandbox', optionalAuth, async (req, res, next) => {
  try {
    const { orderNumber, paymentId, paymentMethod: rawMethod } = req.body;

    if (!orderNumber) {
      return res.status(400).json({ success: false, message: 'Order number required' });
    }

    const order = await prisma.order.findUnique({ where: { orderNumber } });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.userId && req.user && order.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (order.paymentStatus === 'PAID') {
      return res.json({
        success: true,
        message: 'Payment already verified (idempotent)',
        data: { orderNumber: order.orderNumber, paymentStatus: 'PAID', orderStatus: order.orderStatus }
      });
    }

    const paymentMethod = ['gcash', 'maya', 'paypal'].includes(String(rawMethod || order.paymentMethod || 'gcash').toLowerCase())
      ? String(rawMethod || order.paymentMethod || 'gcash').toLowerCase()
      : 'gcash';

    const result = await finalizePayment({
      orderId: order.id,
      provider: `${paymentMethod}_sandbox`,
      paymentMethod,
      actorId: req.user?.id || null,
      isDemo: true,
      paymentId,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: result.alreadyPaid
        ? 'Payment already verified (idempotent)'
        : `E-Wallet (${paymentMethod.toUpperCase()}) payment verified! Order is now PAID.`,
      data: {
        orderNumber: order.orderNumber,
        paymentMethod,
        paymentStatus: 'PAID',
        orderStatus: 'CONFIRMED',
        stockConflicts: result.stockConflicts || []
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/payments/fail-sandbox — Simulate E-Wallet Payment Failure & Retry Eligibility (FR-4.7)
router.post('/fail-sandbox', optionalAuth, async (req, res, next) => {
  try {
    const { orderNumber, reason = 'Insufficient e-wallet balance or user cancelled authorization' } = req.body;
    if (!orderNumber) {
      return res.status(400).json({ success: false, message: 'Order number required' });
    }

    const order = await prisma.order.findUnique({ where: { orderNumber } });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.userId && req.user && order.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (order.paymentStatus === 'PAID') {
      return res.status(400).json({ success: false, message: 'Order is already paid' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { orderId: order.id, status: 'PENDING' },
        data: { status: 'FAILED' }
      });

      await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'FAILED' }
      });

      await tx.auditLog.create({
        data: {
          userId: req.user ? req.user.id : order.userId,
          action: 'EWALLET_PAYMENT_FAILED',
          entityType: 'Order',
          entityId: order.id,
          newValues: { orderNumber, reason },
          ipAddress: req.ip
        }
      });
    });

    res.json({
      success: true,
      message: `Payment failed: ${reason}. You may retry payment using any supported e-wallet.`,
      data: {
        orderNumber: order.orderNumber,
        paymentStatus: 'FAILED',
        orderStatus: order.orderStatus
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/payments/simulate — Demo Safety Fallback (Order Owner or Admin, DEMO_FALLBACK_ENABLED + sandboxMode only)
router.post('/simulate', authenticate, async (req, res, next) => {
  try {
    if (!isDemoFallbackEnabled()) {
      return res.status(403).json({
        success: false,
        message: 'Demo fallback is disabled. Set DEMO_FALLBACK_ENABLED=true and DEMO_MODE=true to enable payment simulation.'
      });
    }

    const platformCfg = await prisma.platformConfig.findUnique({ where: { id: 'default' } });
    if (platformCfg && platformCfg.sandboxMode === false) {
      return res.status(403).json({
        success: false,
        message: 'Payment simulation is only allowed in sandbox mode.'
      });
    }

    const { orderNumber } = req.body;
    if (!orderNumber) {
      return res.status(400).json({ success: false, message: 'Order number required' });
    }

    const order = await prisma.order.findUnique({ where: { orderNumber } });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const result = await finalizePayment({
      orderId: order.id,
      provider: 'SIMULATED',
      paymentMethod: order.paymentMethod || 'gcash',
      referenceNumber: `SIM-${uuidv4().slice(0, 8).toUpperCase()}`,
      actorId: req.user.id,
      isDemo: true,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: result.alreadyPaid ? 'Order already paid (idempotent)' : 'SIMULATED payment — demo mode only',
      data: {
        orderNumber: order.orderNumber,
        paymentStatus: 'PAID',
        orderStatus: 'CONFIRMED',
        isDemo: true,
        stockConflicts: result.stockConflicts || []
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/payments/:paymentId — Get payment status
router.get('/:paymentId', authenticate, async (req, res, next) => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.paymentId },
      include: { order: { select: { orderNumber: true, userId: true } } }
    });

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    if (payment.order.userId !== req.user.id && !['ADMIN', 'FINANCE_OFFICER'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({
      success: true,
      data: {
        id: payment.id,
        orderNumber: payment.order.orderNumber,
        provider: payment.provider,
        paymentMethod: payment.paymentMethod,
        status: payment.status,
        amountCentavos: payment.amountCentavos,
        amountFormatted: `₱${(payment.amountCentavos / 100).toFixed(2)}`,
        currency: payment.currency,
        isDemo: payment.isDemo,
        verifiedAt: payment.verifiedAt,
        financeVerified: payment.financeVerified,
        checkoutUrl: payment.providerCheckoutUrl,
        createdAt: payment.createdAt
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
