'use strict';

// ✅ dotenv bootstrap MUST happen first
const path = require('path');
const dotenv = require('dotenv');

const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
const envFileName = nodeEnv === 'production' ? '.env.production' : '.env.local';

// worker.js is app/scripts/worker.js → repo root is ../../
const envPath = path.resolve(__dirname, '..', '..', envFileName);

const result = dotenv.config({ path: envPath, override: true });
if (result.error) {
  console.warn('[worker:boot] dotenv not loaded:', envPath, '-', result.error.message);
} else {
  console.log('[worker:boot] dotenv loaded:', envPath);
}

const os = require('os');
const { pool } = require('../src/db/mysql');
const { claimNextRun, markRunFailed, requeueStaleRuns } = require('../src/services/runQueue');
const { processRun } = require('../src/execution/executionEngine');
const { logInfo, logWarn, logError, toErr } = require('../src/utils/logger');

const SERVICE = 'pdr-worker';

const { config } = require('../src/config');
console.log(`[worker] db_target host=${config.db.host} port=${config.db.port} user=${config.db.user} db=${config.db.database}`);

const WORKER_ID = process.env.PDR_WORKER_ID || `${os.hostname()}:${process.pid}`;
const POLL_MS = Number(process.env.PDR_WORKER_POLL_MS || 1000);
const REQUEUE_EVERY = Number(process.env.PDR_REQUEUE_EVERY_LOOPS || 30); // ~30s if POLL_MS=1000
const HEARTBEAT_EVERY = Number(process.env.PDR_HEARTBEAT_EVERY_LOOPS || 1);

async function heartbeat({ worker_id, poll_ms, requeue_every_loops }) {
  const host = os.hostname();
  const pid = process.pid;

  await pool.execute(
    `INSERT INTO worker_heartbeats (worker_id, host, pid, poll_ms, requeue_every_loops, last_seen_at)
     VALUES (?, ?, ?, ?, ?, NOW(3))
     ON DUPLICATE KEY UPDATE
       host=VALUES(host),
       pid=VALUES(pid),
       poll_ms=VALUES(poll_ms),
       requeue_every_loops=VALUES(requeue_every_loops),
       last_seen_at=NOW(3)`,
    [worker_id, host, pid, poll_ms, requeue_every_loops]
  );
}

let loops = 0;
let shuttingDown = false;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  logInfo(SERVICE, 'worker_started', {
    worker_id: WORKER_ID,
    host: os.hostname(),
    pid: process.pid,
    poll_ms: POLL_MS,
    requeue_every_loops: REQUEUE_EVERY
  });

  while (!shuttingDown) {
    loops += 1;

    if (HEARTBEAT_EVERY > 0 && loops % HEARTBEAT_EVERY === 0) {
  try {
    await heartbeat({ worker_id: WORKER_ID, poll_ms: POLL_MS, requeue_every_loops: REQUEUE_EVERY });
    // optional debug-level tick if you want it visible:
    // logDebug(SERVICE, 'worker_heartbeat', { worker_id: WORKER_ID });
  } catch (e) {
    logWarn(SERVICE, 'worker_heartbeat_failed', { worker_id: WORKER_ID, err: toErr(e) });
  }
}

    // MS15 reaper is disabled for MS14
    // if (REQUEUE_EVERY > 0 && loops % REQUEUE_EVERY === 0) {
    //   try {
    //     await requeueStaleRuns({ staleSeconds: 600, maxAttempts: 5 });
    //   } catch (e) {
    //     console.error('[worker] requeueStaleRuns error:', e && e.stack ? e.stack : e);
    //   }
    // }

    let runId = null;
    try {
      runId = await claimNextRun(WORKER_ID);
    } catch (e) {
      logError(SERVICE, 'claim_next_run_failed', { worker_id: WORKER_ID, err: toErr(e) });
      await sleep(POLL_MS);
      continue;
    }

    if (!runId) {
      await sleep(POLL_MS);
      continue;
    }

    try {
      await processRun(runId);
    } catch (e) {
      logError(SERVICE, 'process_run_failed', { worker_id: WORKER_ID, run_id: runId, err: toErr(e) });
      try {
        await markRunFailed(runId, e, WORKER_ID);
      } catch (e2) {
        logError(SERVICE, 'mark_run_failed_failed', { worker_id: WORKER_ID, run_id: runId, err: toErr(e2) });
      }
    }
  }

    logInfo(SERVICE, 'worker_started', {
    worker_id: WORKER_ID,
    host: os.hostname(),
    pid: process.pid,
    poll_ms: POLL_MS,
    requeue_every_loops: REQUEUE_EVERY
  });
}

process.on('SIGINT', () => { shuttingDown = true; });
process.on('SIGTERM', () => { shuttingDown = true; });

main().catch((e) => {
  logError(SERVICE, 'worker_fatal', { worker_id: WORKER_ID, err: toErr(e) });
  process.exit(1);
});