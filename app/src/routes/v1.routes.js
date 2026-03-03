'use strict';

const express = require('express');
const { runsRouter } = require('./runs.routes');
const { validateRouter } = require('./validate.routes');
const { artifactsRouter } = require('./artifacts.routes');
const { contractsRouter } = require('./contracts.routes');
const { metaRouter } = require('./meta.routes');
const { debugExecRouter } = require('./debugExec.routes');
const { uploadedArtifactsRouter } = require('./uploadedArtifacts.routes');

const router = express.Router();

// v1 root stub
router.get('/', (req, res) => {
  res.status(200).json({
    message: 'PDR API v1 (MS02)',
    requestId: req.requestId
  });
});

router.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'pdr-api',
    ts: new Date().toISOString()
  });
});

router.get('/ping2', (req, res) => {
  res.status(200).json({ ok: true, route: '/v1/ping2', ts: new Date().toISOString() });
});

router.get('/worker/status', (req, res) => {
  res.status(200).json({
    ok: true,
    ts: new Date().toISOString(),
    note: 'stub: implement heartbeats + LiteSpeed forwarding to use this endpoint'
  });

  router.get('/worker-status', async (req, res) => {
  // return whatever you intended for /v1/worker/status
  res.status(200).json({
    ok: true,
    ts: new Date().toISOString(),
    note: 'temporary endpoint until LiteSpeed forwards /v1/worker/*'
  });
});

  res.status(200).json({
    ok: true,
    ts: new Date().toISOString(),
    recent_workers: rows
  });
});

// v1 routes
router.use(runsRouter);
router.use(validateRouter);
router.use(artifactsRouter);
router.use(contractsRouter);
router.use(metaRouter);
router.use(uploadedArtifactsRouter);
if (process.env.NODE_ENV !== 'production') {
  router.use('/debug-exec', debugExecRouter);
}
module.exports = { v1Router: router };