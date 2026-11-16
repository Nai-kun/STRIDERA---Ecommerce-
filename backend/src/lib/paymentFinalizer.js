// Transactional, Idempotent Payment Finalization & Order Status Derivation (REV-05, REV-06, D2, D9, D13)
const prisma = require('./prisma');
const { v4: uuidv4 } = require('uuid');

/**
 * Derive canonical order status (PENDING | PAID | SHIPPED | CANCELLED) + isPartiallyShipped flag per D2
 */
function deriveCanonicalOrderStatus(order, items = []) {
  if (!order) return { canonicalStatus: 'PENDING', isPartiallyShipped: false };
  if (order.orderStatus === 'CANCELLED') {
    return { canonicalStatus: 'CANCELLED', isPartiallyShipped: false };
  }
  if (order.paymentStatus !== 'PAID') {
    return { canonicalStatus: 'PENDING', isPartiallyShipped: false };
  }
  const activeItems = (items || []).filter(i => i.fulfillmentStatus !== 'CANCELLED');
  if (items && items.length > 0 && activeItems.length === 0) {
    return { canonicalStatus: 'CANCELLED', isPartiallyShipped: false };
  }
  const shippedCount = activeItems.filter(i => i.fulfillmentStatus === 'SHIPPED').length;
  if (activeItems.length > 0 && shippedCount === activeItems.length) {
    return { canonicalStatus: 'SHIPPED', isPartiallyShipped: false };
  }
  if (order.orderStatus === 'SHIPPED' || order.orderStatus === 'DELIVERED') {
    return { canonicalStatus: 'SHIPPED', isPartiallyShipped: false };
  }
  return {
    canonicalStatus: 'PAID',
    isPartiallyShipped: shippedCount > 0 && shippedCount < activeItems.length
  };
}

/**
 * Single transactional, idempotent payment finalization function (D9).
 * Called by:
 *   1. Webhook handler (POST /api/payments/webhook)
 *   2. Sandbox confirm (POST /api/payments/confirm-sandbox)
 *   3. Demo Simulate Payment Success (POST /api/payments/simulate)
 */
async function finalizePayment({
  orderId,
  provider = 'paymongo_sandbox',
  referenceNumber = null,
  paymentMethod = 'gcash',
  actorId = null,
  isDemo = false,
  webhookEventId = null,
  paymentId = null,
  ipAddress = null
}) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });

    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    // Idempotency guard: do nothing on a second call
    if (order.paymentStatus === 'PAID') {
      return { alreadyPaid: true, order, stockConflicts: [] };
    }

    const stockConflicts = [];

    // Decrement stock only if not already decremented (supports both new checkout-without-decrement and legacy orders)
    if (!order.stockDecremented) {
      for (const item of order.items) {
        // Conditional atomic update: never oversell below 0
        const updated = await tx.productVariant.updateMany({
          where: {
            id: item.productVariantId,
            stockQuantity: { gte: item.quantity }
          },
          data: {
            stockQuantity: { decrement: item.quantity }
          }
        });

        if (updated.count === 0) {
          // Concurrent buyer took the last pair: flag stockConflict instead of overselling
          await tx.orderItem.update({
            where: { id: item.id },
            data: { stockConflict: true }
          });
          stockConflicts.push({
            orderItemId: item.id,
            productName: item.productName,
            variantSku: item.variantSku,
            requestedQty: item.quantity
          });
        } else {
          const afterVariant = await tx.productVariant.findUnique({
            where: { id: item.productVariantId }
          });
          await tx.stockMovement.create({
            data: {
              productVariantId: item.productVariantId,
              quantityChange: -item.quantity,
              stockAfter: afterVariant ? afterVariant.stockQuantity : 0,
              movementType: 'OUTGOING',
              reason: 'PAYMENT_CONFIRMED',
              referenceId: order.orderNumber
            }
          });
        }
      }
    }

    const resolvedRef = referenceNumber || `${String(paymentMethod).toUpperCase()}-PAID-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    // Update or create Payment record
    let existingPayment = paymentId
      ? await tx.payment.findUnique({ where: { id: paymentId } })
      : await tx.payment.findFirst({ where: { orderId: order.id, status: 'PENDING' } });

    if (existingPayment) {
      await tx.payment.update({
        where: { id: existingPayment.id },
        data: {
          status: 'PAID',
          provider,
          paymentMethod,
          providerPaymentId: existingPayment.providerPaymentId || resolvedRef,
          webhookEventId: webhookEventId || existingPayment.webhookEventId,
          isDemo,
          verifiedAt: new Date()
        }
      });
    } else {
      await tx.payment.create({
        data: {
          orderId: order.id,
          provider,
          paymentMethod,
          providerPaymentId: resolvedRef,
          idempotencyKey: uuidv4(),
          amountCentavos: order.grandTotalCentavos,
          currency: 'PHP',
          status: 'PAID',
          isDemo,
          webhookEventId,
          verifiedAt: new Date()
        }
      });
    }

    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: 'PAID',
        orderStatus: 'CONFIRMED',
        paymentMethod,
        stockDecremented: true
      }
    });

    await tx.sellerOrder.updateMany({
      where: { orderId: order.id, status: 'PENDING' },
      data: { status: 'PAID' }
    });

    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: provider === 'SIMULATED' ? 'DEMO_PAYMENT_SIMULATED' : 'EWALLET_PAYMENT_CONFIRMED',
        entityType: 'Order',
        entityId: order.id,
        newValues: {
          orderNumber: order.orderNumber,
          provider,
          paymentMethod,
          referenceNumber: resolvedRef,
          amountCentavos: order.grandTotalCentavos,
          stockConflictsCount: stockConflicts.length
        },
        ipAddress
      }
    });

    if (stockConflicts.length > 0) {
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'STOCK_CONFLICT_DETECTED',
          entityType: 'Order',
          entityId: order.id,
          newValues: { orderNumber: order.orderNumber, stockConflicts },
          ipAddress
        }
      });
    }

    return { alreadyPaid: false, order: updatedOrder, stockConflicts, referenceNumber: resolvedRef };
  });
}

module.exports = {
  finalizePayment,
  deriveCanonicalOrderStatus
};
