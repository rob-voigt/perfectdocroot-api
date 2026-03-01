'use strict';

const crypto = require('crypto');
const uuidv4 = () => (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
const { pool } = require('../db/mysql');

/**
 * Inserts a run step into run_steps table.
 * Returns { id }.
 */
async function insertRunStep({
  run_id,
  seq,
  type,
  status,
  input_hash = null,
  output_hash = null,
  step_output_json = null,
  validation_report_json = null,
  meta_json = null,
}) {
  const id = uuidv4();

  const sql = `
    INSERT INTO run_steps
      (id, run_id, seq, type, status, input_hash, output_hash, step_output_json, validation_report_json, meta_json)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    id,
    run_id,
    seq,
    type,
    status,
    input_hash,
    output_hash,
    step_output_json ? JSON.stringify(step_output_json) : null,
    validation_report_json ? JSON.stringify(validation_report_json) : null,
    meta_json ? JSON.stringify(meta_json) : null,
  ];

  await pool.execute(sql, params);
  return { id };
}

function safeJsonParse(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }
}

async function listRunSteps(run_id) {
  const sql = `
    SELECT
      id, run_id, seq, type, status,
      input_hash, output_hash,
      step_output_json, validation_report_json, meta_json,
      created_at
    FROM run_steps
    WHERE run_id = ?
    ORDER BY seq ASC
  `;
  const [rows] = await pool.execute(sql, [run_id]);
  return rows;
}

async function listRunSteps(run_id) {
  const sql = `
    SELECT
      id, run_id, seq, type, status,
      input_hash, output_hash,
      step_output_json, validation_report_json, meta_json,
      created_at
    FROM run_steps
    WHERE run_id = ?
    ORDER BY seq ASC
  `;

  const [rows] = await pool.execute(sql, [run_id]);

  return rows.map((r) => ({
    ...r,
    step_output_json: safeJsonParse(r.step_output_json),
    validation_report_json: safeJsonParse(r.validation_report_json),
    meta_json: safeJsonParse(r.meta_json),
  }));
}

async function getLastRunStep(run_id) {
  const sql = `
    SELECT id, run_id, seq, type, status,
           input_hash, output_hash,
           created_at
    FROM run_steps
    WHERE run_id = ?
    ORDER BY seq DESC
    LIMIT 1
  `;

  const [rows] = await pool.execute(sql, [run_id]);
  return rows && rows.length ? rows[0] : null;
}

async function getNextSeq(run_id) {
  const last = await getLastRunStep(run_id);
  return last && typeof last.seq === 'number' ? last.seq + 1 : 1;
}

module.exports = {
  insertRunStep,
  listRunSteps,
  getLastRunStep,
  getNextSeq,
};