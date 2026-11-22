'use client';

import { useState, useEffect } from 'react';
import { getDeliveryEstimate } from '../lib/api';

function formatShortDate(iso) {
  if (!iso) return '';
  const parts = String(iso).split('-').map(Number);
  if (parts.length !== 3) return iso;
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return d.toLocaleDateString('en-PH', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export default function DeliveryEstimateBanner({
  regionCode = '',
  province = '',
  city = '',
  compact = false
}) {
  const [estimate, setEstimate] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const res = await getDeliveryEstimate({ regionCode, province, city });
        if (active && res?.success && res?.data) {
          setEstimate(res.data);
        }
      } catch {
        if (active) setEstimate(null);
      } finally {
        if (active) setLoading(false);
      }
    }, compact ? 0 : 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [regionCode, province, city, compact]);

  if (loading && !estimate) {
    return (
      <div style={{
        padding: compact ? '10px 12px' : '12px 14px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
        fontSize: 'var(--text-xs)',
        color: 'var(--color-text-muted)',
        marginTop: compact ? 'var(--space-2)' : '0',
        marginBottom: compact ? '0' : 'var(--space-4)'
      }}>
        Calculating PH holiday-aware delivery estimate...
      </div>
    );
  }

  if (!estimate) return null;

  const rangeText = `${formatShortDate(estimate.estimatedDeliveryStart)} – ${formatShortDate(estimate.estimatedDeliveryEnd)}`;
  const isVerified = estimate.source === 'NAGER_PH_HOLIDAYS' && !estimate.degraded;
  const nextHoliday = estimate.upcomingHolidays?.[0];

  return (
    <div style={{
      padding: compact ? '10px 12px' : '12px 16px',
      borderRadius: 'var(--radius-md)',
      background: isVerified ? 'rgba(74, 144, 196, 0.08)' : 'rgba(245, 158, 11, 0.08)',
      border: `1px solid ${isVerified ? 'rgba(74, 144, 196, 0.35)' : 'rgba(245, 158, 11, 0.45)'}`,
      marginTop: compact ? 'var(--space-2)' : '0',
      marginBottom: compact ? '0' : 'var(--space-4)',
      fontSize: 'var(--text-xs)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <div style={{ fontWeight: 700, color: 'var(--color-text)' }}>
          📅 Est. Delivery: <span style={{ color: 'var(--color-brand-primary)' }}>{rangeText}</span>
        </div>
        <span style={{
          fontSize: '10px',
          fontWeight: 700,
          padding: '2px 7px',
          borderRadius: 99,
          background: isVerified ? 'rgba(22, 163, 74, 0.12)' : 'rgba(245, 158, 11, 0.18)',
          color: isVerified ? '#166534' : '#92400E'
        }}>
          {isVerified ? '✓ PH Holidays Checked' : '⚠ Fallback Schedule'}
        </span>
      </div>

      <div style={{ color: 'var(--color-text-muted)', marginTop: 4 }}>
        Zone: <strong>{estimate.zoneLabel}</strong> ({estimate.minBusinessDays}–{estimate.maxBusinessDays} business days, excl. Sundays{isVerified ? ' & PH holidays' : ''})
      </div>

      {estimate.notice && (
        <div style={{ color: isVerified ? '#1D4ED8' : '#92400E', marginTop: 4, fontWeight: 600 }}>
          {estimate.notice}
        </div>
      )}

      {!compact && isVerified && nextHoliday && estimate.holidaysInWindow?.length === 0 && (
        <div style={{ color: 'var(--color-text-muted)', marginTop: 4 }}>
          Next PH Holiday: <strong>{nextHoliday.name}</strong> ({formatShortDate(nextHoliday.date)})
        </div>
      )}
    </div>
  );
}
