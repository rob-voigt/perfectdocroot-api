'use strict';

const express = require('express');
const { requireApiKey } = require('../middleware/auth');
const executionEngine = require('../execution/executionEngine');

const router = express.Router();

router.post('/runs/:id/start-twice', requireApiKey, async (req, res) => {
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

module.exports = { debugExecRouter: router };
