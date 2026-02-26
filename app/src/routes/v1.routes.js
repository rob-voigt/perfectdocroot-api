'use strict';

const express = require('express');
const { runsRouter } = require('./runs.routes');
const { validateRouter } = require('./validate.routes');

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

module.exports = { v1Router: router };