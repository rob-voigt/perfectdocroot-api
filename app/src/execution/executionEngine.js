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

const { executeRun } = require('../services/runOrchestrator');
const { logInfo, logWarn, logError } = require('../utils/logger');

const SERVICE = 'pdr-worker'; // execution engine runs inside worker (and sync path too)

function maxConcurrentRuns() {
  // ✅ default to 1 (safer); override via env
  const raw = Number(process.env.MAX_CONCURRENT_RUNS || 1);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
}

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

/**
 * MS14:
 * processRun is called by:
 *  - worker (async mode)
 *  - inline execution (sync mode)
 *
 * IMPORTANT:
 * It assumes the run status has already been set to 'running'
 * (either by worker claim or by sync route logic).
 */
async function processRun(run_id) {
  if (activeRuns >= maxConcurrentRuns()) {
    log('run_start_delayed_concurrency', {
      run_id,
      active_runs: activeRuns,
      max_concurrent_runs: maxConcurrentRuns()
    });

    await new Promise((resolve) => setTimeout(resolve, retryDelayMs()));
    return processRun(run_id);
  }

  let acquiredSlot = false;

  try {
    activeRuns += 1;
    acquiredSlot = true;

    log('run_started', { run_id });

    // This executes full orchestration:
    // validation → repair → mutation → terminal status update
    await executeRun(run_id);

    log('run_completed', { run_id });
  } catch (err) {
    logError(SERVICE, 'run_failed', { run_id, error: err?.message });
    throw err; // Worker must catch and mark failed if needed
  } finally {
    if (acquiredSlot) {
      activeRuns = Math.max(0, activeRuns - 1);
    }
  }
}

module.exports = { processRun };
