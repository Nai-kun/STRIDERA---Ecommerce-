// Prisma Client Singleton with PostgreSQL Driver Adapter
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/stridera';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({ adapter });
} else {
  // Prevent multiple instances in development (hot-reload)
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      adapter,
      log: ['error', 'warn'],
    });
  }
  prisma = global.__prisma;
}

module.exports = prisma;
