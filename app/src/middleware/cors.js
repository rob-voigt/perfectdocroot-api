'use strict';

function corsAllowlist(req, res, next) {
  const raw = (process.env.PDR_CORS_ORIGINS || '').trim();
  if (!raw) return next(); // default deny: no CORS headers

  const allowed = raw.split(',').map(s => s.trim()).filter(Boolean);
  const origin = req.get('origin');

  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PDR-API-KEY');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  return next();
}

module.exports = { corsAllowlist };