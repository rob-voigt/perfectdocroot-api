'use strict';

const crypto = require('crypto');
const { pool } = require('../db/mysql');

function uuidv4() {
  return crypto.randomUUID();
}

function safeJsonParse(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }
}

async function insertMutation({
  run_id,
  from_step_id,
  to_step_id,
  patch_json,
  summary_json = null,
}) {
  const id = uuidv4();

  const sql = `
    INSERT INTO mutations
      (id, run_id, from_step_id, to_step_id, patch_json, summary_json)
    VALUES
      (?, ?, ?, ?, ?, ?)
  `;

  await pool.execute(sql, [
    id,
    run_id,
    from_step_id,
    to_step_id,
    JSON.stringify(patch_json),
    summary_json ? JSON.stringify(summary_json) : null,
  ]);

  return { id };
}

async function listMutations(run_id) {
  const sql = `
    SELECT
      id, run_id, from_step_id, to_step_id,
      patch_json, summary_json, created_at
    FROM mutations
    WHERE run_id = ?
    ORDER BY created_at ASC
  `;

  const [rows] = await pool.execute(sql, [run_id]);

  return rows.map((r) => ({
    ...r,
    patch_json: safeJsonParse(r.patch_json),
    summary_json: safeJsonParse(r.summary_json),
  }));
}

module.exports = {
  insertMutation,
  listMutations,
};