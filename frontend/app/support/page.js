'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  getSupportTickets,
  lookupSupportOrders,
  replySupportTicket,
  updateSupportTicketStatus,
  executeSupportTicketAction,
  logout
} from '../../lib/api';

export default function CustomerSupportPortalPage() {
  const [activeTab, setActiveTab] = useState('tickets');
  const [tickets, setTickets] = useState([]);
  const [summary, setSummary] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupResults, setLookupResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);

  const notify = (msg, isError = false) => {
    setNotification({ msg, isError });
    setTimeout(() => setNotification(null), 3500);
  };

  const loadTickets = async () => {
    try {
      setLoading(true);
      const params = statusFilter ? { status: statusFilter } : {};
      const res = await getSupportTickets(params);
      if (res.success) {
        const list = res.data?.tickets || [];
        setTickets(list);
        setSummary(res.data?.summary || null);
        if (selectedTicket) {
          const updated = list.find(t => t.id === selectedTicket.id);
          if (updated) setSelectedTicket(updated);
        } else if (list.length > 0) {
          setSelectedTicket(list[0]);
        }
      }
    } catch (err) {
      notify(err.message || 'Failed to load support tickets', true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, [statusFilter]);

  const handleReply = async (e) => {
    e.preventDefault();
    if (!selectedTicket || !replyText.trim()) return;
    try {
      const res = await replySupportTicket(selectedTicket.id, replyText);
      if (res.success) {
        notify('Reply sent to customer!');
        setReplyText('');
        loadTickets();
      }
    } catch (err) {
      notify(err.message || 'Failed to send reply', true);
    }
  };

  const handleStatusChange = async (ticketId, status, resolutionNotes) => {
    try {
      const res = await updateSupportTicketStatus(ticketId, { status, resolutionNotes });
      if (res.success) {
        notify(`Ticket status updated to ${status}`);
        loadTickets();
      }
    } catch (err) {
      notify(err.message || 'Failed to update ticket status', true);
    }
  };

  const handleSupportAction = async (ticketId, action) => {
    try {
      const res = await executeSupportTicketAction(ticketId, {
        action,
        resolutionNotes: `Executed ${action} by Customer Support Personnel`
      });
      if (res.success) {
        notify(res.message || 'Action executed!');
        loadTickets();
      }
    } catch (err) {
      notify(err.message || 'Action failed', true);
    }
  };

  const handleOrderLookup = async (e) => {
    e.preventDefault();
    try {
      const res = await lookupSupportOrders(lookupQuery);
      if (res.success) setLookupResults(res.data || []);
    } catch (err) {
      notify(err.message || 'Order lookup failed', true);
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
              background: '#EC4899', color: '#fff', fontSize: '11px',
              padding: '2px 10px', borderRadius: 'var(--radius-full)', fontWeight: 700, textTransform: 'uppercase'
            }}>
              Customer Support Portal (Role 6)
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
            Customer Care & Dispute Resolution Desk
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
            Manage customer inquiries, inspect order/payment/shipment history, process cancellations/returns, and escalate approved refunds to Finance (FR-8.1–FR-8.11).
          </p>
        </div>

        {/* Summary KPIs */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: 'var(--space-4)', marginBottom: 'var(--space-8)'
        }}>
          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', borderLeft: '4px solid #EC4899' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Total Tickets</span>
            <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 800 }}>{summary?.total || 0}</div>
          </div>
          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', borderLeft: '4px solid var(--color-warning)' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Open Inquiries</span>
            <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, color: 'var(--color-warning)' }}>{summary?.open || 0}</div>
          </div>
          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', borderLeft: '4px solid #3B82F6' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>In Progress</span>
            <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 800 }}>{summary?.inProgress || 0}</div>
          </div>
          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', borderLeft: '4px solid var(--color-success)' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Resolved / Closed</span>
            <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, color: 'var(--color-success)' }}>{summary?.resolved || 0}</div>
          </div>
          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', borderLeft: '4px solid #8B5CF6' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Refund Requests</span>
            <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 800 }}>{summary?.pendingRefunds || 0}</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', borderBottom: '2px solid var(--color-border)', marginBottom: 'var(--space-6)' }}>
          {[
            ['tickets', `Support Tickets & Escalations (${tickets.length})`],
            ['lookup', 'Order, Payment & Shipment Lookup (FR-8.5 & FR-8.6)']
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                padding: 'var(--space-3) var(--space-5)',
                fontWeight: activeTab === id ? 700 : 500,
                color: activeTab === id ? 'var(--color-brand-primary)' : 'var(--color-text-muted)',
                borderBottom: activeTab === id ? '3px solid var(--color-brand-primary)' : '3px solid transparent',
                marginBottom: '-2px', background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: 'pointer'
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'tickets' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--space-6)' }}>
            {/* Ticket List Column */}
            <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
                {['', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map(st => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={statusFilter === st ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                  >
                    {st === '' ? 'ALL' : st}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {tickets.map(t => (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTicket(t)}
                    style={{
                      padding: 'var(--space-4)',
                      borderRadius: 'var(--radius-lg)',
                      border: selectedTicket?.id === t.id ? '2px solid var(--color-brand-primary)' : '1px solid var(--color-border)',
                      background: selectedTicket?.id === t.id ? 'var(--color-surface-raised)' : 'transparent',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, fontSize: 'var(--text-sm)' }}>{t.ticketNumber}</span>
                      <span style={{
                        fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-full)',
                        background: t.status === 'RESOLVED' || t.status === 'CLOSED' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                        color: t.status === 'RESOLVED' || t.status === 'CLOSED' ? 'var(--color-success)' : '#D97706'
                      }}>
                        {t.status}
                      </span>
                    </div>
                    <div style={{ fontWeight: 700, marginTop: '4px' }}>{t.subject}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                      Category: <strong>{t.category}</strong> &bull; Customer: {t.user?.firstName} {t.user?.lastName}
                    </div>
                    {t.refundStatus && t.refundStatus !== 'NONE' && (
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#8B5CF6', marginTop: '4px' }}>
                        Refund: {t.refundStatus} (₱{((t.refundAmountCentavos || t.order?.grandTotalCentavos || 0) / 100).toFixed(2)})
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Selected Ticket Details & Actions Column */}
            {selectedTicket && (
              <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                  <div>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-brand-primary)' }}>{selectedTicket.ticketNumber} &bull; {selectedTicket.category}</span>
                    <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 800 }}>{selectedTicket.subject}</h2>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                      Submitted by {selectedTicket.user?.firstName} {selectedTicket.user?.lastName} ({selectedTicket.user?.email})
                    </div>
                  </div>

                  {/* Ticket Status Controls (FR-8.10) */}
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    {['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map(st => (
                      <button
                        key={st}
                        onClick={() => handleStatusChange(selectedTicket.id, st)}
                        className={selectedTicket.status === st ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Linked Order, Payment & Shipment Details (FR-8.5, FR-8.6) */}
                {selectedTicket.order && (
                  <div style={{ padding: 'var(--space-4)', background: 'var(--color-surface-raised)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-xs)' }}>
                    <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                      Linked Order: {selectedTicket.order.orderNumber} (₱{((selectedTicket.order.grandTotalCentavos || 0) / 100).toFixed(2)})
                    </div>
                    <div>Payment Status: <strong>{selectedTicket.order.paymentStatus}</strong> | Shipping Status: <strong>{selectedTicket.order.shippingStatus}</strong></div>
                    {selectedTicket.order.payments?.[0] && (
                      <div>E-Wallet Ref: <code>{selectedTicket.order.payments[0].providerPaymentId || selectedTicket.order.payments[0].idempotencyKey}</code> ({selectedTicket.order.payments[0].provider})</div>
                    )}
                    {selectedTicket.order.shipments?.[0] && (
                      <div>Courier Waybill: <strong>{selectedTicket.order.shipments[0].trackingNumber}</strong> ({selectedTicket.order.shipments[0].status})</div>
                    )}
                  </div>
                )}

                {/* Escalation & Resolution Actions (FR-8.7, FR-8.8, FR-8.9) */}
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-4)', paddingBottom: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
                  <button className="btn btn-outline btn-sm" onClick={() => handleSupportAction(selectedTicket.id, 'APPROVE_CANCELLATION')}>
                    ✓ Approve Order Cancellation (FR-8.7)
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={() => handleSupportAction(selectedTicket.id, 'APPROVE_RETURN')}>
                    📦 Authorize Return (FR-8.7)
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ background: '#8B5CF6', borderColor: '#8B5CF6' }}
                    onClick={() => handleSupportAction(selectedTicket.id, 'APPROVE_REFUND')}
                  >
                    💸 Approve & Escalate Refund to Finance (FR-8.8)
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    style={{ color: 'var(--color-error)', borderColor: 'var(--color-error)' }}
                    onClick={() => handleSupportAction(selectedTicket.id, 'REJECT_REFUND')}
                  >
                    ✕ Reject Refund
                  </button>
                </div>

                {/* Conversation Thread (FR-8.4) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', maxHeight: '320px', overflowY: 'auto', marginBottom: 'var(--space-4)' }}>
                  {selectedTicket.messages?.map(m => (
                    <div key={m.id} style={{
                      padding: 'var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      background: m.senderRole === 'CUSTOMER_SUPPORT' || m.senderRole === 'ADMIN' ? 'rgba(236,72,153,0.08)' : 'var(--color-surface-raised)',
                      borderLeft: m.senderRole === 'CUSTOMER_SUPPORT' ? '3px solid #EC4899' : '3px solid var(--color-border)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        <strong>{m.senderName || m.senderRole}</strong>
                        <span>{new Date(m.createdAt).toLocaleString()}</span>
                      </div>
                      <p style={{ fontSize: 'var(--text-sm)', marginTop: '4px' }}>{m.message}</p>
                    </div>
                  ))}
                </div>

                {/* Reply Form */}
                <form onSubmit={handleReply} style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <input
                    type="text"
                    required
                    placeholder="Type support response to customer..."
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    style={{ flex: 1, padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                  />
                  <button type="submit" className="btn btn-primary">Send Reply</button>
                </form>
              </div>
            )}
          </div>
        )}

        {activeTab === 'lookup' && (
          <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-sm)' }}>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>
              Order, E-Wallet Payment & Shipment Diagnostic Lookup (FR-8.5, FR-8.6)
            </h2>
            <form onSubmit={handleOrderLookup} style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
              <input
                type="text"
                placeholder="Search by Order Number or Customer Email..."
                value={lookupQuery}
                onChange={e => setLookupQuery(e.target.value)}
                style={{ flex: 1, padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
              />
              <button type="submit" className="btn btn-primary">Lookup Records</button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {lookupResults.map(o => (
                <div key={o.id} style={{ padding: 'var(--space-4)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                    <span>{o.orderNumber} &bull; Customer: {o.user?.email || o.shippingFullName}</span>
                    <span>₱{((o.grandTotalCentavos || 0) / 100).toFixed(2)}</span>
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                    Payment Status: <strong>{o.paymentStatus}</strong> | Shipping Status: <strong>{o.shippingStatus}</strong>
                  </div>
                  {o.payments?.map(p => (
                    <div key={p.id} style={{ fontSize: 'var(--text-xs)', marginTop: '4px' }}>
                      💳 Payment Ref: <code>{p.providerPaymentId || p.idempotencyKey}</code> | Provider: <strong>{p.provider}</strong> | Verified by Finance: <strong>{p.financeVerified ? 'YES' : 'Pending'}</strong>
                    </div>
                  ))}
                  {o.shipments?.map(s => (
                    <div key={s.id} style={{ fontSize: 'var(--text-xs)', marginTop: '4px' }}>
                      🚚 Shipment Waybill: <strong>{s.trackingNumber}</strong> | Status: <strong>{s.status}</strong> | Carrier: {s.carrier}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
