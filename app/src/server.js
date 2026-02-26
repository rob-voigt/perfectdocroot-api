'use strict';

const { app } = require('./app');
const { config } = require('./config');

const port = Number(process.env.PORT || config.port || 3000);

// IMPORTANT: under Passenger, server.js may be loaded in a way where
// require.main checks are unreliable. Always listen.
app.listen(port, () => {
  console.log(`[${config.serviceName}] listening on port ${port} (${config.envName}, ${config.nodeEnv})`);
});