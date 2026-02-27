'use strict';

const express = require('express');
const { validateInput } = require('../services/validationService');
const { requireApiKey } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

const router = express.Router();

router.post('/validate', requireApiKey, rateLimit({ windowMs: 60_000, max: 60 }), (req, res) => {
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

  const report = validateInput({ domain_id, contract_version, input_payload });

  return res.status(200).json({
    validation_report: report,
    requestId: req.requestId
  });
});

module.exports = { validateRouter: router };