// Holiday-Aware Philippine Delivery Schedule Routes (Server-Side Proxy & Estimator)
const express = require('express');
const router = express.Router();
const holidayClient = require('../services/holidayClient');

// GET /api/schedule/health — Live Nager.Date connectivity & cache stats
router.get('/health', async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  const health = await holidayClient.checkHealth({ forceRefresh });
  res.status(health.reachable ? 200 : 503).json({
    success: health.reachable,
    data: health
  });
});

// GET /api/schedule/holidays?year=2026 — Official PH Public Holidays from Nager.Date
router.get('/holidays', async (req, res, next) => {
  try {
    const todayManila = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());

    const rawYear = req.query.year !== undefined ? req.query.year : Number.parseInt(todayManila.slice(0, 4), 10);
    const holidays = await holidayClient.getPublicHolidays(rawYear);
    const upcoming = holidays.filter((h) => h.date >= todayManila).slice(0, 5);

    res.json({
      success: true,
      data: {
        year: Number.parseInt(String(rawYear), 10),
        countryCode: holidayClient.getConfig().countryCode,
        count: holidays.length,
        today: todayManila,
        upcoming,
        holidays,
        cache: holidayClient.getCacheStats()
      }
    });
  } catch (err) {
    if (err instanceof holidayClient.HolidayApiError || err?.name === 'HolidayApiError') {
      return res.status(err.statusCode || 503).json({
        success: false,
        code: err.code || 'HOLIDAY_API_ERROR',
        message: err.message,
        degraded: (err.statusCode || 500) >= 500
      });
    }
    next(err);
  }
});

// GET /api/schedule/delivery-estimate?regionCode=&province=&city=&fromDate=
router.get('/delivery-estimate', async (req, res, next) => {
  try {
    const rawRegionCode = req.query.regionCode ? String(req.query.regionCode).trim() : '';
    if (rawRegionCode && !/^\d{9}$/.test(rawRegionCode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid regionCode: expected 9 digits.'
      });
    }

    const fromDate = req.query.fromDate ? String(req.query.fromDate).trim() : undefined;
    const province = req.query.province ? String(req.query.province).trim().slice(0, 100) : '';
    const city = req.query.city ? String(req.query.city).trim().slice(0, 100) : '';

    const estimate = await holidayClient.calculateDeliveryEstimate({
      regionCode: rawRegionCode,
      province,
      city,
      fromDate
    });

    res.json({
      success: true,
      data: estimate
    });
  } catch (err) {
    if (err instanceof holidayClient.HolidayApiError || err?.name === 'HolidayApiError') {
      return res.status(err.statusCode || 503).json({
        success: false,
        code: err.code || 'HOLIDAY_API_ERROR',
        message: err.message
      });
    }
    next(err);
  }
});

module.exports = router;
