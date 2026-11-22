// Dedicated PSGC Philippine Address API Service Layer (Server-Side Only)
// Upstream: https://psgc.gitlab.io/api (PSA Philippine Standard Geographic Code JSON endpoints)

const DEFAULT_PSGC_BASE_URL = 'https://psgc.gitlab.io/api';
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (PSGC administrative divisions are stable)
const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);

class PsgcError extends Error {
  constructor(message, { code = 'PSGC_ERROR', statusCode = 502, httpStatus = null, retryable = false, details = null } = {}) {
    super(message);
    this.name = 'PsgcError';
    this.code = code;
    this.statusCode = statusCode;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
    this.details = details;
  }
}

const cache = new Map();
let cacheHits = 0;
let cacheMisses = 0;

function clearCache() {
  cache.clear();
  cacheHits = 0;
  cacheMisses = 0;
}

function getCacheStats() {
  return {
    entries: cache.size,
    hits: cacheHits,
    misses: cacheMisses
  };
}

function getConfig(env = process.env) {
  const rawBase = String(env.PSGC_API_BASE_URL || DEFAULT_PSGC_BASE_URL).trim().replace(/\/+$/, '');
  let parsed;
  try {
    parsed = new URL(rawBase);
  } catch {
    throw new PsgcError('PSGC_API_BASE_URL is not a valid URL.', {
      code: 'PSGC_INVALID_CONFIG',
      statusCode: 500
    });
  }

  if (parsed.protocol !== 'https:') {
    throw new PsgcError('PSGC_API_BASE_URL must use HTTPS.', {
      code: 'PSGC_INVALID_CONFIG',
      statusCode: 500
    });
  }

  const parsedTimeout = Number.parseInt(env.PSGC_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS), 10);
  const parsedRetries = Number.parseInt(env.PSGC_MAX_RETRIES ?? String(DEFAULT_MAX_RETRIES), 10);
  const parsedTtl = Number.parseInt(env.PSGC_CACHE_TTL_MS || String(DEFAULT_CACHE_TTL_MS), 10);

  return {
    baseUrl: rawBase,
    host: parsed.host,
    timeoutMs: Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : DEFAULT_TIMEOUT_MS,
    maxRetries: Number.isFinite(parsedRetries) && parsedRetries >= 0 ? Math.min(parsedRetries, 4) : DEFAULT_MAX_RETRIES,
    cacheTtlMs: Number.isFinite(parsedTtl) && parsedTtl >= 0 ? parsedTtl : DEFAULT_CACHE_TTL_MS
  };
}

function validatePsgcCode(rawCode, fieldName = 'code') {
  const code = String(rawCode || '').trim();
  if (!/^\d{9}$/.test(code)) {
    throw new PsgcError(`Invalid PSGC ${fieldName}: expected a 9-digit numeric code.`, {
      code: 'PSGC_INVALID_CODE',
      statusCode: 400
    });
  }
  return code;
}

