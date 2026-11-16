// STRIDERA — Backend Entry Point
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const path = require('path');

const authRoutes = require('./src/routes/auth.routes');
const productRoutes = require('./src/routes/product.routes');
const categoryRoutes = require('./src/routes/category.routes');
const brandRoutes = require('./src/routes/brand.routes');
const cartRoutes = require('./src/routes/cart.routes');
const orderRoutes = require('./src/routes/order.routes');
const paymentRoutes = require('./src/routes/payment.routes');
const adminRoutes = require('./src/routes/admin.routes');
const sellerRoutes = require('./src/routes/seller.routes');
const inventoryRoutes = require('./src/routes/inventory.routes');
const deliveryRoutes = require('./src/routes/delivery.routes');
const supportRoutes = require('./src/routes/support.routes');
const financeRoutes = require('./src/routes/finance.routes');
const wishlistRoutes = require('./src/routes/wishlist.routes');
const { errorHandler, notFound } = require('./src/middleware/error.middleware');

const app = express();
const PORT = process.env.PORT || 5000;

// Security
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS — allow localhost, 127.0.0.1, and configured FRONTEND_URL
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.FRONTEND_URL || 'http://localhost:3000')
    : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));

// Body parsing — raw body needed for webhook signature verification
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Cookies
app.use(cookieParser());

// Compression
app.use(compression());

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Static files for product images & uploads
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/wishlist', wishlistRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use(notFound);
app.use(errorHandler);

const net = require('net');

async function ensureDb() {
  const isPortOpen = await new Promise((resolve) => {
    const s = net.connect(5432, '127.0.0.1');
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
  });

  if (!isPortOpen) {
    console.log('🔄 Starting embedded PGlite PostgreSQL database on 127.0.0.1:5432...');
    const { start: startDb } = require('./db-server');
    await startDb();
  }
}

async function startServer() {
  await ensureDb();
  app.listen(PORT, () => {
    console.log(`🚀 STRIDERA API running on port ${PORT}`);
    console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🎮 Demo mode: ${process.env.DEMO_MODE === 'true' ? 'ON' : 'OFF'}`);
  });
}

if (require.main === module) {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

module.exports = app;
