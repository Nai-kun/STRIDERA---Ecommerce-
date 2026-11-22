'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  getDeliveryShipments,
  acceptDeliveryShipment,
  collectDeliveryShipment,
  updateDeliveryShipmentStatus,
  failDeliveryShipment,
  getPhilippineHolidays,
  logout
} from '../../lib/api';
import InlineFieldError from '../../components/InlineFieldError';
import {
  validatePersonName,
  validateOptionalText,
  validateRequiredText,
  focusFirstInvalidField
} from '../../lib/validation';

const POD_FIELD_IDS = {
  recipientName: 'del-pod-recipient',
  proofOfDeliveryUrl: 'del-pod-proof',
  notes: 'del-pod-notes'
};

export default function DeliveryPersonnelPortalPage() {
  const [shipments, setShipments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [upcomingHolidays, setUpcomingHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);

  // Proof of Delivery Modal
  const [podModal, setPodModal] = useState({ open: false, shipment: null });
  const [podForm, setPodForm] = useState({ recipientName: '', proofOfDeliveryUrl: '', notes: '' });

  // Failed Delivery Modal
  const [failModal, setFailModal] = useState({ open: false, shipment: null });
  const [failForm, setFailForm] = useState({ failureReason: 'Customer unreachable at delivery address', initiateReturn: false });
  const [podErrors, setPodErrors] = useState({});
  const [failError, setFailError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const notify = (msg, isError = false) => {
    setNotification({ msg, isError });
    setTimeout(() => setNotification(null), 3500);
  };

  const loadShipments = async () => {
    try {
      setLoading(true);
      const params = statusFilter ? { status: statusFilter } : {};
      const res = await getDeliveryShipments(params);
      if (res.success) {
        setShipments(res.data?.shipments || []);
        setSummary(res.data?.summary || null);
      }
    } catch (err) {
      notify(err.message || 'Failed to load shipments', true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShipments();
  }, [statusFilter]);

  useEffect(() => {
    getPhilippineHolidays()
      .then((res) => {
        if (res?.success && Array.isArray(res?.data?.upcoming)) {
          setUpcomingHolidays(res.data.upcoming);
        }
      })
      .catch(() => {});
  }, []);

  const handleAccept = async (id) => {
    try {
      const res = await acceptDeliveryShipment(id);
      if (res.success) {
        notify('Delivery assignment accepted! Ready for seller pickup.');
        loadShipments();
      }
    } catch (err) {
      notify(err.message || 'Failed to accept shipment', true);
    }
  };

  const handleCollect = async (s) => {
    try {
      const res = await collectDeliveryShipment(s.id, s.trackingNumber);
      if (res.success) {
        notify('Package collected from seller! Status updated to SHIPPED.');
        loadShipments();
      }
    } catch (err) {
      notify(err.message || 'Failed to confirm collection', true);
    }
  };

  const handleQuickStatus = async (id, status, notes) => {
    try {
      const res = await updateDeliveryShipmentStatus(id, { status, notes });
      if (res.success) {
        notify(`Shipment updated to ${status}`);
        loadShipments();
      }
    } catch (err) {
      notify(err.message || 'Status update failed', true);
    }
  };

  const handlePodSubmit = async (e) => {
    e.preventDefault();
    if (!podModal.shipment || submitting) return;

    const recRes = validatePersonName(podForm.recipientName, 'Recipient name');
    const podUrlRes = validateOptionalText(podForm.proofOfDeliveryUrl, 'Proof of delivery reference', { max: 300 });
    const notesRes = validateOptionalText(podForm.notes, 'Delivery notes', { max: 500 });
    const nextErrors = {
      ...(recRes.valid ? {} : { recipientName: recRes.error }),
      ...(podUrlRes.valid ? {} : { proofOfDeliveryUrl: podUrlRes.error }),
      ...(notesRes.valid ? {} : { notes: notesRes.error })
    };
    setPodErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalidField(nextErrors, POD_FIELD_IDS);
      return;
    }

    setSubmitting(true);
    try {
      const res = await updateDeliveryShipmentStatus(podModal.shipment.id, {
        status: 'DELIVERED',
        recipientName: recRes.value,
        proofOfDeliveryUrl: podUrlRes.value || `POD-SIGNED-${Date.now()}`,
        notes: notesRes.value || 'Package delivered and signed by recipient.'
      });
      if (res.success) {
        notify('Shipment marked as DELIVERED with Proof of Delivery!');
        setPodModal({ open: false, shipment: null });
        setPodErrors({});
        loadShipments();
      }
    } catch (err) {
      notify(err.message || 'Failed to complete delivery', true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFailSubmit = async (e) => {
    e.preventDefault();
    if (!failModal.shipment || submitting) return;

    const reasonRes = validateRequiredText(failForm.failureReason, 'Failure reason', { min: 3, max: 500 });
    if (!reasonRes.valid) {
      setFailError(reasonRes.error);
      document.getElementById('del-fail-reason')?.focus();
      return;
    }
    setFailError(null);
    setSubmitting(true);
    try {
      const res = await failDeliveryShipment(failModal.shipment.id, {
        ...failForm,
        failureReason: reasonRes.value
      });
      if (res.success) {
        notify(failForm.initiateReturn ? 'Return to Seller initiated.' : 'Failed delivery attempt recorded.');
        setFailModal({ open: false, shipment: null });
        loadShipments();
      }
    } catch (err) {
      notify(err.message || 'Failed to record delivery attempt', true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logout().catch(() => {});
    localStorage.removeItem('stridera_token');
    localStorage.removeItem('stridera_user');
    window.location.href = '/account/login';
  };

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh', paddingBottom: 'var(--space-16)' }}>
      {notification && (
        <div style={{
          position: 'fixed', bottom: 'var(--space-6)', right: 'var(--space-6)',
          background: notification.isError ? 'var(--color-error)' : 'var(--color-text)',
          color: '#fff', padding: 'var(--space-3) var(--space-6)', borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-xl)', zIndex: 9999, fontSize: 'var(--text-sm)', fontWeight: 600
        }}>
          {notification.msg}
        </div>
      )}

      {/* Header */}
      <header style={{ background: '#0F172A', color: '#fff', padding: 'var(--space-4) 0' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <Link href="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: 800, fontSize: 'var(--text-lg)' }}>
              STRIDERA
            </Link>
            <span style={{
              background: '#F59E0B', color: '#fff', fontSize: '11px',
              padding: '2px 10px', borderRadius: 'var(--radius-full)', fontWeight: 700, textTransform: 'uppercase'
            }}>
              Delivery Personnel Portal (Role 5)
            </span>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <Link href="/shop" className="btn btn-ghost btn-sm" style={{ color: '#fff' }}>Storefront</Link>
            <button onClick={handleLogout} className="btn btn-outline btn-sm" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="container" style={{ marginTop: 'var(--space-8)' }}>
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-4xl)' }}>
            Courier & Last-Mile Dispatch Hub
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
            Accept delivery assignments, collect packages from sellers, update transit milestones, and record Proof of Delivery (FR-7.1–FR-7.11).
          </p>
          {upcomingHolidays.length > 0 && (
            <div style={{
              marginTop: 'var(--space-3)',
              padding: 'var(--space-3) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(74, 144, 196, 0.08)',
              border: '1px solid rgba(74, 144, 196, 0.3)',
              fontSize: 'var(--text-xs)'
            }}>
              <strong>📅 Upcoming PH Courier Holidays (Nager.Date):</strong>{' '}
              {upcomingHolidays.slice(0, 3).map(h => `${h.name} (${h.date})`).join(' • ')}
            </div>
          )}
        </div>

        {/* Summary KPIs */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: 'var(--space-4)', marginBottom: 'var(--space-8)'
        }}>
          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', borderLeft: '4px solid #F59E0B' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Total Shipments</span>
            <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 800 }}>{summary?.total || 0}</div>
          </div>
          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', borderLeft: '4px solid #3B82F6' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Preparing / Pickup</span>
            <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 800 }}>{summary?.preparing || 0}</div>
          </div>
          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', borderLeft: '4px solid #8B5CF6' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>In Transit / Out</span>
            <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 800 }}>{summary?.inTransit || 0}</div>
          </div>
          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', borderLeft: '4px solid var(--color-success)' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Delivered</span>
            <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, color: 'var(--color-success)' }}>{summary?.delivered || 0}</div>
          </div>
          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', borderLeft: '4px solid var(--color-error)' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Failed / Return</span>
            <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, color: 'var(--color-error)' }}>{summary?.failedOrReturn || 0}</div>
          </div>
        </div>

        {/* Status Filters */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-6)' }}>
          {['', 'PREPARING', 'ASSIGNED', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURN_PENDING'].map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={statusFilter === st ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
            >
              {st === '' ? 'ALL SHIPMENTS' : st.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', padding: 'var(--space-12)' }}>Loading delivery manifest...</p>
        ) : shipments.length === 0 ? (
          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-12)', borderRadius: 'var(--radius-xl)', textAlign: 'center' }}>
            <p style={{ color: 'var(--color-text-muted)' }}>No shipments found for the selected filter.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {shipments.map(s => (
              <div key={s.id} style={{
                background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)',
                boxShadow: 'var(--shadow-sm)', border: '1px solid var(--color-border)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <span style={{ fontWeight: 800, fontSize: 'var(--text-lg)' }}>Waybill: {s.trackingNumber || 'Pending Waybill'}</span>
                      <span style={{
                        fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: 'var(--radius-full)',
                        background: s.status === 'DELIVERED' ? 'rgba(34,197,94,0.15)' : s.status.includes('FAILED') || s.status.includes('RETURN') ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                        color: s.status === 'DELIVERED' ? 'var(--color-success)' : s.status.includes('FAILED') || s.status.includes('RETURN') ? 'var(--color-error)' : '#D97706'
                      }}>
                        {s.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                      Order: <strong>{s.order?.orderNumber}</strong> &bull; Pickup Seller: <strong>{s.sellerOrder?.seller?.storeName || 'STRIDERA Warehouse'}</strong> &bull; Carrier: {s.carrier}
                    </div>
                  </div>

                  {s.proofOfDeliveryUrl && (
                    <div style={{ fontSize: 'var(--text-xs)', background: 'rgba(34,197,94,0.1)', color: 'var(--color-success)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)' }}>
                      ✓ POD: <strong>{s.proofOfDeliveryUrl}</strong> (Received by: {s.recipientName})
                    </div>
                  )}
                </div>

                {/* Customer Delivery Address & Package Items (FR-7.3) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)', padding: 'var(--space-4)', background: 'var(--color-surface-raised)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-4)' }}>
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Customer Recipient Details (FR-7.3)</div>
                    <div style={{ fontWeight: 700, marginTop: '4px' }}>{s.order?.shippingFullName}</div>
                    <div style={{ fontSize: 'var(--text-sm)' }}>📞 {s.order?.shippingPhone || 'No phone provided'}</div>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                      📍 {s.order?.shippingAddressLine1}, {s.order?.shippingCity}, {s.order?.shippingProvince} {s.order?.shippingPostalCode}
                    </div>
                    {s.order?.estimatedDeliveryStart && s.order?.estimatedDeliveryEnd && (
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-brand-primary)', marginTop: '4px', fontWeight: 600 }}>
                        📅 Target Delivery: {s.order.estimatedDeliveryStart} – {s.order.estimatedDeliveryEnd} ({s.order.deliveryZone || 'PH'})
                      </div>
                    )}
                    {s.order?.notes && (
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-brand-primary)', marginTop: '4px' }}>
                        Note: "{s.order.notes}"
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Package Contents</div>
                    {(s.sellerOrder?.items || s.order?.items || []).map(item => (
                      <div key={item.id} style={{ fontSize: 'var(--text-sm)', marginTop: '4px' }}>
                        &bull; <strong>{item.quantity}x</strong> {item.productName} ({item.size} / {item.color})
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  {s.status === 'PREPARING' && (
                    <button className="btn btn-primary btn-sm" onClick={() => handleAccept(s.id)}>
                      ✓ Accept Delivery Assignment (FR-7.4)
                    </button>
                  )}

                  {(s.status === 'PREPARING' || s.status === 'ASSIGNED') && (
                    <button className="btn btn-primary btn-sm" onClick={() => handleCollect(s)}>
                      📦 Confirm Seller Collection & Start Transit (FR-7.5)
                    </button>
                  )}

                  {(s.status === 'SHIPPED' || s.status === 'IN_TRANSIT') && (
                    <button className="btn btn-outline btn-sm" onClick={() => handleQuickStatus(s.id, 'OUT_FOR_DELIVERY', 'Courier out for final delivery to customer address')}>
                      🚚 Mark Out for Delivery (FR-7.6)
                    </button>
                  )}

                  {s.status !== 'DELIVERED' && s.status !== 'RETURN_PENDING' && (
                    <>
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ background: 'var(--color-success)', borderColor: 'var(--color-success)' }}
                        onClick={() => {
                          setPodForm({ recipientName: s.order?.shippingFullName || '', proofOfDeliveryUrl: `POD-${s.trackingNumber || Date.now()}`, notes: 'Delivered to recipient in good condition' });
                          setPodModal({ open: true, shipment: s });
                        }}
                      >
                        ✓ Confirm Delivered & Record POD (FR-7.8 / FR-7.9)
                      </button>

                      <button
                        className="btn btn-outline btn-sm"
                        style={{ color: 'var(--color-error)', borderColor: 'var(--color-error)' }}
                        onClick={() => setFailModal({ open: true, shipment: s })}
                      >
                        ⚠️ Failed Attempt / Return (FR-7.10)
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal: Proof of Delivery */}
      {podModal.open && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 'var(--space-4)'
        }}>
          <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', maxWidth: '450px', width: '100%' }}>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
              Confirm Delivery & Proof of Delivery (FR-7.9)
            </h2>
            <form onSubmit={handlePodSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label htmlFor="del-pod-recipient" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Recipient Name *</label>
                <input
                  id="del-pod-recipient"
                  type="text"
                  required
                  aria-required="true"
                  maxLength={60}
                  aria-invalid={Boolean(podErrors.recipientName)}
                  aria-describedby={podErrors.recipientName ? 'del-pod-recipient-error' : undefined}
                  value={podForm.recipientName}
                  onChange={e => {
                    setPodForm({ ...podForm, recipientName: e.target.value });
                    if (podErrors.recipientName) setPodErrors(prev => ({ ...prev, recipientName: null }));
                  }}
                  onBlur={e => setPodErrors(prev => ({ ...prev, recipientName: validatePersonName(e.target.value, 'Recipient name').error }))}
                  style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: `1px solid ${podErrors.recipientName ? 'var(--color-error)' : 'var(--color-border)'}` }}
                />
                <InlineFieldError id="del-pod-recipient-error" error={podErrors.recipientName} />
              </div>
              <div>
                <label htmlFor="del-pod-proof" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Proof of Delivery Reference / Photo URL <span className="form-optional">(optional)</span></label>
                <input
                  id="del-pod-proof"
                  type="text"
                  maxLength={300}
                  aria-invalid={Boolean(podErrors.proofOfDeliveryUrl)}
                  aria-describedby={podErrors.proofOfDeliveryUrl ? 'del-pod-proof-error' : undefined}
                  value={podForm.proofOfDeliveryUrl}
                  onChange={e => {
                    setPodForm({ ...podForm, proofOfDeliveryUrl: e.target.value });
                    if (podErrors.proofOfDeliveryUrl) setPodErrors(prev => ({ ...prev, proofOfDeliveryUrl: null }));
                  }}
                  onBlur={e => setPodErrors(prev => ({ ...prev, proofOfDeliveryUrl: validateOptionalText(e.target.value, 'Proof of delivery reference', { max: 300 }).error }))}
                  style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: `1px solid ${podErrors.proofOfDeliveryUrl ? 'var(--color-error)' : 'var(--color-border)'}` }}
                />
                <InlineFieldError id="del-pod-proof-error" error={podErrors.proofOfDeliveryUrl} />
              </div>
              <div>
                <label htmlFor="del-pod-notes" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Delivery Notes <span className="form-optional">(optional)</span></label>
                <textarea
                  id="del-pod-notes"
                  rows="2"
                  maxLength={500}
                  aria-invalid={Boolean(podErrors.notes)}
                  aria-describedby={podErrors.notes ? 'del-pod-notes-error' : undefined}
                  value={podForm.notes}
                  onChange={e => {
                    setPodForm({ ...podForm, notes: e.target.value });
                    if (podErrors.notes) setPodErrors(prev => ({ ...prev, notes: null }));
                  }}
                  onBlur={e => setPodErrors(prev => ({ ...prev, notes: validateOptionalText(e.target.value, 'Delivery notes', { max: 500 }).error }))}
                  style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: `1px solid ${podErrors.notes ? 'var(--color-error)' : 'var(--color-border)'}` }}
                />
                <InlineFieldError id="del-pod-notes-error" error={podErrors.notes} />
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => { setPodModal({ open: false, shipment: null }); setPodErrors({}); }}>Cancel</button>
                <button type="submit" disabled={submitting} className="btn btn-primary">{submitting ? 'Completing…' : 'Complete Delivery'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Failed Delivery */}
      {failModal.open && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 'var(--space-4)'
        }}>
          <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', maxWidth: '450px', width: '100%' }}>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-error)', marginBottom: 'var(--space-2)' }}>
              Record Failed Delivery Attempt (FR-7.10)
            </h2>
            <form onSubmit={handleFailSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label htmlFor="del-fail-reason" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Failure Reason *</label>
                <textarea
                  id="del-fail-reason"
                  rows="3"
                  required
                  aria-required="true"
                  maxLength={500}
                  aria-invalid={Boolean(failError)}
                  aria-describedby={failError ? 'del-fail-reason-error' : undefined}
                  value={failForm.failureReason}
                  onChange={e => {
                    setFailForm({ ...failForm, failureReason: e.target.value });
                    if (failError) setFailError(null);
                  }}
                  onBlur={e => setFailError(validateRequiredText(e.target.value, 'Failure reason', { min: 3, max: 500 }).error)}
                  style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: `1px solid ${failError ? 'var(--color-error)' : 'var(--color-border)'}` }}
                />
                <InlineFieldError id="del-fail-reason-error" error={failError} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
                <input
                  type="checkbox"
                  checked={failForm.initiateReturn}
                  onChange={e => setFailForm({ ...failForm, initiateReturn: e.target.checked })}
                />
                Initiate Return-to-Seller (max attempts reached / refused)
              </label>
              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => { setFailModal({ open: false, shipment: null }); setFailError(null); }}>Cancel</button>
                <button type="submit" disabled={submitting} className="btn btn-primary" style={{ background: 'var(--color-error)', borderColor: 'var(--color-error)' }}>
                  {submitting ? 'Submitting…' : 'Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