function normalizeOptionalString(val) {
  return typeof val === 'string' && val.trim().length > 0 ? val.trim() : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeRetryDelayMs(attempt, retryAfterHeader, baseMs = 250) {
  if (retryAfterHeader) {
    const secs = Number.parseInt(retryAfterHeader, 10);
    if (Number.isFinite(secs) && secs >= 0) {
      return Math.min(secs * 1000, 3000);
    }
  }
  return Math.min(baseMs * Math.pow(2, attempt), 2000);
}

/**
 * Execute an HTTPS GET request against the PSGC API with TTL caching, timeout, and bounded retries.
 */
async function requestPsgc(endpointPath, opts = {}) {
  const env = opts.env || process.env;
  const cfg = getConfig(env);
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new PsgcError('Fetch API is unavailable in this Node runtime.', {
      code: 'PSGC_UNAVAILABLE',
      statusCode: 503
    });
  }

  const normalizedPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  const fullUrl = `${cfg.baseUrl}${normalizedPath}`;
  const parsedUrl = new URL(fullUrl);
  const now = opts.now ? opts.now() : Date.now();

  if (!opts.bypassCache && cfg.cacheTtlMs > 0) {
    const cached = cache.get(fullUrl);
    if (cached && now < cached.expiresAt) {
      cacheHits += 1;
      return { data: cached.data, fromCache: true, httpStatus: cached.httpStatus, latencyMs: 0, host: cfg.host };
    }
    if (cached && now >= cached.expiresAt) {
      cache.delete(fullUrl);
    }
  }

  cacheMisses += 1;
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : cfg.timeoutMs;
  const maxRetries = Number.isFinite(opts.maxRetries) ? opts.maxRetries : cfg.maxRetries;
  const baseDelayMs = Number.isFinite(opts.retryBaseDelayMs) ? opts.retryBaseDelayMs : 250;
  const maxAttempts = maxRetries + 1;

  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const t0 = Date.now();
    try {
      const res = await fetchImpl(fullUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'STRIDERA-Ecommerce/1.0'
        },
        signal: AbortSignal.timeout(timeoutMs)
      });

      const elapsedMs = Date.now() - t0;
      const contentType = res.headers?.get ? (res.headers.get('content-type') || '') : '';
      const rawText = await res.text();

      let payload = null;
      if (rawText) {
        try {
          payload = JSON.parse(rawText);
        } catch {
          payload = null;
        }
      }

      console.info(`[PSGC] GET ${parsedUrl.host}${parsedUrl.pathname} -> HTTP ${res.status} (${elapsedMs}ms) [cache:miss]`);

      if (res.ok) {
        if (!payload || (typeof payload !== 'object' && !Array.isArray(payload))) {
          throw new PsgcError('PSGC API returned an invalid or non-JSON response payload.', {
            code: 'PSGC_INVALID_RESPONSE',
            statusCode: 502,
            httpStatus: res.status,
            details: { contentType }
          });
        }

        if (!opts.bypassCache && cfg.cacheTtlMs > 0) {
          cache.set(fullUrl, {
            data: payload,
            httpStatus: res.status,
            expiresAt: (opts.now ? opts.now() : Date.now()) + cfg.cacheTtlMs
          });
        }

        return { data: payload, fromCache: false, httpStatus: res.status, latencyMs: elapsedMs, host: cfg.host };
      }

      if (res.status === 404) {
        throw new PsgcError('Requested Philippine geographic record was not found in PSGC.', {
          code: 'PSGC_NOT_FOUND',
          statusCode: 404,
          httpStatus: 404
        });
      }

      if (res.status === 429) {
        lastError = new PsgcError('PSGC API rate limit exceeded. Please try again shortly or use manual entry.', {
          code: 'PSGC_RATE_LIMITED',
          statusCode: 429,
          httpStatus: 429,
          retryable: true
        });
        if (attempt < maxAttempts - 1) {
          const retryAfter = res.headers?.get ? res.headers.get('retry-after') : null;
          await sleep(computeRetryDelayMs(attempt, retryAfter, baseDelayMs));
          continue;
        }
        throw lastError;
      }

      if (RETRYABLE_HTTP_STATUSES.has(res.status) || res.status >= 500) {
        lastError = new PsgcError('PSGC Philippine Address API is temporarily unavailable.', {
          code: 'PSGC_UNAVAILABLE',
          statusCode: 503,
          httpStatus: res.status,
          retryable: true
        });
        if (attempt < maxAttempts - 1) {
          await sleep(computeRetryDelayMs(attempt, null, baseDelayMs));
          continue;
        }
        throw lastError;
      }

      throw new PsgcError(`PSGC API returned unexpected status HTTP ${res.status}.`, {
        code: 'PSGC_ERROR',
        statusCode: 502,
        httpStatus: res.status
      });
    } catch (err) {
      if (err instanceof PsgcError) {
        throw err;
      }

      const elapsedMs = Date.now() - t0;
      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      console.warn(`[PSGC] GET ${parsedUrl.host}${parsedUrl.pathname} -> ${isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR'} (${elapsedMs}ms)`);

      lastError = isTimeout
        ? new PsgcError('PSGC Philippine Address API timed out. You can switch to manual entry.', {
            code: 'PSGC_TIMEOUT',
            statusCode: 504,
            retryable: true
          })
        : new PsgcError('Unable to reach PSGC Philippine Address API.', {
            code: 'PSGC_UNAVAILABLE',
            statusCode: 503,
            retryable: true
          });

      if (attempt < maxAttempts - 1) {
        await sleep(computeRetryDelayMs(attempt, null, baseDelayMs));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError || new PsgcError('PSGC API request failed.', { code: 'PSGC_UNAVAILABLE', statusCode: 503 });
}

function formatRegion(r) {
  const name = String(r.name || '').trim();
  const regionName = String(r.regionName || name).trim();
  const displayName = name && regionName && name !== regionName ? `${regionName} (${name})` : (regionName || name);
  return {
    code: String(r.code),
    name,
    regionName,
    displayName,
    islandGroupCode: normalizeOptionalString(r.islandGroupCode)
  };
}

function formatProvince(p) {
  return {
    code: String(p.code),
    name: String(p.name || '').trim(),
    regionCode: normalizeOptionalString(p.regionCode)
  };
}

function formatCity(c) {
  return {
    code: String(c.code),
    name: String(c.name || '').trim(),
    isCity: Boolean(c.isCity),
    isMunicipality: Boolean(c.isMunicipality),
    provinceCode: normalizeOptionalString(c.provinceCode),
    regionCode: normalizeOptionalString(c.regionCode)
  };
}

function formatBarangay(b) {
  return {
    code: String(b.code),
    name: String(b.name || '').trim(),
    cityCode: normalizeOptionalString(b.cityCode) || normalizeOptionalString(b.municipalityCode),
    provinceCode: normalizeOptionalString(b.provinceCode),
    regionCode: normalizeOptionalString(b.regionCode)
  };
}

async function getRegions(opts = {}) {
  const res = await requestPsgc('/regions.json', opts);
  if (!Array.isArray(res.data)) {
    throw new PsgcError('Unexpected PSGC regions format.', { code: 'PSGC_INVALID_RESPONSE', statusCode: 502 });
  }
  return {
    regions: res.data.map(formatRegion).sort((a, b) => a.code.localeCompare(b.code)),
    fromCache: res.fromCache,
    latencyMs: res.latencyMs
  };
}

async function getProvincesByRegion(rawRegionCode, opts = {}) {
  const regionCode = validatePsgcCode(rawRegionCode, 'regionCode');
  const res = await requestPsgc(`/regions/${regionCode}/provinces.json`, opts);
  if (!Array.isArray(res.data)) {
    throw new PsgcError('Unexpected PSGC provinces format.', { code: 'PSGC_INVALID_RESPONSE', statusCode: 502 });
  }
  const provinces = res.data.map(formatProvince).sort((a, b) => a.name.localeCompare(b.name));
  return {
    regionCode,
    hasProvinces: provinces.length > 0,
    provinces,
    fromCache: res.fromCache,
    latencyMs: res.latencyMs
  };
}

async function getCitiesByRegion(rawRegionCode, opts = {}) {
  const regionCode = validatePsgcCode(rawRegionCode, 'regionCode');
  const res = await requestPsgc(`/regions/${regionCode}/cities-municipalities.json`, opts);
  if (!Array.isArray(res.data)) {
    throw new PsgcError('Unexpected PSGC cities format.', { code: 'PSGC_INVALID_RESPONSE', statusCode: 502 });
  }
  return {
    regionCode,
    cities: res.data.map(formatCity).sort((a, b) => a.name.localeCompare(b.name)),
    fromCache: res.fromCache,
    latencyMs: res.latencyMs
  };
}

async function getCitiesByProvince(rawProvinceCode, opts = {}) {
  const provinceCode = validatePsgcCode(rawProvinceCode, 'provinceCode');
  const res = await requestPsgc(`/provinces/${provinceCode}/cities-municipalities.json`, opts);
  if (!Array.isArray(res.data)) {
    throw new PsgcError('Unexpected PSGC cities format.', { code: 'PSGC_INVALID_RESPONSE', statusCode: 502 });
  }
  return {
    provinceCode,
    cities: res.data.map(formatCity).sort((a, b) => a.name.localeCompare(b.name)),
    fromCache: res.fromCache,
    latencyMs: res.latencyMs
  };
}

async function getBarangaysByCity(rawCityCode, opts = {}) {
  const cityCode = validatePsgcCode(rawCityCode, 'cityCode');
  const res = await requestPsgc(`/cities-municipalities/${cityCode}/barangays.json`, opts);
  if (!Array.isArray(res.data)) {
    throw new PsgcError('Unexpected PSGC barangays format.', { code: 'PSGC_INVALID_RESPONSE', statusCode: 502 });
  }
  return {
    cityCode,
    barangays: res.data.map(formatBarangay).sort((a, b) => a.name.localeCompare(b.name)),
    fromCache: res.fromCache,
    latencyMs: res.latencyMs
  };
}

/**
 * Strictly validate an address hierarchy server-side against live/cached PSGC data.
 * Returns canonical names from PSGC so browser-submitted names are never trusted.
 */
async function validateAddressHierarchy({ regionCode, provinceCode, cityCode, barangayCode } = {}, opts = {}) {
  const cleanRegionCode = validatePsgcCode(regionCode, 'regionCode');
  const cleanCityCode = validatePsgcCode(cityCode, 'cityCode');
  const cleanProvinceCode = provinceCode ? validatePsgcCode(provinceCode, 'provinceCode') : null;
  const cleanBarangayCode = barangayCode ? validatePsgcCode(barangayCode, 'barangayCode') : null;

  const { regions } = await getRegions(opts);
  const region = regions.find((r) => r.code === cleanRegionCode);
  if (!region) {
    throw new PsgcError('Selected PSGC region code does not exist.', {
      code: 'PSGC_ADDRESS_MISMATCH',
      statusCode: 400
    });
  }

  const provRes = await getProvincesByRegion(cleanRegionCode, opts);
  let matchedProvince = null;
  let matchedCity = null;

  if (provRes.hasProvinces) {
    if (!cleanProvinceCode) {
      throw new PsgcError('Province selection is required for this Philippine region.', {
        code: 'PSGC_ADDRESS_MISMATCH',
        statusCode: 400
      });
    }
    matchedProvince = provRes.provinces.find((p) => p.code === cleanProvinceCode);
    if (!matchedProvince) {
      throw new PsgcError('Selected province does not belong to the selected region.', {
        code: 'PSGC_ADDRESS_MISMATCH',
        statusCode: 400
      });
    }

    const { cities: provCities } = await getCitiesByProvince(cleanProvinceCode, opts);
    matchedCity = provCities.find((c) => c.code === cleanCityCode) || null;

    if (!matchedCity) {
      // Handle independent Highly Urbanized Cities (provinceCode: null) belonging directly to the region
      const { cities: regCities } = await getCitiesByRegion(cleanRegionCode, opts);
      matchedCity = regCities.find((c) => c.code === cleanCityCode && !c.provinceCode) || null;
    }

    if (!matchedCity) {
      throw new PsgcError('Selected city/municipality does not belong to the selected province.', {
        code: 'PSGC_ADDRESS_MISMATCH',
        statusCode: 400
      });
    }
  } else {
    if (cleanProvinceCode) {
      throw new PsgcError('Selected region (such as NCR) does not use a province code.', {
        code: 'PSGC_ADDRESS_MISMATCH',
        statusCode: 400
      });
    }
    const { cities: regCities } = await getCitiesByRegion(cleanRegionCode, opts);
    matchedCity = regCities.find((c) => c.code === cleanCityCode) || null;
    if (!matchedCity) {
      throw new PsgcError('Selected city/municipality does not belong to the selected region.', {
        code: 'PSGC_ADDRESS_MISMATCH',
        statusCode: 400
      });
    }
  }

  let matchedBarangay = null;
  if (cleanBarangayCode) {
    const { barangays } = await getBarangaysByCity(cleanCityCode, opts);
    matchedBarangay = barangays.find((b) => b.code === cleanBarangayCode) || null;
    if (!matchedBarangay) {
      throw new PsgcError('Selected barangay does not belong to the selected city/municipality.', {
        code: 'PSGC_ADDRESS_MISMATCH',
        statusCode: 400
      });
    }
  }

  const canonicalProvinceName = matchedProvince
    ? matchedProvince.name
    : (cleanRegionCode === '130000000' ? 'Metro Manila' : region.regionName);

  return {
    verified: true,
    source: 'PSGC_VERIFIED',
    regionCode: region.code,
    regionName: region.displayName,
    provinceCode: matchedProvince ? matchedProvince.code : null,
    provinceName: canonicalProvinceName,
    cityCode: matchedCity.code,
    cityName: matchedCity.name,
    barangayCode: matchedBarangay ? matchedBarangay.code : null,
    barangayName: matchedBarangay ? matchedBarangay.name : null
  };
}

/**
 * Live health check probe against the PSGC API.
 */
async function checkHealth(opts = {}) {
  const cfg = getConfig(opts.env || process.env);
  const t0 = Date.now();
  try {
    const res = await requestPsgc('/regions.json', {
      ...opts,
      bypassCache: opts.forceRefresh !== false,
      timeoutMs: opts.timeoutMs || 5000,
      maxRetries: opts.maxRetries ?? 0
    });
    const regions = Array.isArray(res.data) ? res.data : [];
    return {
      provider: 'psgc',
      host: cfg.host,
      reachable: regions.length > 0,
      httpStatus: res.httpStatus || 200,
      latencyMs: Date.now() - t0,
      regionCount: regions.length,
      cache: getCacheStats(),
      checkedAt: new Date().toISOString(),
      message: `PSGC Philippine Address API reachable (${regions.length} regions).`
    };
  } catch (err) {
    return {
      provider: 'psgc',
      host: cfg.host,
      reachable: false,
      httpStatus: err?.httpStatus || null,
      latencyMs: Date.now() - t0,
      regionCount: 0,
      cache: getCacheStats(),
      checkedAt: new Date().toISOString(),
      message: err?.message || 'PSGC Philippine Address API unreachable.'
    };
  }
}

module.exports = {
  PsgcError,
  getConfig,
  validatePsgcCode,
  clearCache,
  getCacheStats,
  requestPsgc,
  getRegions,
  getProvincesByRegion,
  getCitiesByRegion,
  getCitiesByProvince,
  getBarangaysByCity,
  validateAddressHierarchy,
  checkHealth
};
