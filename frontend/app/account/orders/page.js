'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const STATUS_COLORS = {
  PENDING: 'var(--color-warning)',
  CONFIRMED: 'var(--color-brand-primary)',
  PROCESSING: 'var(--color-brand-primary)',
  SHIPPED: 'var(--color-success)',
  DELIVERED: 'var(--color-success)',
  CANCELLED: 'var(--color-error)'
};

const PAYMENT_COLORS = {
  UNPAID: 'var(--color-error)',
  PENDING: 'var(--color-warning)',
  PAID: 'var(--color-success)',
  FAILED: 'var(--color-error)',
  REFUNDED: 'var(--color-text-muted)'
};

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API}/orders`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.success) setOrders(d.data);
        else setError(d.message || 'Failed to load orders');
      })
      .catch(() => setError('Failed to load orders. Please sign in.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', padding: 'var(--space-8) 0' }}>
      <div className="container" style={{ maxWidth: 800 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-8)' }}>
          <div>
            <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 800 }}>My Orders</h1>
            <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>Track and manage your STRIDERA orders</p>
          </div>
          <Link href="/" style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>← Home</Link>
        </div>

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton" style={{ height: 120, borderRadius: 'var(--radius-lg)' }} />
            ))}
          </div>
        )}

        {error && (
          <div style={{ textAlign: 'center', padding: 'var(--space-16) 0' }}>
            <p style={{ color: 'var(--color-error)', marginBottom: 'var(--space-4)' }}>{error}</p>
            <Link href="/account/login" className="btn btn-primary">Sign In</Link>
          </div>
        )}

        {!loading && !error && orders.length === 0 && (
          <div style={{ textAlign: 'center', padding: 'var(--space-16) 0' }}>
            <p style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>No orders yet</p>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-6)' }}>Start shopping to see your orders here.</p>
            <Link href="/shop" className="btn btn-primary">Shop Now</Link>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {orders.map(order => (
            <div key={order.id} style={{
              background: 'var(--color-surface)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-6)',
              boxShadow: 'var(--shadow-sm)',
              border: '1px solid var(--color-border)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-4)' }}>
                <div>
                  <p style={{ fontSize: 'var(--text-base)', fontWeight: 700 }}>Order {order.orderNumber}</p>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>
                    {new Date(order.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span style={{
                    fontSize: 'var(--text-xs)', fontWeight: 700, padding: '2px 8px',
                    borderRadius: 'var(--radius-full)', background: `${STATUS_COLORS[order.orderStatus]}20`,
                    color: STATUS_COLORS[order.orderStatus]
                  }}>{order.orderStatus}</span>
                  <span style={{
                    fontSize: 'var(--text-xs)', fontWeight: 700, padding: '2px 8px',
                    borderRadius: 'var(--radius-full)', background: `${PAYMENT_COLORS[order.paymentStatus]}20`,
                    color: PAYMENT_COLORS[order.paymentStatus]
                  }}>{order.paymentStatus === 'PAID' ? '✓ PAID' : order.paymentStatus}</span>
                </div>
              </div>

              {/* Items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
                {(order.items || []).slice(0, 3).map(item => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                    <span>{item.productName} <span style={{ color: 'var(--color-text-subtle)' }}>×{item.quantity}</span></span>
                    <span>₱{(item.lineTotalCentavos / 100).toFixed(2)}</span>
                  </div>
                ))}
                {(order.items || []).length > 3 && (
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>
                    +{order.items.length - 3} more items
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-4)' }}>
                <p style={{ fontWeight: 700 }}>
                  Total: {order.grandTotalFormatted || `₱${(order.grandTotalCentavos / 100).toFixed(2)}`}
                </p>
                <Link href={`/account/orders/${order.orderNumber}`} className="btn btn-outline btn-sm">
                  View Details
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
