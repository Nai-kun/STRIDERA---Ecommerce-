'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  getOrder,
  confirmOrderReceipt,
  cancelOrder,
  confirmSandboxPayment,
  createSupportTicket
} from '../../../../lib/api';
import InlineFieldError from '../../../../components/InlineFieldError';
import { validateRequiredText, focusFirstInvalidField } from '../../../../lib/validation';

const TICKET_FIELD_IDS = {
  subject: 'ord-ticket-subject',
  description: 'ord-ticket-description'
};

export default function OrderDetailPage() {
  const { orderNumber } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  // Support / Return / Refund Ticket Modal (FR-8.2)
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    category: 'INQUIRY',
    subject: '',
    description: ''
  });
  const [ticketErrors, setTicketErrors] = useState({});

  const loadOrder = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getOrder(orderNumber);
      setOrder(res.data);
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Could not load order details.' });
    } finally {
      setLoading(false);
    }
  }, [orderNumber]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const handleConfirmReceipt = async () => {
    setActionLoading(true);
    try {
      const res = await confirmOrderReceipt(orderNumber);
      setMsg({ type: 'success', text: res.message });
      await loadOrder();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelOrder = async () => {
    setActionLoading(true);
    try {
      const res = await cancelOrder(orderNumber);
      setMsg({ type: 'success', text: res.message });
      await loadOrder();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetryPayment = async (wallet = 'gcash') => {
    setActionLoading(true);
    try {
      const res = await confirmSandboxPayment(orderNumber, wallet);
      setMsg({ type: 'success', text: res.message });
      await loadOrder();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitTicket = async (e) => {
    e.preventDefault();
    if (actionLoading) return;

    const subjectRes = validateRequiredText(ticketForm.subject, 'Subject', { min: 3, max: 150 });
    const descRes = validateRequiredText(ticketForm.description, 'Details / Reason', { min: 5, max: 2000 });
    const nextErrors = {
      ...(subjectRes.valid ? {} : { subject: subjectRes.error }),
      ...(descRes.valid ? {} : { description: descRes.error })
    };
    setTicketErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalidField(nextErrors, TICKET_FIELD_IDS);
      return;
    }

    setActionLoading(true);
    try {
      const res = await createSupportTicket({
        category: ticketForm.category,
        subject: subjectRes.value,
        description: descRes.value,
        orderNumber: order.orderNumber,
        orderId: order.id
      });
      setShowTicketModal(false);
      setTicketErrors({});
      setTicketForm({ category: 'INQUIRY', subject: '', description: '' });
      setMsg({ type: 'success', text: res.message });
      await loadOrder();
    } catch (err) {
      if (err.fieldErrors) setTicketErrors(err.fieldErrors);
      setMsg({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Loading Order #{orderNumber}…</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>Order Not Found</h1>
        <Link href="/account/orders" className="btn btn-primary">← Back to My Orders</Link>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', paddingBlock: 'var(--space-8)' }}>
      <div className="container" style={{ maxWidth: 920 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <Link href="/account/orders" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
              ← Back to My Orders
            </Link>
            <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, marginTop: 4 }}>
              Order #{order.orderNumber}
            </h1>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              Placed on {new Date(order.createdAt).toLocaleString('en-PH')}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {['SHIPPED', 'PROCESSING', 'CONFIRMED'].includes(order.orderStatus) && !order.receivedConfirmedAt && (
              <button
                className="btn btn-primary btn-sm"
                onClick={handleConfirmReceipt}
                disabled={actionLoading}
              >
                ✓ Confirm Order Receipt (FR-7.7)
              </button>
            )}

            {['PENDING', 'CONFIRMED'].includes(order.orderStatus) && (
              <button
                className="btn btn-outline btn-sm"
                onClick={handleCancelOrder}
                disabled={actionLoading}
                style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}
              >
                Cancel Order (FR-3.12)
              </button>
            )}

            <button
              className="btn btn-outline btn-sm"
              onClick={() => {
                setTicketForm({
                  category: order.orderStatus === 'DELIVERED' ? 'RETURN' : 'INQUIRY',
                  subject: `Support Request for Order ${order.orderNumber}`,
                  description: ''
                });
                setShowTicketModal(true);
              }}
            >
              🎧 Request Support / Return / Refund (FR-8.2)
            </button>
          </div>
        </div>

        {msg && (
          <div role="alert" style={{
            padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-6)', fontWeight: 600, fontSize: 'var(--text-sm)',
            background: msg.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            color: msg.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
            border: `1px solid ${msg.type === 'success' ? 'var(--color-success)' : 'var(--color-error)'}`
          }}>
            {msg.text}
          </div>
        )}

        {/* Status Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Order Status</p>
            <p style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--color-brand-primary)', marginTop: 4 }}>{order.orderStatus}</p>
          </div>
          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Payment Status</p>
            <p style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color: order.paymentStatus === 'PAID' ? 'var(--color-success)' : 'var(--color-warning)', marginTop: 4 }}>
              {order.paymentStatus} ({(order.paymentMethod || 'gcash').toUpperCase()})
            </p>
          </div>
          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Shipping Status</p>
            <p style={{ fontSize: 'var(--text-lg)', fontWeight: 800, marginTop: 4 }}>{order.shippingStatus}</p>
          </div>
          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Grand Total</p>
            <p style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--color-brand-primary)', marginTop: 4 }}>
              {order.grandTotalFormatted || `₱${(order.grandTotalCentavos / 100).toFixed(2)}`}
            </p>
          </div>
        </div>

        {/* Retry Payment Banner if UNPAID or FAILED (FR-4.7) */}
        {['UNPAID', 'FAILED', 'PENDING'].includes(order.paymentStatus) && order.orderStatus !== 'CANCELLED' && (
          <div style={{
            background: 'rgba(245,158,11,0.1)', border: '1px solid var(--color-warning)',
            padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-6)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12
          }}>
            <div>
              <strong>Payment {order.paymentStatus}:</strong> Complete or retry your e-wallet payment now.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={() => handleRetryPayment('gcash')} disabled={actionLoading}>Pay with GCash</button>
              <button className="btn btn-primary btn-sm" onClick={() => handleRetryPayment('maya')} disabled={actionLoading} style={{ background: '#00B14F' }}>Pay with Maya</button>
              <button className="btn btn-primary btn-sm" onClick={() => handleRetryPayment('paypal')} disabled={actionLoading} style={{ background: '#003087' }}>Pay with PayPal</button>
            </div>
          </div>
        )}

        {/* Line Items & Multi-Seller Breakdown (FR-3.11) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.7fr', gap: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Ordered Items &amp; Seller Breakdown</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {(order.items || []).map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 'var(--space-3)', borderBottom: '1px solid var(--color-border)' }}>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>{item.productName}</p>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                      SKU: {item.variantSku} &bull; Size: US {item.size} &bull; Color: {item.color} &bull; Qty: {item.quantity}
                    </p>
                  </div>
                  <p style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                    ₱{(item.lineTotalCentavos / 100).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>

            {/* Seller Slices */}
            {(order.sellerOrders || []).length > 0 && (
              <div style={{ marginTop: 'var(--space-5)' }}>
                <h3 style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' }}>
                  Merchant Fulfillment Slices
                </h3>
                {(order.sellerOrders || []).map(so => (
                  <div key={so.id} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--color-bg)', marginBottom: 8, fontSize: 'var(--text-xs)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>🏪 {so.seller?.storeName || 'Merchant'}</strong>
                      {so.trackingNumber && <span style={{ marginLeft: 8, color: 'var(--color-brand-primary)' }}>Tracking: {so.trackingNumber} ({so.carrier || 'Courier'})</span>}
                    </div>
                    <span style={{ fontWeight: 700 }}>{so.status} &bull; ₱{(so.subtotalCentavos / 100).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Delivery Address & Totals */}
          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 'var(--space-3)' }}>Delivery Recipient</h2>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: 'var(--space-6)' }}>
              <strong>{order.shippingFullName}</strong><br />
              {order.shippingPhone}<br />
              {order.shippingAddressLine1}{order.shippingAddressLine2 ? `, ${order.shippingAddressLine2}` : ''}<br />
              {order.shippingBarangay ? `Brgy. ${order.shippingBarangay}, ` : ''}{order.shippingCity}, {order.shippingProvince}{order.shippingRegion ? `, ${order.shippingRegion}` : ''} {order.shippingPostalCode}
              {order.shippingAddressSource === 'PSGC_VERIFIED' && (
                <span style={{ display: 'inline-block', marginTop: 6, background: 'rgba(22,163,74,0.12)', color: '#166534', padding: '2px 8px', borderRadius: 99, fontSize: '11px', fontWeight: 700 }}>
                  ✓ PSGC Verified ({order.shippingCityCode}{order.shippingBarangayCode ? ` • ${order.shippingBarangayCode}` : ''})
                </span>
              )}
              {order.estimatedDeliveryStart && order.estimatedDeliveryEnd && (
                <span style={{ display: 'block', marginTop: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(74, 144, 196, 0.08)', border: '1px solid rgba(74, 144, 196, 0.3)', fontSize: '12px', color: 'var(--color-text)' }}>
                  <strong>📅 Estimated Delivery Window:</strong> {order.estimatedDeliveryStart} to {order.estimatedDeliveryEnd}
                  {order.deliveryZone && <span> ({order.deliveryZone})</span>}
                  {order.deliveryScheduleSource === 'NAGER_PH_HOLIDAYS' ? (
                    <span style={{ marginLeft: 6, color: '#166534', fontWeight: 700 }}>✓ PH Holidays Checked</span>
                  ) : (
                    <span style={{ marginLeft: 6, color: '#92400E', fontWeight: 600 }}>(Fallback Schedule)</span>
                  )}
                  {Array.isArray(order.deliveryHolidaysObserved) && order.deliveryHolidaysObserved.length > 0 && (
                    <span style={{ display: 'block', marginTop: 3, color: '#1D4ED8' }}>
                      Holidays observed in window: {order.deliveryHolidaysObserved.map(h => `${h.name} (${h.date})`).join(', ')}
                    </span>
                  )}
                </span>
              )}
            </p>

            <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginBottom: 'var(--space-3)' }}>Summary</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--text-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Subtotal</span>
                <span>{order.subtotalFormatted}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Discount</span>
                <span>-{order.discountFormatted}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Shipping</span>
                <span>{order.shippingFormatted}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 'var(--text-base)', borderTop: '1px solid var(--color-border)', paddingTop: 8, marginTop: 4 }}>
                <span>Grand Total</span>
                <span>{order.grandTotalFormatted}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Shipment Tracking Timeline (FR-7.7, FR-7.11) */}
        <div style={{ background: 'var(--color-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', marginBottom: 'var(--space-6)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>
            Shipment &amp; Delivery Tracking (FR-7.7)
          </h2>
          {(order.shipments || []).length === 0 ? (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
              Your order is currently being prepared by the merchant. Tracking details will appear here once dispatched.
            </p>
          ) : (
            (order.shipments || []).map(sh => {
              const events = Array.isArray(sh.history?.events) ? sh.history.events : [];
              return (
                <div key={sh.id} style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--color-bg)', borderRadius: 8 }}>
                    <div style={{ fontSize: 'var(--text-sm)' }}>
                      <strong>Courier:</strong> {sh.carrier || 'STRIDERA Express'} &bull; <strong>Tracking #:</strong> {sh.trackingNumber || 'Pending'}
                      {sh.deliveryPersonnel && (
                        <span> &bull; <strong>Rider:</strong> {sh.deliveryPersonnel.firstName} {sh.deliveryPersonnel.lastName} ({sh.deliveryPersonnel.phone})</span>
                      )}
                    </div>
                    <span style={{ fontWeight: 800, fontSize: 'var(--text-xs)', color: 'var(--color-brand-primary)' }}>
                      Status: {sh.status}
                    </span>
                  </div>

                  {events.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 12, borderLeft: '2px solid var(--color-brand-primary)' }}>
                      {events.map((ev, idx) => (
                        <div key={idx} style={{ fontSize: 'var(--text-xs)' }}>
                          <strong>{ev.status}</strong> — {ev.note}
                          <span style={{ color: 'var(--color-text-subtle)', marginLeft: 8 }}>
                            ({new Date(ev.timestamp).toLocaleString('en-PH')})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Support / Return / Refund Ticket Modal (FR-8.2) */}
      {showTicketModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 'var(--space-4)'
        }}>
          <div style={{
            background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-6)', width: '100%', maxWidth: 480, boxShadow: 'var(--shadow-xl)'
          }}>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 800, marginBottom: 'var(--space-2)' }}>
              Submit Order Support / Return / Refund (FR-8.2)
            </h2>
            <form onSubmit={handleSubmitTicket} noValidate>
              <div className="form-group">
                <label htmlFor="ord-ticket-category" className="form-label">Request Category *</label>
                <select
                  id="ord-ticket-category"
                  className="form-select"
                  value={ticketForm.category}
                  onChange={e => setTicketForm(p => ({ ...p, category: e.target.value }))}
                >
                  <option value="INQUIRY">Order / Delivery Inquiry</option>
                  <option value="COMPLAINT">Issue / Complaint</option>
                  <option value="CANCELLATION">Order Cancellation Request</option>
                  <option value="RETURN">Return Request</option>
                  <option value="REFUND">E-Wallet Refund Request</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="ord-ticket-subject" className="form-label">Subject *</label>
                <input
                  id="ord-ticket-subject"
                  className="form-input"
                  maxLength={150}
                  aria-required="true"
                  aria-invalid={Boolean(ticketErrors.subject)}
                  aria-describedby={ticketErrors.subject ? 'ord-ticket-subject-error' : undefined}
                  value={ticketForm.subject}
                  onChange={e => {
                    setTicketForm(p => ({ ...p, subject: e.target.value }));
                    if (ticketErrors.subject) setTicketErrors(prev => ({ ...prev, subject: null }));
                  }}
                  onBlur={e => setTicketErrors(prev => ({ ...prev, subject: validateRequiredText(e.target.value, 'Subject', { min: 3, max: 150 }).error }))}
                  required
                />
                <InlineFieldError id="ord-ticket-subject-error" error={ticketErrors.subject} />
              </div>
              <div className="form-group">
                <label htmlFor="ord-ticket-description" className="form-label">Details / Reason *</label>
                <textarea
                  id="ord-ticket-description"
                  className="form-input"
                  rows={4}
                  maxLength={2000}
                  aria-required="true"
                  aria-invalid={Boolean(ticketErrors.description)}
                  aria-describedby={ticketErrors.description ? 'ord-ticket-description-error' : undefined}
                  placeholder="Describe your inquiry, return reason, or refund details…"
                  value={ticketForm.description}
                  onChange={e => {
                    setTicketForm(p => ({ ...p, description: e.target.value }));
                    if (ticketErrors.description) setTicketErrors(prev => ({ ...prev, description: null }));
                  }}
                  onBlur={e => setTicketErrors(prev => ({ ...prev, description: validateRequiredText(e.target.value, 'Details / Reason', { min: 5, max: 2000 }).error }))}
                  required
                />
                <InlineFieldError id="ord-ticket-description-error" error={ticketErrors.description} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => { setShowTicketModal(false); setTicketErrors({}); }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                  {actionLoading ? 'Submitting…' : 'Submit Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

