'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getMe, logout } from '../lib/api';

function getPortalForRole(role) {
  switch (role) {
    case 'SELLER': return { href: '/seller/dashboard', label: 'Seller Portal' };
    case 'ADMIN': return { href: '/admin/dashboard', label: 'Admin Console' };
    case 'INVENTORY_MANAGER': return { href: '/inventory', label: 'Inventory Portal' };
    case 'DELIVERY_PERSONNEL': return { href: '/delivery', label: 'Delivery Portal' };
    case 'CUSTOMER_SUPPORT': return { href: '/support', label: 'Support Portal' };
    case 'FINANCE_OFFICER': return { href: '/finance', label: 'Finance Portal' };
    default: return null;
  }
}

export default function HeaderAuthActions() {
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    try {
      const cached = localStorage.getItem('stridera_user');
      if (cached) setUser(JSON.parse(cached));
    } catch {}

    getMe()
      .then((res) => {
        if (res?.success && res?.data) {
          setUser(res.data);
          try { localStorage.setItem('stridera_user', JSON.stringify(res.data)); } catch {}
        } else {
          setUser(null);
        }
      })
      .catch((err) => {
        if (err?.status === 401) {
          setUser(null);
          try {
            localStorage.removeItem('stridera_token');
            localStorage.removeItem('stridera_user');
          } catch {}
        }
      })
      .finally(() => setChecked(true));
  }, []);

  const handleSignOut = async () => {
    try { await logout(); } catch {}
    try {
      localStorage.removeItem('stridera_token');
      localStorage.removeItem('stridera_user');
    } catch {}
    setUser(null);
    window.location.href = '/account/login';
  };

  if (!checked && !user) {
    return null;
  }

  if (!user) {
    return (
      <Link href="/account/login" className="btn btn-primary btn-sm">
        Sign In
      </Link>
    );
  }

  const portal = getPortalForRole(user.role);

  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
      {portal && (
        <Link href={portal.href} className="btn btn-primary btn-sm">
          {portal.label}
        </Link>
      )}
      <Link href="/account/profile" className="btn btn-ghost btn-sm" title={`${user.firstName} (${user.role})`}>
        👤 {user.firstName}
      </Link>
      <button type="button" onClick={handleSignOut} className="btn btn-outline btn-sm">
        Sign Out
      </button>
    </div>
  );
}
