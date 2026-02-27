'use strict';

const express = require('express');
const { config } = require('../config');
const { pool } = require('../db/mysql');

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

module.exports = { metaRouter: router };