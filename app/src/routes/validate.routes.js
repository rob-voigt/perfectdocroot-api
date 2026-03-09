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

const crypto = require('crypto');
const express = require('express');
const { getContract } = require('../services/contractRepo');
const { validateAgainstSchema } = require('../services/schemaValidate');
const { requireApiKey } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

const router = express.Router();

router.post('/validate', requireApiKey, rateLimit({ windowMs: 60_000, max: 60 }), async (req, res, next) => {
  try {
    const body = req.body || {};

    const domain_id = typeof body.domain_id === 'string' ? body.domain_id.trim() : '';
    const contract_version = typeof body.contract_version === 'string' ? body.contract_version.trim() : '';
    const input_payload = body.input_payload;

    if (!domain_id) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'domain_id is required',
        requestId: req.requestId
      });
    }

    if (!contract_version) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'contract_version is required',
        requestId: req.requestId
      });
    }

    if (!input_payload || typeof input_payload !== 'object' || Array.isArray(input_payload)) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'input_payload must be an object',
        requestId: req.requestId
      });
    }

    const contract = await getContract({ domain_id, contract_version });

    if (!contract) {
      return res.status(400).json({
        error: 'contract_not_found',
        message: 'Contract not found for domain_id and contract_version',
        requestId: req.requestId
      });
    }

    const { ok, issues } = validateAgainstSchema(contract.schema_json, input_payload);
    const pass = ok;
    const score = pass ? 100 : Math.max(0, 100 - issues.length * 10);

    const validation_report = {
      report_id: crypto.randomUUID(),
      domain_id,
      contract_version,
      pass,
      score,
      issues,
      created_at: new Date().toISOString()
    };

    return res.status(200).json({
      validation_report,
      requestId: req.requestId
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = { validateRouter: router };
