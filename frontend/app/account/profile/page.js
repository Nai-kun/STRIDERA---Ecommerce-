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
import PhilippineAddressPicker from '../../../components/PhilippineAddressPicker';
import InlineFieldError from '../../../components/InlineFieldError';
import PasswordInput from '../../../components/PasswordInput';
import {
  formatPhMobileInput,
  handlePhMobileKeyDown,
  isEmptyPhPrefix,
  normalizePhMobile,
  validatePersonName,
  validatePassword,
  validateStreet,
  validateCityOrProvince,
  validatePostalCode,
  validateOptionalText,
  focusFirstInvalidField
} from '../../../lib/validation';

export default function AccountProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingAction, setSavingAction] = useState('');
  const [msg, setMsg] = useState(null);

  const [profileForm, setProfileForm] = useState({ firstName: '', lastName: '', phone: '+63 ' });
  const [profileErrors, setProfileErrors] = useState({});

  const [pwdForm, setPwdForm] = useState({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
  const [pwdErrors, setPwdErrors] = useState({});

  const [addrForm, setAddrForm] = useState({
    label: 'Home', fullName: '', phone: '+63 ', addressLine1: '', addressLine2: '',
    region: '', barangay: '', city: '', province: '',
    regionCode: '', provinceCode: '', cityCode: '', barangayCode: '', addressSource: 'MANUAL',
    postalCode: '', isDefault: true
  });
  const [addrErrors, setAddrErrors] = useState({});

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
        const normalizedPhone = meRes.data.phone ? formatPhMobileInput(meRes.data.phone) : '+63 ';
        setProfileForm({
          firstName: meRes.data.firstName || '',
          lastName: meRes.data.lastName || '',
          phone: normalizedPhone
        });
        setAddrForm(prev => ({
          ...prev,
          fullName: `${meRes.data.firstName} ${meRes.data.lastName}`.trim(),
          phone: normalizedPhone
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
    setTimeout(() => setMsg(null), 4000);
  };

  const validateProfileField = (field, raw) => {
    if (field === 'firstName') {
      const r = validatePersonName(raw, 'First name');
      return r.valid ? null : r.error;
    }
    if (field === 'lastName') {
      const r = validatePersonName(raw, 'Last name');
      return r.valid ? null : r.error;
    }
    if (field === 'phone') {
      const r = normalizePhMobile(raw, { required: false });
      return r.valid ? null : r.error;
    }
    return null;
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (savingAction) return;

    const errors = {
      firstName: validateProfileField('firstName', profileForm.firstName),
      lastName: validateProfileField('lastName', profileForm.lastName),
      phone: validateProfileField('phone', profileForm.phone)
    };
    setProfileErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      focusFirstInvalidField(errors, { firstName: 'prof-firstName', lastName: 'prof-lastName', phone: 'prof-phone' });
      return;
    }

    const phoneToSend = isEmptyPhPrefix(profileForm.phone) ? '' : normalizePhMobile(profileForm.phone, { required: false }).value;
    setSavingAction('profile');
    try {
      const res = await updateProfile({
        firstName: profileForm.firstName.trim(),
        lastName: profileForm.lastName.trim(),
        phone: phoneToSend
      });
      setUser(prev => ({ ...prev, ...res.data }));
      flash('success', 'Profile information updated (FR-1.6).');
    } catch (err) {
      if (err?.data?.fieldErrors) setProfileErrors(prev => ({ ...prev, ...err.data.fieldErrors }));
      flash('error', err.message);
    } finally {
      setSavingAction('');
    }
  };

  const validatePwdField = (field, raw, next = pwdForm) => {
    if (field === 'currentPassword') {
      const r = validatePassword(raw, { required: true, checkStrength: false, label: 'Current password' });
      return r.valid ? null : r.error;
    }
    if (field === 'newPassword') {
      const r = validatePassword(raw, { required: true, checkStrength: true, label: 'New password' });
      return r.valid ? null : r.error;
    }
    if (field === 'confirmNewPassword') {
      if (!raw) return 'Please confirm your new password.';
      return raw === next.newPassword ? null : 'New passwords do not match.';
    }
    return null;
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (savingAction) return;

    const errors = {
      currentPassword: validatePwdField('currentPassword', pwdForm.currentPassword),
      newPassword: validatePwdField('newPassword', pwdForm.newPassword),
      confirmNewPassword: validatePwdField('confirmNewPassword', pwdForm.confirmNewPassword)
    };
    setPwdErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      focusFirstInvalidField(errors, {
        currentPassword: 'pwd-current',
        newPassword: 'pwd-new',
        confirmNewPassword: 'pwd-confirm'
      });
      return;
    }

    setSavingAction('password');
    try {
      const res = await changePassword(pwdForm.currentPassword, pwdForm.newPassword);
      setPwdForm({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
      setPwdErrors({});
      flash('success', res.message);
    } catch (err) {
      if (err?.data?.fieldErrors) setPwdErrors(prev => ({ ...prev, ...err.data.fieldErrors }));
      flash('error', err.message);
    } finally {
      setSavingAction('');
    }
  };

  const validateAddrField = (field, raw) => {
    switch (field) {
      case 'fullName': {
        const r = validatePersonName(raw, 'Recipient full name');
        return r.valid ? null : r.error;
      }
      case 'phone': {
        const r = normalizePhMobile(raw, { required: true });
        return r.valid ? null : r.error;
      }
      case 'addressLine1': {
        const r = validateStreet(raw);
        return r.valid ? null : r.error;
      }
      case 'addressLine2': {
        const r = validateOptionalText(raw, 'Address line 2', { max: 200 });
        return r.valid ? null : r.error;
      }
      case 'city': {
        const r = validateCityOrProvince(raw, 'City');
        return r.valid ? null : r.error;
      }
      case 'province': {
        const r = validateCityOrProvince(raw, 'Province');
        return r.valid ? null : r.error;
      }
      case 'postalCode': {
        const r = validatePostalCode(raw);
        return r.valid ? null : r.error;
      }
      case 'label': {
        const r = validateOptionalText(raw, 'Address label', { max: 50 });
        return r.valid ? null : r.error;
      }
      default:
        return null;
    }
  };

  const handleAddAddress = async (e) => {
    e.preventDefault();
    if (savingAction) return;

    const errors = {
      fullName: validateAddrField('fullName', addrForm.fullName),
      phone: validateAddrField('phone', addrForm.phone),
      addressLine1: validateAddrField('addressLine1', addrForm.addressLine1),
      addressLine2: validateAddrField('addressLine2', addrForm.addressLine2),
      postalCode: validateAddrField('postalCode', addrForm.postalCode),
      label: validateAddrField('label', addrForm.label),
      city: validateAddrField('city', addrForm.city),
      province: validateAddrField('province', addrForm.province)
    };
    setAddrErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      focusFirstInvalidField(errors, {
        fullName: 'addr-fullName',
        phone: 'addr-phone',
        addressLine1: 'addr-line1',
        addressLine2: 'addr-line2',
        postalCode: 'addr-postal',
        label: 'addr-label',
        city: 'psgc-city',
        province: 'psgc-province'
      });
      return;
    }

    const cleanPhone = normalizePhMobile(addrForm.phone, { required: true }).value;
    setSavingAction('address');
    try {
      await addAddress({
        ...addrForm,
        fullName: addrForm.fullName.trim(),
        phone: cleanPhone,
        addressLine1: addrForm.addressLine1.trim(),
        addressLine2: addrForm.addressLine2.trim() || null,
        label: addrForm.label.trim() || null,
        postalCode: addrForm.postalCode.trim()
      });
      setAddrForm(prev => ({
        ...prev,
        addressLine1: '', addressLine2: '',
        region: '', barangay: '', city: '', province: '',
        regionCode: '', provinceCode: '', cityCode: '', barangayCode: '', addressSource: 'MANUAL',
        postalCode: ''
      }));
      setAddrErrors({});
      await loadData();
      flash('success', 'Delivery address saved.');
    } catch (err) {
      if (err?.data?.fieldErrors) setAddrErrors(prev => ({ ...prev, ...err.data.fieldErrors }));
      flash('error', err.message);
    } finally {
      setSavingAction('');
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
    if (!text?.trim()) {
      flash('error', 'Reply message cannot be empty.');
      return;
    }
    try {
      await postSupportMessage(ticketId, text.trim());
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
          <form onSubmit={handleSaveProfile} noValidate style={{ background: 'var(--color-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Personal Details</h2>
            <div className="form-group">
              <label className="form-label" htmlFor="prof-firstName">First Name *</label>
              <input
                id="prof-firstName"
                className="form-input"
                value={profileForm.firstName}
                onChange={e => setProfileForm(p => ({ ...p, firstName: e.target.value }))}
                onBlur={() => setProfileErrors(p => ({ ...p, firstName: validateProfileField('firstName', profileForm.firstName) }))}
                required
                aria-required="true"
                aria-invalid={Boolean(profileErrors.firstName)}
                aria-describedby={profileErrors.firstName ? 'prof-firstName-err' : undefined}
                maxLength={60}
              />
              <InlineFieldError id="prof-firstName-err" error={profileErrors.firstName} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="prof-lastName">Last Name *</label>
              <input
                id="prof-lastName"
                className="form-input"
                value={profileForm.lastName}
                onChange={e => setProfileForm(p => ({ ...p, lastName: e.target.value }))}
                onBlur={() => setProfileErrors(p => ({ ...p, lastName: validateProfileField('lastName', profileForm.lastName) }))}
                required
                aria-required="true"
                aria-invalid={Boolean(profileErrors.lastName)}
                aria-describedby={profileErrors.lastName ? 'prof-lastName-err' : undefined}
                maxLength={60}
              />
              <InlineFieldError id="prof-lastName-err" error={profileErrors.lastName} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="prof-phone">Mobile Number <span className="form-optional">(optional)</span></label>
              <input
                id="prof-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={16}
                placeholder="+63 9XX-XXX-YYYY"
                className="form-input"
                value={profileForm.phone}
                onKeyDown={handlePhMobileKeyDown}
                onChange={e => setProfileForm(p => ({ ...p, phone: formatPhMobileInput(e.target.value) }))}
                onBlur={() => setProfileErrors(p => ({ ...p, phone: validateProfileField('phone', profileForm.phone) }))}
                aria-invalid={Boolean(profileErrors.phone)}
                aria-describedby={profileErrors.phone ? 'prof-phone-err' : undefined}
              />
              <InlineFieldError id="prof-phone-err" error={profileErrors.phone} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={savingAction === 'profile'}>
              {savingAction === 'profile' ? 'Saving…' : 'Save Profile'}
            </button>
          </form>

          {/* Change Password (FR-1.7) */}
          <form onSubmit={handleChangePassword} noValidate style={{ background: 'var(--color-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Change Password (FR-1.7)</h2>
            <div className="form-group">
              <label className="form-label" htmlFor="pwd-current">Current Password *</label>
              <PasswordInput
                id="pwd-current"
                toggleLabel="current password"
                autoComplete="current-password"
                className="form-input"
                value={pwdForm.currentPassword}
                onChange={e => setPwdForm(p => ({ ...p, currentPassword: e.target.value }))}
                onBlur={() => setPwdErrors(p => ({ ...p, currentPassword: validatePwdField('currentPassword', pwdForm.currentPassword) }))}
                required
                aria-required="true"
                aria-invalid={Boolean(pwdErrors.currentPassword)}
                aria-describedby={pwdErrors.currentPassword ? 'pwd-current-err' : undefined}
              />
              <InlineFieldError id="pwd-current-err" error={pwdErrors.currentPassword} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="pwd-new">New Password *</label>
              <PasswordInput
                id="pwd-new"
                toggleLabel="new password"
                autoComplete="new-password"
                className="form-input"
                minLength={8}
                placeholder="Min 8 chars, 1 letter & 1 number"
                value={pwdForm.newPassword}
                onChange={e => setPwdForm(p => ({ ...p, newPassword: e.target.value }))}
                onBlur={() => setPwdErrors(p => ({ ...p, newPassword: validatePwdField('newPassword', pwdForm.newPassword) }))}
                required
                aria-required="true"
                aria-invalid={Boolean(pwdErrors.newPassword)}
                aria-describedby={pwdErrors.newPassword ? 'pwd-new-err' : undefined}
              />
              <InlineFieldError id="pwd-new-err" error={pwdErrors.newPassword} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="pwd-confirm">Confirm New Password *</label>
              <PasswordInput
                id="pwd-confirm"
                toggleLabel="confirm password"
                autoComplete="new-password"
                className="form-input"
                value={pwdForm.confirmNewPassword}
                onChange={e => setPwdForm(p => ({ ...p, confirmNewPassword: e.target.value }))}
                onBlur={() => setPwdErrors(p => ({ ...p, confirmNewPassword: validatePwdField('confirmNewPassword', pwdForm.confirmNewPassword) }))}
                required
                aria-required="true"
                aria-invalid={Boolean(pwdErrors.confirmNewPassword)}
                aria-describedby={pwdErrors.confirmNewPassword ? 'pwd-confirm-err' : undefined}
              />
              <InlineFieldError id="pwd-confirm-err" error={pwdErrors.confirmNewPassword} />
            </div>
            <button type="submit" className="btn btn-outline" disabled={savingAction === 'password'}>
              {savingAction === 'password' ? 'Updating…' : 'Update Password'}
            </button>
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
                  {addr.addressSource === 'PSGC_VERIFIED' && (
                    <span style={{ marginLeft: 6, background: 'rgba(22,163,74,0.12)', color: '#166534', padding: '1px 6px', borderRadius: 99, fontSize: '10px', fontWeight: 700 }}>
                      ✓ PSGC Verified
                    </span>
                  )}
                  <p style={{ color: 'var(--color-text-muted)', marginTop: 4 }}>
                    {addr.addressLine1}{addr.addressLine2 ? `, ${addr.addressLine2}` : ''}<br />
                    {addr.barangay ? `Brgy. ${addr.barangay}, ` : ''}{addr.city}, {addr.province}{addr.region ? `, ${addr.region}` : ''} {addr.postalCode} &bull; {addr.phone}
                  </p>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDeleteAddress(addr.id)} style={{ color: 'var(--color-error)' }}>
                  Delete
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddAddress} noValidate>
            <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginBottom: 'var(--space-3)' }}>Add New Address</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
              <div>
                <label className="form-label" htmlFor="addr-fullName">Recipient Full Name *</label>
                <input
                  id="addr-fullName"
                  className="form-input"
                  placeholder="Recipient Full Name"
                  value={addrForm.fullName}
                  onChange={e => setAddrForm(p => ({ ...p, fullName: e.target.value }))}
                  onBlur={() => setAddrErrors(p => ({ ...p, fullName: validateAddrField('fullName', addrForm.fullName) }))}
                  required
                  aria-required="true"
                  aria-invalid={Boolean(addrErrors.fullName)}
                  aria-describedby={addrErrors.fullName ? 'addr-fullName-err' : undefined}
                />
                <InlineFieldError id="addr-fullName-err" error={addrErrors.fullName} />
              </div>
              <div>
                <label className="form-label" htmlFor="addr-phone">Mobile Number *</label>
                <input
                  id="addr-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={16}
                  className="form-input"
                  placeholder="+63 9XX-XXX-YYYY"
                  value={addrForm.phone}
                  onKeyDown={handlePhMobileKeyDown}
                  onChange={e => setAddrForm(p => ({ ...p, phone: formatPhMobileInput(e.target.value) }))}
                  onBlur={() => setAddrErrors(p => ({ ...p, phone: validateAddrField('phone', addrForm.phone) }))}
                  required
                  aria-required="true"
                  aria-invalid={Boolean(addrErrors.phone)}
                  aria-describedby={addrErrors.phone ? 'addr-phone-err' : undefined}
                />
                <InlineFieldError id="addr-phone-err" error={addrErrors.phone} />
              </div>
              <div>
                <label className="form-label" htmlFor="addr-line1">Street / Building *</label>
                <input
                  id="addr-line1"
                  className="form-input"
                  placeholder="Street, building, house/unit no."
                  value={addrForm.addressLine1}
                  onChange={e => setAddrForm(p => ({ ...p, addressLine1: e.target.value }))}
                  onBlur={() => setAddrErrors(p => ({ ...p, addressLine1: validateAddrField('addressLine1', addrForm.addressLine1) }))}
                  required
                  aria-required="true"
                  aria-invalid={Boolean(addrErrors.addressLine1)}
                  aria-describedby={addrErrors.addressLine1 ? 'addr-line1-err' : undefined}
                />
                <InlineFieldError id="addr-line1-err" error={addrErrors.addressLine1} />
              </div>
              <div>
                <label className="form-label" htmlFor="addr-line2">Address Line 2 <span className="form-optional">(optional)</span></label>
                <input
                  id="addr-line2"
                  className="form-input"
                  placeholder="Landmark, floor, unit"
                  value={addrForm.addressLine2}
                  onChange={e => setAddrForm(p => ({ ...p, addressLine2: e.target.value }))}
                  onBlur={() => setAddrErrors(p => ({ ...p, addressLine2: validateAddrField('addressLine2', addrForm.addressLine2) }))}
                  aria-invalid={Boolean(addrErrors.addressLine2)}
                  aria-describedby={addrErrors.addressLine2 ? 'addr-line2-err' : undefined}
                />
                <InlineFieldError id="addr-line2-err" error={addrErrors.addressLine2} />
              </div>
              <div>
                <label className="form-label" htmlFor="addr-postal">Postal Code *</label>
                <input
                  id="addr-postal"
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  className="form-input"
                  placeholder="4 digits (e.g. 1226)"
                  value={addrForm.postalCode}
                  onChange={e => setAddrForm(p => ({ ...p, postalCode: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  onBlur={() => setAddrErrors(p => ({ ...p, postalCode: validateAddrField('postalCode', addrForm.postalCode) }))}
                  required
                  aria-required="true"
                  aria-invalid={Boolean(addrErrors.postalCode)}
                  aria-describedby={addrErrors.postalCode ? 'addr-postal-err' : undefined}
                />
                <InlineFieldError id="addr-postal-err" error={addrErrors.postalCode} />
              </div>
              <div>
                <label className="form-label" htmlFor="addr-label">Label <span className="form-optional">(optional)</span></label>
                <input
                  id="addr-label"
                  className="form-input"
                  placeholder="e.g. Home, Office"
                  value={addrForm.label}
                  onChange={e => setAddrForm(p => ({ ...p, label: e.target.value }))}
                  onBlur={() => setAddrErrors(p => ({ ...p, label: validateAddrField('label', addrForm.label) }))}
                  aria-invalid={Boolean(addrErrors.label)}
                  aria-describedby={addrErrors.label ? 'addr-label-err' : undefined}
                />
                <InlineFieldError id="addr-label-err" error={addrErrors.label} />
              </div>
            </div>
            <PhilippineAddressPicker compact value={addrForm} onChange={setAddrForm} />
            {(addrErrors.city || addrErrors.province) && (
              <InlineFieldError id="addr-psgc-err" error={addrErrors.city || addrErrors.province} />
            )}
            <button type="submit" className="btn btn-primary btn-sm" style={{ marginTop: 'var(--space-2)' }} disabled={savingAction === 'address'}>
              {savingAction === 'address' ? 'Saving…' : '+ Save Address'}
            </button>
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
