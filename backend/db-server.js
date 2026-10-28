const { PGlite } = require('@electric-sql/pglite');
const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
const path = require('path');
const fs = require('fs');

async function start() {
  const dbDir = path.join(__dirname, 'prisma', 'pgdata');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new PGlite(dbDir);
  const server = new PGLiteSocketServer({
    db,
    port: 5432,
    host: '127.0.0.1',
    maxConnections: 50
  });

  await server.start();
  console.log('🚀 PGlite PostgreSQL server listening on 127.0.0.1:5432 (maxConnections: 50)');
}

if (require.main === module) {
  start().catch((err) => {
    console.error('Failed to start DB server:', err);
    process.exit(1);
  });
}

module.exports = { start };
