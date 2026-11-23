// STRIDERA — Backend Entry Point
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Auto-sync Prisma Client if prisma/schema.prisma changed (e.g. after git pull on VM)
(function ensurePrismaClientSynced() {
  try {
    const srcSchemaPath = path.join(__dirname, 'prisma', 'schema.prisma');
    const genSchemaPath = path.join(__dirname, 'node_modules', '.prisma', 'client', 'schema.prisma');
    const srcSchema = fs.existsSync(srcSchemaPath) ? fs.readFileSync(srcSchemaPath, 'utf8').replace(/\r\n/g, '\n').trim() : '';
    const genSchema = fs.existsSync(genSchemaPath) ? fs.readFileSync(genSchemaPath, 'utf8').replace(/\r\n/g, '\n').trim() : '';
    if (srcSchema && srcSchema !== genSchema) {
      console.log('🔄 Prisma schema updated — running `npx prisma generate` automatically...');
      execSync('npx prisma generate', { cwd: __dirname, stdio: 'inherit' });
    }
  } catch (err) {
    console.warn('Prisma auto-generate warning:', err.message);
  }
})();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const compression = require('compression');

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
const locationRoutes = require('./src/routes/location.routes');
const scheduleRoutes = require('./src/routes/schedule.routes');
const { errorHandler, notFound } = require('./src/middleware/error.middleware');

const app = express();
const PORT = process.env.PORT || 5000;

// Security
app.use(helmet({
  crossOriginResourcePolicy: false
}));

// CORS — unrestricted in development and explicitly allow all origins, headers & methods
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-CSRF-Token');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

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
app.use('/api/locations', locationRoutes);
app.use('/api/schedule', scheduleRoutes);

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

  // Always ensure additive columns from migrations 006 & 008 exist even if DB was already running
  try {
    const prisma = require('./src/lib/prisma');
    const additiveStatements = [
      'ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_region" TEXT',
      'ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_barangay" TEXT',
      'ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_region_code" TEXT',
      'ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_province_code" TEXT',
      'ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_city_code" TEXT',
      'ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_barangay_code" TEXT',
      'ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_address_source" TEXT NOT NULL DEFAULT \'MANUAL\'',
      'ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "estimated_delivery_start" TEXT',
      'ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "estimated_delivery_end" TEXT',
      'ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_zone" TEXT',
      'ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_schedule_source" TEXT NOT NULL DEFAULT \'UNAVAILABLE\'',
      'ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_holidays_observed" JSONB',
      'ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "region" TEXT',
      'ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "barangay" TEXT',
      'ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "region_code" TEXT',
      'ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "province_code" TEXT',
      'ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "city_code" TEXT',
      'ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "barangay_code" TEXT',
      'ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "address_source" TEXT NOT NULL DEFAULT \'MANUAL\''
    ];
    for (const stmt of additiveStatements) {
      await prisma.$executeRawUnsafe(stmt);
    }

    // Auto-seed on fresh/empty database using async spawn (never execFileSync, which would block PGLiteSocketServer's event loop)
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      const seedPath = path.join(__dirname, '../database/seeds/seed.js');
      if (fs.existsSync(seedPath)) {
        console.log('🌱 Empty database detected — seeding 7 roles, brands, and products...');
        const { spawn } = require('child_process');
        await new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [seedPath], { cwd: __dirname, stdio: 'inherit' });
          child.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Seed process exited with code ${code}`));
          });
          child.on('error', reject);
        });
      }
    }
  } catch (err) {
    console.warn('Additive schema sync warning:', err.message);
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
