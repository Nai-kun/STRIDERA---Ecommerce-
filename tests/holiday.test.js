// Nager.Date Philippine Public Holidays & Delivery Schedule Client Unit Tests
// Run with: node --test tests/holiday.test.js

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const holidayClient = require('../backend/src/services/holidayClient');

const SAMPLE_PH_2026 = [
  { date: '2026-01-01', localName: 'Bagong Taon', name: "New Year's Day", countryCode: 'PH', types: ['Public'] },
  { date: '2026-11-30', localName: 'Araw ni Gat Andres Bonifacio', name: 'Bonifacio Day', countryCode: 'PH', types: ['Public'] },
  { date: '2026-12-25', localName: 'Araw ng Pasko', name: 'Christmas Day', countryCode: 'PH', types: ['Public'] },
  { date: '2026-12-30', localName: 'Araw ng Kamatayan ni Dr. Jose Rizal', name: 'Rizal Day', countryCode: 'PH', types: ['Public'] },
  { date: '2026-12-31', localName: 'Huling Araw ng Taon', name: 'Last Day of The Year', countryCode: 'PH', types: ['Observance'] }
];

const SAMPLE_PH_2027 = [
  { date: '2027-01-01', localName: 'Bagong Taon', name: "New Year's Day", countryCode: 'PH', types: ['Public'] }
];

function createMockFetch(handler) {
  return async (url, init) => {
    const res = await handler(url, init);
    const bodyText = typeof res.body === 'string' ? res.body : JSON.stringify(res.body);
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      headers: {
        get: (k) => (res.headers && res.headers[k.toLowerCase()]) || 'application/json'
      },
      text: async () => bodyText
    };
  };
}

