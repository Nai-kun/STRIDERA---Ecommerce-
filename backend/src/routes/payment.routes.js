// Payment Routes — Multi-Wallet Processing (GCash, Maya, PayPal), Sandbox QR/Session, Webhook & Admin Demo Simulation (FR-4.1 to FR-4.12)
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticate, isAdmin } = require('../middleware/auth.middleware');
const { createError } = require('../middleware/error.middleware');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const PAYMONGO_WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;
const PAYMONGO_API_URL = 'https://api.paymongo.com/v1';
const DEMO_MODE = process.env.DEMO_MODE === 'true';

/**
 * Helper: Make a PayMongo API request
 */
async function paymongoRequest(endpoint, method = 'GET', body = null) {
  const headers = {
    'Authorization': `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${PAYMONGO_API_URL}${endpoint}`, options);
  const data = await res.json();

  if (!res.ok) {
    const msg = data.errors?.[0]?.detail || 'PayMongo API error';
    throw createError(msg, res.status);
  }

  return data;
}

// POST /api/payments/create-session — Create an E-Wallet Checkout Session (GCash, Maya, PayPal) (FR-4.1 to FR-4.5)
router.post('/create-session', authenticate, async (req, res, next) => {
  try {
    const { orderNumber, paymentMethod: rawMethod } = req.body;

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
          sandboxMode: !PAYMONGO_SECRET_KEY,
          qrCodeData: qrPayload,
          referenceNumber: existingPayment.providerPaymentId || `${walletLabel.toUpperCase()}-REF-${existingPayment.id.slice(0, 8).toUpperCase()}`,
          amountCentavos: order.grandTotalCentavos,
          amountFormatted: `₱${(order.grandTotalCentavos / 100).toFixed(2)}`,
          status: 'PENDING'
        }
      });
    }

    const idempotencyKey = uuidv4();
    const referenceNumber = `${walletLabel.toUpperCase()}-REF-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    // If PayMongo key is not configured, provide built-in Sandbox E-Wallet QR & Session (FR-4.2, FR-4.3, FR-4.5)
    if (!PAYMONGO_SECRET_KEY) {
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
          demoModeAvailable: DEMO_MODE
        }
      });
    }

    // Create live/sandbox PayMongo checkout session
    const sessionData = await paymongoRequest('/checkout_sessions', 'POST', {
      data: {
        attributes: {
          send_email_receipt: false,
          show_description: true,
          show_line_items: true,
          description: `STRIDERA Order ${order.orderNumber}`,
          line_items: [{
            currency: 'PHP',
            amount: order.grandTotalCentavos,
            name: `Order ${order.orderNumber}`,
            quantity: 1
          }],
          payment_method_types: ['gcash', 'grab_pay', 'paymaya'],
          success_url: `${process.env.FRONTEND_URL}/account/orders/${order.orderNumber}`,
          cancel_url: `${process.env.FRONTEND_URL}/account/orders/${order.orderNumber}`,
          metadata: {
            order_number: order.orderNumber,
            idempotency_key: idempotencyKey
          }
        }
      }
    });

    const checkoutUrl = sessionData.data.attributes.checkout_url;
    const providerPaymentId = sessionData.data.id;

    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: 'paymongo',
        paymentMethod,
        providerPaymentId,
        providerCheckoutUrl: checkoutUrl,
        idempotencyKey,
        amountCentavos: order.grandTotalCentavos,
        currency: 'PHP',
        status: 'PENDING',
        isDemo: false
      }
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: 'PENDING', paymentMethod }
    });

    res.json({
      success: true,
      data: {
        paymentId: payment.id,
        paymentMethod,
        walletLabel,
        checkoutUrl,
        sandboxMode: false,
        qrCodeData: qrPayload,
        referenceNumber: providerPaymentId,
        amountCentavos: order.grandTotalCentavos,
        amountFormatted: `₱${(order.grandTotalCentavos / 100).toFixed(2)}`,
        status: 'PENDING'
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/payments/confirm-sandbox — Confirm E-Wallet Sandbox Payment (FR-4.4, FR-4.6, FR-4.8, FR-4.10)
router.post('/confirm-sandbox', authenticate, async (req, res, next) => {
  try {
    const { orderNumber, paymentId, paymentMethod: rawMethod } = req.body;

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

    const refNumber = `${paymentMethod.toUpperCase()}-PAID-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    await prisma.$transaction(async (tx) => {
      let existing = paymentId
        ? await tx.payment.findUnique({ where: { id: paymentId } })
        : await tx.payment.findFirst({ where: { orderId: order.id, status: 'PENDING' } });

      if (existing) {
        await tx.payment.update({
          where: { id: existing.id },
          data: {
            status: 'PAID',
            paymentMethod,
            providerPaymentId: existing.providerPaymentId || refNumber,
            verifiedAt: new Date()
          }
        });
      } else {
        await tx.payment.create({
          data: {
            orderId: order.id,
            provider: `${paymentMethod}_sandbox`,
            paymentMethod,
            providerPaymentId: refNumber,
            idempotencyKey: uuidv4(),
            amountCentavos: order.grandTotalCentavos,
            currency: 'PHP',
            status: 'PAID',
            isDemo: true,
            verifiedAt: new Date()
          }
        });
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'PAID',
          orderStatus: 'CONFIRMED',
          paymentMethod
        }
      });

      await tx.sellerOrder.updateMany({
        where: { orderId: order.id, status: 'PENDING' },
        data: { status: 'PAID' }
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'EWALLET_PAYMENT_CONFIRMED',
          entityType: 'Order',
          entityId: order.id,
          newValues: { orderNumber, paymentMethod, amountCentavos: order.grandTotalCentavos },
          ipAddress: req.ip
        }
      });
    });

    res.json({
      success: true,
      message: `E-Wallet (${paymentMethod.toUpperCase()}) payment verified! Order is now CONFIRMED.`,
      data: {
        orderNumber: order.orderNumber,
        paymentMethod,
        paymentStatus: 'PAID',
        orderStatus: 'CONFIRMED'
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/payments/fail-sandbox — Simulate E-Wallet Payment Failure & Retry Eligibility (FR-4.7)
router.post('/fail-sandbox', authenticate, async (req, res, next) => {
  try {
    const { orderNumber, reason = 'Insufficient e-wallet balance or user cancelled authorization' } = req.body;
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
          userId: req.user.id,
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

// POST /api/payments/webhook — PayMongo webhook handler (raw body for signature verification, FR-4.4 & FR-4.10)
router.post('/webhook', async (req, res, next) => {
  try {
    const rawBody = req.body;

    if (PAYMONGO_WEBHOOK_SECRET) {
      const signature = req.headers['paymongo-signature'];
      if (!signature) {
        return res.status(401).json({ success: false, message: 'Missing signature' });
      }

      const parts = signature.split(',').reduce((acc, part) => {
        const [key, val] = part.split('=');
        acc[key] = val;
        return acc;
      }, {});

      const timestamp = parts.t;
      const testSig = parts.te;
      const liveSig = parts.li;

      const payload = `${timestamp}.${rawBody.toString()}`;
      const expectedSig = crypto.createHmac('sha256', PAYMONGO_WEBHOOK_SECRET).update(payload).digest('hex');

      const sigToCheck = testSig || liveSig;
      if (sigToCheck !== expectedSig) {
        return res.status(401).json({ success: false, message: 'Invalid signature' });
      }
    }

    const event = JSON.parse(rawBody.toString());
    const eventType = event.data?.attributes?.type;
    const eventData = event.data?.attributes?.data;

    if (eventType === 'checkout_session.payment.paid') {
      const metadata = eventData?.attributes?.metadata;
      const orderNumber = metadata?.order_number;
      const idempotencyKey = metadata?.idempotency_key;

      if (!orderNumber) {
        return res.status(400).json({ success: false, message: 'Missing order number in metadata' });
      }

      const payment = await prisma.payment.findFirst({
        where: { idempotencyKey, status: 'PENDING' }
      });

      if (!payment) {
        return res.json({ success: true, message: 'Already processed or not found' });
      }

      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'PAID',
            providerPaymentId: eventData?.id || payment.providerPaymentId,
            webhookEventId: event.data?.id,
            verifiedAt: new Date()
          }
        });

        await tx.order.update({
          where: { id: payment.orderId },
          data: {
            paymentStatus: 'PAID',
            orderStatus: 'CONFIRMED'
          }
        });

        await tx.sellerOrder.updateMany({
          where: { orderId: payment.orderId, status: 'PENDING' },
          data: { status: 'PAID' }
        });
      });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/payments/simulate — Demo Safety Fallback (admin only, DEMO_MODE only)
router.post('/simulate', authenticate, isAdmin, async (req, res, next) => {
  try {
    if (!DEMO_MODE) {
      return res.status(403).json({
        success: false,
        message: 'Demo mode is disabled. Set DEMO_MODE=true to enable payment simulation.'
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

    if (order.paymentStatus === 'PAID') {
      return res.status(400).json({ success: false, message: 'Order is already paid' });
    }

    const idempotencyKey = uuidv4();

    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          orderId: order.id,
          provider: 'demo_simulation',
          paymentMethod: order.paymentMethod || 'gcash',
          providerPaymentId: `DEMO-${uuidv4().slice(0, 8)}`,
          idempotencyKey,
          amountCentavos: order.grandTotalCentavos,
          currency: 'PHP',
          status: 'PAID',
          isDemo: true,
          verifiedAt: new Date()
        }
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'PAID',
          orderStatus: 'CONFIRMED'
        }
      });

      await tx.sellerOrder.updateMany({
        where: { orderId: order.id, status: 'PENDING' },
        data: { status: 'PAID' }
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'SIMULATE_PAYMENT',
          entityType: 'Order',
          entityId: order.id,
          newValues: { orderNumber, amount: order.grandTotalCentavos, simulatedBy: req.user.email },
          ipAddress: req.ip
        }
      });
    });

    res.json({
      success: true,
      message: '⚠️ SIMULATED payment — demo mode only',
      data: {
        orderNumber: order.orderNumber,
        paymentStatus: 'PAID',
        orderStatus: 'CONFIRMED',
        isDemo: true
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
