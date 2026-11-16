'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  getAdminReports,
  getAdminUsers,
  updateAdminUserRole,
  updateAdminUserStatus,
  getAdminSellers,
  updateAdminSellerStatus,
  assignAdminBrand,
  getAdminBrands,
  createAdminBrand,
  getAdminOrders,
  getAdminConfigStatus,
  getAdminPlatformConfig,
  updateAdminPlatformConfig,
  getAdminPaymentLogs,
  getAdminAuditLogs,
  getAdminAnalytics,
  getAdminApiSettings,
  updateAdminApiSettings,
  getAdminWebhooks,
  getAdminHealth,
  simulatePayment,
  logout
} from '../../../lib/api';

const ALL_ROLES = [
  'CUSTOMER',
  'SELLER',
  'ADMIN',
  'INVENTORY_MANAGER',
  'DELIVERY_PERSONNEL',
  'CUSTOMER_SUPPORT',
  'FINANCE_OFFICER'
];

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [reports, setReports] = useState(null);
  const [users, setUsers] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [brands, setBrands] = useState([]);
  const [orders, setOrders] = useState([]);
  const [config, setConfig] = useState(null);
  const [platformConfig, setPlatformConfig] = useState({
    platformFeePercent: 5,
    lowStockThreshold: 5,
    shippingFeeCentavos: 15000,
    freeShippingThresholdCentavos: 500000,
    enabledWallets: 'gcash,maya,paypal',
    sandboxMode: true
  });
  const [paymentLogs, setPaymentLogs] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsPeriod, setAnalyticsPeriod] = useState('30d');
  const [apiSettings, setApiSettings] = useState(null);
  const [apiKeyForm, setApiKeyForm] = useState({ PAYMONGO_SECRET_KEY: '', PAYMONGO_PUBLIC_KEY: '', PAYMONGO_WEBHOOK_SECRET: '' });
  const [webhooks, setWebhooks] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);

  // Brand modal
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [newBrand, setNewBrand] = useState({ name: '', slug: '', description: '' });

  const notify = (msg, isError = false) => {
    setNotification({ msg, isError });
    setTimeout(() => setNotification(null), 3500);
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      const [repRes, usrRes, selRes, brRes, ordRes, cfgRes, pCfgRes, payRes, audRes, anaRes, apiRes, whRes, hltRes] = await Promise.allSettled([
        getAdminReports(),
        getAdminUsers(),
        getAdminSellers(),
        getAdminBrands(),
        getAdminOrders(),
        getAdminConfigStatus(),
        getAdminPlatformConfig(),
        getAdminPaymentLogs(),
        getAdminAuditLogs(),
        getAdminAnalytics(analyticsPeriod),
        getAdminApiSettings(),
        getAdminWebhooks(),
        getAdminHealth()
      ]);

      if (repRes.status === 'fulfilled' && repRes.value.success) setReports(repRes.value.data);
      if (usrRes.status === 'fulfilled' && usrRes.value.success) setUsers(usrRes.value.data);
      if (selRes.status === 'fulfilled' && selRes.value.success) setSellers(selRes.value.data);
      if (brRes.status === 'fulfilled' && brRes.value.success) setBrands(brRes.value.data);
      if (ordRes.status === 'fulfilled' && ordRes.value.success) setOrders(ordRes.value.data);
      if (cfgRes.status === 'fulfilled' && cfgRes.value.success) setConfig(cfgRes.value.data);
      if (pCfgRes.status === 'fulfilled' && pCfgRes.value.success) setPlatformConfig(pCfgRes.value.data);
      if (payRes.status === 'fulfilled' && payRes.value.success) setPaymentLogs(payRes.value.data);
      if (audRes.status === 'fulfilled' && audRes.value.success) setAuditLogs(audRes.value.data);
      if (anaRes.status === 'fulfilled' && anaRes.value.success) setAnalytics(anaRes.value.data);
      if (apiRes.status === 'fulfilled' && apiRes.value.success) setApiSettings(apiRes.value.data);
      if (whRes.status === 'fulfilled' && whRes.value.success) setWebhooks(whRes.value.data);
      if (hltRes.status === 'fulfilled' && hltRes.value.success) setHealth(hltRes.value.data);
    } catch (e) {
      console.error(e);
      notify('Failed to load administrator records', true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleUserRoleChange = async (userId, role) => {
    try {
      const res = await updateAdminUserRole(userId, role);
      if (res.success) {
        notify(`User role updated to ${role}`);
        loadAll();
      }
    } catch (e) {
      notify(e.message || 'Role update failed', true);
    }
  };

  const handleUserStatusChange = async (userId, accountStatus) => {
    try {
      const res = await updateAdminUserStatus(userId, accountStatus);
      if (res.success) {
        notify(`User account status updated to ${accountStatus}`);
        loadAll();
      }
    } catch (e) {
      notify(e.message || 'Account status update failed', true);
    }
  };

  const handleSellerStatus = async (sellerId, newStatus) => {
    try {
      const res = await updateAdminSellerStatus(sellerId, newStatus);
      if (res.success) {
        notify(`Seller status updated to ${newStatus}`);
        loadAll();
      }
    } catch (e) {
      notify(e.message || 'Status update failed', true);
    }
  };

  const handleAssignBrand = async (sellerId, brandId) => {
    try {
      const res = await assignAdminBrand(sellerId, brandId);
      if (res.success) {
        notify('Brand successfully assigned to merchant!');
        loadAll();
      }
    } catch (e) {
      notify(e.message || 'Brand assignment failed', true);
    }
  };

  const handleCreateBrand = async (e) => {
    e.preventDefault();
    try {
      const res = await createAdminBrand(newBrand);
      if (res.success) {
        notify('Brand created successfully!');
        setShowBrandModal(false);
        setNewBrand({ name: '', slug: '', description: '' });
        loadAll();
      }
    } catch (e) {
      notify(e.message || 'Brand creation failed', true);
    }
  };

  const handleSavePlatformConfig = async (e) => {
    e.preventDefault();
    try {
      const res = await updateAdminPlatformConfig(platformConfig);
      if (res.success) {
        notify('Platform configuration saved!');
        setPlatformConfig(res.data);
      }
    } catch (e) {
      notify(e.message || 'Failed to save platform settings', true);
    }
  };

  const handleSimulatePayment = async (orderNumber) => {
    try {
      const res = await simulatePayment(orderNumber);
      if (res.success) {
        notify(`Payment simulated for ${orderNumber}! Order marked PAID.`);
        loadAll();
      }
    } catch (e) {
      notify(e.message || 'Simulation failed', true);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (e) {
      console.error(e);
    }
    localStorage.removeItem('stridera_token');
    localStorage.removeItem('stridera_user');
    window.location.href = '/account/login';
  };

  const pendingSellers = sellers.filter(s => s.sellerStatus === 'PENDING');

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
          boxShadow: 'var(--shadow-xl)',
          zIndex: 9999,
          fontSize: 'var(--text-sm)',
          fontWeight: 600
        }}>
          {notification.msg}
        </div>
      )}

      {/* Admin Top Navigation with All 7 Role Portals */}
      <header style={{
        background: '#0F172A',
        color: '#fff',
        padding: 'var(--space-4) 0',
        borderBottom: '1px solid rgba(255,255,255,0.1)'
      }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <Link href="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: 800, fontSize: 'var(--text-lg)', letterSpacing: '0.05em' }}>
              STRIDERA
            </Link>
            <span style={{
              background: 'var(--color-brand-primary)',
              color: '#fff',
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              fontWeight: 700,
              textTransform: 'uppercase'
            }}>
              Platform Admin (Role 3)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <Link href="/" className="btn btn-ghost btn-sm" style={{ color: '#fff' }}>Storefront</Link>
            <Link href="/seller/dashboard" className="btn btn-ghost btn-sm" style={{ color: '#fff' }}>Seller Portal</Link>
            <Link href="/inventory" className="btn btn-ghost btn-sm" style={{ color: '#fff' }}>Inventory Portal</Link>
            <Link href="/delivery" className="btn btn-ghost btn-sm" style={{ color: '#fff' }}>Delivery Portal</Link>
            <Link href="/support" className="btn btn-ghost btn-sm" style={{ color: '#fff' }}>Support Portal</Link>
            <Link href="/finance" className="btn btn-ghost btn-sm" style={{ color: '#fff' }}>Finance Portal</Link>
            <button onClick={handleLogout} className="btn btn-outline btn-sm" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="container" style={{ marginTop: 'var(--space-8)' }}>
        {/* Title and Demo Mode Alert */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-4xl)' }}>Executive Control Center</h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
              7-Role user governance, multi-seller verification, brand governance, order tracking, and platform configuration (FR-10.1–FR-10.10).
            </p>
          </div>

          {config?.demoSafetyFallback?.enabled && (
            <div style={{
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid var(--color-warning)',
              color: 'var(--color-warning)',
              padding: 'var(--space-2) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)'
            }}>
              <span>⚡</span> DEMO_MODE ACTIVE &bull; Simulate Payment Enabled
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          gap: 'var(--space-2)',
          borderBottom: '2px solid var(--color-border)',
          marginBottom: 'var(--space-8)',
          overflowX: 'auto'
        }}>
          {[
            ['overview', 'Overview & Metrics'],
            ['analytics', 'Seller Analytics'],
            ['users', `Users & 7 Roles (${users.length})`],
            ['sellers', `Merchants & Approvals (${pendingSellers.length})`],
            ['orders', `Orders (${orders.length})`],
            ['brands', `Brands (${brands.length})`],
            ['config', 'Platform Settings & API Keys'],
            ['health', 'Webhooks & System Health'],
            ['audit', 'Audit Logs']
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                padding: 'var(--space-3) var(--space-5)',
                fontWeight: activeTab === id ? 700 : 500,
                color: activeTab === id ? 'var(--color-brand-primary)' : 'var(--color-text-muted)',
                borderBottom: activeTab === id ? '3px solid var(--color-brand-primary)' : '3px solid transparent',
                marginBottom: '-2px',
                background: 'none',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', padding: 'var(--space-16) 0', color: 'var(--color-text-muted)' }}>
            Loading platform records...
          </p>
        ) : (
          <>
            {/* ── TAB 1: OVERVIEW ── */}
            {activeTab === 'overview' && (
              <div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 'var(--space-4)',
                  marginBottom: 'var(--space-8)'
                }}>
                  <div style={{ background: 'var(--color-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', borderLeft: '4px solid var(--color-brand-primary)' }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Total Revenue (30d)</span>
                    <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, marginTop: 'var(--space-1)' }}>
                      {reports?.totalRevenueFormatted || '₱0.00'}
                    </div>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>From verified paid transactions</span>
                  </div>

                  <div style={{ background: 'var(--color-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', borderLeft: '4px solid var(--color-success)' }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Orders Placed</span>
                    <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, marginTop: 'var(--space-1)' }}>
                      {reports?.paidOrders || 0} / {reports?.totalOrders || 0}
                    </div>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>{reports?.conversionRate || 0}% checkout payment rate</span>
                  </div>

                  <div style={{ background: 'var(--color-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', borderLeft: '4px solid var(--color-warning)' }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Pending Seller Review</span>
                    <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, marginTop: 'var(--space-1)' }}>
                      {pendingSellers.length}
                    </div>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>Require admin authorization</span>
                  </div>

                  <div style={{ background: 'var(--color-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', borderLeft: '4px solid #8B5CF6' }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Average Order Value</span>
                    <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, marginTop: 'var(--space-1)' }}>
                      {reports?.averageOrderValueFormatted || '₱0.00'}
                    </div>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>Per completed checkout</span>
                  </div>
                </div>

                {/* Top Selling Models & Low Stock Alerts */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 'var(--space-6)' }}>
                  <div style={{ background: 'var(--color-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
                    <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Low Inventory Monitor (≤ 5 units)</h2>
                    {(!reports?.lowStockAlerts || reports.lowStockAlerts.length === 0) ? (
                      <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>All variants healthy.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                        {reports.lowStockAlerts.map(a => (
                          <div key={a.variantId} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) var(--space-3)', background: 'var(--color-surface-raised)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}>
                            <span><strong>{a.productName}</strong> ({a.size} / {a.color})</span>
                            <span style={{ color: a.stockQuantity === 0 ? 'var(--color-error)' : 'var(--color-warning)', fontWeight: 700 }}>{a.stockQuantity} remaining</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ background: 'var(--color-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
                    <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Top Footwear Models by Volume</h2>
                    {(!reports?.topProducts || reports.topProducts.length === 0) ? (
                      <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>No paid sales recorded in this period.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                        {reports.topProducts.map(p => (
                          <div key={p.productName} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) var(--space-3)', borderBottom: '1px solid var(--color-border)', fontSize: 'var(--text-sm)' }}>
                            <span>{p.productName}</span>
                            <span style={{ fontWeight: 700 }}>₱{(p._sum.lineTotalCentavos / 100).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 2: USERS & 7-ROLE GOVERNANCE (FR-10.2, FR-10.4) ── */}
            {activeTab === 'users' && (
              <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-sm)' }}>
                <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
                  Platform Users & 7-Role Governance (FR-10.2, FR-10.4)
                </h2>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-6)' }}>
                  Assign roles across all 7 platform personas and activate, suspend, or deactivate user accounts.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {users.map(u => (
                    <div key={u.id} style={{
                      padding: 'var(--space-4)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-lg)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 'var(--space-4)'
                    }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <span style={{ fontWeight: 700 }}>{u.firstName} {u.lastName}</span>
                          <span style={{
                            fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-full)',
                            background: u.accountStatus === 'ACTIVE' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                            color: u.accountStatus === 'ACTIVE' ? 'var(--color-success)' : 'var(--color-error)'
                          }}>
                            {u.accountStatus || 'ACTIVE'}
                          </span>
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                          {u.email} {u.storeName ? `• Store: ${u.storeName}` : ''}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                        <select
                          value={u.role}
                          onChange={e => handleUserRoleChange(u.id, e.target.value)}
                          style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: 'var(--text-xs)', fontWeight: 700 }}
                        >
                          {ALL_ROLES.map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>

                        <select
                          value={u.accountStatus || 'ACTIVE'}
                          onChange={e => handleUserStatusChange(u.id, e.target.value)}
                          style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: 'var(--text-xs)' }}
                        >
                          <option value="ACTIVE">ACTIVE</option>
                          <option value="SUSPENDED">SUSPENDED</option>
                          <option value="DEACTIVATED">DEACTIVATED</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── TAB 3: SELLERS & APPROVALS (FR-10.3) ── */}
            {activeTab === 'sellers' && (
              <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-sm)' }}>
                <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>
                  Merchant Partner Applications & Verification (FR-10.3)
                </h2>

                {sellers.length === 0 ? (
                  <p style={{ color: 'var(--color-text-muted)' }}>No sellers registered yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    {sellers.map((s) => (
                      <div key={s.id} style={{
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-lg)',
                        padding: 'var(--space-4)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 'var(--space-4)'
                      }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                            <span style={{ fontWeight: 700, fontSize: 'var(--text-base)' }}>{s.storeName || 'Unnamed Store'}</span>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-full)',
                              background: s.sellerStatus === 'APPROVED' ? 'rgba(34, 197, 94, 0.1)' : s.sellerStatus === 'PENDING' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                              color: s.sellerStatus === 'APPROVED' ? 'var(--color-success)' : s.sellerStatus === 'PENDING' ? 'var(--color-warning)' : 'var(--color-error)'
                            }}>
                              ● {s.sellerStatus}
                            </span>
                          </div>

                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>
                            Contact: {s.firstName} {s.lastName} ({s.email}) &bull; Phone: {s.phone || 'N/A'}
                          </div>

                          {s.identificationDetails && (
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-brand-primary)', marginTop: '4px', fontWeight: 600 }}>
                              🪪 Business / DTI / TIN Verification: {s.identificationDetails}
                            </div>
                          )}

                          {s.storeDescription && (
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)', marginTop: 'var(--space-1)', fontStyle: 'italic' }}>
                              "{s.storeDescription}"
                            </div>
                          )}

                          <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)' }}>
                            Assigned Brand: <strong>{s.brand?.name || 'None Assigned'}</strong>
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                          {s.sellerStatus === 'PENDING' && (
                            <>
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => handleSellerStatus(s.id, 'APPROVED')}
                              >
                                ✓ Approve Merchant
                              </button>
                              <button
                                className="btn btn-outline btn-sm"
                                style={{ color: 'var(--color-error)', borderColor: 'var(--color-error)' }}
                                onClick={() => handleSellerStatus(s.id, 'REJECTED')}
                              >
                                Reject
                              </button>
                            </>
                          )}

                          {s.sellerStatus === 'APPROVED' && (
                            <>
                              <select
                                style={{ padding: 'var(--space-1) var(--space-2)', fontSize: 'var(--text-xs)', borderRadius: 'var(--radius-sm)' }}
                                onChange={(e) => { if (e.target.value) handleAssignBrand(s.id, e.target.value); }}
                                defaultValue=""
                              >
                                <option value="" disabled>Assign Brand...</option>
                                {brands.map(b => (
                                  <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                              </select>

                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--color-error)' }}
                                onClick={() => handleSellerStatus(s.id, 'SUSPENDED')}
                              >
                                Suspend
                              </button>
                            </>
                          )}

                          {s.sellerStatus === 'SUSPENDED' && (
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => handleSellerStatus(s.id, 'APPROVED')}
                            >
                              Re-activate
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── TAB 4: ORDERS ── */}
            {activeTab === 'orders' && (
              <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-sm)' }}>
                <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Platform Orders</h2>

                {orders.length === 0 ? (
                  <p style={{ color: 'var(--color-text-muted)' }}>No orders placed yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {orders.map(o => (
                      <div key={o.id} style={{
                        padding: 'var(--space-4)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 'var(--space-4)'
                      }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                            <span style={{ fontWeight: 700 }}>{o.orderNumber}</span>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-full)',
                              background: o.paymentStatus === 'PAID' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                              color: o.paymentStatus === 'PAID' ? 'var(--color-success)' : 'var(--color-warning)'
                            }}>
                              Payment: {o.paymentStatus}
                            </span>
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                              Fulfillment: {o.shippingStatus}
                            </span>
                          </div>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>
                            Customer: {o.user?.email || o.guestEmail || 'Guest'} &bull; Date: {new Date(o.createdAt).toLocaleString()}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                          <span style={{ fontWeight: 800, fontSize: 'var(--text-base)' }}>{o.grandTotalFormatted}</span>

                          {o.paymentStatus !== 'PAID' && (
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => handleSimulatePayment(o.orderNumber)}
                              style={{ color: 'var(--color-warning)', borderColor: 'var(--color-warning)', fontSize: '11px' }}
                            >
                              ⚡ Simulate Paid
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── TAB 5: BRANDS ── */}
            {activeTab === 'brands' && (
              <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                  <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>Brand Portfolio</h2>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowBrandModal(true)}>
                    + Create Brand
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
                  {brands.map(b => (
                    <div key={b.id} style={{
                      padding: 'var(--space-4)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-lg)'
                    }}>
                      <div style={{ fontWeight: 700, fontSize: 'var(--text-base)' }}>{b.name}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-brand-primary)' }}>Slug: {b.slug}</div>
                      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: 'var(--space-2) 0' }}>
                        {b.description || 'No description provided.'}
                      </p>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-2)' }}>
                        Merchant: <strong>{b.seller?.storeName || 'STRIDERA Direct / Unassigned'}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── TAB 6: PLATFORM SETTINGS & API CONFIG (FR-10.9) ── */}
            {activeTab === 'config' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                {/* Editable Platform Settings Form (FR-10.9) */}
                <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-sm)' }}>
                  <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
                    Platform Governance & E-Wallet Settings (FR-10.9)
                  </h2>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
                    Configure marketplace commission percentage, low-stock threshold, shipping fees, and active e-wallet providers.
                  </p>

                  <form onSubmit={handleSavePlatformConfig} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 700, marginBottom: '4px' }}>Platform Commission (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        value={platformConfig.platformFeePercent}
                        onChange={e => setPlatformConfig({ ...platformConfig, platformFeePercent: Number(e.target.value) })}
                        style={{ width: '100%', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 700, marginBottom: '4px' }}>Low-Stock Alert Threshold</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={platformConfig.lowStockThreshold}
                        onChange={e => setPlatformConfig({ ...platformConfig, lowStockThreshold: Number(e.target.value) })}
                        style={{ width: '100%', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 700, marginBottom: '4px' }}>Enabled E-Wallets</label>
                      <input
                        type="text"
                        value={platformConfig.enabledWallets}
                        onChange={e => setPlatformConfig({ ...platformConfig, enabledWallets: e.target.value })}
                        style={{ width: '100%', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <button type="submit" className="btn btn-primary btn-sm" style={{ width: '100%', padding: 'var(--space-3)' }}>
                        Save Platform Settings
                      </button>
                    </div>
                  </form>
                </div>

                {/* Read-only API & Secret Status */}
                <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-sm)' }}>
                  <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
                    Platform Environment & API Gateway Status
                  </h2>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-6)' }}>
                    Read-only secret key audit. Per architecture rules, secret keys are never editable or persisted in the database.
                  </p>

                  {config && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-4)' }}>
                        <div style={{ padding: 'var(--space-4)', background: 'var(--color-surface-raised)', borderRadius: 'var(--radius-md)' }}>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>System Runtime</div>
                          <div style={{ fontWeight: 700, marginTop: 'var(--space-1)' }}>Environment: {config.environment}</div>
                          <div style={{ fontSize: 'var(--text-xs)' }}>Server Port: {config.port}</div>
                          <div style={{ fontSize: 'var(--text-xs)' }}>Frontend Origin: {config.frontendUrl}</div>
                        </div>

                        <div style={{ padding: 'var(--space-4)', background: 'var(--color-surface-raised)', borderRadius: 'var(--radius-md)' }}>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Database Driver</div>
                          <div style={{ fontWeight: 700, marginTop: 'var(--space-1)' }}>Connected: {config.database.configured ? 'YES' : 'NO'}</div>
                          <div style={{ fontSize: 'var(--text-xs)', fontFamily: 'monospace' }}>{config.database.connection}</div>
                        </div>

                        <div style={{ padding: 'var(--space-4)', background: 'var(--color-surface-raised)', borderRadius: 'var(--radius-md)' }}>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>PayMongo E-Wallet Gateway</div>
                          <div style={{ fontWeight: 700, marginTop: 'var(--space-1)' }}>Mode: {config.paymentGateway.mode}</div>
                          <div style={{ fontSize: 'var(--text-xs)' }}>Secret Key: <code style={{ fontFamily: 'monospace' }}>{config.paymentGateway.secretKeyMasked}</code></div>
                          <div style={{ fontSize: 'var(--text-xs)' }}>Webhook Secret: <code style={{ fontFamily: 'monospace' }}>{config.paymentGateway.webhookSecretMasked}</code></div>
                        </div>

                        <div style={{ padding: 'var(--space-4)', background: 'var(--color-surface-raised)', borderRadius: 'var(--radius-md)' }}>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Demo Safety Fallback</div>
                          <div style={{ fontWeight: 700, marginTop: 'var(--space-1)' }}>{config.demoSafetyFallback.mode}</div>
                          <div style={{ fontSize: 'var(--text-xs)' }}>Default Shipping: {config.shipping.defaultFeeFormatted}</div>
                        </div>
                      </div>

                      {/* Payment Transactions & Webhook Audit Trail */}
                      <div style={{ marginTop: 'var(--space-6)' }}>
                        <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 700, marginBottom: 'var(--space-3)' }}>
                          Payment Transaction & Webhook Deduplication Log
                        </h3>
                        {paymentLogs.length === 0 ? (
                          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>No payment transactions recorded.</p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                            {paymentLogs.map(p => (
                              <div key={p.id} style={{
                                padding: 'var(--space-2) var(--space-3)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-sm)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: 'var(--text-xs)'
                              }}>
                                <span>
                                  Order: <strong>{p.order?.orderNumber}</strong> ({p.amountFormatted}) &bull; Provider: {p.provider} {p.isDemo ? '(SIMULATED)' : ''}
                                </span>
                                <span>
                                  Status: <strong style={{ color: p.status === 'PAID' ? 'var(--color-success)' : 'inherit' }}>{p.status}</strong> &bull; Idempotency: {p.idempotencyKey.slice(0, 12)}...
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── TAB 7: AUDIT LOGS ── */}
            {activeTab === 'audit' && (
              <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-sm)' }}>
                <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Platform Audit Trail</h2>
                {auditLogs.length === 0 ? (
                  <p style={{ color: 'var(--color-text-muted)' }}>No audit events logged yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {auditLogs.map(l => (
                      <div key={l.id} style={{
                        padding: 'var(--space-3)',
                        borderBottom: '1px solid var(--color-border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 'var(--text-xs)'
                      }}>
                        <div>
                          <strong style={{ color: 'var(--color-brand-primary)' }}>{l.action}</strong> &bull; Entity: {l.entityType} ({l.entityId || 'N/A'})
                          <div style={{ color: 'var(--color-text-muted)', marginTop: '2px' }}>
                            Actor: {l.user?.email || 'System'} | IP: {l.ipAddress || 'internal'}
                          </div>
                        </div>
                        <span style={{ color: 'var(--color-text-subtle)' }}>
                          {new Date(l.createdAt).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* ── TAB 8: PLATFORM-WIDE SELLER ANALYTICS (REV-08, D3, D8, D13) ── */}
            {activeTab === 'analytics' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
                  <div>
                    <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, margin: 0 }}>Platform-Wide Seller Analytics</h2>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                      Reconciled over PAID &amp; SHIPPED orders ({analytics?.timezone || 'Asia/Manila'}).
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['7d', '30d', '90d', 'all'].map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={async () => {
                          setAnalyticsPeriod(p);
                          const res = await getAdminAnalytics(p).catch(() => null);
                          if (res?.success) setAnalytics(res.data);
                        }}
                        className={`btn btn-sm ${analyticsPeriod === p ? 'btn-primary' : 'btn-outline'}`}
                      >
                        {p === 'all' ? 'All Time' : p.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Totals Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 'var(--space-4)' }}>
                  <div style={{ background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>PLATFORM REVENUE</div>
                    <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800 }}>{analytics?.totals?.revenueFormatted || '₱0.00'}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      Gateway: ₱{((analytics?.totals?.gatewayRevenueCentavos || 0) / 100).toFixed(2)} · Sim: ₱{((analytics?.totals?.simulatedRevenueCentavos || 0) / 100).toFixed(2)}
                    </div>
                  </div>
                  <div style={{ background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>UNITS SOLD</div>
                    <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800 }}>{analytics?.totals?.unitsSold || 0}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{analytics?.totals?.orderCount || 0} paid orders</div>
                  </div>
                  <div style={{ background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>APPROVED SELLERS</div>
                    <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800 }}>{analytics?.totals?.approvedSellers || 0}</div>
                    <div style={{ fontSize: '11px', color: '#166534', fontWeight: 600 }}>● {analytics?.totals?.onlineSellers || 0} online now</div>
                  </div>
                </div>

                {/* Lightweight Top Sellers SVG Chart */}
                {analytics?.sellers?.length > 0 && (
                  <div style={{ background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 8 }}>TOP SELLERS BY REVENUE</div>
                    <svg width="100%" height={Math.max(40, analytics.sellers.length * 30)} role="img" aria-label="Top sellers revenue chart">
                      {(() => {
                        const maxRev = Math.max(1, ...analytics.sellers.map(s => s.revenueCentavos));
                        return analytics.sellers.map((s, idx) => {
                          const y = idx * 30 + 6;
                          const pct = Math.round((s.revenueCentavos / maxRev) * 55);
                          return (
                            <g key={s.sellerId}>
                              <text x="0" y={y + 14} fontSize="12" fill="currentColor">{s.storeName.slice(0, 24)}</text>
                              <rect x="32%" y={y + 2} width={`${pct}%`} height="16" rx="3" fill="#0F172A" />
                              <text x="98%" y={y + 14} fontSize="12" fontWeight="700" textAnchor="end" fill="currentColor">{s.revenueFormatted}</text>
                            </g>
                          );
                        });
                      })()}
                    </svg>
                  </div>
                )}

                {/* Per-Seller Table */}
                <div style={{ background: 'var(--color-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-sm)', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
                        <th style={{ padding: '10px 8px' }}>Seller Store</th>
                        <th style={{ padding: '10px 8px' }}>Activity</th>
                        <th style={{ padding: '10px 8px' }}>Listings</th>
                        <th style={{ padding: '10px 8px' }}>Low Stock</th>
                        <th style={{ padding: '10px 8px' }}>Orders</th>
                        <th style={{ padding: '10px 8px' }}>Units</th>
                        <th style={{ padding: '10px 8px' }}>Revenue</th>
                        <th style={{ padding: '10px 8px' }}>Fulfilment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(analytics?.sellers || []).map(s => (
                        <tr key={s.sellerId} style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <td style={{ padding: '10px 8px', fontWeight: 600 }}>
                            {s.storeName}
                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 400 }}>{s.email}</div>
                          </td>
                          <td style={{ padding: '10px 8px' }}>
                            {s.onlineNow ? (
                              <span style={{ background: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: 999, fontSize: '11px', fontWeight: 700 }}>● Online now</span>
                            ) : (
                              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                {s.lastSeenAt ? `Last active ${new Date(s.lastSeenAt).toLocaleString()}` : 'Not seen yet'}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 8px' }}>{s.activeListings}</td>
                          <td style={{ padding: '10px 8px' }}>{s.lowStockItems}</td>
                          <td style={{ padding: '10px 8px' }}>{s.orderCount}</td>
                          <td style={{ padding: '10px 8px' }}>{s.unitsSold}</td>
                          <td style={{ padding: '10px 8px', fontWeight: 700 }}>{s.revenueFormatted}</td>
                          <td style={{ padding: '10px 8px' }}>{s.fulfillmentRate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── TAB 9: WEBHOOKS, ENCRYPTED API KEYS & SYSTEM HEALTH (REV-10, D7) ── */}
            {activeTab === 'health' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                {/* Real Health Checks */}
                <div style={{ background: 'var(--color-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-sm)' }}>
                  <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>System Health Diagnostics</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
                    <div style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>DATABASE</div>
                      <div style={{ fontWeight: 700, color: health?.databaseReachable ? '#166534' : '#B91C1C' }}>
                        {health?.databaseReachable ? `Reachable (${health.databaseLatencyMs} ms)` : 'Unreachable'}
                      </div>
                    </div>
                    <div style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>SANDBOX PROVIDER</div>
                      <div style={{ fontWeight: 700 }}>{health?.sandboxMode ? 'Sandbox Mode Active' : 'Disabled'}</div>
                    </div>
                    <div style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>WEBHOOK FAILURES (24H)</div>
                      <div style={{ fontWeight: 700, color: (health?.webhookFailuresLast24h || 0) > 0 ? '#B45309' : '#166534' }}>
                        {health?.webhookFailuresLast24h || 0}
                      </div>
                    </div>
                    <div style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>DEMO FALLBACK</div>
                      <div style={{ fontWeight: 700 }}>{health?.demoFallbackEnabled ? 'Enabled' : 'Disabled'}</div>
                    </div>
                  </div>
                </div>

                {/* Encrypted Sandbox API Keys */}
                <div style={{ background: 'var(--color-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-sm)' }}>
                  <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>Encrypted Sandbox API Keys</h2>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
                    Keys are encrypted at rest (AES-256-GCM) and displayed masked. Live keys (sk_live_, pk_live_) are rejected.
                  </p>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        const res = await updateAdminApiSettings(apiKeyForm);
                        notify(res.message || 'Sandbox API settings saved!');
                        setApiKeyForm({ PAYMONGO_SECRET_KEY: '', PAYMONGO_PUBLIC_KEY: '', PAYMONGO_WEBHOOK_SECRET: '' });
                        loadAll();
                      } catch (err) {
                        notify(err.message || 'Failed to save API keys', true);
                      }
                    }}
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)' }}
                  >
                    {['PAYMONGO_SECRET_KEY', 'PAYMONGO_PUBLIC_KEY', 'PAYMONGO_WEBHOOK_SECRET'].map(k => (
                      <div key={k}>
                        <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 4 }}>
                          {k} <span style={{ color: 'var(--color-text-muted)' }}>({apiSettings?.settings?.[k]?.masked || 'unset'})</span>
                        </label>
                        <input
                          type="password"
                          className="form-input"
                          placeholder="Enter new sandbox key..."
                          value={apiKeyForm[k]}
                          onChange={e => setApiKeyForm(p => ({ ...p, [k]: e.target.value }))}
                        />
                      </div>
                    ))}
                    <div style={{ gridColumn: '1 / -1' }}>
                      <button type="submit" className="btn btn-primary btn-sm">Save Encrypted Sandbox Keys</button>
                    </div>
                  </form>
                </div>

                {/* Webhook Events Monitor */}
                <div style={{ background: 'var(--color-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-sm)', overflowX: 'auto' }}>
                  <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Webhook Events Monitor</h2>
                  {webhooks.length === 0 ? (
                    <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>No webhook events recorded yet.</p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
                          <th style={{ padding: '8px' }}>Event ID</th>
                          <th style={{ padding: '8px' }}>Type</th>
                          <th style={{ padding: '8px' }}>Signature</th>
                          <th style={{ padding: '8px' }}>Status</th>
                          <th style={{ padding: '8px' }}>Received</th>
                          <th style={{ padding: '8px' }}>Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {webhooks.map(w => (
                          <tr key={w.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                            <td style={{ padding: '8px', fontFamily: 'monospace' }}>{w.eventId}</td>
                            <td style={{ padding: '8px' }}>{w.eventType || 'N/A'}</td>
                            <td style={{ padding: '8px' }}>{w.signatureValid ? 'Valid' : 'Invalid'}</td>
                            <td style={{ padding: '8px', fontWeight: 700 }}>{w.status}</td>
                            <td style={{ padding: '8px' }}>{new Date(w.receivedAt).toLocaleString()}</td>
                            <td style={{ padding: '8px', color: 'var(--color-error)' }}>{w.error || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Modal: Create Brand */}
      {showBrandModal && (
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
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Create New Footwear Brand</h2>
            <form onSubmit={handleCreateBrand} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Brand Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Athletics"
                  value={newBrand.name}
                  onChange={e => setNewBrand({ ...newBrand, name: e.target.value, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-') })}
                  style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Brand Slug</label>
                <input
                  type="text"
                  required
                  value={newBrand.slug}
                  onChange={e => setNewBrand({ ...newBrand, slug: e.target.value })}
                  style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Description</label>
                <textarea
                  rows="3"
                  placeholder="High-performance marathon and distance running footwear..."
                  value={newBrand.description}
                  onChange={e => setNewBrand({ ...newBrand, description: e.target.value })}
                  style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowBrandModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Brand</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
