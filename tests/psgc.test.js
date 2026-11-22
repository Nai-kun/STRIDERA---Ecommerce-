// PSGC Philippine Address API Client Unit Tests
// Run with: node --test tests/psgc.test.js

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const psgcClient = require('../backend/src/services/psgcClient');

const SAMPLE_REGIONS = [
  { code: '130000000', name: 'NCR', regionName: 'National Capital Region', islandGroupCode: 'luzon' },
  { code: '040000000', name: 'CALABARZON', regionName: 'Region IV-A', islandGroupCode: 'luzon' }
];

const SAMPLE_PROVINCES_04 = [
  { code: '042100000', name: 'Cavite', regionCode: '040000000' },
  { code: '041000000', name: 'Batangas', regionCode: '040000000' }
];

const SAMPLE_CITIES_NCR = [
  { code: '137602000', name: 'City of Makati', isCity: true, isMunicipality: false, provinceCode: false, regionCode: '130000000' }
];

const SAMPLE_CITIES_CAVITE = [
  { code: '042101000', name: 'Alfonso', isCity: false, isMunicipality: true, provinceCode: '042100000', regionCode: '040000000' }
];

const SAMPLE_CITIES_04 = [
  { code: '042101000', name: 'Alfonso', isCity: false, isMunicipality: true, provinceCode: '042100000', regionCode: '040000000' },
  { code: '041014000', name: 'City of Lipa', isCity: true, isMunicipality: false, provinceCode: '041000000', regionCode: '040000000' }
];

