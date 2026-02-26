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