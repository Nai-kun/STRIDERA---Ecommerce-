'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  getFinanceDashboard,
  verifyFinancePayment,
  createSellerPayout,
  processFinanceRefund,
  getFinanceReports,
  logout
} from '../../lib/api';

export default function FinanceOfficerPortalPage() {
  const [activeTab, setActiveTab] = useState('transactions');
  const [dashboard, setDashboard] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);

  const notify = (msg, isError = false) => {
    setNotification({ msg, isError });
    setTimeout(() => setNotification(null), 3500);
  };

  const loadFinance = async () => {
    try {
      setLoading(true);
      const [dashRes, repRes] = await Promise.allSettled([
        getFinanceDashboard(),
        getFinanceReports()
      ]);
      if (dashRes.status === 'fulfilled' && dashRes.value.success) setDashboard(dashRes.value.data);
      if (repRes.status === 'fulfilled' && repRes.value.success) setReport(repRes.value.data);
    } catch (err) {
      notify(err.message || 'Failed to load financial records', true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFinance();
  }, []);

  const handleVerifyPayment = async (paymentId) => {
    try {
      const res = await verifyFinancePayment(paymentId);
      if (res.success) {
        notify('E-wallet payment reference verified and stamped!');
        loadFinance();
      }
    } catch (err) {
      notify(err.message || 'Verification failed', true);
    }
  };

  const handleSettlePayout = async (sf) => {
    try {
      const res = await createSellerPayout({
        sellerId: sf.sellerId,
        grossSalesCentavos: sf.grossSalesCentavos,
        provider: 'gcash',
        notes: `Automated settlement for ${sf.storeName} via Finance Officer Portal`
      });
      if (res.success) {
        notify(res.message || 'Seller payout settled!');
        loadFinance();
      }
    } catch (err) {
      notify(err.message || 'Payout failed', true);
    }
  };

  const handleProcessRefund = async (ticketId) => {
    try {
      const res = await processFinanceRefund(ticketId);
      if (res.success) {
        notify(res.message || 'Customer refund processed and marked REFUNDED!');
        loadFinance();
      }
    } catch (err) {
      notify(err.message || 'Refund processing failed', true);
    }
  };

  const handleLogout = async () => {
    await logout().catch(() => {});
    localStorage.removeItem('stridera_token');
    localStorage.removeItem('stridera_user');
    window.location.href = '/account/login';
  };

  const metrics = dashboard?.metrics;

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
              background: '#10B981', color: '#fff', fontSize: '11px',
              padding: '2px 10px', borderRadius: 'var(--radius-full)', fontWeight: 700, textTransform: 'uppercase'
            }}>
              Finance Officer Portal (Role 7)
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
            Treasury, E-Wallet Reconciliation & Seller Payouts
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
            Verify GCash/Maya/PayPal transactions, compute {metrics?.platformFeePercent || 5}% platform commissions, disburse seller payouts, and process approved customer refunds (FR-9.1–FR-9.11).
          </p>
        </div>

        {/* Financial KPI Cards */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 'var(--space-4)', marginBottom: 'var(--space-8)'
        }}>
          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', borderLeft: '4px solid #10B981' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Gross Platform Sales</span>
            <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 800 }}>{metrics?.grossRevenueFormatted || '₱0.00'}</div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>Verified paid orders</span>
          </div>

          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', borderLeft: '4px solid var(--color-brand-primary)' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Platform Commission ({metrics?.platformFeePercent || 5}%)</span>
            <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, color: 'var(--color-brand-primary)' }}>{metrics?.totalPlatformFeesFormatted || '₱0.00'}</div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>Marketplace fee revenue</span>
          </div>

          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', borderLeft: '4px solid #3B82F6' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Net Seller Earnings</span>
            <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 800 }}>{metrics?.totalNetSellerEarningsFormatted || '₱0.00'}</div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>Settled: {metrics?.totalPayoutsFormatted || '₱0.00'}</span>
          </div>

          <div style={{ background: 'var(--color-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', borderLeft: '4px solid #8B5CF6' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Completed Refunds</span>
            <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 800 }}>{metrics?.completedRefundsFormatted || '₱0.00'}</div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>Returned to shoppers</span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', borderBottom: '2px solid var(--color-border)', marginBottom: 'var(--space-6)', overflowX: 'auto' }}>
          {[
            ['transactions', `E-Wallet Transactions (${dashboard?.payments?.length || 0})`],
            ['payouts', `Seller Earnings & Payouts (${dashboard?.sellerEarnings?.length || 0})`],
            ['refunds', `Approved Refund Queue (${dashboard?.refundTickets?.length || 0})`],
            ['report', 'Financial Summary Report (FR-9.10)']
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                padding: 'var(--space-3) var(--space-5)',
                fontWeight: activeTab === id ? 700 : 500,
                color: activeTab === id ? 'var(--color-brand-primary)' : 'var(--color-text-muted)',
                borderBottom: activeTab === id ? '3px solid var(--color-brand-primary)' : '3px solid transparent',
                marginBottom: '-2px', background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: 'pointer', whiteSpace: 'nowrap'
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', padding: 'var(--space-12)' }}>Loading treasury & ledger records...</p>
        ) : (
          <>
            {/* Tab 1: E-Wallet Transactions */}
            {activeTab === 'transactions' && (
              <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-sm)' }}>
                <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>
                  E-Wallet Payment Ledger & Reference Verification (FR-9.2, FR-9.3, FR-9.4)
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {dashboard?.payments?.map(p => (
                    <div key={p.id} style={{
                      padding: 'var(--space-4)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)'
                    }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <span style={{ fontWeight: 800 }}>Order: {p.order?.orderNumber}</span>
                          <span style={{
                            fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-full)',
                            background: p.status === 'PAID' ? 'rgba(34,197,94,0.15)' : p.status === 'FAILED' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                            color: p.status === 'PAID' ? 'var(--color-success)' : p.status === 'FAILED' ? 'var(--color-error)' : '#D97706'
                          }}>
                            {p.status}
                          </span>
                          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-brand-primary)' }}>
                            [{(p.paymentMethod || p.provider || 'GCASH').toUpperCase()}]
                          </span>
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                          Ref: <code>{p.providerPaymentId || p.idempotencyKey}</code> &bull; Customer: {p.order?.user?.email || p.order?.shippingFullName || 'Guest'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                        <span style={{ fontWeight: 800, fontSize: 'var(--text-lg)' }}>
                          ₱{((p.amountCentavos || 0) / 100).toFixed(2)}
                        </span>
                        {p.financeVerified ? (
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success)', fontWeight: 700 }}>
                            ✓ Verified by Finance
                          </span>
                        ) : (
                          <button className="btn btn-primary btn-sm" onClick={() => handleVerifyPayment(p.id)}>
                            ✓ Verify Reference (FR-9.3)
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab 2: Seller Earnings & Payouts */}
            {activeTab === 'payouts' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-sm)' }}>
                  <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>
                    Seller Earnings Breakdown & Payout Settlement (FR-9.5, FR-9.6, FR-9.7, FR-9.8)
                  </h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-4)' }}>
                    {dashboard?.sellerEarnings?.map(sf => (
                      <div key={sf.sellerId} style={{ padding: 'var(--space-5)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
                        <div style={{ fontWeight: 800, fontSize: 'var(--text-lg)' }}>{sf.storeName}</div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>{sf.email}</div>

                        <div style={{ fontSize: 'var(--text-sm)', display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span>Gross Sales:</span>
                          <strong>{sf.grossSalesFormatted}</strong>
                        </div>
                        <div style={{ fontSize: 'var(--text-sm)', display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: 'var(--color-text-muted)' }}>
                          <span>Platform Fee ({sf.platformFeePercent || 5}%):</span>
                          <span>-{sf.platformFeeFormatted}</span>
                        </div>
                        <div style={{ fontSize: 'var(--text-sm)', display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span>Net Earnings:</span>
                          <strong style={{ color: 'var(--color-success)' }}>{sf.netEarnedFormatted}</strong>
                        </div>
                        <div style={{ fontSize: 'var(--text-sm)', display: 'flex', justifyContent: 'space-between', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-border)', marginTop: 'var(--space-2)' }}>
                          <span>Unpaid Payable Balance:</span>
                          <strong style={{ color: 'var(--color-brand-primary)' }}>{sf.unpaidBalanceFormatted}</strong>
                        </div>

                        <button
                          className="btn btn-primary btn-sm"
                          style={{ width: '100%', marginTop: 'var(--space-4)' }}
                          disabled={sf.unpaidBalanceCentavos <= 0}
                          onClick={() => handleSettlePayout(sf)}
                        >
                          {sf.unpaidBalanceCentavos > 0 ? `Disburse Payout (${sf.unpaidBalanceFormatted})` : 'All Earnings Settled ✓'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Historical Payouts Ledger */}
                <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-sm)' }}>
                  <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Seller Payout Settlement History</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {dashboard?.payouts?.map(po => (
                      <div key={po.id} style={{
                        padding: 'var(--space-3) var(--space-4)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap'
                      }}>
                        <div>
                          <strong>{po.payoutNumber}</strong> &bull; {po.seller?.storeName}
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                            Gross: ₱{((po.grossSalesCentavos || 0) / 100).toFixed(2)} | Fee: ₱{((po.platformFeeCentavos || 0) / 100).toFixed(2)} | Ref: {po.referenceNumber || 'N/A'}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, color: 'var(--color-success)' }}>Net Paid: ₱{((po.netAmountCentavos || 0) / 100).toFixed(2)}</div>
                          <span style={{ fontSize: '11px', fontWeight: 700 }}>{po.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Approved Refund Processing */}
            {activeTab === 'refunds' && (
              <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-sm)' }}>
                <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>
                  Customer Refund Queue (FR-9.9)
                </h2>
                {(!dashboard?.refundTickets || dashboard.refundTickets.length === 0) ? (
                  <p style={{ color: 'var(--color-text-muted)' }}>No refund requests in queue.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {dashboard.refundTickets.map(t => (
                      <div key={t.id} style={{
                        padding: 'var(--space-4)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)'
                      }}>
                        <div>
                          <div style={{ fontWeight: 800 }}>
                            {t.ticketNumber} &bull; Order: {t.order?.orderNumber}
                          </div>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                            Customer: {t.user?.firstName} {t.user?.lastName} ({t.user?.email}) &bull; Support Status: {t.status}
                          </div>
                          <div style={{ fontSize: 'var(--text-xs)', marginTop: '4px' }}>
                            Reason: {t.subject}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 800, fontSize: 'var(--text-lg)' }}>
                              ₱{(((t.refundAmountCentavos || t.order?.grandTotalCentavos || 0)) / 100).toFixed(2)}
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: t.refundStatus === 'COMPLETED' ? 'var(--color-success)' : '#8B5CF6' }}>
                              Refund Status: {t.refundStatus}
                            </span>
                          </div>

                          {t.refundStatus !== 'COMPLETED' && (
                            <button className="btn btn-primary btn-sm" onClick={() => handleProcessRefund(t.id)}>
                              💸 Process E-Wallet Refund (FR-9.9)
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 4: Financial Summary Report */}
            {activeTab === 'report' && report && (
              <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-sm)' }}>
                <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
                  Executive Financial Summary Report (FR-9.10)
                </h2>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-6)' }}>
                  Generated: {new Date(report.generatedAt).toLocaleString()} &bull; By: {report.generatedBy}
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
                  <div style={{ padding: 'var(--space-4)', background: 'var(--color-surface-raised)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Total Paid Sales</div>
                    <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800 }}>{report.totalSalesFormatted}</div>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>{report.transactionCount} transactions</span>
                  </div>
                  <div style={{ padding: 'var(--space-4)', background: 'var(--color-surface-raised)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Platform Commission ({report.platformFeePercent}%)</div>
                    <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--color-brand-primary)' }}>{report.totalFeesFormatted}</div>
                  </div>
                  <div style={{ padding: 'var(--space-4)', background: 'var(--color-surface-raised)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Settled Seller Payouts</div>
                    <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--color-success)' }}>{report.totalPayoutsFormatted}</div>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>{report.payoutCount} settlements</span>
                  </div>
                  <div style={{ padding: 'var(--space-4)', background: 'var(--color-surface-raised)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Processed Refunds</div>
                    <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800 }}>{report.totalRefundsFormatted}</div>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>{report.refundCount} refunds</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
