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
