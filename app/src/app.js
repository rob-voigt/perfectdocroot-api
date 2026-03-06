'use strict';

const express = require('express');
const helmet = require('helmet');
const { requestIdMiddleware } = require('./middleware/requestId');
const { healthRouter } = require('./routes/health.routes');
const { v1Router } = require('./routes/v1.routes');
const { accessLog } = require('./middleware/accessLog');
const { corsAllowlist } = require('./middleware/cors');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '256kb' }));

app.use(requestIdMiddleware);
app.use(accessLog);
app.use(corsAllowlist);

app.use(healthRouter);
app.use('/v1', v1Router);

app.use((req, res) => {
  res.status(404).json({
    error: 'not_found',
    message: 'Route not found',
    path: req.originalUrl,
    requestId: req.requestId
  });
});

app.use((err, req, res, next) => {
  console.error('ERR', req.requestId, err);

  const status = err.statusCode || err.status || 500;
  const payload = {
    error: err.code || (status === 500 ? 'internal_error' : 'bad_request'),
    message: status === 500 ? 'Unexpected error' : (err.message || 'Error'),
    requestId: req.requestId
  };

  if (Array.isArray(err.available_versions)) {
    payload.available_versions = err.available_versions;
  }

  res.status(status).json(payload);
});

module.exports = { app };