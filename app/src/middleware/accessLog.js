/*
Copyright 2026 Robert Scott Voigt

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
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
