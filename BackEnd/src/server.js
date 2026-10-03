'use strict';
const config = require('./config');
const db = require('./db');
const { createApp } = require('./app');

const app = createApp({ db });

const server = app.listen(config.port, () => {
  console.log(`raaaa-api listening on port ${config.port} (${config.env})`);
  if (!db.isConfigured()) {
    console.warn('DATABASE_URL is not set - database routes will report not_configured');
  }
});

function shutdown() {
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