describe('Nager.Date Philippine Public Holidays Client', () => {
  beforeEach(() => {
    holidayClient.clearCache();
  });

  it('1. enforces HTTPS-only URL, valid ISO country code, and 4-digit year range', async () => {
    assert.throws(
      () => holidayClient.getConfig({ HOLIDAY_API_BASE_URL: 'http://date.nager.at/api/v3' }),
      /HTTPS/i
    );
    assert.throws(
      () => holidayClient.getConfig({ HOLIDAY_COUNTRY_CODE: 'INVALID' }),
      /2-letter ISO/i
    );
    await assert.rejects(
      () => holidayClient.getPublicHolidays(1999, { fetchImpl: createMockFetch(async () => ({ status: 200, body: [] })) }),
      /between 2000 and 2100/
    );
  });

  it('2. caches holiday lists within 24h TTL and tracks hits/misses accurately', async () => {
    let calls = 0;
    const mockFetch = createMockFetch(async () => {
      calls += 1;
      return { status: 200, body: SAMPLE_PH_2026 };
    });

    const first = await holidayClient.getPublicHolidays(2026, { fetchImpl: mockFetch, now: 1_000_000 });
    const second = await holidayClient.getPublicHolidays(2026, { fetchImpl: mockFetch, now: 1_000_500 });

    assert.equal(calls, 1);
    assert.equal(first.length, 5);
    assert.deepEqual(first, second);
    assert.deepEqual(holidayClient.getCacheStats(), { entries: 1, hits: 1, misses: 1 });

    holidayClient.clearCache();
    assert.deepEqual(holidayClient.getCacheStats(), { entries: 0, hits: 0, misses: 0 });
  });

  it('3. retries boundedly on 503/429 and maps timeouts and malformed JSON cleanly', async () => {
    let attempts = 0;
    const flakyFetch = createMockFetch(async () => {
      attempts += 1;
      if (attempts < 3) return { status: 503, body: { error: 'busy' } };
      return { status: 200, body: SAMPLE_PH_2026 };
    });

    const list = await holidayClient.getPublicHolidays(2026, {
      fetchImpl: flakyFetch,
      retryBaseDelayMs: 1,
      env: { HOLIDAY_MAX_RETRIES: '2' }
    });
    assert.equal(attempts, 3);
    assert.equal(list.length, 5);

    holidayClient.clearCache();
    const timeoutFetch = async () => {
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      throw err;
    };
    await assert.rejects(
      () => holidayClient.getPublicHolidays(2026, { fetchImpl: timeoutFetch, retryBaseDelayMs: 1, env: { HOLIDAY_MAX_RETRIES: '1' } }),
      (e) => e.name === 'HolidayApiError' && e.code === 'HOLIDAY_TIMEOUT' && e.statusCode === 503
    );

    holidayClient.clearCache();
    const badJsonFetch = createMockFetch(async () => ({ status: 200, body: '{not-json' }));
    await assert.rejects(
      () => holidayClient.getPublicHolidays(2026, { fetchImpl: badJsonFetch }),
      (e) => e.name === 'HolidayApiError' && e.code === 'HOLIDAY_BAD_JSON' && e.statusCode === 502
    );
  });

  it('4. calculates NCR vs Provincial delivery windows skipping Sundays and PH holidays (incl. year boundary)', async () => {
    const holidayFetch = createMockFetch(async (url) => {
      if (url.endsWith('/2026/PH')) return { status: 200, body: SAMPLE_PH_2026 };
      if (url.endsWith('/2027/PH')) return { status: 200, body: SAMPLE_PH_2027 };
      return { status: 404, body: [] };
    });

    // Order placed Sat Nov 28, 2026 for NCR (Makati):
    // Nov 29 = Sun (skip), Nov 30 = Bonifacio Day PH holiday (skip)
    // Business days: Tue Dec 1 (1), Wed Dec 2 (2), Thu Dec 3 (3)
    const ncrBonifacio = await holidayClient.calculateDeliveryEstimate(
      { regionCode: '130000000', province: 'Metro Manila', city: 'City of Makati', fromDate: '2026-11-28' },
      { fetchImpl: holidayFetch }
    );
    assert.equal(ncrBonifacio.zone, 'NCR');
    assert.equal(ncrBonifacio.source, 'NAGER_PH_HOLIDAYS');
    assert.equal(ncrBonifacio.degraded, false);
    assert.equal(ncrBonifacio.estimatedDeliveryStart, '2026-12-02');
    assert.equal(ncrBonifacio.estimatedDeliveryEnd, '2026-12-03');
    assert.equal(ncrBonifacio.holidaysInWindow.some((h) => h.date === '2026-11-30' && h.name === 'Bonifacio Day'), true);

    // Order placed Tue Dec 29, 2026 for Provincial (Cebu):
    // Dec 30 = Rizal Day (skip), Dec 31 = Last Day (skip), Jan 1 2027 = New Year (skip), Jan 3 = Sun (skip)
    // Business days: Sat Jan 2 (1), Mon Jan 4 (2), Tue Jan 5 (3), Wed Jan 6 (4), Thu Jan 7 (5), Fri Jan 8 (6)
    const provYearEnd = await holidayClient.calculateDeliveryEstimate(
      { regionCode: '070000000', province: 'Cebu', city: 'Cebu City', fromDate: '2026-12-29' },
      { fetchImpl: holidayFetch }
    );
    assert.equal(provYearEnd.zone, 'PROVINCIAL');
    assert.equal(provYearEnd.estimatedDeliveryStart, '2027-01-06');
    assert.equal(provYearEnd.estimatedDeliveryEnd, '2027-01-08');
    assert.equal(provYearEnd.holidaysInWindow.some((h) => h.date === '2027-01-01'), true);
  });

  it('5. degrades honestly when upstream Nager.Date fails without inventing holidays', async () => {
    const downFetch = async () => {
      throw new Error('connect ECONNREFUSED');
    };
    const res = await holidayClient.calculateDeliveryEstimate(
      { regionCode: '130000000', fromDate: '2026-11-28' },
      { fetchImpl: downFetch, retryBaseDelayMs: 0, env: { HOLIDAY_MAX_RETRIES: '0' } }
    );
    assert.equal(res.source, 'FALLBACK_NO_HOLIDAY_DATA');
    assert.equal(res.degraded, true);
    assert.deepEqual(res.holidaysInWindow, []);
    assert.deepEqual(res.upcomingHolidays, []);
    // Without holiday data on Sat Nov 28: Sun Nov 29 skipped, Mon Nov 30 (1), Tue Dec 1 (2), Wed Dec 2 (3)
    assert.equal(res.estimatedDeliveryStart, '2026-12-01');
    assert.equal(res.estimatedDeliveryEnd, '2026-12-02');
  });
});
