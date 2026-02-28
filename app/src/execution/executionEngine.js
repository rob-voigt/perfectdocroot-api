'use strict';

const { pool } = require('../db/mysql');
const { executeRun } = require('../services/runOrchestrator');

let activeRuns = 0;

function maxConcurrentRuns() {
  const raw = Number(process.env.MAX_CONCURRENT_RUNS || 5);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5;
}

function retryDelayMs() {
  const raw = Number(process.env.EXEC_ENGINE_RETRY_MS || 250);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 250;
}

function log(event, fields = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

function enqueue(run_id) {
  log('run_enqueued', { run_id });

  setImmediate(() => {
    start(run_id).catch((err) => log('run_failed', { run_id, error: err?.message }));
  });
}

async function start(run_id) {
  if (activeRuns >= maxConcurrentRuns()) {
    log('run_start_delayed_concurrency', {
      run_id,
      active_runs: activeRuns,
      max_concurrent_runs: maxConcurrentRuns()
    });

    setTimeout(() => {
      start(run_id).catch((err) => log('run_failed', { run_id, error: err?.message }));
    }, retryDelayMs());

    return;
  }

  let acquiredSlot = false;

  try {
    const [result] = await pool.execute(
      `UPDATE runs SET status = 'running' WHERE id = ? AND status = 'queued' LIMIT 1`,
      [run_id]
    );

    if (!result || result.affectedRows === 0) {
      log('run_start_skipped_not_queued', { run_id });
      return;
    }

    activeRuns += 1;
    acquiredSlot = true;

    log('run_started', { run_id });

    await executeRun(run_id);

    log('run_completed', { run_id });
  } catch (err) {
    log('run_failed', { run_id, error: err?.message });
  } finally {
    if (acquiredSlot) {
      activeRuns = Math.max(0, activeRuns - 1);
    }
  }
}

module.exports = { enqueue, start };
