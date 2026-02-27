'use strict';

const express = require('express');
const helmet = require('helmet');
const { requestIdMiddleware } = require('./middleware/requestId');
const { healthRouter } = require('./routes/health.routes');
const { v1Router } = require('./routes/v1.routes');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '256kb' }));
app.use(requestIdMiddleware);

app.use(healthRouter);
app.use('/v1', v1Router);

app.use((req, res) => {
  res.status(404).json({
    error: 'not_found',
    path: req.path,
    requestId: req.requestId
  });
});

app.use((err, req, res, next) => {
  console.error('ERR', req.requestId, err);

  const status = err.statusCode || err.status || 500;
  res.status(status).json({
    error: 'internal_error',
    message: status === 500 ? 'Unexpected error' : err.message,
    requestId: req.requestId
  });
});

module.exports = { app };