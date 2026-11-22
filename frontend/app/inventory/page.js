'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  getInventoryDashboard,
  getInventoryVariants,
  recordIncomingStock,
  recordOutgoingStock,
  adjustInventoryVariant,
  toggleVariantAvailability,
  getStockMovements,
  getInventoryReport,
  logout
} from '../../lib/api';
import InlineFieldError from '../../components/InlineFieldError';
import {
  validateStock,
  validateQuantity,
  validateRequiredText,
  focusFirstInvalidField
} from '../../lib/validation';

const INV_ACTION_FIELD_IDS = {
  newQuantity: 'inv-new-qty',
  quantity: 'inv-qty',
  reason: 'inv-reason'
};

export default function InventoryManagerPortalPage() {
  const [activeTab, setActiveTab] = useState('variants');
  const [dashboard, setDashboard] = useState(null);
  const [variants, setVariants] = useState([]);
  const [movements, setMovements] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);

  // Filters
  const [stockStatus, setStockStatus] = useState('');
  const [search, setSearch] = useState('');

  // Modal for Incoming / Outgoing / Adjustment
  const [actionModal, setActionModal] = useState({ open: false, type: '', variant: null });
  const [actionForm, setActionForm] = useState({ quantity: 10, newQuantity: 10, reason: '', reference: '' });
  const [actionErrors, setActionErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const notify = (msg, isError = false) => {
    setNotification({ msg, isError });
    setTimeout(() => setNotification(null), 3500);
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      const params = {};
      if (stockStatus) params.stockStatus = stockStatus;
      if (search) params.search = search;

      const [dashRes, varRes, movRes, repRes] = await Promise.allSettled([
        getInventoryDashboard(),
        getInventoryVariants(params),
        getStockMovements(),
        getInventoryReport()
      ]);

      if (dashRes.status === 'fulfilled' && dashRes.value.success) setDashboard(dashRes.value.data);
      if (varRes.status === 'fulfilled' && varRes.value.success) setVariants(varRes.value.data);
      if (movRes.status === 'fulfilled' && movRes.value.success) setMovements(movRes.value.data);
      if (repRes.status === 'fulfilled' && repRes.value.success) setReport(repRes.value.data);
    } catch (e) {
      notify(e.message || 'Failed to load inventory data', true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [stockStatus]);

  const openModal = (type, variant) => {
    setActionErrors({});
    setActionModal({ open: true, type, variant });
    setActionForm({
      quantity: 10,
      newQuantity: variant.stockQuantity,
      reason: type === 'INCOMING' ? 'Supplier Restock Batch' : type === 'OUTGOING' ? 'Warehouse Fulfillment Dispatch' : 'Physical Cycle Count Audit',
      reference: `REF-${Date.now().toString().slice(-6)}`
    });
  };

  const handleActionSubmit = async (e) => {
    e.preventDefault();
    const { type, variant } = actionModal;
    if (!variant || submitting) return;

    const reasonRes = validateRequiredText(actionForm.reason, 'Reason / Audit Note', { min: 2, max: 200 });
    const nextErrors = { ...(reasonRes.valid ? {} : { reason: reasonRes.error }) };

    let parsedQty = null;
    let parsedNewQty = null;
    if (type === 'ADJUST') {
      const stockRes = validateStock(actionForm.newQuantity);
      if (!stockRes.valid) nextErrors.newQuantity = stockRes.error;
      else parsedNewQty = stockRes.value;
    } else {
      const maxCap = type === 'OUTGOING' ? variant.stockQuantity : 9999;
      const qtyRes = validateQuantity(actionForm.quantity, maxCap);
      if (!qtyRes.valid) nextErrors.quantity = qtyRes.error;
      else parsedQty = qtyRes.value;
    }

    setActionErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalidField(nextErrors, INV_ACTION_FIELD_IDS);
      return;
    }

    const skuLabel = variant.variantSku || variant.sku;
    setSubmitting(true);
    try {
      if (type === 'INCOMING') {
        await recordIncomingStock({
          variantId: variant.id,
          quantity: parsedQty,
          reason: `${reasonRes.value} (${actionForm.reference})`
        });
        notify(`Recorded +${parsedQty} incoming units for ${skuLabel}`);
      } else if (type === 'OUTGOING') {
        await recordOutgoingStock({
          variantId: variant.id,
          quantity: parsedQty,
          reason: `${reasonRes.value} (${actionForm.reference})`
        });
        notify(`Recorded -${parsedQty} outgoing units for ${skuLabel}`);
      } else if (type === 'ADJUST') {
        const delta = parsedNewQty - variant.stockQuantity;
        await adjustInventoryVariant(variant.id, {
          quantityChange: delta,
          reason: reasonRes.value
        });
        notify(`Adjusted stock of ${skuLabel} to ${parsedNewQty} units`);
      }
      setActionErrors({});
      setActionModal({ open: false, type: '', variant: null });
      loadAll();
    } catch (err) {
      notify(err.message || 'Stock movement failed', true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleAvailability = async (v) => {
    try {
      const res = await toggleVariantAvailability(v.id, !v.isActive);
      if (res.success) {
        notify(`Variant ${v.variantSku || v.sku} marked as ${!v.isActive ? 'AVAILABLE' : 'UNAVAILABLE'}`);
        loadAll();
      }
    } catch (err) {
      notify(err.message || 'Failed to toggle availability', true);
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
              background: '#0EA5E9', color: '#fff', fontSize: '11px',
              padding: '2px 10px', borderRadius: 'var(--radius-full)', fontWeight: 700, textTransform: 'uppercase'
            }}>
              Inventory Manager Portal (Role 4)
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
            Warehouse & Stock Control Center
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
            Monitor SKU quantities across all sellers, log incoming restocks, record outgoing dispatches, and audit stock movements (FR-6.1–FR-6.11).
          </p>
        </div>

        {/* KPI Cards */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'var(--space-4)', marginBottom: 'var(--space-8)'
        }}>
          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', borderLeft: '4px solid #0EA5E9' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Total Variants / SKUs</span>
            <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 800 }}>{dashboard?.totalVariants || 0}</div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>Across {dashboard?.totalProducts || 0} footwear models</span>
          </div>

          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', borderLeft: '4px solid var(--color-success)' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Total Units in Stock</span>
            <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 800 }}>{dashboard?.totalUnits ?? dashboard?.totalUnitsInStock ?? 0}</div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>Healthy SKUs: {dashboard?.healthyCount || 0}</span>
          </div>

          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', borderLeft: '4px solid var(--color-warning)' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Low-Stock Alerts (≤ 5)</span>
            <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, color: 'var(--color-warning)' }}>{dashboard?.lowStockCount || 0}</div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>Require immediate replenishment</span>
          </div>

          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', borderLeft: '4px solid var(--color-error)' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Out-of-Stock SKUs</span>
            <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, color: 'var(--color-error)' }}>{dashboard?.outOfStockCount || 0}</div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>Blocked from checkout</span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', borderBottom: '2px solid var(--color-border)', marginBottom: 'var(--space-6)' }}>
          {[
            ['variants', `SKU Stock Levels (${variants.length})`],
            ['movements', `Stock Movement Audit Log (${movements.length})`],
            ['report', 'Valuation & Seller Summary Report']
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

        {loading ? (
          <p style={{ textAlign: 'center', padding: 'var(--space-12)' }}>Loading warehouse inventory...</p>
        ) : (
          <>
            {activeTab === 'variants' && (
              <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-sm)' }}>
                {/* Filters */}
                <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-6)', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    {[
                      ['', 'All SKUs'],
                      ['low', '⚠️ Low Stock (1–5)'],
                      ['out', '🚨 Out of Stock (0)'],
                      ['healthy', '✓ Healthy (>5)']
                    ].map(([val, lbl]) => (
                      <button
                        key={val}
                        onClick={() => setStockStatus(val)}
                        className={stockStatus === val ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <input
                      type="text"
                      placeholder="Search SKU, product, color..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      style={{ padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: 'var(--text-sm)' }}
                    />
                    <button className="btn btn-outline btn-sm" onClick={loadAll}>Search</button>
                  </div>
                </div>

                {/* Variants Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
                        <th style={{ padding: 'var(--space-3)' }}>SKU</th>
                        <th style={{ padding: 'var(--space-3)' }}>Product & Category</th>
                        <th style={{ padding: 'var(--space-3)' }}>Seller</th>
                        <th style={{ padding: 'var(--space-3)' }}>Size / Color</th>
                        <th style={{ padding: 'var(--space-3)' }}>Stock Qty</th>
                        <th style={{ padding: 'var(--space-3)' }}>Status</th>
                        <th style={{ padding: 'var(--space-3)', textAlign: 'right' }}>Warehouse Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variants.map(v => {
                        const unitCentavos = v.priceOverrideCentavos || v.product?.basePriceCentavos || 0;
                        return (
                          <tr key={v.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                            <td style={{ padding: 'var(--space-3)', fontFamily: 'monospace', fontWeight: 700, fontSize: 'var(--text-xs)' }}>
                              {v.variantSku || v.sku}
                            </td>
                            <td style={{ padding: 'var(--space-3)' }}>
                              <div style={{ fontWeight: 700 }}>{v.product?.name}</div>
                              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                                {v.product?.category?.name} &bull; ₱{(unitCentavos / 100).toFixed(2)}
                              </div>
                            </td>
                            <td style={{ padding: 'var(--space-3)', fontSize: 'var(--text-xs)' }}>
                              {v.product?.seller?.storeName || 'STRIDERA'}
                            </td>
                            <td style={{ padding: 'var(--space-3)' }}>
                              <strong>{v.size}</strong> / {v.color}
                            </td>
                            <td style={{ padding: 'var(--space-3)' }}>
                              <span style={{
                                fontWeight: 800,
                                fontSize: 'var(--text-base)',
                                color: v.stockQuantity === 0 ? 'var(--color-error)' : v.stockQuantity <= 5 ? 'var(--color-warning)' : 'var(--color-success)'
                              }}>
                                {v.stockQuantity}
                              </span>
                            </td>
                            <td style={{ padding: 'var(--space-3)' }}>
                              <span style={{
                                fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-full)',
                                background: v.isActive ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                color: v.isActive ? 'var(--color-success)' : 'var(--color-error)'
                              }}>
                                {v.isActive ? 'AVAILABLE' : 'DISABLED'}
                              </span>
                            </td>
                            <td style={{ padding: 'var(--space-3)', textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                <button className="btn btn-outline btn-sm" onClick={() => openModal('INCOMING', v)}>+ Restock</button>
                                <button className="btn btn-outline btn-sm" onClick={() => openModal('OUTGOING', v)} disabled={v.stockQuantity === 0}>- Dispatch</button>
                                <button className="btn btn-outline btn-sm" onClick={() => openModal('ADJUST', v)}>Adjust</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => handleToggleAvailability(v)}>
                                  {v.isActive ? 'Disable' : 'Enable'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'movements' && (
              <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-sm)' }}>
                <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>
                  Stock Movement Audit Log (FR-6.9)
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {movements.map(m => {
                    const mType = m.movementType || m.type;
                    const v = m.productVariant || m.variant;
                    return (
                      <div key={m.id} style={{
                        padding: 'var(--space-3) var(--space-4)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 'var(--space-3)'
                      }}>
                        <div>
                          <span style={{
                            fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: 'var(--radius-full)', marginRight: 'var(--space-2)',
                            background: mType === 'INCOMING' ? 'rgba(34,197,94,0.15)' : mType === 'OUTGOING' ? 'rgba(239,68,68,0.15)' : 'rgba(14,165,233,0.15)',
                            color: mType === 'INCOMING' ? 'var(--color-success)' : mType === 'OUTGOING' ? 'var(--color-error)' : '#0EA5E9'
                          }}>
                            {mType}
                          </span>
                          <strong>{v?.product?.name}</strong> ({v?.variantSku || v?.sku} &bull; {v?.size}/{v?.color})
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                            Reason: {m.reason || 'Standard warehouse adjustment'}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, fontSize: 'var(--text-base)' }}>
                            Change: {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange} (After: {m.stockAfter})
                          </div>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>
                            {new Date(m.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'report' && report && (
              <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
                  <div>
                    <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>Inventory Valuation & Seller Summary Report (FR-6.10)</h2>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Generated: {new Date(report.generatedAt).toLocaleString()}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Total Platform Stock Valuation</span>
                    <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--color-brand-primary)' }}>
                      {report.totalInventoryValuationFormatted}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
                  {report.bySeller?.map((s, idx) => (
                    <div key={idx} style={{ padding: 'var(--space-4)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
                      <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)' }}>{s.sellerName}</div>
                      <div style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>Variants: <strong>{s.variantCount}</strong> | Total Units: <strong>{s.totalUnits}</strong></div>
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-warning)' }}>Low-Stock SKUs: <strong>{s.lowStockCount}</strong> | Out-of-Stock: <strong>{s.outOfStockCount}</strong></div>
                      <div style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-border)', fontWeight: 700 }}>
                        Valuation: {s.valuationFormatted}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Modal for Incoming / Outgoing / Adjust */}
      {actionModal.open && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 'var(--space-4)'
        }}>
          <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', maxWidth: '440px', width: '100%' }}>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
              {actionModal.type === 'INCOMING' ? 'Record Incoming Restock (FR-6.3)' : actionModal.type === 'OUTGOING' ? 'Record Outgoing Stock (FR-6.4)' : 'Manual Stock Adjustment (FR-6.6)'}
            </h2>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
              SKU: <strong>{actionModal.variant?.variantSku || actionModal.variant?.sku}</strong> (Current Stock: {actionModal.variant?.stockQuantity} units)
            </p>

            <form onSubmit={handleActionSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {actionModal.type === 'ADJUST' ? (
                <div>
                  <label htmlFor="inv-new-qty" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>New Exact Stock Quantity (≥ 0) *</label>
                  <input
                    id="inv-new-qty"
                    type="number"
                    min="0"
                    required
                    aria-required="true"
                    aria-invalid={Boolean(actionErrors.newQuantity)}
                    aria-describedby={actionErrors.newQuantity ? 'inv-new-qty-error' : undefined}
                    value={actionForm.newQuantity}
                    onChange={e => {
                      setActionForm({ ...actionForm, newQuantity: e.target.value });
                      if (actionErrors.newQuantity) setActionErrors(prev => ({ ...prev, newQuantity: null }));
                    }}
                    onBlur={e => setActionErrors(prev => ({ ...prev, newQuantity: validateStock(e.target.value).error }))}
                    style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: `1px solid ${actionErrors.newQuantity ? 'var(--color-error)' : 'var(--color-border)'}` }}
                  />
                  <InlineFieldError id="inv-new-qty-error" error={actionErrors.newQuantity} />
                </div>
              ) : (
                <div>
                  <label htmlFor="inv-qty" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Quantity to {actionModal.type === 'INCOMING' ? 'Add' : 'Deduct'} *</label>
                  <input
                    id="inv-qty"
                    type="number"
                    min="1"
                    max={actionModal.type === 'OUTGOING' ? actionModal.variant?.stockQuantity : 9999}
                    required
                    aria-required="true"
                    aria-invalid={Boolean(actionErrors.quantity)}
                    aria-describedby={actionErrors.quantity ? 'inv-qty-error' : undefined}
                    value={actionForm.quantity}
                    onChange={e => {
                      setActionForm({ ...actionForm, quantity: e.target.value });
                      if (actionErrors.quantity) setActionErrors(prev => ({ ...prev, quantity: null }));
                    }}
                    onBlur={e => setActionErrors(prev => ({
                      ...prev,
                      quantity: validateQuantity(e.target.value, actionModal.type === 'OUTGOING' ? actionModal.variant?.stockQuantity : 9999).error
                    }))}
                    style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: `1px solid ${actionErrors.quantity ? 'var(--color-error)' : 'var(--color-border)'}` }}
                  />
                  <InlineFieldError id="inv-qty-error" error={actionErrors.quantity} />
                </div>
              )}

              <div>
                <label htmlFor="inv-reason" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Reason / Audit Note *</label>
                <input
                  id="inv-reason"
                  type="text"
                  required
                  aria-required="true"
                  maxLength={200}
                  aria-invalid={Boolean(actionErrors.reason)}
                  aria-describedby={actionErrors.reason ? 'inv-reason-error' : undefined}
                  value={actionForm.reason}
                  onChange={e => {
                    setActionForm({ ...actionForm, reason: e.target.value });
                    if (actionErrors.reason) setActionErrors(prev => ({ ...prev, reason: null }));
                  }}
                  onBlur={e => setActionErrors(prev => ({ ...prev, reason: validateRequiredText(e.target.value, 'Reason / Audit Note', { min: 2, max: 200 }).error }))}
                  style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: `1px solid ${actionErrors.reason ? 'var(--color-error)' : 'var(--color-border)'}` }}
                />
                <InlineFieldError id="inv-reason-error" error={actionErrors.reason} />
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => { setActionModal({ open: false, type: '', variant: null }); setActionErrors({}); }}>Cancel</button>
                <button type="submit" disabled={submitting} className="btn btn-primary">{submitting ? 'Saving…' : 'Confirm Stock Update'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
