'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getSellerDashboard, getSellerProfile, logout } from '../../../lib/api';

export default function SellerDashboardPage() {
  const [profile, setProfile] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        setLoading(true);
        const [profileRes, dashboardRes] = await Promise.all([
          getSellerProfile(),
          getSellerDashboard()
        ]);

        if (profileRes.success) setProfile(profileRes.data);
        if (dashboardRes.success) setMetrics(dashboardRes.data);
      } catch (err) {
        console.error('Seller dashboard fetch failed:', err);
        setError(err.message || 'Failed to load seller dashboard. Please ensure you are logged in as an approved merchant.');
      } finally {
        setLoading(false);
      }
    }

    fetchDashboard();
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      window.location.href = '/account/login';
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ padding: 'var(--space-16) 0', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-text-muted)' }}>Loading Merchant Hub...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container" style={{ padding: 'var(--space-16) 0', maxWidth: '600px' }}>
        <div style={{
          background: '#FEF2F2',
          border: '1px solid #FCA5A5',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-6)',
          textAlign: 'center'
        }}>
          <h2 style={{ color: 'var(--color-error)', marginBottom: 'var(--space-2)' }}>Merchant Access Restricted</h2>
          <p style={{ color: 'var(--color-text)', marginBottom: 'var(--space-4)' }}>{error}</p>
          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' }}>
            <Link href="/account/login" className="btn btn-primary">Sign In as Seller</Link>
            <Link href="/seller/register" className="btn btn-outline">Apply as Vendor</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh', paddingBottom: 'var(--space-16)' }}>
      {/* Top Banner / Merchant Bar */}
      <header style={{
        background: 'var(--color-brand-dark)',
        color: '#fff',
        padding: 'var(--space-4) 0',
        borderBottom: '1px solid rgba(255,255,255,0.1)'
      }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <Link href="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 'var(--text-lg)' }}>
              STRIDERA
            </Link>
            <span style={{
              background: 'rgba(255,255,255,0.15)',
              fontSize: 'var(--text-xs)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              Seller Portal
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'rgba(255,255,255,0.8)' }}>
              {profile?.storeName || profile?.email}
            </span>
            <button
              onClick={handleLogout}
              className="btn btn-ghost btn-sm"
              style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="container" style={{ marginTop: 'var(--space-8)' }}>
        {/* Merchant Welcome Banner */}
        <div style={{
          background: 'var(--color-surface)',
          padding: 'var(--space-6)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: 'var(--space-8)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-4)'
        }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-4xl)', color: 'var(--color-brand-dark)' }}>
              {profile?.storeName || 'Merchant Dashboard'}
            </h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
              {profile?.storeDescription || 'Manage your product inventory and customer fulfillment.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
            {profile?.brand ? (
              <span style={{
                background: 'rgba(74, 144, 196, 0.12)',
                color: 'var(--color-brand-primary)',
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600
              }}>
                Brand: {profile.brand.name}
              </span>
            ) : (
              <span style={{
                background: 'rgba(245, 158, 11, 0.12)',
                color: 'var(--color-warning)',
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600
              }}>
                Brand Pending Assignment
              </span>
            )}

            <span style={{
              background: 'rgba(34, 197, 94, 0.12)',
              color: 'var(--color-success)',
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              textTransform: 'uppercase'
            }}>
              ● {profile?.sellerStatus || 'ACTIVE'}
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          gap: 'var(--space-2)',
          borderBottom: '2px solid var(--color-border)',
          marginBottom: 'var(--space-8)'
        }}>
          <Link
            href="/seller/dashboard"
            style={{
              padding: 'var(--space-3) var(--space-6)',
              fontWeight: 600,
              color: 'var(--color-brand-primary)',
              borderBottom: '2px solid var(--color-brand-primary)',
              marginBottom: '-2px',
              textDecoration: 'none'
            }}
          >
            Overview
          </Link>
          <Link
            href="/seller/products"
            style={{
              padding: 'var(--space-3) var(--space-6)',
              fontWeight: 500,
              color: 'var(--color-text-muted)',
              textDecoration: 'none'
            }}
          >
            My Products & Stock
          </Link>
          <Link
            href="/seller/orders"
            style={{
              padding: 'var(--space-3) var(--space-6)',
              fontWeight: 500,
              color: 'var(--color-text-muted)',
              textDecoration: 'none'
            }}
          >
            Fulfillment Orders ({metrics?.pendingOrders || 0})
          </Link>
        </div>

        {/* Metric Cards Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-8)'
        }}>
          <div style={{
            background: 'var(--color-surface)',
            padding: 'var(--space-6)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
            borderLeft: '4px solid var(--color-brand-primary)'
          }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Total Revenue</span>
            <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--color-text)', marginTop: 'var(--space-1)' }}>
              {metrics?.totalRevenueFormatted || '₱0.00'}
            </div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>From verified paid orders</span>
          </div>

          <div style={{
            background: 'var(--color-surface)',
            padding: 'var(--space-6)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
            borderLeft: '4px solid var(--color-warning)'
          }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Orders to Fulfill</span>
            <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--color-text)', marginTop: 'var(--space-1)' }}>
              {metrics?.pendingOrders || 0}
            </div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>Awaiting shipment tracking</span>
          </div>

          <div style={{
            background: 'var(--color-surface)',
            padding: 'var(--space-6)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
            borderLeft: '4px solid var(--color-success)'
          }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Shipped Orders</span>
            <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--color-text)', marginTop: 'var(--space-1)' }}>
              {metrics?.shippedOrders || 0}
            </div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>Dispatched with tracking</span>
          </div>

          <div style={{
            background: 'var(--color-surface)',
            padding: 'var(--space-6)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
            borderLeft: '4px solid var(--color-brand-accent-alt)'
          }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Active Products</span>
            <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--color-text)', marginTop: 'var(--space-1)' }}>
              {metrics?.totalProducts || 0}
            </div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>Listed in marketplace</span>
          </div>
        </div>

        {/* Dual Section: Low Stock Alerts & Recent Orders */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
          gap: 'var(--space-6)'
        }}>
          {/* Low Stock Alerts */}
          <div style={{
            background: 'var(--color-surface)',
            padding: 'var(--space-6)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>Low Stock Alerts (≤ 5 units)</h2>
              <Link href="/seller/products" className="btn btn-outline btn-sm">Adjust Stock</Link>
            </div>

            {(!metrics?.lowStockAlerts || metrics.lowStockAlerts.length === 0) ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', textAlign: 'center', padding: 'var(--space-6) 0' }}>
                All variants are sufficiently stocked.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {metrics.lowStockAlerts.map(alert => (
                  <div key={alert.variantId} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 'var(--space-3)',
                    background: 'var(--color-surface-raised)',
                    borderRadius: 'var(--radius-md)'
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{alert.productName}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                        SKU: {alert.variantSku} | Size: {alert.size} | Color: {alert.color}
                      </div>
                    </div>
                    <span style={{
                      color: alert.stockQuantity === 0 ? 'var(--color-error)' : 'var(--color-warning)',
                      fontWeight: 700,
                      fontSize: 'var(--text-sm)'
                    }}>
                      {alert.stockQuantity} left
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Orders */}
          <div style={{
            background: 'var(--color-surface)',
            padding: 'var(--space-6)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>Recent Order Slices</h2>
              <Link href="/seller/orders" className="btn btn-outline btn-sm">View All</Link>
            </div>

            {(!metrics?.recentOrders || metrics.recentOrders.length === 0) ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', textAlign: 'center', padding: 'var(--space-6) 0' }}>
                No customer orders received yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {metrics.recentOrders.map(order => (
                  <div key={order.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 'var(--space-3)',
                    borderBottom: '1px solid var(--color-border)'
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{order.orderNumber}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                        {order.itemCount} items • {new Date(order.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{order.subtotalFormatted}</div>
                      <span style={{
                        fontSize: 'var(--text-xs)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        background: order.status === 'SHIPPED' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                        color: order.status === 'SHIPPED' ? 'var(--color-success)' : 'var(--color-warning)',
                        fontWeight: 600
                      }}>
                        {order.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

