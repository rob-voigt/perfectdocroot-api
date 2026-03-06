'use strict';

const express = require('express');
const { requireApiKey } = require('../middleware/auth');
const { listContracts, listContractsByDomain, getContract, upsertContract } = require('../services/contractRepo');

const router = express.Router();

router.get('/contracts', requireApiKey, async (req, res, next) => {
  try {
    const contracts = await listContracts();
    return res.status(200).json({ contracts, requestId: req.requestId });
  } catch (err) { next(err); }
});

router.get('/contracts/:domain_id', requireApiKey, async (req, res, next) => {
  try {
    const rows = await listContractsByDomain({ domain_id: req.params.domain_id });

    if (!rows.length) {
      return res.status(404).json({
        error: 'not_found',
        message: 'No contracts found for domain',
        requestId: req.requestId
      });
    }

    return res.status(200).json({
      domain_id: req.params.domain_id,
      versions: rows,
      requestId: req.requestId
    });
  } catch (err) { next(err); }
});

router.get('/contracts/:domain_id/:contract_version', requireApiKey, async (req, res, next) => {
  try {
    const contract = await getContract({
      domain_id: req.params.domain_id,
      contract_version: req.params.contract_version
    });

    if (!contract) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Contract not found',
        requestId: req.requestId
      });
    }

    return res.status(200).json({ contract, requestId: req.requestId });
  } catch (err) { next(err); }
});

// Admin-only: upsert contract
router.post('/contracts', requireApiKey, async (req, res, next) => {
  try {
    const { domain_id, contract_version, schema_json } = req.body || {};
    if (!domain_id || !contract_version || !schema_json) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'domain_id, contract_version, schema_json are required',
        requestId: req.requestId
      });
    }

    const saved = await upsertContract({ domain_id, contract_version, schema_json });
    return res.status(201).json({ contract: saved, requestId: req.requestId });
  } catch (err) {
    if (err && err.code === 'CONTRACT_VERSION_EXISTS') {
      return res.status(409).json({
        error: 'conflict',
        message: 'Contract version already exists',
        requestId: req.requestId
      });
    }
    next(err);
  }
});

module.exports = { contractsRouter: router };