// Customer Support Management Routes — Shopper Ticket Submission & Support Portal (Feature 8: FR-8.1 to FR-8.11 & Process Flow 5)
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticate, optionalAuth, requireSupport } = require('../middleware/auth.middleware');
const { body, validationResult } = require('express-validator');
const { validateRequiredText, collectFieldErrors, sendValidationError } = require('../lib/validators');

function generateTicketNumber() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TKT-${dateStr}-${rand}`;
}

// POST /api/support/tickets — Shopper submits inquiry, complaint, cancellation, return, or refund request (FR-8.2)
router.post('/tickets', optionalAuth, [
  body('category').optional().isIn(['INQUIRY', 'COMPLAINT', 'CANCELLATION', 'RETURN', 'REFUND'])
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const bodyData = req.body || {};
    const collected = collectFieldErrors({
      subject: validateRequiredText(bodyData.subject, 'Subject', { min: 3, max: 150 }),
      description: validateRequiredText(bodyData.description, 'Details / Reason', { min: 5, max: 2000 })
    });
    if (!collected.ok) {
      return sendValidationError(res, collected);
    }

    const { category = 'INQUIRY', orderNumber, orderId, priority = 'MEDIUM' } = bodyData;
    const { subject, description } = collected.values;

    let order = null;
    if (orderId) {
      order = await prisma.order.findUnique({ where: { id: orderId }, include: { sellerOrders: true } });
    } else if (orderNumber) {
      order = await prisma.order.findUnique({ where: { orderNumber }, include: { sellerOrders: true } });
    }

    let ticketUser = req.user || null;
    if (!ticketUser && order?.userId) {
      ticketUser = await prisma.user.findUnique({ where: { id: order.userId } });
    }
    if (!ticketUser && order?.guestEmail) {
      ticketUser = await prisma.user.findUnique({ where: { email: order.guestEmail } });
    }
    if (!ticketUser) {
      ticketUser = await prisma.user.findFirst({ where: { role: 'CUSTOMER', isActive: true } });
    }
    if (!ticketUser) {
      return res.status(401).json({ success: false, message: 'Authentication required or session expired' });
    }

    const senderName = req.user ? `${req.user.firstName} ${req.user.lastName}` : (order?.shippingFullName || `${ticketUser.firstName} ${ticketUser.lastName}`);
    const senderRole = req.user ? req.user.role : 'CUSTOMER';

    const defaultSupport = await prisma.user.findFirst({
      where: { role: 'CUSTOMER_SUPPORT', isActive: true }
    });

    const isRefundOrReturn = ['REFUND', 'RETURN', 'CANCELLATION'].includes(category);

    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber: generateTicketNumber(),
        userId: ticketUser.id,
        orderId: order ? order.id : null,
        sellerId: order?.sellerOrders?.[0]?.sellerId || null,
        assignedToId: defaultSupport ? defaultSupport.id : null,
        category,
        subject,
        description,
        status: 'OPEN',
        priority,
        refundStatus: isRefundOrReturn ? 'PENDING' : 'NONE',
        refundAmountCentavos: isRefundOrReturn && order ? order.grandTotalCentavos : null,
        messages: {
          create: [
            {
              senderId: ticketUser.id,
              senderRole,
              senderName,
              message: description
            }
          ]
        }
      },
      include: {
        order: { select: { orderNumber: true, orderStatus: true, paymentStatus: true, grandTotalCentavos: true } },
        messages: true
      }
    });

    if (order && category === 'RETURN') {
      await prisma.order.update({
        where: { id: order.id },
        data: { orderStatus: 'RETURN_REQUESTED' }
      });
    }

    res.status(201).json({
      success: true,
      message: `Support ticket ${ticket.ticketNumber} created successfully.`,
      data: ticket
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/support/my-tickets — Shopper views own support tickets
router.get('/my-tickets', authenticate, async (req, res, next) => {
  try {
    const tickets = await prisma.supportTicket.findMany({
      where: { userId: req.user.id },
      include: {
        order: { select: { id: true, orderNumber: true, orderStatus: true, paymentStatus: true, grandTotalCentavos: true } },
        messages: { orderBy: { createdAt: 'asc' } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, data: tickets });
  } catch (err) {
    next(err);
  }
});

// POST /api/support/tickets/:id/messages — Add reply to ticket (Ticket owner or Support/Admin) (FR-8.7)
router.post('/tickets/:id/messages', authenticate, [
  body('message').trim().notEmpty().withMessage('Message cannot be empty')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

    const isSupportOrAdmin = ['CUSTOMER_SUPPORT', 'ADMIN'].includes(req.user.role);
    if (ticket.userId !== req.user.id && !isSupportOrAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const msg = await prisma.supportMessage.create({
      data: {
        ticketId: ticket.id,
        senderId: req.user.id,
        senderRole: req.user.role,
        senderName: `${req.user.firstName} ${req.user.lastName}${isSupportOrAdmin ? ' (Support)' : ''}`,
        message: req.body.message.trim()
      }
    });

    if (isSupportOrAdmin && ticket.status === 'OPEN') {
      await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { status: 'IN_PROGRESS', assignedToId: req.user.id }
      });
    }

    res.status(201).json({ success: true, data: msg });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────
// CUSTOMER SUPPORT PERSONNEL PORTAL ENDPOINTS (FR-8.1 to FR-8.11)
// ────────────────────────────────────────────────

// GET /api/support/tickets — View all tickets with order, payment, and shipment details (FR-8.3, FR-8.5, FR-8.6, FR-8.11)
router.get('/tickets', authenticate, requireSupport, async (req, res, next) => {
  try {
    const { status, category, search } = req.query;
    const where = {};
    if (status) where.status = status;
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { ticketNumber: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { order: { orderNumber: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const tickets = await prisma.supportTicket.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        order: {
          include: {
            items: true,
            payments: true,
            shipments: true,
            sellerOrders: {
              include: { seller: { select: { id: true, storeName: true, email: true } } }
            }
          }
        },
        messages: { orderBy: { createdAt: 'asc' } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const summary = {
      total: tickets.length,
      open: tickets.filter(t => t.status === 'OPEN').length,
      inProgress: tickets.filter(t => t.status === 'IN_PROGRESS').length,
      resolved: tickets.filter(t => t.status === 'RESOLVED' || t.status === 'CLOSED').length,
      pendingRefunds: tickets.filter(t => t.refundStatus === 'PENDING' || t.refundStatus === 'APPROVED').length
    };

    res.json({
      success: true,
      data: {
        summary,
        tickets
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/support/orders/lookup — Look up order, payment & delivery status for support verification (FR-8.5, FR-8.6)
router.get('/orders/lookup', authenticate, requireSupport, async (req, res, next) => {
  try {
    const { q } = req.query;
    const where = q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: 'insensitive' } },
            { shippingFullName: { contains: q, mode: 'insensitive' } },
            { user: { email: { contains: q, mode: 'insensitive' } } }
          ]
        }
      : {};

    const orders = await prisma.order.findMany({
      where,
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        items: true,
        payments: true,
        shipments: true,
        sellerOrders: { include: { seller: { select: { id: true, storeName: true } } } }
      }
    });

    res.json({ success: true, data: orders });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/support/tickets/:id/status — Update ticket status & resolution notes (FR-8.4, FR-8.10)
router.patch('/tickets/:id/status', authenticate, requireSupport, [
  body('status').isIn(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).withMessage('Valid status required'),
  body('resolutionNotes').optional().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { status, resolutionNotes } = req.body;
    const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status,
        assignedToId: ticket.assignedToId || req.user.id,
        ...(resolutionNotes !== undefined && { resolutionNotes })
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'SUPPORT_UPDATE_TICKET_STATUS',
        entityType: 'SupportTicket',
        entityId: ticket.id,
        oldValues: { status: ticket.status },
        newValues: { status, resolutionNotes },
        ipAddress: req.ip
      }
    });

    res.json({
      success: true,
      message: `Ticket ${ticket.ticketNumber} status updated to ${status}`,
      data: updated
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/support/tickets/:id/action — Process cancellation, return, or escalate refund to Finance (FR-8.8, FR-8.9)
router.patch('/tickets/:id/action', authenticate, requireSupport, [
  body('action').isIn(['APPROVE_CANCELLATION', 'APPROVE_RETURN', 'APPROVE_REFUND', 'REJECT_REFUND']).withMessage('Valid action required'),
  body('resolutionNotes').optional().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { action, resolutionNotes, refundAmountCentavos } = req.body;
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: req.params.id },
      include: { order: { include: { items: true } } }
    });
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

    const updated = await prisma.$transaction(async (tx) => {
      let nextRefundStatus = ticket.refundStatus;
      let nextTicketStatus = 'IN_PROGRESS';
      let systemMessage = '';

      if (action === 'APPROVE_CANCELLATION') {
        if (ticket.order && ticket.order.orderStatus !== 'CANCELLED') {
          for (const item of ticket.order.items) {
            await tx.productVariant.update({
              where: { id: item.productVariantId },
              data: { stockQuantity: { increment: item.quantity } }
            });
            const v = await tx.productVariant.findUnique({ where: { id: item.productVariantId } });
            await tx.stockMovement.create({
              data: {
                productVariantId: item.productVariantId,
                quantityChange: item.quantity,
                stockAfter: v.stockQuantity,
                movementType: 'INCOMING',
                reason: `SUPPORT_CANCELLATION_${ticket.ticketNumber}`,
                referenceId: req.user.id
              }
            });
          }

          await tx.order.update({
            where: { id: ticket.order.id },
            data: { orderStatus: 'CANCELLED' }
          });

          await tx.sellerOrder.updateMany({
            where: { orderId: ticket.order.id },
            data: { status: 'CANCELLED', notes: `Cancelled via Support Ticket ${ticket.ticketNumber}` }
          });
        }
        nextRefundStatus = ticket.order?.paymentStatus === 'PAID' ? 'APPROVED' : 'NONE';
        nextTicketStatus = 'RESOLVED';
        systemMessage = `Order cancellation approved by Support. Inventory restored${nextRefundStatus === 'APPROVED' ? ' and refund escalated to Finance Officer.' : '.'}`;
      } else if (action === 'APPROVE_RETURN') {
        if (ticket.order) {
          await tx.order.update({
            where: { id: ticket.order.id },
            data: { orderStatus: 'RETURNED', shippingStatus: 'RETURN_PENDING' }
          });
        }
        nextRefundStatus = 'APPROVED';
        nextTicketStatus = 'IN_PROGRESS';
        systemMessage = 'Return request approved by Customer Support and escalated to Finance Officer for refund settlement.';
      } else if (action === 'APPROVE_REFUND') {
        nextRefundStatus = 'APPROVED';
        nextTicketStatus = 'IN_PROGRESS';
        systemMessage = 'Refund request verified and approved by Customer Support. Forwarded to Finance Officer for payout settlement.';
      } else if (action === 'REJECT_REFUND') {
        nextRefundStatus = 'REJECTED';
        nextTicketStatus = 'RESOLVED';
        systemMessage = `Refund/Return request declined: ${resolutionNotes || 'Does not meet return policy criteria.'}`;
      }

      const t = await tx.supportTicket.update({
        where: { id: ticket.id },
        data: {
          status: nextTicketStatus,
          refundStatus: nextRefundStatus,
          refundAmountCentavos: refundAmountCentavos || ticket.refundAmountCentavos || ticket.order?.grandTotalCentavos || 0,
          resolutionNotes: resolutionNotes || systemMessage,
          assignedToId: req.user.id
        }
      });

      await tx.supportMessage.create({
        data: {
          ticketId: ticket.id,
          senderId: req.user.id,
          senderRole: req.user.role,
          senderName: `${req.user.firstName} ${req.user.lastName} (Support)`,
          message: systemMessage
        }
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: `SUPPORT_${action}`,
          entityType: 'SupportTicket',
          entityId: ticket.id,
          newValues: { action, refundStatus: nextRefundStatus, status: nextTicketStatus },
          ipAddress: req.ip
        }
      });

      return t;
    });

    res.json({
      success: true,
      message: `Action ${action} completed on ticket ${ticket.ticketNumber}.`,
      data: updated
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

