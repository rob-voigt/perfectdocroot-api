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

const { pool } = require('../db/mysql');

function asSafeInt(n, fallback) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.max(0, Math.floor(x)) : fallback;
}

/**
 * Claims the next queued run for processing by this worker.
 * Race-safe via SELECT ... FOR UPDATE inside a transaction.
 * @param {string} workerId
 * @returns {Promise<string|null>} run_id or null if none claimed
 */
async function claimNextRun(workerId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT id
         FROM runs
        WHERE status = 'queued'
          AND locked_at IS NULL
          AND (next_attempt_at IS NULL OR next_attempt_at <= NOW(3))
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE`
    );

    if (!rows || rows.length === 0) {
      await conn.rollback();
      return null;
    }

    const runId = rows[0].id;

    const [result] = await conn.query(
      `UPDATE runs
          SET status = 'running',
              locked_at = NOW(3),
              locked_by = ?,
              attempts = attempts + 1
        WHERE id = ?
          AND status = 'queued'
          AND locked_at IS NULL
        LIMIT 1`,
      [workerId, runId]
    );

    if (!result || result.affectedRows === 0) {
      await conn.rollback();
      return null;
    }

    await conn.commit();
    return runId;
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Marks a run as failed, recording error info.
 * Note: we do NOT require locked_by match; worker may change ids, or orchestrator may not clear.
 */
async function markRunFailed(runId, err, workerId) {
  const lastError =
    err && err.stack ? String(err.stack) :
    err && err.message ? String(err.message) :
    String(err || 'Unknown error');

  await pool.execute(
    `UPDATE runs
        SET status = 'failed',
            completed_at = NOW(3),
            last_error = ?,
            locked_at = NULL,
            locked_by = NULL
      WHERE id = ?
      LIMIT 1`,
    [lastError.slice(0, 8000), runId]
  );
}

/**
 * Requeue stale running jobs and fail jobs that exceed max attempts.
 */
async function requeueStaleRuns({ staleSeconds = 600, maxAttempts = 5 } = {}) {
  const stale = asSafeInt(staleSeconds, 600);
  const maxA = Math.max(1, asSafeInt(maxAttempts, 5));

  // NOTE: Injecting stale as a validated integer is safe here.
  await pool.execute(
    `UPDATE runs
        SET status = 'queued',
            locked_at = NULL,
            locked_by = NULL,
            next_attempt_at = DATE_ADD(NOW(3), INTERVAL 30 SECOND),
            last_error = CONCAT(IFNULL(last_error,''), '\n[requeued] stale lock detected')
      WHERE status = 'running'
        AND locked_at IS NOT NULL
        AND locked_at < DATE_SUB(NOW(3), INTERVAL ${stale} SECOND)
        AND attempts < ?`,
    [maxA]
  );

    await pool.execute(
    `UPDATE runs
        SET status = 'failed',
            completed_at = NOW(3),
            last_error = CONCAT(IFNULL(last_error,''), '\n[failed] max attempts exceeded'),
            locked_at = NULL,
            locked_by = NULL
      WHERE status = 'running'
        AND locked_at IS NOT NULL
        AND attempts >= ?`,
    [maxA]
  );
}

module.exports = {
  claimNextRun,
  markRunFailed,
  requeueStaleRuns
};