const SAMPLE_BRGY_MAKATI = [
  { code: '137602002', name: 'Bel-Air', cityCode: '137602000', municipalityCode: false, provinceCode: false, regionCode: '130000000' }
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

function createHierarchyMockFetch() {
  return createMockFetch(async (url) => {
    if (url.endsWith('/regions.json')) return { status: 200, body: SAMPLE_REGIONS };
    if (url.endsWith('/regions/130000000/provinces.json')) return { status: 200, body: [] };
    if (url.endsWith('/regions/040000000/provinces.json')) return { status: 200, body: SAMPLE_PROVINCES_04 };
    if (url.endsWith('/regions/130000000/cities-municipalities.json')) return { status: 200, body: SAMPLE_CITIES_NCR };
    if (url.endsWith('/regions/040000000/cities-municipalities.json')) return { status: 200, body: SAMPLE_CITIES_04 };
    if (url.endsWith('/provinces/042100000/cities-municipalities.json')) return { status: 200, body: SAMPLE_CITIES_CAVITE };
    if (url.endsWith('/cities-municipalities/137602000/barangays.json')) return { status: 200, body: SAMPLE_BRGY_MAKATI };
    return { status: 404, body: { error: 'not found' } };
  });
}

describe('PSGC Philippine Address Client', () => {
  beforeEach(() => {
    psgcClient.clearCache();
  });

  it('1. validates 9-digit PSGC codes strictly and rejects non-HTTPS config', () => {
    assert.equal(psgcClient.validatePsgcCode('137602000', 'cityCode'), '137602000');

    for (const bad of ['', '123', '../etc', '13760200a', '1376020000']) {
      assert.throws(
        () => psgcClient.validatePsgcCode(bad, 'cityCode'),
        (err) => err instanceof psgcClient.PsgcError && err.code === 'PSGC_INVALID_CODE' && err.statusCode === 400
      );
    }

    assert.throws(
      () => psgcClient.getConfig({ PSGC_API_BASE_URL: 'http://psgc.gitlab.io/api' }),
      (err) => err instanceof psgcClient.PsgcError && err.code === 'PSGC_INVALID_CONFIG'
    );
  });

  it('2. caches stable PSGC responses within TTL and resets via clearCache()', async () => {
    let calls = 0;
    const mockFetch = createMockFetch(async () => {
      calls += 1;
      return { status: 200, body: SAMPLE_REGIONS };
    });

    const r1 = await psgcClient.getRegions({ fetchImpl: mockFetch, env: { PSGC_CACHE_TTL_MS: '60000' } });
    const r2 = await psgcClient.getRegions({ fetchImpl: mockFetch, env: { PSGC_CACHE_TTL_MS: '60000' } });

    assert.equal(calls, 1);
    assert.equal(r1.fromCache, false);
    assert.equal(r2.fromCache, true);
    assert.equal(r2.regions.length, 2);
    assert.equal(psgcClient.getCacheStats().hits, 1);
    assert.equal(psgcClient.getCacheStats().misses, 1);

    psgcClient.clearCache();
    assert.equal(psgcClient.getCacheStats().entries, 0);
  });

  it('3. retries boundedly on 503/429 and maps timeouts and malformed JSON cleanly', async () => {
    let attempt = 0;
    const retryFetch = createMockFetch(async () => {
      attempt += 1;
      if (attempt === 1) return { status: 429, headers: { 'retry-after': '0' }, body: { message: 'rate limit' } };
      if (attempt === 2) return { status: 503, body: { message: 'unavailable' } };
      return { status: 200, body: SAMPLE_REGIONS };
    });

    const res = await psgcClient.getRegions({
      fetchImpl: retryFetch,
      retryBaseDelayMs: 1,
      env: { PSGC_MAX_RETRIES: '2', PSGC_CACHE_TTL_MS: '0' }
    });
    assert.equal(attempt, 3);
    assert.equal(res.regions.length, 2);

    const timeoutFetch = async () => {
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      throw err;
    };
    await assert.rejects(
      () => psgcClient.getRegions({ fetchImpl: timeoutFetch, retryBaseDelayMs: 1, env: { PSGC_MAX_RETRIES: '0' } }),
      (err) => err instanceof psgcClient.PsgcError && err.code === 'PSGC_TIMEOUT' && err.statusCode === 504
    );

    const badJsonFetch = createMockFetch(async () => ({ status: 200, body: '<html>bad gateway</html>' }));
    await assert.rejects(
      () => psgcClient.getRegions({ fetchImpl: badJsonFetch, env: { PSGC_MAX_RETRIES: '0', PSGC_CACHE_TTL_MS: '0' } }),
      (err) => err instanceof psgcClient.PsgcError && err.code === 'PSGC_INVALID_RESPONSE' && err.statusCode === 502
    );
  });

  it('4. validates NCR (no province) and provincial hierarchies & rejects cross-area tampering', async () => {
    const fetchImpl = createHierarchyMockFetch();

    // Valid NCR: Metro Manila / City of Makati / Bel-Air
    const ncr = await psgcClient.validateAddressHierarchy(
      { regionCode: '130000000', provinceCode: null, cityCode: '137602000', barangayCode: '137602002' },
      { fetchImpl }
    );
    assert.equal(ncr.verified, true);
    assert.equal(ncr.provinceName, 'Metro Manila');
    assert.equal(ncr.cityName, 'City of Makati');
    assert.equal(ncr.barangayName, 'Bel-Air');

    // Valid Provincial: CALABARZON / Cavite / Alfonso
    const prov = await psgcClient.validateAddressHierarchy(
      { regionCode: '040000000', provinceCode: '042100000', cityCode: '042101000' },
      { fetchImpl }
    );
    assert.equal(prov.verified, true);
    assert.equal(prov.provinceName, 'Cavite');
    assert.equal(prov.cityName, 'Alfonso');

    // Tampered NCR + province code -> rejected
    await assert.rejects(
      () => psgcClient.validateAddressHierarchy(
        { regionCode: '130000000', provinceCode: '042100000', cityCode: '137602000' },
        { fetchImpl }
      ),
      (err) => err instanceof psgcClient.PsgcError && err.code === 'PSGC_ADDRESS_MISMATCH' && err.statusCode === 400
    );

    // Tampered Cavite province + Batangas city (Lipa) -> rejected
    await assert.rejects(
      () => psgcClient.validateAddressHierarchy(
        { regionCode: '040000000', provinceCode: '042100000', cityCode: '041014000' },
        { fetchImpl }
      ),
      (err) => err instanceof psgcClient.PsgcError && err.code === 'PSGC_ADDRESS_MISMATCH' && err.statusCode === 400
    );

    // Tampered Makati city + Alfonso (or unknown) barangay -> rejected
    await assert.rejects(
      () => psgcClient.validateAddressHierarchy(
        { regionCode: '130000000', cityCode: '137602000', barangayCode: '042101001' },
        { fetchImpl }
      ),
      (err) => err instanceof psgcClient.PsgcError && err.code === 'PSGC_ADDRESS_MISMATCH' && err.statusCode === 400
    );
  });
});
