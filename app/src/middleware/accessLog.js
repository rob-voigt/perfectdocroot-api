'use strict';

const fs = require('fs');
const path = require('path');

const logDir = path.join(process.cwd(), 'logs');
const logFile = path.join(logDir, 'access.log');

function safeAppend(line) {
  try {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logFile, line + '\n', 'utf8');
  } catch (e) {
    // If file write fails, still try stderr
    try { console.error('ACCESSLOG_WRITE_FAIL', e); } catch (_) {}
  }
}

function accessLog(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration_ms = Date.now() - start;
    const ua = (req.get('user-agent') || '').slice(0, 200);

    const lineObj = {
      ts: new Date().toISOString(),
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms,
      ip: req.ip,
      ua
    };

    const line = JSON.stringify(lineObj);

    // Write to file (reliable) + stderr (nice-to-have)
    safeAppend(line);
    console.error(line);
  });

  next();
}

module.exports = { accessLog };