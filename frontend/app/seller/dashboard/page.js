'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getSellerDashboard, getSellerProfile, updateSellerProfile, getSellerMetrics, getMe, logout } from '../../../lib/api';
import InlineFieldError from '../../../components/InlineFieldError';
import {
  formatPhMobileInput,
  handlePhMobileKeyDown,
  isEmptyPhPrefix,
  normalizePhMobile,
  validateEntityName,
  validateOptionalText,
  focusFirstInvalidField
} from '../../../lib/validation';

export default function SellerDashboardPage() {
  const [profile, setProfile] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [productMetrics, setProductMetrics] = useState(null);
  const [period, setPeriod] = useState('30d');
  const [pendingUser, setPendingUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editModal, setEditModal] = useState(false);
  const [profileForm, setProfileForm] = useState({
    storeName: '',
    storeDescription: '',
    storeLogoUrl: '',
    identificationDetails: '',
    phone: '+63 '
  });
  const [profileErrors, setProfileErrors] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [msg, setMsg] = useState(null);

  const fetchDashboard = async (selectedPeriod = period) => {
    try {
      setLoading(true);
      const [profileRes, dashboardRes, prodMetRes] = await Promise.all([
        getSellerProfile(),
        getSellerDashboard(),
        getSellerMetrics(selectedPeriod)
      ]);

      if (profileRes.success) {
        setProfile(profileRes.data);
        setProfileForm({
          storeName: profileRes.data.storeName || '',
          storeDescription: profileRes.data.storeDescription || '',
          storeLogoUrl: profileRes.data.storeLogoUrl || '',
          identificationDetails: profileRes.data.identificationDetails || '',
          phone: profileRes.data.phone ? formatPhMobileInput(profileRes.data.phone) : '+63 '
        });
      }
      if (dashboardRes.success) setMetrics(dashboardRes.data);
      if (prodMetRes.success) setProductMetrics(prodMetRes.data);
    } catch (err) {
      // Check if logged in as PENDING seller -> show Awaiting Approval screen (T-AUTH-05)
      try {
        const me = await getMe();
        if (me?.success && me.data?.role === 'SELLER' && me.data?.sellerStatus !== 'APPROVED') {
          setPendingUser(me.data);
          setError(null);
          return;
        }
      } catch {}
      setError(err.message || 'Failed to load seller dashboard. Please ensure you are logged in as an approved merchant.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard(period);
  }, [period]);

  const handleSaveStoreProfile = async (e) => {
    e.preventDefault();
    if (savingProfile) return;
    const checks = {
      storeName: validateEntityName(profileForm.storeName, 'Store name', { min: 2, max: 80 }),
      storeDescription: validateOptionalText(profileForm.storeDescription, 'Store description', { max: 1000 }),
      identificationDetails: validateOptionalText(profileForm.identificationDetails, 'Identification details', { max: 300 }),
      phone: normalizePhMobile(profileForm.phone, { required: false })
    };
    const errors = {
      storeName: checks.storeName.valid ? null : checks.storeName.error,
      storeDescription: checks.storeDescription.valid ? null : checks.storeDescription.error,
      identificationDetails: checks.identificationDetails.valid ? null : checks.identificationDetails.error,
      phone: checks.phone.valid ? null : checks.phone.error
    };
    setProfileErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      focusFirstInvalidField(errors, {
        storeName: 'sp-storeName',
        storeDescription: 'sp-storeDesc',
        identificationDetails: 'sp-idDetails',
        phone: 'sp-phone'
      });
      return;
    }

    setSavingProfile(true);
    try {
      const res = await updateSellerProfile({
        ...profileForm,
        storeName: checks.storeName.value,
        storeDescription: checks.storeDescription.value || '',
        identificationDetails: checks.identificationDetails.value || '',
        phone: isEmptyPhPrefix(profileForm.phone) ? '' : (checks.phone.value || '')
      });
      setProfile(prev => ({ ...prev, ...res.data }));
      setEditModal(false);
      setProfileErrors({});
      setMsg('Store profile & identification details updated (FR-5.2)!');
      setTimeout(() => setMsg(null), 3000);
    } catch (err) {
      if (err?.data?.fieldErrors) setProfileErrors(prev => ({ ...prev, ...err.data.fieldErrors }));
      setMsg(err.message);
    } finally {
      setSavingProfile(false);
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

  if (pendingUser) {
    return (
      <div className="container" style={{ padding: 'var(--space-16) 0', maxWidth: '640px' }}>
        <div style={{
          background: '#FFFBEB',
          border: '1px solid #FCD34D',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-8)',
          textAlign: 'center'
        }}>
          <span style={{
            display: 'inline-block', padding: '4px 12px', borderRadius: 'var(--radius-full)',
            background: '#FEF3C7', color: '#92400E', fontSize: 'var(--text-xs)', fontWeight: 700, marginBottom: 'var(--space-3)'
          }}>
            STATUS: {pendingUser.sellerStatus || 'PENDING_APPROVAL'}
          </span>
          <h2 style={{ marginBottom: 'var(--space-2)' }}>Awaiting Administrator Approval</h2>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
            Your merchant application for <strong>{pendingUser.storeName || pendingUser.email}</strong> has been received and is under review. You will be able to publish listings and manage orders once an administrator approves your store.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' }}>
            <Link href="/shop" className="btn btn-outline">Browse Storefront</Link>
            <button onClick={handleLogout} className="btn btn-primary">Sign Out</button>
          </div>
        </div>
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

        {/* Product Performance Metrics Section (REV-07, FR-4.4, D8) */}
        <div style={{
          background: 'var(--color-surface)',
          padding: 'var(--space-6)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: 'var(--space-8)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <div>
              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, margin: 0 }}>Product Performance Metrics</h2>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>
                Counts PAID &amp; SHIPPED orders only (Asia/Manila). {productMetrics && !productMetrics.badgesApplied ? 'Fewer than 5 active products — ranked without High/Low badges.' : 'Top 20% High-selling · Bottom 20% Low-selling'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { key: '7d', label: '7 Days' },
                { key: '30d', label: '30 Days' },
                { key: '90d', label: '90 Days' },
                { key: 'all', label: 'All Time' }
              ].map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setPeriod(opt.key)}
                  className={`btn btn-sm ${period === opt.key ? 'btn-primary' : 'btn-outline'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {(!productMetrics?.products || productMetrics.products.length === 0) ? (
            <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: 'var(--space-6) 0', fontSize: 'var(--text-sm)' }}>
              No products or sales recorded yet for this period.
            </p>
          ) : (
            <>
              {/* Lightweight Inline SVG Bar Chart */}
              <div style={{ marginBottom: 'var(--space-5)', padding: 'var(--space-3)', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8 }}>
                  Units Sold by Product ({period.toUpperCase()})
                </div>
                <svg width="100%" height={Math.max(40, Math.min(productMetrics.products.length, 6) * 28)} role="img" aria-label="Product units sold chart">
                  {(() => {
                    const top = productMetrics.products.slice(0, 6);
                    const maxUnits = Math.max(1, ...top.map(p => p.unitsSold));
                    return top.map((p, idx) => {
                      const y = idx * 28 + 4;
                      const barPct = Math.round((p.unitsSold / maxUnits) * 58);
                      return (
                        <g key={p.productId}>
                          <text x="0" y={y + 14} fontSize="11" fill="currentColor">{p.name.slice(0, 26)}</text>
                          <rect x="35%" y={y + 3} width={`${barPct}%`} height="14" rx="3" fill="#2563EB" />
                          <text x="95%" y={y + 14} fontSize="11" fontWeight="700" textAnchor="end" fill="currentColor">{p.unitsSold} u</text>
                        </g>
                      );
                    });
                  })()}
                </svg>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
                      <th style={{ padding: '10px 8px' }}>Product</th>
                      <th style={{ padding: '10px 8px' }}>Status</th>
                      <th style={{ padding: '10px 8px' }}>Stock</th>
                      <th style={{ padding: '10px 8px' }}>Orders</th>
                      <th style={{ padding: '10px 8px' }}>Units Sold</th>
                      <th style={{ padding: '10px 8px' }}>Revenue</th>
                      <th style={{ padding: '10px 8px' }}>Performance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productMetrics.products.map(p => (
                      <tr key={p.productId} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '10px 8px', fontWeight: 600 }}>
                          {p.name}
                          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 400 }}>{p.sku}</div>
                        </td>
                        <td style={{ padding: '10px 8px' }}>{p.status}</td>
                        <td style={{ padding: '10px 8px' }}>{p.currentStock}</td>
                        <td style={{ padding: '10px 8px' }}>{p.orderCount}</td>
                        <td style={{ padding: '10px 8px', fontWeight: 700 }}>{p.unitsSold}</td>
                        <td style={{ padding: '10px 8px', fontWeight: 700 }}>{p.revenueFormatted}</td>
                        <td style={{ padding: '10px 8px' }}>
                          {p.performanceLabel === 'HIGH_SELLING' && (
                            <span style={{ background: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: 999, fontSize: '11px', fontWeight: 700 }}>High-selling</span>
                          )}
                          {p.performanceLabel === 'LOW_SELLING' && (
                            <span style={{ background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: 999, fontSize: '11px', fontWeight: 700 }}>Low-selling</span>
                          )}
                          {p.performanceLabel === 'NO_SALES' && (
                            <span style={{ background: '#F3F4F6', color: '#374151', padding: '2px 8px', borderRadius: 999, fontSize: '11px', fontWeight: 700 }}>No sales</span>
                          )}
                          {!p.performanceLabel && <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Ranked</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
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
            <form onSubmit={handleSaveStoreProfile} noValidate>
              <div className="form-group">
                <label className="form-label" htmlFor="sp-storeName">Store Name *</label>
                <input
                  id="sp-storeName"
                  className="form-input"
                  value={profileForm.storeName}
                  onChange={e => setProfileForm(p => ({ ...p, storeName: e.target.value }))}
                  required
                  aria-required="true"
                  aria-invalid={Boolean(profileErrors.storeName)}
                  aria-describedby={profileErrors.storeName ? 'sp-storeName-err' : undefined}
                  maxLength={80}
                />
                <InlineFieldError id="sp-storeName-err" error={profileErrors.storeName} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="sp-storeDesc">Store Description <span className="form-optional">(optional)</span></label>
                <textarea
                  id="sp-storeDesc"
                  className="form-input"
                  rows={3}
                  value={profileForm.storeDescription}
                  onChange={e => setProfileForm(p => ({ ...p, storeDescription: e.target.value }))}
                  aria-invalid={Boolean(profileErrors.storeDescription)}
                  aria-describedby={profileErrors.storeDescription ? 'sp-storeDesc-err' : undefined}
                  maxLength={1000}
                />
                <InlineFieldError id="sp-storeDesc-err" error={profileErrors.storeDescription} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="sp-idDetails">Business / DTI / TIN Identification Details <span className="form-optional">(optional)</span></label>
                <input
                  id="sp-idDetails"
                  className="form-input"
                  value={profileForm.identificationDetails}
                  onChange={e => setProfileForm(p => ({ ...p, identificationDetails: e.target.value }))}
                  aria-invalid={Boolean(profileErrors.identificationDetails)}
                  aria-describedby={profileErrors.identificationDetails ? 'sp-idDetails-err' : undefined}
                  maxLength={300}
                />
                <InlineFieldError id="sp-idDetails-err" error={profileErrors.identificationDetails} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="sp-phone">Contact Mobile <span className="form-optional">(optional)</span></label>
                <input
                  id="sp-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={16}
                  placeholder="+63 9XX-XXX-YYYY"
                  className="form-input"
                  value={profileForm.phone}
                  onKeyDown={handlePhMobileKeyDown}
                  onChange={e => setProfileForm(p => ({ ...p, phone: formatPhMobileInput(e.target.value) }))}
                  aria-invalid={Boolean(profileErrors.phone)}
                  aria-describedby={profileErrors.phone ? 'sp-phone-err' : undefined}
                />
                <InlineFieldError id="sp-phone-err" error={profileErrors.phone} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => { setEditModal(false); setProfileErrors({}); }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={savingProfile}>
                  {savingProfile ? 'Saving…' : 'Save Store Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
