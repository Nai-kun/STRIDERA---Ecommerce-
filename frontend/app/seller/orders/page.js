'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getSellerOrders, acceptSellerOrder, fulfillSellerOrder, cancelSellerOrder } from '../../../lib/api';
import InlineFieldError from '../../../components/InlineFieldError';
import {
  validateRequiredText,
  validateOptionalUrl,
  validateOptionalText,
  focusFirstInvalidField
} from '../../../lib/validation';

const FULFILL_FIELD_IDS = {
  trackingNumber: 'so-tracking-number',
  trackingUrl: 'so-tracking-url',
  notes: 'so-fulfill-notes'
};

export default function SellerOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [notification, setNotification] = useState(null);

  // Modal states
  const [fulfillModal, setFulfillModal] = useState({ open: false, orderId: null });
  const [trackingForm, setTrackingForm] = useState({
    trackingNumber: '',
    courierName: 'STRIDERA Express Courier',
    trackingUrl: '',
    notes: ''
  });

  const [cancelModal, setCancelModal] = useState({ open: false, orderId: null });
  const [cancelReason, setCancelReason] = useState('');
  const [fulfillErrors, setFulfillErrors] = useState({});
  const [cancelError, setCancelError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const notify = (msg, isError = false) => {
    setNotification({ msg, isError });
    setTimeout(() => setNotification(null), 3000);
  };

  const loadOrders = async () => {
    try {
      setLoading(true);
      const params = statusFilter ? { status: statusFilter } : {};
      const res = await getSellerOrders(params);
      if (res.success) setOrders(res.data);
    } catch (err) {
      notify(err.message || 'Failed to load seller orders', true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [statusFilter]);

  const handleAccept = async (orderId) => {
    try {
      const res = await acceptSellerOrder(orderId);
      if (res.success) {
        notify('Order accepted and moved to PROCESSING! Delivery shipment initialized.');
        loadOrders();
      }
    } catch (err) {
      notify(err.message || 'Failed to accept order', true);
    }
  };

  const handleFulfill = async (e) => {
    e.preventDefault();
    if (!fulfillModal.orderId || submitting) return;

    const trkRes = validateRequiredText(trackingForm.trackingNumber, 'Tracking number', { min: 3, max: 80 });
    const urlRes = validateOptionalUrl(trackingForm.trackingUrl, 'Courier tracking URL');
    const notesRes = validateOptionalText(trackingForm.notes, 'Fulfillment notes', { max: 500 });
    const nextErrors = {
      ...(trkRes.valid ? {} : { trackingNumber: trkRes.error }),
      ...(urlRes.valid ? {} : { trackingUrl: urlRes.error }),
      ...(notesRes.valid ? {} : { notes: notesRes.error })
    };
    setFulfillErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalidField(nextErrors, FULFILL_FIELD_IDS);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fulfillSellerOrder(fulfillModal.orderId, {
        ...trackingForm,
        trackingNumber: trkRes.value,
        trackingUrl: urlRes.value || '',
        notes: notesRes.value || ''
      });
      if (res.success) {
        notify('Order slice marked as SHIPPED and handed off to Delivery Personnel!');
        setFulfillModal({ open: false, orderId: null });
        setFulfillErrors({});
        setTrackingForm({ trackingNumber: '', courierName: 'STRIDERA Express Courier', trackingUrl: '', notes: '' });
        loadOrders();
      }
    } catch (err) {
      notify(err.message || 'Failed to fulfill order', true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (e) => {
    e.preventDefault();
    if (!cancelModal.orderId || submitting) return;

    const reasonRes = validateRequiredText(cancelReason, 'Cancellation reason', { min: 3, max: 500 });
    if (!reasonRes.valid) {
      setCancelError(reasonRes.error);
      document.getElementById('so-cancel-reason')?.focus();
      return;
    }
    setCancelError(null);
    setSubmitting(true);
    try {
      const res = await cancelSellerOrder(cancelModal.orderId, reasonRes.value);
      if (res.success) {
        notify('Order slice cancelled and stock restored to inventory.');
        setCancelModal({ open: false, orderId: null });
        setCancelReason('');
        loadOrders();
      }
    } catch (err) {
      notify(err.message || 'Failed to cancel order slice', true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh', paddingBottom: 'var(--space-16)' }}>
      {/* Toast Notification */}
      {notification && (
        <div style={{
          position: 'fixed',
          bottom: 'var(--space-6)',
          right: 'var(--space-6)',
          background: notification.isError ? 'var(--color-error)' : 'var(--color-text)',
          color: '#fff',
          padding: 'var(--space-3) var(--space-6)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 9999,
          fontSize: 'var(--text-sm)'
        }}>
          {notification.msg}
        </div>
      )}

      {/* Merchant Header */}
      <header style={{ background: 'var(--color-brand-dark)', color: '#fff', padding: 'var(--space-4) 0' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <Link href="/seller/dashboard" style={{ color: '#fff', textDecoration: 'none', fontWeight: 700 }}>
              STRIDERA MERCHANT
            </Link>
          </div>
          <Link href="/seller/dashboard" className="btn btn-ghost btn-sm" style={{ color: '#fff' }}>
            ← Back to Overview
          </Link>
        </div>
      </header>

      <main className="container" style={{ marginTop: 'var(--space-8)' }}>
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-4xl)' }}>Fulfillment & Order Slices</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
            Accept, prepare, and dispatch orders for your brand items. Dispatches create a shipment record for Delivery Personnel.
          </p>
        </div>

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
          {['', 'PENDING', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={statusFilter === st ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
            >
              {st === '' ? 'ALL ORDERS' : st}
            </button>
          ))}
        </div>

        {/* Orders List */}
        {loading ? (
          <p style={{ textAlign: 'center', padding: 'var(--space-12) 0', color: 'var(--color-text-muted)' }}>
            Loading order slices...
          </p>
        ) : orders.length === 0 ? (
          <div style={{
            background: 'var(--color-surface)',
            padding: 'var(--space-12)',
            borderRadius: 'var(--radius-lg)',
            textAlign: 'center'
          }}>
            <p style={{ color: 'var(--color-text-muted)' }}>No orders match the selected filter.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            {orders.map((slice) => (
              <div key={slice.id} style={{
                background: 'var(--color-surface)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-6)',
                boxShadow: 'var(--shadow-sm)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <span style={{ fontWeight: 700, fontSize: 'var(--text-lg)' }}>Order: {slice.order?.orderNumber}</span>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        background: slice.status === 'SHIPPED' || slice.status === 'DELIVERED' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                        color: slice.status === 'SHIPPED' || slice.status === 'DELIVERED' ? 'var(--color-success)' : 'var(--color-warning)'
                      }}>
                        {slice.status}
                      </span>
                    </div>

                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>
                      Placed: {new Date(slice.createdAt).toLocaleString()} | Destination: {slice.order?.shippingCity}, {slice.order?.shippingProvince}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>
                      Slice Total: {slice.subtotalFormatted}
                    </div>
                    {slice.trackingNumber && (
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-brand-primary)', marginTop: 'var(--space-1)' }}>
                        Tracking: <strong>{slice.trackingNumber}</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* Items in this Slice */}
                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {slice.items?.map((item) => (
                      <div key={item.id} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 'var(--text-sm)',
                        padding: 'var(--space-2) 0',
                        borderBottom: '1px dashed var(--color-border)'
                      }}>
                        <span>
                          <strong>{item.quantity}x</strong> {item.productName} ({item.size} / {item.color})
                        </span>
                        <span style={{ fontWeight: 600 }}>
                          ₱{(item.lineTotalCentavos / 100).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  {slice.status !== 'SHIPPED' && slice.status !== 'DELIVERED' && slice.status !== 'CANCELLED' && (
                    <>
                      <button
                        className="btn btn-outline btn-sm"
                        style={{ color: 'var(--color-error)', borderColor: 'var(--color-error)' }}
                        onClick={() => setCancelModal({ open: true, orderId: slice.id })}
                      >
                        Cancel Slice
                      </button>

                      {(slice.status === 'PENDING' || slice.status === 'PAID') && (
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => handleAccept(slice.id)}
                        >
                          ✓ Accept & Prepare Order
                        </button>
                      )}

                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => setFulfillModal({ open: true, orderId: slice.id })}
                      >
                        Mark Shipped & Add Tracking
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal: Fulfill Order */}
      {fulfillModal.open && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 'var(--space-4)'
        }}>
          <div style={{
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-6)',
            maxWidth: '450px',
            width: '100%'
          }}>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
              Dispatch & Fulfill Order
            </h2>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
              Enter courier and tracking details to notify the customer and Delivery Personnel.
            </p>

            <form onSubmit={handleFulfill} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label htmlFor="so-courier-name" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                  Courier / Logistics Partner *
                </label>
                <select
                  id="so-courier-name"
                  value={trackingForm.courierName}
                  onChange={e => setTrackingForm({ ...trackingForm, courierName: e.target.value })}
                  style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                >
                  <option value="STRIDERA Express Courier">STRIDERA Express Courier</option>
                  <option value="LBC Express">LBC Express</option>
                  <option value="J&T Express">J&T Express</option>
                  <option value="GrabExpress">GrabExpress</option>
                </select>
              </div>

              <div>
                <label htmlFor="so-tracking-number" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                  Tracking Number / Waybill *
                </label>
                <input
                  id="so-tracking-number"
                  type="text"
                  required
                  aria-required="true"
                  maxLength={80}
                  aria-invalid={Boolean(fulfillErrors.trackingNumber)}
                  aria-describedby={fulfillErrors.trackingNumber ? 'so-tracking-number-error' : undefined}
                  placeholder="e.g. LBC-8899123049"
                  value={trackingForm.trackingNumber}
                  onChange={e => {
                    setTrackingForm({ ...trackingForm, trackingNumber: e.target.value });
                    if (fulfillErrors.trackingNumber) setFulfillErrors(prev => ({ ...prev, trackingNumber: null }));
                  }}
                  onBlur={e => setFulfillErrors(prev => ({ ...prev, trackingNumber: validateRequiredText(e.target.value, 'Tracking number', { min: 3, max: 80 }).error }))}
                  style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: `1px solid ${fulfillErrors.trackingNumber ? 'var(--color-error)' : 'var(--color-border)'}` }}
                />
                <InlineFieldError id="so-tracking-number-error" error={fulfillErrors.trackingNumber} />
              </div>

              <div>
                <label htmlFor="so-tracking-url" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                  Courier Tracking URL <span className="form-optional">(optional)</span>
                </label>
                <input
                  id="so-tracking-url"
                  type="url"
                  maxLength={300}
                  aria-invalid={Boolean(fulfillErrors.trackingUrl)}
                  aria-describedby={fulfillErrors.trackingUrl ? 'so-tracking-url-error' : undefined}
                  placeholder="https://track.courier.com/..."
                  value={trackingForm.trackingUrl}
                  onChange={e => {
                    setTrackingForm({ ...trackingForm, trackingUrl: e.target.value });
                    if (fulfillErrors.trackingUrl) setFulfillErrors(prev => ({ ...prev, trackingUrl: null }));
                  }}
                  onBlur={e => setFulfillErrors(prev => ({ ...prev, trackingUrl: validateOptionalUrl(e.target.value, 'Courier tracking URL').error }))}
                  style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: `1px solid ${fulfillErrors.trackingUrl ? 'var(--color-error)' : 'var(--color-border)'}` }}
                />
                <InlineFieldError id="so-tracking-url-error" error={fulfillErrors.trackingUrl} />
              </div>

              <div>
                <label htmlFor="so-fulfill-notes" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                  Fulfillment Notes <span className="form-optional">(optional)</span>
                </label>
                <textarea
                  id="so-fulfill-notes"
                  rows="2"
                  maxLength={500}
                  aria-invalid={Boolean(fulfillErrors.notes)}
                  aria-describedby={fulfillErrors.notes ? 'so-fulfill-notes-error' : undefined}
                  placeholder="Dispatched via express delivery"
                  value={trackingForm.notes}
                  onChange={e => {
                    setTrackingForm({ ...trackingForm, notes: e.target.value });
                    if (fulfillErrors.notes) setFulfillErrors(prev => ({ ...prev, notes: null }));
                  }}
                  onBlur={e => setFulfillErrors(prev => ({ ...prev, notes: validateOptionalText(e.target.value, 'Fulfillment notes', { max: 500 }).error }))}
                  style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: `1px solid ${fulfillErrors.notes ? 'var(--color-error)' : 'var(--color-border)'}` }}
                />
                <InlineFieldError id="so-fulfill-notes-error" error={fulfillErrors.notes} />
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                <button type="button" className="btn btn-ghost" onClick={() => { setFulfillModal({ open: false, orderId: null }); setFulfillErrors({}); }}>Cancel</button>
                <button type="submit" disabled={submitting} className="btn btn-primary">{submitting ? 'Submitting…' : 'Confirm Shipment'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Cancel Order */}
      {cancelModal.open && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 'var(--space-4)'
        }}>
          <div style={{
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-6)',
            maxWidth: '450px',
            width: '100%'
          }}>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-error)', marginBottom: 'var(--space-2)' }}>
              Cancel Order Slice
            </h2>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
              ⚠️ Cancelling will mark this slice cancelled and automatically restore variant stock to your warehouse inventory.
            </p>

            <form onSubmit={handleCancel} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label htmlFor="so-cancel-reason" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                  Cancellation Reason *
                </label>
                <textarea
                  id="so-cancel-reason"
                  rows="3"
                  required
                  aria-required="true"
                  maxLength={500}
                  aria-invalid={Boolean(cancelError)}
                  aria-describedby={cancelError ? 'so-cancel-reason-error' : undefined}
                  placeholder="e.g. Stock damage prior to dispatch, out of requested size"
                  value={cancelReason}
                  onChange={e => {
                    setCancelReason(e.target.value);
                    if (cancelError) setCancelError(null);
                  }}
                  onBlur={e => setCancelError(validateRequiredText(e.target.value, 'Cancellation reason', { min: 3, max: 500 }).error)}
                  style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: `1px solid ${cancelError ? 'var(--color-error)' : 'var(--color-border)'}` }}
                />
                <InlineFieldError id="so-cancel-reason-error" error={cancelError} />
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                <button type="button" className="btn btn-ghost" onClick={() => { setCancelModal({ open: false, orderId: null }); setCancelError(null); }}>Keep Order</button>
                <button type="submit" disabled={submitting} className="btn btn-primary" style={{ background: 'var(--color-error)', borderColor: 'var(--color-error)' }}>
                  {submitting ? 'Cancelling…' : 'Confirm Cancellation & Restore Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
