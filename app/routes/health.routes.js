'use strict';

const express = require('express');
const { config } = require('../config');

const router = express.Router();

router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: config.serviceName,
    env: config.envName,
    nodeEnv: config.nodeEnv,
    timestamp: new Date().toISOString(),
    requestId: req.requestId
  });
});

module.exports = { healthRouter: router };