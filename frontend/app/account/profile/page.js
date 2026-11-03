'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getMe,
  updateProfile,
  changePassword,
  addAddress,
  deleteAddress,
  getMySupportTickets,
  postSupportMessage,
  logout
} from '../../../lib/api';

export default function AccountProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  const [profileForm, setProfileForm] = useState({ firstName: '', lastName: '', phone: '' });
  const [pwdForm, setPwdForm] = useState({ currentPassword: '', newPassword: '' });
  const [addrForm, setAddrForm] = useState({
    label: 'Home', fullName: '', phone: '', addressLine1: '', addressLine2: '',
    city: '', province: '', postalCode: '', isDefault: true
  });
  const [replyText, setReplyText] = useState({});

  const loadData = async () => {
    setLoading(true);
    try {
      const [meRes, tktRes] = await Promise.all([
        getMe(),
        getMySupportTickets().catch(() => ({ data: [] }))
      ]);
      if (meRes.data) {
        setUser(meRes.data);
        setProfileForm({
          firstName: meRes.data.firstName || '',
          lastName: meRes.data.lastName || '',
          phone: meRes.data.phone || ''
        });
        setAddrForm(prev => ({
          ...prev,
          fullName: `${meRes.data.firstName} ${meRes.data.lastName}`,
          phone: meRes.data.phone || ''
        }));
      }
      setTickets(tktRes.data || []);
    } catch {
      router.push('/account/login');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const flash = (type, text) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3500);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      const res = await updateProfile(profileForm);
      setUser(prev => ({ ...prev, ...res.data }));
      flash('success', 'Profile information updated (FR-1.6).');
    } catch (err) {
      flash('error', err.message);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    try {
      const res = await changePassword(pwdForm.currentPassword, pwdForm.newPassword);
      setPwdForm({ currentPassword: '', newPassword: '' });
      flash('success', res.message);
    } catch (err) {
      flash('error', err.message);
    }
  };

  const handleAddAddress = async (e) => {
    e.preventDefault();
    try {
      await addAddress(addrForm);
      setAddrForm(prev => ({ ...prev, addressLine1: '', addressLine2: '', city: '', province: '', postalCode: '' }));
      await loadData();
      flash('success', 'Delivery address saved.');
    } catch (err) {
      flash('error', err.message);
    }
  };

  const handleDeleteAddress = async (id) => {
    try {
      await deleteAddress(id);
      await loadData();
      flash('success', 'Address removed.');
    } catch (err) {
      flash('error', err.message);
    }
  };

  const handleSendReply = async (ticketId) => {
    const text = replyText[ticketId];
    if (!text?.trim()) return;
    try {
      await postSupportMessage(ticketId, text);
      setReplyText(prev => ({ ...prev, [ticketId]: '' }));
      await loadData();
      flash('success', 'Reply sent to Customer Support.');
    } catch (err) {
      flash('error', err.message);
    }
  };

  const handleLogout = async () => {
    await logout().catch(() => {});
    if (typeof window !== 'undefined') {
      localStorage.removeItem('stridera_token');
      localStorage.removeItem('stridera_user');
    }
    router.push('/account/login');
  };

  if (loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Loading your profile…</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', paddingBlock: 'var(--space-8)' }}>
      <div className="container" style={{ maxWidth: 960 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-8)', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 800 }}>Account &amp; Profile (FR-1.6)</h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
              Signed in as <strong>{user?.email}</strong> &bull; Role: <span style={{ color: 'var(--color-brand-primary)', fontWeight: 700 }}>{user?.role}</span>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <Link href="/" className="btn btn-ghost btn-sm">← Storefront</Link>
            <Link href="/account/orders" className="btn btn-outline btn-sm">My Orders</Link>
            <button onClick={handleLogout} className="btn btn-primary btn-sm" style={{ background: 'var(--color-error)', borderColor: 'var(--color-error)' }}>
              Sign Out (FR-1.8)
            </button>
          </div>
        </div>

        {msg && (
          <div role="alert" style={{
            padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-6)', fontWeight: 600, fontSize: 'var(--text-sm)',
            background: msg.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            color: msg.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
            border: `1px solid ${msg.type === 'success' ? 'var(--color-success)' : 'var(--color-error)'}`
          }}>
            {msg.text}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)', marginBottom: 'var(--space-8)' }}>
          {/* Personal Info (FR-1.6) */}
          <form onSubmit={handleSaveProfile} style={{ background: 'var(--color-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Personal Details</h2>
            <div className="form-group">
              <label className="form-label">First Name</label>
              <input className="form-input" value={profileForm.firstName} onChange={e => setProfileForm(p => ({ ...p, firstName: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Last Name</label>
              <input className="form-input" value={profileForm.lastName} onChange={e => setProfileForm(p => ({ ...p, lastName: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input className="form-input" value={profileForm.phone} onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))} />
            </div>
            <button type="submit" className="btn btn-primary">Save Profile</button>
          </form>

          {/* Change Password (FR-1.7) */}
          <form onSubmit={handleChangePassword} style={{ background: 'var(--color-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Change Password (FR-1.7)</h2>
            <div className="form-group">
              <label className="form-label">Current Password</label>
              <input type="password" className="form-input" value={pwdForm.currentPassword} onChange={e => setPwdForm(p => ({ ...p, currentPassword: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">New Password (min 8 characters)</label>
              <input type="password" className="form-input" minLength={8} value={pwdForm.newPassword} onChange={e => setPwdForm(p => ({ ...p, newPassword: e.target.value }))} required />
            </div>
            <button type="submit" className="btn btn-outline">Update Password</button>
          </form>
        </div>

        {/* Saved Addresses */}
        <div style={{ background: 'var(--color-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', marginBottom: 'var(--space-8)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Saved Delivery Addresses</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
            {(user?.addresses || []).map(addr => (
              <div key={addr.id} style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontSize: 'var(--text-sm)' }}>
                  <strong>{addr.label || 'Address'} — {addr.fullName}</strong> {addr.isDefault && <span style={{ color: 'var(--color-brand-primary)', fontSize: '11px' }}>(Default)</span>}
                  <p style={{ color: 'var(--color-text-muted)', marginTop: 4 }}>
                    {addr.addressLine1}{addr.addressLine2 ? `, ${addr.addressLine2}` : ''}<br />
                    {addr.city}, {addr.province} {addr.postalCode} &bull; {addr.phone}
                  </p>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDeleteAddress(addr.id)} style={{ color: 'var(--color-error)' }}>
                  Delete
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddAddress}>
            <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginBottom: 'var(--space-3)' }}>Add New Address</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)' }}>
              <input className="form-input" placeholder="Recipient Full Name" value={addrForm.fullName} onChange={e => setAddrForm(p => ({ ...p, fullName: e.target.value }))} required />
              <input className="form-input" placeholder="Phone (+639...)" value={addrForm.phone} onChange={e => setAddrForm(p => ({ ...p, phone: e.target.value }))} required />
              <input className="form-input" placeholder="Street / Building" value={addrForm.addressLine1} onChange={e => setAddrForm(p => ({ ...p, addressLine1: e.target.value }))} required />
              <input className="form-input" placeholder="City" value={addrForm.city} onChange={e => setAddrForm(p => ({ ...p, city: e.target.value }))} required />
              <input className="form-input" placeholder="Province" value={addrForm.province} onChange={e => setAddrForm(p => ({ ...p, province: e.target.value }))} required />
              <input className="form-input" placeholder="Postal Code" value={addrForm.postalCode} onChange={e => setAddrForm(p => ({ ...p, postalCode: e.target.value }))} required />
            </div>
            <button type="submit" className="btn btn-primary btn-sm" style={{ marginTop: 'var(--space-3)' }}>+ Save Address</button>
          </form>
        </div>

        {/* My Support Tickets */}
        <div style={{ background: 'var(--color-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>My Support Tickets &amp; Refund Requests ({tickets.length})</h2>
          {tickets.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>No support tickets submitted yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {tickets.map(t => (
                <div key={t.id} style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <strong>{t.ticketNumber} — {t.subject}</strong>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: 'rgba(37,99,235,0.1)', color: '#2563eb' }}>
                        {t.category} | {t.status}
                      </span>
                      {t.refundStatus !== 'NONE' && (
                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: 'rgba(22,163,74,0.1)', color: '#16a34a' }}>
                          Refund: {t.refundStatus}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                    {(t.messages || []).map(m => (
                      <div key={m.id} style={{ fontSize: 'var(--text-xs)', padding: '6px 10px', borderRadius: 6, background: 'var(--color-surface)' }}>
                        <strong>{m.senderName}:</strong> {m.message}
                      </div>
                    ))}
                  </div>
                  {t.status !== 'CLOSED' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        className="form-input"
                        placeholder="Reply to Customer Support…"
                        value={replyText[t.id] || ''}
                        onChange={e => setReplyText(p => ({ ...p, [t.id]: e.target.value }))}
                        style={{ flex: 1, fontSize: 'var(--text-xs)' }}
                      />
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => handleSendReply(t.id)}>
                        Send
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

