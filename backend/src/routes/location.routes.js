// Location Routes — Live PSGC Philippine Standard Geographic Code Proxy & Address Validator
const express = require('express');
const router = express.Router();
const psgcClient = require('../services/psgcClient');

function sendPsgcError(res, next, err) {
  if (err instanceof psgcClient.PsgcError || err?.name === 'PsgcError') {
    return res.status(err.statusCode || 502).json({
      success: false,
      code: err.code || 'PSGC_ERROR',
      message: err.message,
      degraded: (err.statusCode || 500) >= 500
    });
  }
  return next(err);
}

// GET /api/locations/health — Live PSGC upstream probe & cache metrics
router.get('/health', async (req, res, next) => {
  try {
    const health = await psgcClient.checkHealth({ forceRefresh: req.query.refresh !== 'false' });
    res.json({ success: true, data: health });
  } catch (err) {
    sendPsgcError(res, next, err);
  }
});

// GET /api/locations/regions
router.get('/regions', async (req, res, next) => {
  try {
    const data = await psgcClient.getRegions({ bypassCache: req.query.refresh === 'true' });
    res.json({ success: true, data });
  } catch (err) {
    sendPsgcError(res, next, err);
  }
});

// GET /api/locations/regions/:regionCode/provinces
router.get('/regions/:regionCode/provinces', async (req, res, next) => {
  try {
    const data = await psgcClient.getProvincesByRegion(req.params.regionCode, { bypassCache: req.query.refresh === 'true' });
    res.json({ success: true, data });
  } catch (err) {
    sendPsgcError(res, next, err);
  }
});

// GET /api/locations/regions/:regionCode/cities
router.get('/regions/:regionCode/cities', async (req, res, next) => {
  try {
    const data = await psgcClient.getCitiesByRegion(req.params.regionCode, { bypassCache: req.query.refresh === 'true' });
    res.json({ success: true, data });
  } catch (err) {
    sendPsgcError(res, next, err);
  }
});

// GET /api/locations/provinces/:provinceCode/cities
router.get('/provinces/:provinceCode/cities', async (req, res, next) => {
  try {
    const data = await psgcClient.getCitiesByProvince(req.params.provinceCode, { bypassCache: req.query.refresh === 'true' });
    res.json({ success: true, data });
  } catch (err) {
    sendPsgcError(res, next, err);
  }
});

// GET /api/locations/cities/:cityCode/barangays
router.get('/cities/:cityCode/barangays', async (req, res, next) => {
  try {
    const data = await psgcClient.getBarangaysByCity(req.params.cityCode, { bypassCache: req.query.refresh === 'true' });
    res.json({ success: true, data });
  } catch (err) {
    sendPsgcError(res, next, err);
  }
});

// POST /api/locations/validate
router.post('/validate', async (req, res, next) => {
  try {
    const { regionCode, provinceCode, cityCode, barangayCode } = req.body || {};
    const verified = await psgcClient.validateAddressHierarchy({
      regionCode,
      provinceCode: provinceCode || null,
      cityCode,
      barangayCode: barangayCode || null
    });
    res.json({ success: true, data: verified });
  } catch (err) {
    sendPsgcError(res, next, err);
  }
});

module.exports = router;
