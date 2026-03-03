'use strict';

function toErr(err) {
  if (!err) return undefined;
  return {
    name: err.name,
    message: err.message,
    stack: err.stack
  };
}

function base(service) {
  const env = process.env.NODE_ENV || 'development';
  return { service, env };
}

function log(service, level, event, fields = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...base(service),
    ...fields
  };
  // Keep stdout JSON-only (pm2 friendly)
  console.log(JSON.stringify(payload));
}

module.exports = {
  toErr,
  logInfo: (service, event, fields) => log(service, 'info', event, fields),
  logWarn: (service, event, fields) => log(service, 'warn', event, fields),
  logError: (service, event, fields) => log(service, 'error', event, fields),
  logDebug: (service, event, fields) => log(service, 'debug', event, fields)
};