'use strict';

const express = require('express');
const { createRun, getRun } = require('../services/runRepo');

const router = express.Router();

router.post('/runs', async (req, res, next) => {
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

    if (!domain_id) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'domain_id is required',
        requestId: req.requestId
      });
    }

    const run = await createRun({
      domain_id,
      contract_version,
      input_payload,
      correlation_id: req.requestId
    });
    return res.status(201).json({ run, requestId: req.requestId });
  } catch (err) {
    return next(err);
  }
});

router.get('/runs/:id', async (req, res, next) => {
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