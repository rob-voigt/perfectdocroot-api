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

const express = require('express');
const { config } = require('../config');
const { pool } = require('../db/mysql');
const { requireApiKey } = require('../middleware/auth');
const executionEngine = require('../execution/executionEngine');

const router = express.Router();

router.get('/meta', async (req, res, next) => {
  try {
    // Light DB ping (fast)
    let db_ok = false;
    try {
      await pool.execute('SELECT 1');
      db_ok = true;
    } catch (e) {
      db_ok = false;
    }

    const uptime_seconds = Math.floor(process.uptime());

    return res.status(200).json({
      meta: {
        service: config.serviceName || 'pdr-api',
        env: process.env.PDR_ENV || '',
        api_version: config.apiVersion || '0.1',
        build_sha: config.buildSha || '',
        runtime: config.runtime || '',
        node: process.version,
        uptime_seconds,
        db_ok
      },
      requestId: req.requestId
    });
  } catch (err) {
    next(err);
  }
});

if (process.env.NODE_ENV !== 'production') {
  router.get('/meta/idempotence/:id', requireApiKey, async (req, res) => {
    const run_id = req.params.id;

    try {
      const settled = await Promise.allSettled([
        executionEngine.start(run_id),
        executionEngine.start(run_id)
      ]);

      const results = settled.map((r) => ({
        status: r.status,
        reason: r.status === 'rejected' ? (r.reason?.message || String(r.reason)) : null
      }));

      return res.status(200).json({ run_id, results, requestId: req.requestId });
    } catch (err) {
      const results = [{ status: 'rejected', reason: err?.message || 'Unknown error' }];
      return res.status(200).json({ run_id, results, requestId: req.requestId });
    }
  });

}

module.exports = { metaRouter: router };
