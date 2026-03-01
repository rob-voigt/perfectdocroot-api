'use strict';

const express = require('express');
const router = express.Router();
const { processRun } = require('../execution/executionEngine');

const { createRun, getRun } = require('../services/runRepo');
const { requireApiKey } = require('../middleware/auth');

// Keep whichever rateLimit you already use in this project.
// Your current file uses: const { rateLimit } = require('../middleware/rateLimit');
const { rateLimit } = require('../middleware/rateLimit');

// MS13: step + mutation persistence reads
const { listRunSteps } = require('../models/runSteps.model');
const { listMutations } = require('../models/mutations.model');

// ----------------------------
// GET /runs/:id/steps
// ----------------------------
router.get(
  '/runs/:id/steps',
  requireApiKey,
  rateLimit({ windowMs: 60_000, max: 20 }),
  async (req, res, next) => {
    try {
      const run_id = req.params.id;
      const steps = await listRunSteps(run_id);
      return res.json({ run_id, steps });
    } catch (err) {
      return next(err);
    }
  }
);

// ----------------------------
// GET /runs/:id/mutations
// ----------------------------
router.get(
  '/runs/:id/mutations',
  requireApiKey,
  rateLimit({ windowMs: 60_000, max: 20 }),
  async (req, res, next) => {
    try {
      const run_id = req.params.id;
      const mutations = await listMutations(run_id);
      return res.json({ run_id, mutations });
    } catch (err) {
      return next(err);
    }
  }
);

// ----------------------------
// POST /runs
// ----------------------------
router.post(
  '/runs',
  requireApiKey,
  rateLimit({ windowMs: 60_000, max: 20 }),
  async (req, res, next) => {
    try {
      const body = req.body || {};

      const domain_id = typeof body.domain_id === 'string' ? body.domain_id.trim() : '';
      const contract_version =
        typeof body.contract_version === 'string' && body.contract_version.trim()
          ? body.contract_version.trim()
          : '0.1';

      const input_payload =
        body.input_payload && typeof body.input_payload === 'object' && !Array.isArray(body.input_payload)
          ? body.input_payload
          : {};

      const execution_mode =
        body.execution && typeof body.execution === 'object' && body.execution.mode === 'async'
          ? 'async'
          : 'sync';

      if (!domain_id) {
        return res.status(400).json({
          error: 'validation_error',
          message: 'domain_id is required',
          requestId: req.requestId
        });
      }


      // Extract repair config if present, else default
      const repair = typeof body.repair === 'object' && body.repair !== null
        ? body.repair
        : { enabled: false, max_attempts: 2 };

      const run = await createRun({
        domain_id,
        contract_version,
        input_payload,
        correlation_id: req.requestId,
        execution_mode,
        repair,
        // MS14: explicit initial status
        status: execution_mode === 'async' ? 'queued' : 'running'
      });

if (execution_mode === 'async') {
  return res.status(202).json({ run, requestId: req.requestId });
}

// sync: execute inline then return final persisted run
await processRun(run.id);
const finalRun = await getRun(run.id);

return res.status(201).json({ run: finalRun || run, requestId: req.requestId });
    } catch (err) {
      return next(err);
    }
  }
);

// ----------------------------
// GET /runs/:id
// ----------------------------
router.get('/runs/:id', requireApiKey, async (req, res, next) => {
  try {
    const run = await getRun(req.params.id);

    if (!run) {
      return res.status(404).json({
        error: 'not_found',
        message: 'run not found',
        requestId: req.requestId
      });
    }

    return res.status(200).json({ run, requestId: req.requestId });
  } catch (err) {
    return next(err);
  }
});

module.exports = { runsRouter: router };