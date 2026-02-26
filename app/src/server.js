'use strict';

const { app } = require('./app');
const { config } = require('./config');
const { pingDb } = require('./db/mysql');

const port = Number(process.env.PORT || config.port || 3000);

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