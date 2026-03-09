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
