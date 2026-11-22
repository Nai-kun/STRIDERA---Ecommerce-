// Dedicated Nager.Date Public Holidays API Service Layer (Server-Side Only)
// Upstream: https://date.nager.at/api/v3 (PublicHolidays/{year}/{countryCode} — free, no API key required)

const DEFAULT_HOLIDAY_BASE_URL = 'https://date.nager.at/api/v3';
const DEFAULT_COUNTRY_CODE = 'PH';
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (national public holidays are stable)
const HEALTH_CACHE_TTL_MS = 30 * 1000;
const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);

const NCR_CITY_REGEX = /^(city of )?(manila|makati|quezon city|taguig|pasig|mandaluyong|marikina|pasay|paranaque|para[ñn]aque|las pinas|las pi[ñn]as|muntinlupa|caloocan|malabon|navotas|valenzuela|san juan|pateros)$/i;

class HolidayApiError extends Error {
  constructor(message, { code = 'HOLIDAY_API_ERROR', statusCode = 503, httpStatus = null, retryable = false, details = null } = {}) {
    super(message);
    this.name = 'HolidayApiError';
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
let healthCache = null;

function clearCache() {
  cache.clear();
  cacheHits = 0;
  cacheMisses = 0;
  healthCache = null;
}

function getCacheStats() {
  return {
    entries: cache.size,
    hits: cacheHits,
    misses: cacheMisses
  };
}

function getConfig(env = process.env) {
  const rawBase = String(env.HOLIDAY_API_BASE_URL || DEFAULT_HOLIDAY_BASE_URL).trim().replace(/\/+$/, '');
  let parsed;
  try {
    parsed = new URL(rawBase);
  } catch {
    throw new HolidayApiError('HOLIDAY_API_BASE_URL is not a valid URL.', {
      code: 'HOLIDAY_INVALID_CONFIG',
      statusCode: 500
    });
  }

  if (parsed.protocol !== 'https:') {
    throw new HolidayApiError('HOLIDAY_API_BASE_URL must use HTTPS.', {
      code: 'HOLIDAY_INVALID_CONFIG',
      statusCode: 500
    });
  }

  const countryCode = String(env.HOLIDAY_COUNTRY_CODE || DEFAULT_COUNTRY_CODE).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new HolidayApiError('HOLIDAY_COUNTRY_CODE must be a 2-letter ISO country code.', {
      code: 'HOLIDAY_INVALID_CONFIG',
      statusCode: 500
    });
  }

  const parsedTimeout = Number.parseInt(env.HOLIDAY_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS), 10);
  const parsedRetries = Number.parseInt(env.HOLIDAY_MAX_RETRIES ?? String(DEFAULT_MAX_RETRIES), 10);
  const parsedTtl = Number.parseInt(env.HOLIDAY_CACHE_TTL_MS || String(DEFAULT_CACHE_TTL_MS), 10);

  return {
    baseUrl: rawBase,
    host: parsed.host,
    countryCode,
    timeoutMs: Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : DEFAULT_TIMEOUT_MS,
    maxRetries: Number.isFinite(parsedRetries) && parsedRetries >= 0 ? Math.min(parsedRetries, 4) : DEFAULT_MAX_RETRIES,
    cacheTtlMs: Number.isFinite(parsedTtl) && parsedTtl >= 0 ? parsedTtl : DEFAULT_CACHE_TTL_MS
  };
}

function validateYear(rawYear) {
  const year = typeof rawYear === 'number' ? rawYear : Number.parseInt(String(rawYear ?? '').trim(), 10);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new HolidayApiError('Year must be a 4-digit integer between 2000 and 2100.', {
      code: 'HOLIDAY_INVALID_YEAR',
      statusCode: 400
    });
  }
  return year;
}

function normalizeOptionalNow(nowOpt) {
  if (typeof nowOpt === 'function') return nowOpt();
  if (typeof nowOpt === 'number' && Number.isFinite(nowOpt)) return nowOpt;
  return Date.now();
}

function getManilaTodayIso(nowMs = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(nowMs));
}

