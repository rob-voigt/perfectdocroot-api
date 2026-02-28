'use strict';

const express = require('express');
const { runsRouter } = require('./runs.routes');
const { validateRouter } = require('./validate.routes');
const { artifactsRouter } = require('./artifacts.routes');
const { contractsRouter } = require('./contracts.routes');
const { metaRouter } = require('./meta.routes');
const { debugExecRouter } = require('./debugExec.routes');

const router = express.Router();

// v1 root stub
router.get('/', (req, res) => {
  res.status(200).json({
    message: 'PDR API v1 (MS02)',
    requestId: req.requestId
  });
});

// v1 routes
router.use(runsRouter);
router.use(validateRouter);
router.use(artifactsRouter);
router.use(contractsRouter);
router.use(metaRouter);
if (process.env.NODE_ENV !== 'production') {
  router.use('/debug-exec', debugExecRouter);
}
module.exports = { v1Router: router };