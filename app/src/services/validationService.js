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

function nowIso() {
  return new Date().toISOString();
}

function issue(code, severity, message, path) {
  return { code, severity, message, path };
}

/**
 * Deterministic, Phase-1 validation.
 * No LLM. No repair. Pure governance checks.
 */
function validateInput({ domain_id, contract_version, input_payload }) {
  const issues = [];

  if (!domain_id || typeof domain_id !== 'string' || !domain_id.trim()) {
    issues.push(issue('DOMAIN_ID_REQUIRED', 'error', 'domain_id is required', '/domain_id'));
  }

  if (!contract_version || typeof contract_version !== 'string' || !contract_version.trim()) {
    issues.push(issue('CONTRACT_VERSION_REQUIRED', 'error', 'contract_version is required', '/contract_version'));
  }

  // Minimal payload requirement (we can tighten later)
  if (input_payload !== undefined) {
    const isObj = input_payload && typeof input_payload === 'object' && !Array.isArray(input_payload);
    if (!isObj) {
      issues.push(issue('INPUT_PAYLOAD_INVALID', 'error', 'input_payload must be an object', '/input_payload'));
    }
  }

  const pass = issues.filter(i => i.severity === 'error').length === 0;

  // Simple deterministic score
  // Start 100, subtract 40 per error, 10 per warning (we have only errors in MS04)
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const score = Math.max(0, 100 - (errorCount * 40));

  return {
    report_id: crypto.randomUUID(),
    domain_id: (domain_id || '').trim(),
    contract_version: (contract_version || '').trim(),
    pass,
    score,
    issues,
    created_at: nowIso()
  };
}

module.exports = { validateInput };
