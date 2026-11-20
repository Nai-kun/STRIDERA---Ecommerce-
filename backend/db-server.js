const { PGlite } = require('@electric-sql/pglite');
const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

async function start(options = {}) {
  // Use a local path in user profile to avoid OneDrive sync lock conflicts
  const dbDir = path.join(os.homedir(), '.stridera-db');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Remove any stale lock file from previous process crashes
  const pidFile = path.join(dbDir, 'postmaster.pid');
  if (fs.existsSync(pidFile)) {
    try {
      fs.unlinkSync(pidFile);
      console.log('🧹 Cleaned up stale postmaster.pid from previous session');
    } catch (e) {
      console.warn('Warning: Could not remove postmaster.pid:', e.message);
    }
  }

  // Start clean if reset requested
  if (options.resetNewTables) {
    try {
      fs.rmSync(dbDir, { recursive: true, force: true });
      fs.mkdirSync(dbDir, { recursive: true });
    } catch (e) {
      console.warn('Could not reset dbDir:', e.message);
    }
  }

  const db = new PGlite(dbDir);

  // Ensure all baseline migrations (001, 002, 003) are applied idempotently
  const migrations = [
    '001_initial_schema.sql',
    '002_multi_seller.sql',
    '003_seven_roles_and_enterprise_portals.sql'
  ];

  for (const migFile of migrations) {
    const migPath = path.join(__dirname, '../database/migrations', migFile);
    if (fs.existsSync(migPath)) {
      try {
        const sql = fs.readFileSync(migPath, 'utf8');
        await db.exec(sql);
      } catch (migErr) {
        console.warn(`Migration ${migFile} check:`, migErr.message);
      }
    }
  }

  const server = new PGLiteSocketServer({
    db,
    port: 5432,
    host: '127.0.0.1',
    maxConnections: 50
  });

  await server.start();
  console.log(`🚀 PGlite PostgreSQL server listening on 127.0.0.1:5432 (storage: ${dbDir})`);
  return { db, server };
}

if (require.main === module) {
  const shouldSeed = process.argv.includes('--seed');
  const shouldReset = process.argv.includes('--reset-new');
  start({ resetNewTables: shouldReset })
    .then(({ db, server }) => {
      if (shouldSeed) {
        const seedPath = path.join(__dirname, '../database/seeds/seed.js');
        const child = spawn(process.execPath, [seedPath], { stdio: 'inherit' });
        child.on('exit', async (code) => {
          await server.stop();
          await db.close();
          process.exit(code || 0);
        });
      }
    })
    .catch((err) => {
      console.error('Failed to start DB server:', err);
      process.exit(1);
    });
}

module.exports = { start };
