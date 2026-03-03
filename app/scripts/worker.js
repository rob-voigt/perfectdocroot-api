'use strict';

const os = require('os');
const { pool } = require('../src/db/mysql');
const { claimNextRun, markRunFailed, requeueStaleRuns } = require('../src/services/runQueue');
const { processRun } = require('../src/execution/executionEngine');

const WORKER_ID = process.env.PDR_WORKER_ID || `${os.hostname()}:${process.pid}`;
const POLL_MS = Number(process.env.PDR_WORKER_POLL_MS || 1000);
const REQUEUE_EVERY = Number(process.env.PDR_REQUEUE_EVERY_LOOPS || 30); // ~30s if POLL_MS=1000

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

  console.log(`[worker] start worker_id=${WORKER_ID} poll_ms=${POLL_MS}`);
  console.log('[worker] MS15 reaper is disabled for MS14');

  while (!shuttingDown) {
    loops += 1;

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
      console.error('[worker] claimNextRun error:', e && e.stack ? e.stack : e);
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
      console.error('[worker] processRun error:', runId, e && e.stack ? e.stack : e);
      try {
        await markRunFailed(runId, e, WORKER_ID);
      } catch (e2) {
        console.error('[worker] markRunFailed error:', runId, e2 && e2.stack ? e2.stack : e2);
      }
    }
  }

  console.log('[worker] shutdown');
}

process.on('SIGINT', () => { shuttingDown = true; });
process.on('SIGTERM', () => { shuttingDown = true; });

main().catch((e) => {
  console.error('[worker] fatal:', e && e.stack ? e.stack : e);
  process.exit(1);
});