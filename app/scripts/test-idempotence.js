'use strict';

const engine = require('../src/execution/executionEngine');

const runId = process.argv[2];
if (!runId) {
  console.error('Usage: node app/scripts/test-idempotence.js <run_id>');
  process.exit(1);
}

(async () => {
  const results = await Promise.allSettled([
    engine.start(runId),
    engine.start(runId),
    engine.start(runId)
  ]);

  console.log('start() results:', results.map(r => r.status));
})();