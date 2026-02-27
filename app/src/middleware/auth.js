'use strict';

const { config } = require('../config');

function requireApiKey(req, res, next) {
  const expected = (process.env.PDR_API_KEY || '').trim();
  const got = (req.header('X-PDR-API-KEY') || '').trim();

  // If key not configured, fail closed (safer)
  if (!expected) {
    return res.status(500).json({
      error: 'server_misconfigured',
      message: 'API key not configured',
      requestId: req.requestId
    });
  }

  if (!got || got !== expected) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Missing or invalid API key',
      requestId: req.requestId
    });
  }

  return next();
}

module.exports = { requireApiKey };