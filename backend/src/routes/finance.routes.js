// Financial Management Routes — Finance Officer Portal (Feature 9: FR-9.1 to FR-9.11 & Process Flow 6)
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticate, requireFinance } = require('../middleware/auth.middleware');
const { body, validationResult } = require('express-validator');

router.use(authenticate, requireFinance);

function generatePayoutNumber() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `PAY-${dateStr}-${rand}`;
}

// GET /api/finance/dashboard — Financial overview, e-wallet transactions, seller earnings, payouts & refunds (FR-9.1 to FR-9.11)
router.get('/dashboard', async (req, res, next) => {
  try {
    const [
      config,
      payments,
      sellers,
      sellerOrders,
      payouts,
      refundTickets
    ] = await Promise.all([
      prisma.platformConfig.findUnique({ where: { id: 'default' } }),
      prisma.payment.findMany({
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              orderStatus: true,
              paymentStatus: true,
              shippingFullName: true,
              grandTotalCentavos: true,
              createdAt: true,
              user: { select: { email: true, firstName: true, lastName: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.user.findMany({
        where: { role: 'SELLER', sellerStatus: 'APPROVED' },
        select: { id: true, storeName: true, email: true, firstName: true, lastName: true, identificationDetails: true }
      }),
      prisma.sellerOrder.findMany({
        where: { status: { in: ['PAID', 'CONFIRMED', 'PREPARING', 'SHIPPED', 'DELIVERED'] } },
        include: {
          seller: { select: { id: true, storeName: true, email: true } },
          order: { select: { orderNumber: true, paymentStatus: true, createdAt: true } }
        }
      }),
      prisma.sellerPayout.findMany({
        include: {
          seller: { select: { id: true, storeName: true, email: true } },
          processedBy: { select: { id: true, firstName: true, lastName: true, email: true } }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.supportTicket.findMany({
        where: {
          OR: [
            { refundStatus: { not: 'NONE' } },
            { category: { in: ['REFUND', 'RETURN', 'CANCELLATION'] } }
          ]
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          order: { select: { id: true, orderNumber: true, grandTotalCentavos: true, paymentStatus: true, paymentMethod: true } }
        },
        orderBy: { updatedAt: 'desc' }
      })
    ]);

    const feePercent = config ? config.platformFeePercent : 5;

    const paidPayments = payments.filter(p => p.status === 'PAID');
    const grossRevenueCentavos = paidPayments.reduce((s, p) => s + p.amountCentavos, 0);
    const totalPlatformFeesCentavos = Math.floor((grossRevenueCentavos * feePercent) / 100);
    const totalNetSellerEarningsCentavos = grossRevenueCentavos - totalPlatformFeesCentavos;
    const totalPayoutsCentavos = payouts.reduce((s, p) => s + p.netAmountCentavos, 0);
    const completedRefundsCentavos = refundTickets
      .filter(t => t.refundStatus === 'COMPLETED')
      .reduce((s, t) => s + (t.refundAmountCentavos || t.order?.grandTotalCentavos || 0), 0);

    // Wallet breakdown
    const walletBreakdown = {
      gcash: paidPayments.filter(p => (p.paymentMethod || 'gcash') === 'gcash').reduce((s, p) => s + p.amountCentavos, 0),
      maya: paidPayments.filter(p => p.paymentMethod === 'maya').reduce((s, p) => s + p.amountCentavos, 0),
      paypal: paidPayments.filter(p => p.paymentMethod === 'paypal').reduce((s, p) => s + p.amountCentavos, 0)
    };

    // Per-seller earnings & payout calculation (FR-9.5, FR-9.6, FR-9.7)
    const sellerEarnings = sellers.map(seller => {
      const slices = sellerOrders.filter(so => so.sellerId === seller.id);
      const grossSalesCentavos = slices.reduce((s, so) => s + so.subtotalCentavos, 0);
      const feeCentavos = Math.floor((grossSalesCentavos * feePercent) / 100);
      const netEarnedCentavos = grossSalesCentavos - feeCentavos;
      const sellerPaidPayouts = payouts
        .filter(p => p.sellerId === seller.id)
        .reduce((s, p) => s + p.netAmountCentavos, 0);
      const unpaidBalanceCentavos = Math.max(0, netEarnedCentavos - sellerPaidPayouts);

      return {
        sellerId: seller.id,
        storeName: seller.storeName || `${seller.firstName} ${seller.lastName}`,
        email: seller.email,
        orderSliceCount: slices.length,
        grossSalesCentavos,
        grossSalesFormatted: `₱${(grossSalesCentavos / 100).toFixed(2)}`,
        platformFeePercent: feePercent,
        platformFeeCentavos: feeCentavos,
        platformFeeFormatted: `₱${(feeCentavos / 100).toFixed(2)}`,
        netEarnedCentavos,
        netEarnedFormatted: `₱${(netEarnedCentavos / 100).toFixed(2)}`,
        paidPayoutsCentavos: sellerPaidPayouts,
        paidPayoutsFormatted: `₱${(sellerPaidPayouts / 100).toFixed(2)}`,
        unpaidBalanceCentavos,
        unpaidBalanceFormatted: `₱${(unpaidBalanceCentavos / 100).toFixed(2)}`
      };
    });

    res.json({
      success: true,
      data: {
        metrics: {
          grossRevenueCentavos,
          grossRevenueFormatted: `₱${(grossRevenueCentavos / 100).toFixed(2)}`,
          platformFeePercent: feePercent,
          totalPlatformFeesCentavos,
          totalPlatformFeesFormatted: `₱${(totalPlatformFeesCentavos / 100).toFixed(2)}`,
          totalNetSellerEarningsCentavos,
          totalNetSellerEarningsFormatted: `₱${(totalNetSellerEarningsCentavos / 100).toFixed(2)}`,
          totalPayoutsCentavos,
          totalPayoutsFormatted: `₱${(totalPayoutsCentavos / 100).toFixed(2)}`,
          completedRefundsCentavos,
          completedRefundsFormatted: `₱${(completedRefundsCentavos / 100).toFixed(2)}`,
          totalTransactions: payments.length,
          paidTransactions: paidPayments.length,
          failedOrPendingTransactions: payments.length - paidPayments.length
        },
        walletBreakdown,
        sellerEarnings,
        payments,
        payouts,
        refundTickets
      }
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/finance/payments/:id/verify — Finance Officer verifies e-wallet transaction reference (FR-9.3)
router.patch('/payments/:id/verify', async (req, res, next) => {
  try {
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!payment) return res.status(404).json({ success: false, message: 'Payment record not found' });

    const now = new Date();
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        financeVerified: true,
        financeVerifiedBy: req.user.email,
        financeVerifiedAt: now
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'FINANCE_VERIFY_PAYMENT',
        entityType: 'Payment',
        entityId: payment.id,
        newValues: { financeVerified: true, financeVerifiedBy: req.user.email },
        ipAddress: req.ip
      }
    });

    res.json({
      success: true,
      message: 'Payment transaction reference verified by Finance Officer.',
      data: updated
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/finance/payouts — Record or simulate seller payout transaction (FR-9.7, FR-9.8)
router.post('/payouts', [
  body('sellerId').isUUID().withMessage('Valid seller ID required'),
  body('grossSalesCentavos').isInt({ min: 100 }).withMessage('Gross sales amount in centavos required'),
  body('provider').optional().trim(),
  body('referenceNumber').optional().trim(),
  body('notes').optional().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { sellerId, grossSalesCentavos, provider = 'gcash', referenceNumber, status = 'COMPLETED', notes } = req.body;

    const seller = await prisma.user.findUnique({ where: { id: sellerId } });
    if (!seller || seller.role !== 'SELLER') {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const config = await prisma.platformConfig.findUnique({ where: { id: 'default' } });
    const feePercent = config ? config.platformFeePercent : 5;
    const gross = parseInt(grossSalesCentavos);
    const feeCentavos = Math.floor((gross * feePercent) / 100);
    const netAmountCentavos = gross - feeCentavos;
    const ref = referenceNumber || `${provider.toUpperCase()}-PAYOUT-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

    const payout = await prisma.$transaction(async (tx) => {
      const p = await tx.sellerPayout.create({
        data: {
          payoutNumber: generatePayoutNumber(),
          sellerId,
          grossSalesCentavos: gross,
          platformFeePercent: feePercent,
          platformFeeCentavos: feeCentavos,
          netAmountCentavos,
          provider,
          referenceNumber: ref,
          status: ['PENDING', 'COMPLETED', 'SIMULATED'].includes(status) ? status : 'COMPLETED',
          processedById: req.user.id,
          notes: notes || `Seller payout settled via ${provider.toUpperCase()} (${feePercent}% platform commission deducted)`
        },
        include: {
          seller: { select: { id: true, storeName: true, email: true } }
        }
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'FINANCE_RECORD_SELLER_PAYOUT',
          entityType: 'SellerPayout',
          entityId: p.id,
          newValues: { payoutNumber: p.payoutNumber, sellerId, gross, feeCentavos, netAmountCentavos, ref },
          ipAddress: req.ip
        }
      });

      return p;
    });

    res.status(201).json({
      success: true,
      message: `Payout ${payout.payoutNumber} (Net: ₱${(netAmountCentavos / 100).toFixed(2)}) recorded for ${seller.storeName}.`,
      data: payout
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/finance/refunds/:ticketId/process — Process approved refund request (FR-9.9)
router.post('/refunds/:ticketId/process', async (req, res, next) => {
  try {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: req.params.ticketId },
      include: { order: true }
    });

    if (!ticket) return res.status(404).json({ success: false, message: 'Support ticket not found' });

    if (ticket.refundStatus === 'COMPLETED') {
      return res.status(400).json({ success: false, message: 'Refund has already been completed' });
    }

    const refundAmount = ticket.refundAmountCentavos || ticket.order?.grandTotalCentavos || 0;
    const refundRef = `REFUND-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

    const updatedTicket = await prisma.$transaction(async (tx) => {
      const t = await tx.supportTicket.update({
        where: { id: ticket.id },
        data: {
          refundStatus: 'COMPLETED',
          refundAmountCentavos: refundAmount,
          status: 'RESOLVED',
          resolutionNotes: `${ticket.resolutionNotes ? ticket.resolutionNotes + ' | ' : ''}Finance Officer settled refund of ₱${(refundAmount / 100).toFixed(2)} (Ref: ${refundRef}).`
        }
      });

      if (ticket.orderId) {
        await tx.order.update({
          where: { id: ticket.orderId },
          data: { paymentStatus: 'REFUNDED' }
        });

        await tx.payment.updateMany({
          where: { orderId: ticket.orderId },
          data: { status: 'REFUNDED' }
        });
      }

      await tx.supportMessage.create({
        data: {
          ticketId: ticket.id,
          senderId: req.user.id,
          senderRole: req.user.role,
          senderName: `${req.user.firstName} ${req.user.lastName} (Finance Officer)`,
          message: `Refund of ₱${(refundAmount / 100).toFixed(2)} has been processed and credited back to your e-wallet (Reference: ${refundRef}).`
        }
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'FINANCE_PROCESS_REFUND',
          entityType: 'SupportTicket',
          entityId: ticket.id,
          newValues: { refundStatus: 'COMPLETED', refundAmountCentavos: refundAmount, refundRef },
          ipAddress: req.ip
        }
      });

      return t;
    });

    res.json({
      success: true,
      message: `Refund of ₱${(refundAmount / 100).toFixed(2)} processed (Ref: ${refundRef}).`,
      data: updatedTicket
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/finance/reports — Generate exportable financial summary report (FR-9.10)
router.get('/reports', async (req, res, next) => {
  try {
    const [payments, payouts, refunds, config] = await Promise.all([
      prisma.payment.findMany({ where: { status: 'PAID' } }),
      prisma.sellerPayout.findMany(),
      prisma.supportTicket.findMany({ where: { refundStatus: 'COMPLETED' } }),
      prisma.platformConfig.findUnique({ where: { id: 'default' } })
    ]);

    const feePercent = config ? config.platformFeePercent : 5;
    const totalSalesCentavos = payments.reduce((s, p) => s + p.amountCentavos, 0);
    const totalFeesCentavos = Math.floor((totalSalesCentavos * feePercent) / 100);
    const totalPayoutsCentavos = payouts.reduce((s, p) => s + p.netAmountCentavos, 0);
    const totalRefundsCentavos = refunds.reduce((s, r) => s + (r.refundAmountCentavos || 0), 0);

    res.json({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        generatedBy: req.user.email,
        platformFeePercent: feePercent,
        totalSalesCentavos,
        totalSalesFormatted: `₱${(totalSalesCentavos / 100).toFixed(2)}`,
        totalFeesCentavos,
        totalFeesFormatted: `₱${(totalFeesCentavos / 100).toFixed(2)}`,
        totalPayoutsCentavos,
        totalPayoutsFormatted: `₱${(totalPayoutsCentavos / 100).toFixed(2)}`,
        totalRefundsCentavos,
        totalRefundsFormatted: `₱${(totalRefundsCentavos / 100).toFixed(2)}`,
        transactionCount: payments.length,
        payoutCount: payouts.length,
        refundCount: refunds.length
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

