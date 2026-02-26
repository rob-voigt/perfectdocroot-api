'use strict';

const crypto = require('crypto');

// TEMPORARY MS02 STORE (in-memory).
// MS03 will replace with DB persistence.
const runs = new Map();

function nowIso() {
  return new Date().toISOString();
}

function createRun({ domain_id, contract_version, input_payload }) {
  const id = crypto.randomUUID();
  const created_at = nowIso();

  // Phase 1: synchronous “complete” run (no governance yet)
  const status = 'complete';
  const completed_at = nowIso();

  const run = {
    id,
    status,
    domain_id,
    contract_version,
    created_at,
    completed_at,
    // Placeholder for future MS04 validation/provenance/artifacts
    result: {
      message: 'Run created (MS02 stub)',
      input_payload
    }
  };

  runs.set(id, run);
  return run;
}

function getRun(id) {
  return runs.get(id) || null;
}

module.exports = { createRun, getRun };