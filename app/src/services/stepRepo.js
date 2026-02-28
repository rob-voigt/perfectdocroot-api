'use strict';

const crypto = require('crypto');
const { pool } = require('../db/mysql');

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
  const d = dt instanceof Date ? dt : new Date(dt);
  return d.toISOString();
}

async function createStep({ run_id, step_type, status = 'queued', attempt_number = 1, metadata = null }) {
  const id = crypto.randomUUID();
  const created_at_iso = nowIso();

  await pool.execute(
    `INSERT INTO steps
       (id, run_id, step_type, status, attempt_number, metadata_json, created_at)
     VALUES
       (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      run_id,
      step_type,
      status,
      attempt_number,
      metadata ? JSON.stringify(metadata) : null,
      isoToMysqlDatetime3(created_at_iso)
    ]
  );

  return { id, created_at_iso };
}

async function updateStep({ id, status, input_hash = null, output_hash = null, error_code = null, error_message = null, metadata = null }) {
  const completed_at_iso = nowIso();

  await pool.execute(
    `UPDATE steps
        SET status = ?,
            input_hash = ?,
            output_hash = ?,
            error_code = ?,
            error_message = ?,
            metadata_json = ?,
            completed_at = ?
      WHERE id = ?
      LIMIT 1`,
    [
      status,
      input_hash,
      output_hash,
      error_code,
      error_message,
      metadata ? JSON.stringify(metadata) : null,
      isoToMysqlDatetime3(completed_at_iso),
      id
    ]
  );

  return { completed_at_iso };
}

async function listStepsByRun(run_id) {
  const [rows] = await pool.execute(
    `SELECT id, run_id, step_type, status, attempt_number,
            input_hash, output_hash, error_code, error_message,
            metadata_json, created_at, completed_at
       FROM steps
      WHERE run_id = ?
      ORDER BY created_at ASC`,
    [run_id]
  );

  return (rows || []).map((r) => ({
    id: r.id,
    run_id: r.run_id,
    step_type: r.step_type,
    status: r.status,
    attempt_number: r.attempt_number,
    input_hash: r.input_hash,
    output_hash: r.output_hash,
    error_code: r.error_code,
    error_message: r.error_message,
    metadata: r.metadata_json ? (typeof r.metadata_json === 'string' ? JSON.parse(r.metadata_json) : r.metadata_json) : null,
    created_at: r.created_at ? mysqlDatetime3ToIso(r.created_at) : null,
    completed_at: r.completed_at ? mysqlDatetime3ToIso(r.completed_at) : null
  }));
}

async function getLatestStep(run_id) {
  const [rows] = await pool.execute(
    `SELECT id, step_type, status, attempt_number, created_at
       FROM steps
      WHERE run_id = ?
      ORDER BY created_at DESC
      LIMIT 1`,
    [run_id]
  );

  if (!rows || rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    step_type: r.step_type,
    status: r.status,
    attempt_number: r.attempt_number,
    created_at: r.created_at ? mysqlDatetime3ToIso(r.created_at) : null
  };
}

module.exports = { createStep, updateStep, listStepsByRun, getLatestStep };