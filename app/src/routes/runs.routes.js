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
const router = express.Router();
const { processRun } = require('../execution/executionEngine');
const { pool } = require('../db/mysql');

const { createRun, getRun } = require('../services/runRepo');
const { requireApiKey } = require('../middleware/auth');

// Keep whichever rateLimit you already use in this project.
// Your current file uses: const { rateLimit } = require('../middleware/rateLimit');
const { rateLimit } = require('../middleware/rateLimit');

// MS13: step + mutation persistence reads
const { listRunSteps } = require('../models/runSteps.model');
const { listMutations } = require('../models/mutations.model');

// ----------------------------
// MS15A: inputs[] validation helpers
// ----------------------------
function isSha256Hex(s) {
  return typeof s === 'string' && /^[a-f0-9]{64}$/i.test(s);
}

function validateInputsArray(inputs) {
  if (!Array.isArray(inputs)) return 'inputs must be an array';
  if (inputs.length < 1) return 'inputs must contain at least 1 item';
  if (inputs.length > 25) return 'inputs must contain at most 25 items';

  let inlineBytes = 0;

  for (let i = 0; i < inputs.length; i++) {
    const item = inputs[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return `inputs[${i}] must be an object`;
    }

    const type = item.type;
    if (type !== 'artifact_ref' && type !== 'inline_text') {
      return `inputs[${i}].type must be one of: artifact_ref, inline_text`;
    }

    if (type === 'artifact_ref') {
      if (typeof item.artifact_id !== 'string' || !item.artifact_id.trim()) {
        return `inputs[${i}].artifact_id is required for artifact_ref`;
      }

      if (item.expect && typeof item.expect === 'object' && item.expect.content_hash != null) {
        if (!isSha256Hex(item.expect.content_hash)) {
          return `inputs[${i}].expect.content_hash must be a 64-char hex sha256`;
        }
      }
    }

    if (type === 'inline_text') {
      if (typeof item.name !== 'string' || !item.name.trim()) {
        return `inputs[${i}].name is required for inline_text`;
      }
      if (typeof item.content !== 'string') {
        return `inputs[${i}].content is required for inline_text`;
      }
      inlineBytes += Buffer.byteLength(item.content, 'utf8');
    }
  }

  if (inlineBytes > 50_000) return 'inline_text content exceeds 50KB limit';
  return null;
}

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
        typeof body.contract_version === 'string'
          ? body.contract_version.trim()
          : '';

      const input_payload =
        body.input_payload && typeof body.input_payload === 'object' && !Array.isArray(body.input_payload)
          ? body.input_payload
          : {};

      // MS15A: optional evidence inputs[] envelope
      const inputs = Array.isArray(body.inputs) ? body.inputs : null;

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

      if (inputs) {
        const inputsErr = validateInputsArray(inputs);
        if (inputsErr) {
          return res.status(400).json({
            error: 'validation_error',
            message: inputsErr,
            requestId: req.requestId
          });
        }
      }

      // Extract repair config if present, else default
      const repair =
        typeof body.repair === 'object' && body.repair !== null ? body.repair : { enabled: false, max_attempts: 2 };

      // MS15A: if inputs[] is present, store envelope in input_payload
      const stored_input_payload = inputs ? { input_payload, inputs } : input_payload;

      const run = await createRun({
        domain_id,
        contract_version,
        input_payload: stored_input_payload,
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
// GET /runs/worker-status
// ----------------------------
router.get('/runs/worker-status', requireApiKey, async (req, res, next) => {
  try {
    const activeWindowMs = Number(process.env.PDR_WORKER_ACTIVE_WINDOW_MS || 15000);
    const failedRecentMinutes = Number(process.env.PDR_FAILED_RECENT_MINUTES || 60);

    // Active workers = heartbeat within window
    const [workers] = await pool.execute(
      `
      SELECT worker_id, host, pid, poll_ms, requeue_every_loops, last_seen_at
      FROM worker_heartbeats
      WHERE last_seen_at >= (NOW(3) - INTERVAL ? MICROSECOND)
      ORDER BY last_seen_at DESC
      `,
      [activeWindowMs * 1000]
    );

    // Counts
    const [[queuedRow]] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM runs WHERE status='queued'`
    );

    const [[runningRow]] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM runs WHERE status='running'`
    );

    const [[failedRecentRow]] = await pool.execute(
      `
      SELECT COUNT(*) AS cnt
      FROM runs
      WHERE status='failed'
        AND completed_at >= (NOW(3) - INTERVAL ? MINUTE)
      `,
      [failedRecentMinutes]
    );

    return res.status(200).json({
      ok: true,
      ts: new Date().toISOString(),
      active_window_ms: activeWindowMs,
      failed_recent_minutes: failedRecentMinutes,
      active_workers: workers,
      counts: {
        queued: Number(queuedRow?.cnt || 0),
        running: Number(runningRow?.cnt || 0),
        failed_recent: Number(failedRecentRow?.cnt || 0)
      }
    });
  } catch (err) {
    return next(err);
  }
});

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
