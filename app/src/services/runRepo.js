'use strict';

const { sha256HexFromObject } = require('../utils/hash');
const { config } = require('../config');

const crypto = require('crypto');
const { pool } = require('../db/mysql');
const { validateInput } = require('./validationService');
const { createArtifact } = require('./artifactRepo');

function nowIso() {
  return new Date().toISOString();
}

// MySQL DATETIME(3) expects 'YYYY-MM-DD HH:MM:SS.mmm'
function isoToMysqlDatetime3(iso) {
  const d = new Date(iso);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const yyyy = d.getUTCFullYear();
  const mm = pad(d.getUTCMonth() + 1);
  const dd = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mi = pad(d.getUTCMinutes());
  const ss = pad(d.getUTCSeconds());
  const ms = pad(d.getUTCMilliseconds(), 3);
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}.${ms}`;
}

function mysqlDatetime3ToIso(dt) {
  // dt may be Date or string depending on mysql2 settings
  const d = dt instanceof Date ? dt : new Date(dt);
  return d.toISOString();
}

async function createRun({ domain_id, contract_version, input_payload, correlation_id }) {
  const id = crypto.randomUUID();
  const created_at_iso = nowIso();

  // Phase 1: sync complete
  const status = 'complete';
  const completed_at_iso = nowIso();

  // Validation (full report stored for audit)
  const validation_report = validateInput({ domain_id, contract_version, input_payload });

  // Result (update message to reflect MS05)
  const result = {
    message: 'Run created (MS06 artifacts emitted)',
    input_payload
  };

  // Deterministic hashes:
  // IMPORTANT: do NOT include report_id or created_at in hashed output.
  const input_for_hash = { domain_id, contract_version, input_payload };
  const input_hash = sha256HexFromObject(input_for_hash);

  const output_for_hash = {
    validation: {
      pass: validation_report.pass,
      score: validation_report.score,
      issues: validation_report.issues
    },
    result
  };
  const output_hash = sha256HexFromObject(output_for_hash);

  const provenance = {
    api_version: config.apiVersion || '0.1',
    build_sha: config.buildSha || '',
    runtime: config.runtime || '',
    node: process.version,
    timings: {
      created_at: created_at_iso,
      completed_at: completed_at_iso
    }
  };

  const created_at = isoToMysqlDatetime3(created_at_iso);
  const completed_at = isoToMysqlDatetime3(completed_at_iso);

  const sql = `
    INSERT INTO runs
      (id, correlation_id, input_hash, output_hash,
       status, domain_id, contract_version,
       input_payload, result_json, validation_report, provenance,
       created_at, completed_at)
    VALUES
      (:id, :correlation_id, :input_hash, :output_hash,
       :status, :domain_id, :contract_version,
       :input_payload, :result_json, :validation_report, :provenance,
       :created_at, :completed_at)
  `;

  await pool.execute(sql, {
    id,
    correlation_id: correlation_id || null,
    input_hash,
    output_hash,
    status,
    domain_id,
    contract_version,
    input_payload: JSON.stringify(input_payload),
    result_json: JSON.stringify(result),
    validation_report: JSON.stringify(validation_report),
    provenance: JSON.stringify(provenance),
    created_at,
    completed_at
  });

  await createArtifact({
    run_id: id,
    artifact_type: 'validation_report',
    content: validation_report
  });

  return {
    id,
    correlation_id: correlation_id || null,
    input_hash,
    output_hash,
    status,
    domain_id,
    contract_version,
    created_at: created_at_iso,
    completed_at: completed_at_iso,
    validation_report,
    provenance,
    result
  };
}

async function getRun(id) {
  const [rows] = await pool.execute(
    `SELECT id, correlation_id, input_hash, output_hash,
            status, domain_id, contract_version,
            input_payload, result_json, validation_report, provenance,
            created_at, completed_at
     FROM runs
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  if (!rows || rows.length === 0) return null;

  const r = rows[0];

  const input_payload =
    r.input_payload ? (typeof r.input_payload === 'string' ? JSON.parse(r.input_payload) : r.input_payload) : {};

  const result =
    r.result_json ? (typeof r.result_json === 'string' ? JSON.parse(r.result_json) : r.result_json) : null;

  const validation_report =
    r.validation_report
      ? (typeof r.validation_report === 'string' ? JSON.parse(r.validation_report) : r.validation_report)
      : null;

  const provenance =
    r.provenance ? (typeof r.provenance === 'string' ? JSON.parse(r.provenance) : r.provenance) : null;

  return {
    id: r.id,
    correlation_id: r.correlation_id,
    input_hash: r.input_hash,
    output_hash: r.output_hash,
    status: r.status,
    domain_id: r.domain_id,
    contract_version: r.contract_version,
    created_at: mysqlDatetime3ToIso(r.created_at),
    completed_at: r.completed_at ? mysqlDatetime3ToIso(r.completed_at) : null,
    validation_report,
    provenance,
    result
  };
}

module.exports = { createRun, getRun };