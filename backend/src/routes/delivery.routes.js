// Delivery & Shipment Management Routes — Delivery Personnel Portal (Feature 7: FR-7.1 to FR-7.11 & Process Flow 3)
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticate, requireDelivery } = require('../middleware/auth.middleware');
const { body, validationResult } = require('express-validator');

router.use(authenticate, requireDelivery);

// GET /api/delivery/shipments — View assigned & available shipments with customer/seller details (FR-7.1, FR-7.2, FR-7.3, FR-7.11)
router.get('/shipments', async (req, res, next) => {
  try {
    const { status } = req.query;

    // Ensure any paid/preparing/shipped SellerOrder without a Shipment has one created so Delivery Personnel can manage it
    const slicesWithoutShipment = await prisma.sellerOrder.findMany({
      where: {
        status: { in: ['PAID', 'CONFIRMED', 'PREPARING', 'SHIPPED'] },
        shipments: { none: {} }
      }
    });

    for (const slice of slicesWithoutShipment) {
      await prisma.shipment.create({
        data: {
          orderId: slice.orderId,
          sellerOrderId: slice.id,
          deliveryPersonnelId: req.user.role === 'DELIVERY_PERSONNEL' ? req.user.id : null,
          carrier: slice.carrier || 'STRIDERA Express Courier',
          trackingNumber: slice.trackingNumber || `STR-TRK-${slice.id.slice(0, 6).toUpperCase()}`,
          status: slice.status === 'SHIPPED' ? 'SHIPPED' : 'PREPARING',
          history: {
            events: [
              {
                status: 'PREPARING',
                note: 'Shipment queued for courier pickup',
                actor: 'system',
                timestamp: new Date().toISOString()
              }
            ]
          }
        }
      });
    }

    const where = {};
    if (status) where.status = status;

    const shipments = await prisma.shipment.findMany({
      where,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            orderStatus: true,
            paymentStatus: true,
            paymentMethod: true,
            shippingStatus: true,
            shippingFullName: true,
            shippingPhone: true,
            shippingAddressLine1: true,
            shippingAddressLine2: true,
            shippingCity: true,
            shippingProvince: true,
            shippingPostalCode: true,
            shippingCountry: true,
            estimatedDeliveryStart: true,
            estimatedDeliveryEnd: true,
            deliveryZone: true,
            deliveryScheduleSource: true,
            deliveryHolidaysObserved: true,
            notes: true,
            grandTotalCentavos: true,
            createdAt: true,
            items: true
          }
        },
        sellerOrder: {
          include: {
            seller: {
              select: {
                id: true,
                storeName: true,
                email: true,
                phone: true
              }
            },
            items: true
          }
        },
        deliveryPersonnel: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    const summary = {
      total: shipments.length,
      preparing: shipments.filter(s => ['PREPARING', 'ASSIGNED', 'COLLECTED'].includes(s.status)).length,
      inTransit: shipments.filter(s => ['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(s.status)).length,
      delivered: shipments.filter(s => s.status === 'DELIVERED').length,
      failedOrReturn: shipments.filter(s => ['FAILED', 'RETURN_PENDING'].includes(s.status)).length
    };

    res.json({
      success: true,
      data: {
        summary,
        shipments
      }
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/delivery/shipments/:id/accept — Accept delivery assignment (FR-7.4)
router.patch('/shipments/:id/accept', async (req, res, next) => {
  try {
    const shipment = await prisma.shipment.findUnique({ where: { id: req.params.id } });
    if (!shipment) return res.status(404).json({ success: false, message: 'Shipment not found' });

    const now = new Date();
    const prevEvents = Array.isArray(shipment.history?.events) ? shipment.history.events : [];
    const nextStatus = shipment.status === 'PREPARING' ? 'ASSIGNED' : shipment.status;

    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          deliveryPersonnelId: req.user.id,
          acceptedAt: now,
          status: nextStatus,
          history: {
            events: [
              ...prevEvents,
              {
                status: 'ASSIGNED',
                note: `Delivery assignment accepted by ${req.user.firstName} ${req.user.lastName}`,
                actor: req.user.email,
                timestamp: now.toISOString()
              }
            ]
          }
        }
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'DELIVERY_ACCEPT_ASSIGNMENT',
          entityType: 'Shipment',
          entityId: shipment.id,
          newValues: { deliveryPersonnelId: req.user.id, acceptedAt: now },
          ipAddress: req.ip
        }
      });

      return s;
    });

    res.json({
      success: true,
      message: 'Delivery assignment accepted.',
      data: updated
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/delivery/shipments/:id/collect — Confirm package collection from seller (FR-7.5)
router.patch('/shipments/:id/collect', async (req, res, next) => {
  try {
    const shipment = await prisma.shipment.findUnique({ where: { id: req.params.id } });
    if (!shipment) return res.status(404).json({ success: false, message: 'Shipment not found' });

    const now = new Date();
    const trackingNumber = req.body?.trackingNumber || shipment.trackingNumber || `STR-TRK-${shipment.id.slice(0, 6).toUpperCase()}`;
    const prevEvents = Array.isArray(shipment.history?.events) ? shipment.history.events : [];

    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          deliveryPersonnelId: shipment.deliveryPersonnelId || req.user.id,
          acceptedAt: shipment.acceptedAt || now,
          collectedAt: now,
          shippedAt: shipment.shippedAt || now,
          trackingNumber,
          status: 'SHIPPED',
          history: {
            events: [
              ...prevEvents,
              {
                status: 'SHIPPED',
                note: `Package collected from seller by ${req.user.firstName} ${req.user.lastName} (Tracking: ${trackingNumber})`,
                actor: req.user.email,
                timestamp: now.toISOString()
              }
            ]
          }
        }
      });

      if (shipment.sellerOrderId) {
        await tx.sellerOrder.update({
          where: { id: shipment.sellerOrderId },
          data: { status: 'SHIPPED', trackingNumber, shippedAt: now }
        });
      }

      await tx.order.update({
        where: { id: shipment.orderId },
        data: { shippingStatus: 'SHIPPED', orderStatus: 'SHIPPED' }
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'DELIVERY_COLLECT_PACKAGE',
          entityType: 'Shipment',
          entityId: shipment.id,
          newValues: { status: 'SHIPPED', collectedAt: now, trackingNumber },
          ipAddress: req.ip
        }
      });

      return s;
    });

    res.json({
      success: true,
      message: 'Package collection confirmed. Shipment is now SHIPPED.',
      data: updated
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/delivery/shipments/:id/status — Update delivery status & record proof of delivery (FR-7.6, FR-7.8, FR-7.9)
router.patch('/shipments/:id/status', [
  body('status').isIn(['PREPARING', 'ASSIGNED', 'COLLECTED', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED']).withMessage('Valid status required'),
  body('recipientName').optional().trim(),
  body('proofOfDeliveryUrl').optional().trim(),
  body('notes').optional().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { status, recipientName, proofOfDeliveryUrl, notes } = req.body;
    const shipment = await prisma.shipment.findUnique({ where: { id: req.params.id } });
    if (!shipment) return res.status(404).json({ success: false, message: 'Shipment not found' });

    const now = new Date();
    const prevEvents = Array.isArray(shipment.history?.events) ? shipment.history.events : [];

    const updated = await prisma.$transaction(async (tx) => {
      const updateData = {
        status,
        deliveryPersonnelId: shipment.deliveryPersonnelId || req.user.id,
        ...(notes !== undefined && { notes }),
        ...(recipientName && { recipientName }),
        ...(proofOfDeliveryUrl && { proofOfDeliveryUrl }),
        ...(status === 'SHIPPED' && !shipment.shippedAt && { shippedAt: now }),
        ...(status === 'DELIVERED' && { deliveredAt: now, failureReason: null }),
        history: {
          events: [
            ...prevEvents,
            {
              status,
              note: notes || (status === 'DELIVERED'
                ? `Delivered to ${recipientName || 'customer'}${proofOfDeliveryUrl ? ' (POD recorded)' : ''}`
                : `Shipment status updated to ${status}`),
              actor: req.user.email,
              timestamp: now.toISOString()
            }
          ]
        }
      };

      const s = await tx.shipment.update({
        where: { id: shipment.id },
        data: updateData
      });

      if (status === 'DELIVERED') {
        if (shipment.sellerOrderId) {
          await tx.sellerOrder.update({
            where: { id: shipment.sellerOrderId },
            data: { status: 'DELIVERED', deliveredAt: now }
          });
        }
        await tx.order.update({
          where: { id: shipment.orderId },
          data: { shippingStatus: 'DELIVERED', orderStatus: 'DELIVERED' }
        });
      } else if (status === 'OUT_FOR_DELIVERY') {
        await tx.order.update({
          where: { id: shipment.orderId },
          data: { shippingStatus: 'OUT_FOR_DELIVERY', orderStatus: 'SHIPPED' }
        });
      } else if (status === 'IN_TRANSIT') {
        await tx.order.update({
          where: { id: shipment.orderId },
          data: { shippingStatus: 'IN_TRANSIT', orderStatus: 'SHIPPED' }
        });
      }

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'DELIVERY_UPDATE_STATUS',
          entityType: 'Shipment',
          entityId: shipment.id,
          oldValues: { status: shipment.status },
          newValues: { status, recipientName, proofOfDeliveryUrl },
          ipAddress: req.ip
        }
      });

      return s;
    });

    res.json({
      success: true,
      message: `Shipment status updated to ${status}`,
      data: updated
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/delivery/shipments/:id/fail — Record failed delivery attempt or return initiation (FR-7.10)
router.patch('/shipments/:id/fail', [
  body('failureReason').trim().notEmpty().withMessage('Failure reason is required'),
  body('initiateReturn').optional().isBoolean()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { failureReason, initiateReturn = false } = req.body;
    const shipment = await prisma.shipment.findUnique({ where: { id: req.params.id } });
    if (!shipment) return res.status(404).json({ success: false, message: 'Shipment not found' });

    const now = new Date();
    const targetStatus = initiateReturn ? 'RETURN_PENDING' : 'FAILED';
    const prevEvents = Array.isArray(shipment.history?.events) ? shipment.history.events : [];

    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          status: targetStatus,
          failureReason,
          history: {
            events: [
              ...prevEvents,
              {
                status: targetStatus,
                note: `Failed Delivery: ${failureReason}${initiateReturn ? ' (Return to seller initiated)' : ''}`,
                actor: req.user.email,
                timestamp: now.toISOString()
              }
            ]
          }
        }
      });

      await tx.order.update({
        where: { id: shipment.orderId },
        data: { shippingStatus: targetStatus }
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'DELIVERY_FAILED_ATTEMPT',
          entityType: 'Shipment',
          entityId: shipment.id,
          newValues: { status: targetStatus, failureReason },
          ipAddress: req.ip
        }
      });

      return s;
    });

    res.json({
      success: true,
      message: `Recorded delivery failure (${targetStatus}): ${failureReason}`,
      data: updated
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

