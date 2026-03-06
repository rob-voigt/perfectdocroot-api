'use strict';

const path = require('path');
const dotenv = require('dotenv');

// Deterministic env file selection
const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
const envFileName = nodeEnv === 'production' ? '.env.production' : '.env.local';

// Anchor to project root (server.js is app/src/server.js)
const envPath = path.resolve(__dirname, '..', '..', envFileName);

// Load env (quietly if file missing, but logs once so you can verify)
const result = dotenv.config({ path: envPath, override: true });
if (result.error) {
  console.warn('[boot] dotenv not loaded:', envPath, '-', result.error.message);
} else {
  console.log('[boot] dotenv loaded:', envPath);
}

console.log('[boot] env snapshot', {
  NODE_ENV: process.env.NODE_ENV,
  DB_HOST: process.env.DB_HOST,
  DB_USER: process.env.DB_USER,
  DB_NAME: process.env.DB_NAME,
  DB_PORT: process.env.DB_PORT,
  pass_set: Boolean((process.env.DB_PASS || '').trim())
});

const { app } = require('./app');
const { config } = require('./config');
const { pingDb } = require('./db/mysql');

const port = Number(process.env.PORT || config.port || 3000);

console.log('[boot] PDR_API_KEY present?', Boolean((process.env.PDR_API_KEY || '').trim()));

// IMPORTANT: under Passenger, server.js may be loaded in a way where
// require.main checks are unreliable. Always listen.
(async () => {
  await pingDb();
  app.listen(port, () => {
    console.log(`[${config.serviceName}] listening on port ${port} (${config.envName}, ${config.nodeEnv})`);
  });
})().catch((err) => {
  console.error('BOOT: DB ping failed', err);
  process.exit(1);
});