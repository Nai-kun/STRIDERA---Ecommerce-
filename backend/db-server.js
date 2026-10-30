const { PGlite } = require('@electric-sql/pglite');
const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
const path = require('path');
const fs = require('fs');
const os = require('os');

async function start() {
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

  const db = new PGlite(dbDir);
  const server = new PGLiteSocketServer({
    db,
    port: 5432,
    host: '127.0.0.1',
    maxConnections: 50
  });

  await server.start();
  console.log(`🚀 PGlite PostgreSQL server listening on 127.0.0.1:5432 (storage: ${dbDir})`);
}

if (require.main === module) {
  start().catch((err) => {
    console.error('Failed to start DB server:', err);
    process.exit(1);
  });
}

module.exports = { start };
