'use strict';

const crypto = require('crypto');
const { pool } = require('../db/mysql');
const { validateInput } = require('./validationService');

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

async function createRun({ domain_id, contract_version, input_payload }) {
  const id = crypto.randomUUID();
  const created_at_iso = nowIso();
  const validation_report = validateInput({ domain_id, contract_version, input_payload });

  // Phase 1: sync complete
  const status = 'complete';
  const completed_at_iso = nowIso();

  const result = {
    message: 'Run created (MS03 persisted stub)',
    input_payload
  };

  const created_at = isoToMysqlDatetime3(created_at_iso);
  const completed_at = isoToMysqlDatetime3(completed_at_iso);

  const sql = `
    INSERT INTO runs
      (id, status, domain_id, contract_version, input_payload, validation_report, result_json, created_at, completed_at)
    VALUES
      (:id, :status, :domain_id, :contract_version, :input_payload, :validation_report, :result_json, :created_at, :completed_at)
  `;

  await pool.execute(sql, {
    id,
    status,
    domain_id,
    contract_version,
    input_payload: JSON.stringify(input_payload),
    validation_report: JSON.stringify(validation_report),
    result_json: JSON.stringify(result),
    created_at,
    completed_at
  });

  return {
    id,
    status,
    domain_id,
    contract_version,
    created_at: created_at_iso,
    completed_at: completed_at_iso,
    validation_report,
    result
  };
}

async function getRun(id) {
  const [rows] = await pool.execute(
    `SELECT id, status, domain_id, contract_version, input_payload, validation_report, result_json, created_at, completed_at
     FROM runs WHERE id = ? LIMIT 1`,
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

  return {
    id: r.id,
    status: r.status,
    domain_id: r.domain_id,
    contract_version: r.contract_version,
    created_at: mysqlDatetime3ToIso(r.created_at),
    completed_at: r.completed_at ? mysqlDatetime3ToIso(r.completed_at) : null,
    validation_report,
    result
  };
}

module.exports = { createRun, getRun };