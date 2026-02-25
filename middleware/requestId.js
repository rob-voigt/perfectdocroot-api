'use strict';

const crypto = require('crypto');

function requestIdMiddleware(req, res, next) {
  // Respect upstream request IDs if present (proxy/load balancer)
  const incoming = req.header('x-request-id');
  const requestId = incoming && incoming.trim() ? incoming.trim() : crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  next();
}

module.exports = { requestIdMiddleware };