function normalizeStartDateIso(fromDate, nowMs = Date.now()) {
  if (fromDate === undefined || fromDate === null || String(fromDate).trim() === '') {
    return getManilaTodayIso(nowMs);
  }
  if (fromDate instanceof Date) {
    if (Number.isNaN(fromDate.getTime())) {
      throw new HolidayApiError('Invalid fromDate provided.', { code: 'HOLIDAY_INVALID_DATE', statusCode: 400 });
    }
    return getManilaTodayIso(fromDate.getTime());
  }
  const str = String(fromDate).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    throw new HolidayApiError('fromDate must use YYYY-MM-DD format.', { code: 'HOLIDAY_INVALID_DATE', statusCode: 400 });
  }
  const [y, m, d] = str.split('-').map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() + 1 !== m || check.getUTCDate() !== d) {
    throw new HolidayApiError('fromDate is not a valid calendar date.', { code: 'HOLIDAY_INVALID_DATE', statusCode: 400 });
  }
  return str;
}

function addDaysIso(isoDate, deltaDays) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yy = String(dt.getUTCFullYear()).padStart(4, '0');
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function getUtcDayOfWeek(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
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
 * Execute an HTTPS GET request against Nager.Date with TTL caching, timeout, and bounded retries.
 */
async function getPublicHolidays(rawYear, opts = {}) {
  const env = opts.env || process.env;
  const cfg = getConfig(env);
  const year = validateYear(rawYear ?? Number.parseInt(getManilaTodayIso().slice(0, 4), 10));
  const countryCode = cfg.countryCode;

  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new HolidayApiError('Fetch API is unavailable in this Node runtime.', {
      code: 'HOLIDAY_UNAVAILABLE',
      statusCode: 503
    });
  }

  const endpointPath = `/PublicHolidays/${year}/${countryCode}`;
  const fullUrl = `${cfg.baseUrl}${endpointPath}`;
  const now = normalizeOptionalNow(opts.now);
  const cacheKey = `${fullUrl}`;

  if (!opts.bypassCache && cfg.cacheTtlMs > 0) {
    const cached = cache.get(cacheKey);
    if (cached && now < cached.expiresAt) {
      cacheHits += 1;
      return cached.data;
    }
  }
  cacheMisses += 1;

  let lastError = null;
  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    const t0 = Date.now();
    try {
      const response = await fetchImpl(fullUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'STRIDERA-Ecommerce/1.0'
        },
        signal: AbortSignal.timeout(cfg.timeoutMs)
      });

      const latencyMs = Date.now() - t0;
      if (process.env.NODE_ENV !== 'test') {
        console.log(`[HolidayAPI] GET ${cfg.host}${endpointPath} -> HTTP ${response.status} (${latencyMs}ms) [cache:miss]`);
      }

      if (!response.ok) {
        const retryable = RETRYABLE_HTTP_STATUSES.has(response.status);
        const err = new HolidayApiError(
          retryable
            ? `Public holiday service is temporarily busy (HTTP ${response.status}).`
            : `Public holiday service rejected request (HTTP ${response.status}).`,
          {
            code: retryable ? 'HOLIDAY_UPSTREAM_RETRYABLE' : 'HOLIDAY_UPSTREAM_ERROR',
            statusCode: retryable ? 503 : 502,
            httpStatus: response.status,
            retryable
          }
        );

        if (retryable && attempt < cfg.maxRetries) {
          lastError = err;
          await sleep(computeRetryDelayMs(attempt, response.headers?.get?.('retry-after'), opts.retryBaseDelayMs));
          continue;
        }
        throw err;
      }

      const rawText = await response.text();
      let payload;
      try {
        payload = JSON.parse(rawText);
      } catch {
        throw new HolidayApiError('Public holiday service returned malformed JSON.', {
          code: 'HOLIDAY_BAD_JSON',
          statusCode: 502,
          httpStatus: response.status
        });
      }

      if (!Array.isArray(payload)) {
        throw new HolidayApiError('Unexpected response structure from public holiday service.', {
          code: 'HOLIDAY_BAD_PAYLOAD',
          statusCode: 502,
          httpStatus: response.status
        });
      }

      const normalized = [];
      for (const item of payload) {
        if (!item || typeof item !== 'object') continue;
        const date = String(item.date || '').trim();
        const name = String(item.name || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !name) {
          throw new HolidayApiError('Public holiday record failed server-side validation.', {
            code: 'HOLIDAY_BAD_RECORD',
            statusCode: 502,
            httpStatus: response.status
          });
        }
        normalized.push({
          date,
          name,
          localName: String(item.localName || name).trim(),
          countryCode: String(item.countryCode || countryCode).trim().toUpperCase(),
          types: Array.isArray(item.types) ? item.types.map((t) => String(t)) : []
        });
      }

      normalized.sort((a, b) => a.date.localeCompare(b.date));

      if (cfg.cacheTtlMs > 0) {
        cache.set(cacheKey, {
          data: normalized,
          expiresAt: now + cfg.cacheTtlMs
        });
      }

      return normalized;
    } catch (err) {
      if (err instanceof HolidayApiError) {
        lastError = err;
        if (!err.retryable || attempt >= cfg.maxRetries) throw err;
        continue;
      }

      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError' || /timeout/i.test(err?.message || '');
      lastError = new HolidayApiError(
        isTimeout
          ? 'Public holiday service timed out before responding.'
          : 'Unable to reach public holiday service over HTTPS.',
        {
          code: isTimeout ? 'HOLIDAY_TIMEOUT' : 'HOLIDAY_NETWORK_ERROR',
          statusCode: 503,
          retryable: true,
          details: err?.message
        }
      );

      if (attempt < cfg.maxRetries) {
        await sleep(computeRetryDelayMs(attempt, null, opts.retryBaseDelayMs));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError || new HolidayApiError('Public holiday service failed.');
}

function classifyPhilippinesZone({ regionCode, province, city } = {}) {
  const cleanRegion = String(regionCode || '').trim();
  const cleanProvince = String(province || '').trim();
  const cleanCity = String(city || '').trim();

  const isNcr =
    cleanRegion === '130000000' ||
    /metro\s*manila|\bncr\b|national\s*capital/i.test(cleanProvince) ||
    NCR_CITY_REGEX.test(cleanCity);

  if (isNcr) {
    return {
      zone: 'NCR',
      zoneLabel: 'Metro Manila (NCR)',
      minBusinessDays: 2,
      maxBusinessDays: 3
    };
  }

  return {
    zone: 'PROVINCIAL',
    zoneLabel: 'Provincial Philippines',
    minBusinessDays: 4,
    maxBusinessDays: 6
  };
}

/**
 * Advance `businessDaysNeeded` courier business days from `startDateIso`, skipping Sundays
 * and any dates present in `holidayMap`.
 */
function advanceBusinessDays(startDateIso, businessDaysNeeded, holidayMap) {
  let cursor = startDateIso;
  let counted = 0;
  const skippedHolidays = [];
  const seenDates = new Set();

  let guard = 0;
  while (counted < businessDaysNeeded && guard < 60) {
    guard += 1;
    cursor = addDaysIso(cursor, 1);
    const holiday = holidayMap.get(cursor);
    if (holiday && !seenDates.has(cursor)) {
      seenDates.add(cursor);
      skippedHolidays.push({ date: holiday.date, name: holiday.name, localName: holiday.localName });
    }
    const dow = getUtcDayOfWeek(cursor);
    if (dow === 0 || holiday) {
      continue;
    }
    counted += 1;
  }

  return { targetDate: cursor, skippedHolidays };
}

/**
 * Compute server-side holiday-aware delivery estimate for a PH address.
 * Never fabricates holidays in degraded mode: falls back honestly to Sunday-skipping calculation.
 */
async function calculateDeliveryEstimate({ regionCode, province, city, fromDate } = {}, opts = {}) {
  const nowMs = normalizeOptionalNow(opts.now);
  const startDateIso = normalizeStartDateIso(fromDate, nowMs);
  const startYear = Number.parseInt(startDateIso.slice(0, 4), 10);
  const startMonth = Number.parseInt(startDateIso.slice(5, 7), 10);
  const zoneInfo = classifyPhilippinesZone({ regionCode, province, city });

  const holidayMap = new Map();
  let allHolidays = [];
  let degraded = false;
  let degradedReason = null;

  try {
    const yearsToFetch = startMonth === 12 ? [startYear, startYear + 1] : [startYear];
    const yearlyLists = await Promise.all(yearsToFetch.map((yr) => getPublicHolidays(yr, opts)));
    allHolidays = yearlyLists.flat();
    for (const h of allHolidays) {
      if (!holidayMap.has(h.date)) {
        holidayMap.set(h.date, h);
      }
    }
  } catch (err) {
    degraded = true;
    degradedReason = err?.message || 'Holiday service unavailable.';
  }

  const startRes = advanceBusinessDays(startDateIso, zoneInfo.minBusinessDays, holidayMap);
  const endRes = advanceBusinessDays(startDateIso, zoneInfo.maxBusinessDays, holidayMap);

  const holidaysInWindow = [];
  if (!degraded) {
    for (const h of endRes.skippedHolidays) {
      holidaysInWindow.push(h);
    }
  }

  const upcomingHolidays = degraded
    ? []
    : allHolidays
        .filter((h) => h.date >= startDateIso)
        .slice(0, 3)
        .map((h) => ({ date: h.date, name: h.name, localName: h.localName }));

  return {
    zone: zoneInfo.zone,
    zoneLabel: zoneInfo.zoneLabel,
    minBusinessDays: zoneInfo.minBusinessDays,
    maxBusinessDays: zoneInfo.maxBusinessDays,
    orderDate: startDateIso,
    estimatedDeliveryStart: startRes.targetDate,
    estimatedDeliveryEnd: endRes.targetDate,
    source: degraded ? 'FALLBACK_NO_HOLIDAY_DATA' : 'NAGER_PH_HOLIDAYS',
    degraded,
    holidaysInWindow,
    upcomingHolidays,
    notice: degraded
      ? 'Holiday calendar service is currently unavailable; estimate excludes Sundays only.'
      : holidaysInWindow.length > 0
        ? `Window adjusted for official PH holiday${holidaysInWindow.length > 1 ? 's' : ''}: ${holidaysInWindow.map((h) => `${h.name} (${h.date})`).join(', ')}.`
        : null
  };
}

async function checkHealth(opts = {}) {
  const now = normalizeOptionalNow(opts.now);
  if (!opts.forceRefresh && healthCache && now - healthCache.checkedAtMs < HEALTH_CACHE_TTL_MS) {
    return {
      ...healthCache.data,
      cache: getCacheStats()
    };
  }

  let cfg;
  try {
    cfg = getConfig(opts.env || process.env);
  } catch (err) {
    return {
      reachable: false,
      httpStatus: null,
      latencyMs: 0,
      host: null,
      countryCode: DEFAULT_COUNTRY_CODE,
      year: null,
      error: err.message,
      checkedAt: new Date(now).toISOString(),
      cache: getCacheStats()
    };
  }

  const year = Number.parseInt(getManilaTodayIso(now).slice(0, 4), 10);
  const t0 = Date.now();
  try {
    const holidays = await getPublicHolidays(year, { ...opts, bypassCache: Boolean(opts.forceRefresh) });
    const data = {
      reachable: true,
      httpStatus: 200,
      latencyMs: Date.now() - t0,
      host: cfg.host,
      countryCode: cfg.countryCode,
      year,
      holidayCount: holidays.length,
      checkedAt: new Date(now).toISOString(),
      cache: getCacheStats()
    };
    healthCache = { checkedAtMs: now, data };
    return data;
  } catch (err) {
    const data = {
      reachable: false,
      httpStatus: err.httpStatus || null,
      latencyMs: Date.now() - t0,
      host: cfg.host,
      countryCode: cfg.countryCode,
      year,
      holidayCount: 0,
      error: err.message,
      checkedAt: new Date(now).toISOString(),
      cache: getCacheStats()
    };
    healthCache = { checkedAtMs: now, data };
    return data;
  }
}

module.exports = {
  HolidayApiError,
  getConfig,
  clearCache,
  getCacheStats,
  getPublicHolidays,
  classifyPhilippinesZone,
  calculateDeliveryEstimate,
  checkHealth
};
