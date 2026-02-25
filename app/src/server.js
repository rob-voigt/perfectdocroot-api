'use strict';

const express = require('express');
const helmet = require('helmet');
const { config } = require('./config');
const { requestIdMiddleware } = require('./middleware/requestId');
const { healthRouter } = require('./routes/health.routes');
const { v1Router } = require('./routes/v1.routes');

const app = express();

// Basic hardening
app.disable('x-powered-by');
app.use(helmet());

// Request parsing with size limits (keep tight; can raise later)
app.use(express.json({ limit: '256kb' }));

// Correlation
app.use(requestIdMiddleware);

// Routes
app.use(healthRouter);
app.use('/v1', v1Router);

// 404 (consistent JSON)
app.use((req, res) => {
  res.status(404).json({
    error: 'not_found',
    path: req.path,
    requestId: req.requestId
  });
});

// Error handler (consistent JSON; never leak stack in production)
app.use((err, req, res, next) => {
  const status = err.statusCode || err.status || 500;

  const body = {
    error: 'internal_error',
    message: status === 500 ? 'Unexpected error' : err.message,
    requestId: req.requestId
  };

  // Helpful in dev only
  if (config.nodeEnv !== 'production' && err.stack) {
    body.stack = err.stack;
  }

  res.status(status).json(body);
});

if (require.main === module) {
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[${config.serviceName}] listening on port ${config.port} (${config.envName}, ${config.nodeEnv})`);
  });
}

module.exports = { app };