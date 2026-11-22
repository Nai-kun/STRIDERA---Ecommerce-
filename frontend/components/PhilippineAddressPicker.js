'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getPsgcRegions,
  getPsgcProvinces,
  getPsgcCitiesByRegion,
  getPsgcCitiesByProvince,
  getPsgcBarangays
} from '../lib/api';

/**
 * Cascading Philippine Address Selector powered by the live PSGC API (/api/locations/*).
 * Supports NCR (no province level), regional HUCs/provinces, barangay lookup,
 * and an honest Manual Address Fallback if PSGC upstream is unreachable.
 */
export default function PhilippineAddressPicker({ value, onChange, compact = false }) {
  const [regions, setRegions] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [hasProvinces, setHasProvinces] = useState(true);
  const [cities, setCities] = useState([]);
  const [barangays, setBarangays] = useState([]);

  const [loadingStep, setLoadingStep] = useState('');
  const [degradedError, setDegradedError] = useState(null);
  const [manualOverride, setManualOverride] = useState(false);

  const addr = value || {};

  const activateManualFallback = useCallback((reasonMsg) => {
    setDegradedError(reasonMsg || 'PSGC Philippine Address API is currently unavailable.');
    onChange({
      ...addr,
      regionCode: '',
      provinceCode: '',
      cityCode: '',
      barangayCode: '',
      addressSource: 'MANUAL_FALLBACK'
    });
  }, [addr, onChange]);

  const loadRegions = useCallback(async () => {
    setLoadingStep('regions');
    setDegradedError(null);
    try {
      const res = await getPsgcRegions();
      const list = res?.data?.regions || [];
      setRegions(list);
      setManualOverride(false);
    } catch (err) {
      activateManualFallback(err.message || 'Unable to load Philippine regions from PSGC API.');
    } finally {
      setLoadingStep('');
    }
  }, []);

  useEffect(() => {
    loadRegions();
  }, [loadRegions]);

  // Hydrate child dropdowns if value already carries PSGC codes (e.g. step Back or default saved PSGC address)
  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      if (!addr.regionCode || degradedError || manualOverride) return;
      try {
        const provRes = await getPsgcProvinces(addr.regionCode);
        if (!active) return;
        const pData = provRes?.data || {};
        setHasProvinces(Boolean(pData.hasProvinces));
        setProvinces(pData.provinces || []);

        if (pData.hasProvinces && addr.provinceCode) {
          const cityRes = await getPsgcCitiesByProvince(addr.provinceCode);
          if (!active) return;
          setCities(cityRes?.data?.cities || []);
        } else if (!pData.hasProvinces) {
          const cityRes = await getPsgcCitiesByRegion(addr.regionCode);
          if (!active) return;
          setCities(cityRes?.data?.cities || []);
        }

        if (addr.cityCode) {
          const brgyRes = await getPsgcBarangays(addr.cityCode);
          if (!active) return;
          setBarangays(brgyRes?.data?.barangays || []);
        }
      } catch (err) {
        if (active) activateManualFallback(err.message);
      }
    };
    hydrate();
    return () => { active = false; };
  }, [addr.regionCode, addr.provinceCode, addr.cityCode, degradedError, manualOverride]);

  const handleRegionChange = async (nextRegionCode) => {
    const selected = regions.find((r) => r.code === nextRegionCode);
    if (!selected) {
      setProvinces([]);
      setCities([]);
      setBarangays([]);
      setHasProvinces(true);
      onChange({
        ...addr,
        region: '', regionCode: '',
        province: '', provinceCode: '',
        city: '', cityCode: '',
        barangay: '', barangayCode: '',
        addressSource: 'MANUAL'
      });
      return;
    }

    setLoadingStep('provinces');
    setDegradedError(null);
    setCities([]);
    setBarangays([]);

    try {
      const provRes = await getPsgcProvinces(selected.code);
      const pData = provRes?.data || {};
      const provFlag = Boolean(pData.hasProvinces);
      setHasProvinces(provFlag);
      setProvinces(pData.provinces || []);

      if (!provFlag) {
        // Regions without provinces (e.g. NCR Metro Manila) load cities directly
        const canonicalProv = selected.code === '130000000' ? 'Metro Manila' : selected.regionName;
        onChange({
          ...addr,
          region: selected.displayName,
          regionCode: selected.code,
          province: canonicalProv,
          provinceCode: '',
          city: '',
          cityCode: '',
          barangay: '',
          barangayCode: '',
          addressSource: 'PSGC_VERIFIED'
        });
        setLoadingStep('cities');
        const cityRes = await getPsgcCitiesByRegion(selected.code);
        setCities(cityRes?.data?.cities || []);
      } else {
        onChange({
          ...addr,
          region: selected.displayName,
          regionCode: selected.code,
          province: '',
          provinceCode: '',
          city: '',
          cityCode: '',
          barangay: '',
          barangayCode: '',
          addressSource: 'PSGC_VERIFIED'
        });
      }
    } catch (err) {
      activateManualFallback(err.message || 'Failed to load provinces/cities from PSGC API.');
    } finally {
      setLoadingStep('');
    }
  };

  const handleProvinceChange = async (nextProvCode) => {
    const selected = provinces.find((p) => p.code === nextProvCode);
    setBarangays([]);
    if (!selected) {
      setCities([]);
      onChange({
        ...addr,
        province: '', provinceCode: '',
        city: '', cityCode: '',
        barangay: '', barangayCode: ''
      });
      return;
    }

    setLoadingStep('cities');
    setDegradedError(null);
    onChange({
      ...addr,
      province: selected.name,
      provinceCode: selected.code,
      city: '', cityCode: '',
      barangay: '', barangayCode: '',
      addressSource: 'PSGC_VERIFIED'
    });

    try {
      const cityRes = await getPsgcCitiesByProvince(selected.code);
      setCities(cityRes?.data?.cities || []);
    } catch (err) {
      activateManualFallback(err.message || 'Failed to load cities from PSGC API.');
    } finally {
      setLoadingStep('');
    }
  };

  const handleCityChange = async (nextCityCode) => {
    const selected = cities.find((c) => c.code === nextCityCode);
    if (!selected) {
      setBarangays([]);
      onChange({ ...addr, city: '', cityCode: '', barangay: '', barangayCode: '' });
      return;
    }

    setLoadingStep('barangays');
    setDegradedError(null);
    onChange({
      ...addr,
      city: selected.name,
      cityCode: selected.code,
      barangay: '',
      barangayCode: '',
      addressSource: 'PSGC_VERIFIED'
    });

    try {
      const brgyRes = await getPsgcBarangays(selected.code);
      setBarangays(brgyRes?.data?.barangays || []);
    } catch (err) {
      activateManualFallback(err.message || 'Failed to load barangays from PSGC API.');
    } finally {
      setLoadingStep('');
    }
  };

  const handleBarangayChange = (nextBrgyCode) => {
    const selected = barangays.find((b) => b.code === nextBrgyCode);
    if (!selected) {
      onChange({ ...addr, barangay: '', barangayCode: '' });
      return;
    }
    onChange({
      ...addr,
      barangay: selected.name,
      barangayCode: selected.code,
      addressSource: 'PSGC_VERIFIED'
    });
  };

  const showManualMode = Boolean(degradedError) || manualOverride;
  const gridCols = compact ? '1fr 1fr' : '1fr 1fr';

  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      {/* Live Status / Degraded Mode Banner */}
      {degradedError ? (
        <div role="status" style={{
          background: 'rgba(245,158,11,0.1)',
          border: '1px solid var(--color-warning)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-3)',
          color: '#92400e',
          fontSize: 'var(--text-xs)',
          marginBottom: 'var(--space-3)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap'
        }}>
          <span>
            <strong>Manual Address Fallback Active:</strong> {degradedError} Enter Province &amp; City manually below.
          </span>
          <button type="button" className="btn btn-outline btn-sm" onClick={loadRegions} style={{ fontSize: '11px' }}>
            Retry PSGC API
          </button>
        </div>
      ) : (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--space-2)',
          flexWrap: 'wrap',
          gap: 8
        }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: addr.cityCode ? '#166534' : 'var(--color-text-muted)' }}>
            {loadingStep
              ? `Loading Philippine ${loadingStep} from PSGC API…`
              : addr.cityCode
                ? `✓ Live PSGC Verified (${addr.regionCode} • ${addr.cityCode}${addr.barangayCode ? ` • ${addr.barangayCode}` : ''})`
                : `Live PSA PSGC Address Lookup (${regions.length} Philippine regions loaded)`}
          </span>
          {manualOverride ? (
            <button
              type="button"
              onClick={() => { setManualOverride(false); if (regions.length === 0) loadRegions(); }}
              style={{ background: 'none', border: 'none', color: 'var(--color-brand-primary)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: 0 }}
            >
              Switch to PSGC Dropdowns
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setManualOverride(true);
                onChange({ ...addr, regionCode: '', provinceCode: '', cityCode: '', barangayCode: '', addressSource: 'MANUAL' });
              }}
              style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: '11px', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
            >
              Enter manually instead
            </button>
          )}
        </div>
      )}

      {addr.city && addr.province && !addr.regionCode && !showManualMode && (
        <div style={{
          background: 'rgba(37,99,235,0.08)',
          border: '1px solid rgba(37,99,235,0.25)',
          borderRadius: 'var(--radius-sm)',
          padding: '8px 10px',
          fontSize: '11px',
          color: '#1e3a8a',
          marginBottom: 'var(--space-3)'
        }}>
          Pre-filled address: <strong>{addr.city}, {addr.province}</strong>. Pick a Region below to verify via PSGC, or click <em>Enter manually instead</em> to keep/edit as-is.
        </div>
      )}

      {showManualMode ? (
        <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 'var(--space-4)' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="manual-city">City / Municipality *</label>
            <input
              id="manual-city"
              className="form-input"
              placeholder="e.g. City of Makati"
              value={addr.city || ''}
              onChange={(e) => onChange({ ...addr, city: e.target.value, addressSource: degradedError ? 'MANUAL_FALLBACK' : 'MANUAL' })}
              required
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="manual-province">Province / Metro Area *</label>
            <input
              id="manual-province"
              className="form-input"
              placeholder="e.g. Metro Manila or Cavite"
              value={addr.province || ''}
              onChange={(e) => onChange({ ...addr, province: e.target.value, addressSource: degradedError ? 'MANUAL_FALLBACK' : 'MANUAL' })}
              required
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <label className="form-label" htmlFor="manual-barangay">Barangay</label>
            <input
              id="manual-barangay"
              className="form-input"
              placeholder="e.g. Bel-Air (optional in manual mode)"
              value={addr.barangay || ''}
              onChange={(e) => onChange({ ...addr, barangay: e.target.value })}
            />
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 'var(--space-4)' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="psgc-region">Region *</label>
            <select
              id="psgc-region"
              className="form-input"
              value={addr.regionCode || ''}
              onChange={(e) => handleRegionChange(e.target.value)}
              disabled={loadingStep === 'regions'}
            >
              <option value="">-- Select Philippine Region --</option>
              {regions.map((r) => (
                <option key={r.code} value={r.code}>{r.displayName}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="psgc-province">Province *</label>
            {!hasProvinces && addr.regionCode ? (
              <input
                id="psgc-province"
                className="form-input"
                value={`${addr.province || 'Metro Manila'} (No Province Division)`}
                readOnly
                style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)' }}
              />
            ) : (
              <select
                id="psgc-province"
                className="form-input"
                value={addr.provinceCode || ''}
                onChange={(e) => handleProvinceChange(e.target.value)}
                disabled={!addr.regionCode || loadingStep === 'provinces'}
              >
                <option value="">-- Select Province --</option>
                {provinces.map((p) => (
                  <option key={p.code} value={p.code}>{p.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="psgc-city">City / Municipality *</label>
            <select
              id="psgc-city"
              className="form-input"
              value={addr.cityCode || ''}
              onChange={(e) => handleCityChange(e.target.value)}
              disabled={(!addr.regionCode) || (hasProvinces && !addr.provinceCode) || loadingStep === 'cities'}
            >
              <option value="">-- Select City / Municipality --</option>
              {cities.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="psgc-barangay">Barangay *</label>
            <select
              id="psgc-barangay"
              className="form-input"
              value={addr.barangayCode || ''}
              onChange={(e) => handleBarangayChange(e.target.value)}
              disabled={!addr.cityCode || loadingStep === 'barangays'}
            >
              <option value="">-- Select Barangay --</option>
              {barangays.map((b) => (
                <option key={b.code} value={b.code}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
