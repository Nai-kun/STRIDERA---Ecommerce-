'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getSellerDashboard, getSellerProfile, updateSellerProfile, logout } from '../../../lib/api';

export default function SellerDashboardPage() {
  const [profile, setProfile] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editModal, setEditModal] = useState(false);
  const [profileForm, setProfileForm] = useState({
    storeName: '',
    storeDescription: '',
    storeLogoUrl: '',
    identificationDetails: '',
    phone: ''
  });
  const [msg, setMsg] = useState(null);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const [profileRes, dashboardRes] = await Promise.all([
        getSellerProfile(),
        getSellerDashboard()
      ]);

      if (profileRes.success) {
        setProfile(profileRes.data);
        setProfileForm({
          storeName: profileRes.data.storeName || '',
          storeDescription: profileRes.data.storeDescription || '',
          storeLogoUrl: profileRes.data.storeLogoUrl || '',
          identificationDetails: profileRes.data.identificationDetails || '',
          phone: profileRes.data.phone || ''
        });
      }
      if (dashboardRes.success) setMetrics(dashboardRes.data);
    } catch (err) {
      setError(err.message || 'Failed to load seller dashboard. Please ensure you are logged in as an approved merchant.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const handleSaveStoreProfile = async (e) => {
    e.preventDefault();
    try {
      const res = await updateSellerProfile(profileForm);
      setProfile(prev => ({ ...prev, ...res.data }));
      setEditModal(false);
      setMsg('Store profile & identification details updated (FR-5.2)!');
      setTimeout(() => setMsg(null), 3000);
    } catch (err) {
      setMsg(err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      if (typeof window !== 'undefined') {
        localStorage.removeItem('stridera_token');
        localStorage.removeItem('stridera_user');
      }
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
      {/* Top Banner */}
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
              padding: '2px 10px',
              borderRadius: 'var(--radius-full)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              Role 2: Seller / Merchant Portal
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Link href="/shop" className="btn btn-ghost btn-sm" style={{ color: '#fff' }}>Storefront</Link>
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

      <main className="container" style={{ marginTop: 'var(--space-8)' }}>
        {msg && (
          <div style={{
            background: 'rgba(34,197,94,0.12)', border: '1px solid var(--color-success)',
            color: 'var(--color-success)', padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', fontWeight: 600, fontSize: 'var(--text-sm)'
          }}>
            {msg}
          </div>
        )}

        {/* Merchant Welcome & Store Profile Banner (FR-5.2) */}
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
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)', marginTop: 4 }}>
              <strong>Verified ID / DTI Details:</strong> {profile?.identificationDetails || 'DTI-NCR-Verified'} &bull; <strong>Contact:</strong> {profile?.phone || 'N/A'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-outline btn-sm" onClick={() => setEditModal(true)}>
              ✏️ Edit Store Profile (FR-5.2)
            </button>

            <span style={{
              background: 'rgba(34, 197, 94, 0.12)',
              color: 'var(--color-success)',
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              textTransform: 'uppercase'
            }}>
              ● {profile?.sellerStatus || 'APPROVED'}
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
            Overview &amp; Earnings
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
            My Products &amp; Stock
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

        {/* Metric Cards Grid (FR-5.13) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-8)'
        }}>
          <div style={{
            background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)', borderLeft: '4px solid var(--color-brand-primary)'
          }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Gross Sales</span>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, marginTop: 4 }}>
              {metrics?.totalRevenueFormatted || '₱0.00'}
            </div>
            <span style={{ fontSize: '11px', color: 'var(--color-text-subtle)' }}>Platform Fee ({metrics?.platformFeePercent || 5}%): {metrics?.platformFeeFormatted || '₱0.00'}</span>
          </div>

          <div style={{
            background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)', borderLeft: '4px solid var(--color-success)'
          }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Net Seller Earnings</span>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--color-success)', marginTop: 4 }}>
              {metrics?.netEarningsFormatted || '₱0.00'}
            </div>
            <span style={{ fontSize: '11px', color: 'var(--color-text-subtle)' }}>After {metrics?.platformFeePercent || 5}% commission</span>
          </div>

          <div style={{
            background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)', borderLeft: '4px solid var(--color-warning)'
          }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Orders to Fulfill</span>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, marginTop: 4 }}>
              {metrics?.pendingOrders || 0}
            </div>
            <span style={{ fontSize: '11px', color: 'var(--color-text-subtle)' }}>{metrics?.shippedOrders || 0} shipped / delivered</span>
          </div>

          <div style={{
            background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)', borderLeft: '4px solid #7c3aed'
          }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Active Products</span>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, marginTop: 4 }}>
              {metrics?.totalProducts || 0}
            </div>
            <span style={{ fontSize: '11px', color: 'var(--color-text-subtle)' }}>Listed in storefront</span>
          </div>
        </div>

        {/* Dual Section: Low Stock Alerts & Recent Orders */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
          gap: 'var(--space-6)',
          marginBottom: 'var(--space-8)'
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
              <Link href="/seller/orders" className="btn btn-outline btn-sm">Manage Orders</Link>
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

        {/* Seller Payout History (FR-5.13 & FR-9.8) */}
        <div style={{ background: 'var(--color-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>
            Finance Officer Payout Settlements (FR-5.13)
          </h2>
          {(!metrics?.payouts || metrics.payouts.length === 0) ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>No payouts recorded yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {metrics.payouts.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--color-bg)', borderRadius: 8, fontSize: 'var(--text-sm)' }}>
                  <div>
                    <strong>{p.payoutNumber}</strong> &bull; Ref: {p.referenceNumber} ({p.provider.toUpperCase()})
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{p.notes}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, color: 'var(--color-success)' }}>Net: ₱{(p.netAmountCentavos / 100).toFixed(2)}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Gross: ₱{(p.grossSalesCentavos / 100).toFixed(2)} (-{p.platformFeePercent}% fee)</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Edit Store Profile Modal (FR-5.2) */}
      {editModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 'var(--space-4)'
        }}>
          <div style={{
            background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-6)', maxWidth: 480, width: '100%'
          }}>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 800, marginBottom: 'var(--space-4)' }}>Edit Store Profile (FR-5.2)</h2>
            <form onSubmit={handleSaveStoreProfile}>
              <div className="form-group">
                <label className="form-label">Store Name *</label>
                <input className="form-input" value={profileForm.storeName} onChange={e => setProfileForm(p => ({ ...p, storeName: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Store Description</label>
                <textarea className="form-input" rows={3} value={profileForm.storeDescription} onChange={e => setProfileForm(p => ({ ...p, storeDescription: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Business / DTI / TIN Identification Details</label>
                <input className="form-input" value={profileForm.identificationDetails} onChange={e => setProfileForm(p => ({ ...p, identificationDetails: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Contact Phone</label>
                <input className="form-input" value={profileForm.phone} onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setEditModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Store Profile</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
