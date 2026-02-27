'use strict';

// Very small in-memory limiter.
// Good enough for api-dev. Phase 2 can replace with Redis/WAF.
const buckets = new Map();

function rateLimit({ windowMs = 60_000, max = 30 } = {}) {
  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const item = buckets.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > item.resetAt) {
      item.count = 0;
      item.resetAt = now + windowMs;
    }

    item.count += 1;
    buckets.set(key, item);

    if (item.count > max) {
      return res.status(429).json({
        error: 'rate_limited',
        message: 'Too many requests',
        requestId: req.requestId
      });
    }

    return next();
  };
}

module.exports = { rateLimit };