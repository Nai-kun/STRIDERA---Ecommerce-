// Payment Routes — PayMongo sandbox integration & demo fallback
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

// POST /api/payments/create-session — Create a PayMongo checkout session
router.post('/create-session', authenticate, async (req, res, next) => {
  try {
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

    if (order.paymentStatus === 'PAID') {
      return res.status(400).json({ success: false, message: 'Order is already paid' });
    }

    // Check for existing pending payment (idempotency)
    const existingPayment = await prisma.payment.findFirst({
      where: { orderId: order.id, status: 'PENDING' }
    });

    if (existingPayment?.providerCheckoutUrl) {
      return res.json({
        success: true,
        data: {
          paymentId: existingPayment.id,
          checkoutUrl: existingPayment.providerCheckoutUrl,
          status: 'PENDING'
        }
      });
    }

    const idempotencyKey = uuidv4();

    // If PayMongo key is not configured, return a message
    if (!PAYMONGO_SECRET_KEY) {
      // Create a payment record with no provider URL
      const payment = await prisma.payment.create({
        data: {
          orderId: order.id,
          provider: 'paymongo',
          idempotencyKey,
          amountCentavos: order.grandTotalCentavos,
          currency: 'PHP',
          status: 'PENDING',
          isDemo: false
        }
      });

      return res.status(503).json({
        success: false,
        message: 'Payment gateway not configured. Use demo mode or configure PAYMONGO_SECRET_KEY.',
        paymentId: payment.id,
        demoModeAvailable: DEMO_MODE
      });
    }

    // Create PayMongo checkout session
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
          success_url: `${process.env.FRONTEND_URL}/orders/${order.orderNumber}/confirmation`,
          cancel_url: `${process.env.FRONTEND_URL}/orders/${order.orderNumber}`,
          metadata: {
            order_number: order.orderNumber,
            idempotency_key: idempotencyKey
          }
        }
      }
    });

    const checkoutUrl = sessionData.data.attributes.checkout_url;
    const providerPaymentId = sessionData.data.id;

    // Record payment
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: 'paymongo',
        providerPaymentId,
        providerCheckoutUrl: checkoutUrl,
        idempotencyKey,
        amountCentavos: order.grandTotalCentavos,
        currency: 'PHP',
        status: 'PENDING',
        isDemo: false
      }
    });

    // Update order payment status
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: 'PENDING' }
    });

    res.json({
      success: true,
      data: {
        paymentId: payment.id,
        checkoutUrl,
        status: 'PENDING'
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/payments/webhook — PayMongo webhook handler (raw body for signature verification)
router.post('/webhook', async (req, res, next) => {
  try {
    const rawBody = req.body; // raw Buffer from express.raw()

    // Verify webhook signature
    if (PAYMONGO_WEBHOOK_SECRET) {
      const signature = req.headers['paymongo-signature'];
      if (!signature) {
        return res.status(401).json({ success: false, message: 'Missing signature' });
      }

      // PayMongo sends: t=timestamp,te=test_signature,li=live_signature
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

      // Idempotent processing
      const payment = await prisma.payment.findFirst({
        where: { idempotencyKey, status: 'PENDING' }
      });

      if (!payment) {
        // Already processed or not found — return 200 to avoid retries
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
      // Create demo payment record
      await tx.payment.create({
        data: {
          orderId: order.id,
          provider: 'demo_simulation',
          providerPaymentId: `DEMO-${uuidv4().slice(0, 8)}`,
          idempotencyKey,
          amountCentavos: order.grandTotalCentavos,
          currency: 'PHP',
          status: 'PAID',
          isDemo: true,
          verifiedAt: new Date()
        }
      });

      // Update order
      await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'PAID',
          orderStatus: 'CONFIRMED'
        }
      });

      // Audit log
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

    if (payment.order.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({
      success: true,
      data: {
        id: payment.id,
        orderNumber: payment.order.orderNumber,
        provider: payment.provider,
        status: payment.status,
        amountCentavos: payment.amountCentavos,
        amountFormatted: `₱${(payment.amountCentavos / 100).toFixed(2)}`,
        currency: payment.currency,
        isDemo: payment.isDemo,
        verifiedAt: payment.verifiedAt,
        checkoutUrl: payment.providerCheckoutUrl,
        createdAt: payment.createdAt
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
