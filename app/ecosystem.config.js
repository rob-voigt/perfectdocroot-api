// ecosystem.config.js
'use strict';

module.exports = {
  apps: [
    {
      name: 'pdr-api',
      script: './src/server.js',          // adjust if your entry differs
      instances: 1,                        // shared hosting / LiteSpeed: keep 1
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 20,
      restart_delay: 2000,
      time: true,
      env: {
        NODE_ENV: 'production',
        // keep API env vars here or via .env (pm2 supports --update-env)
      }
    },
    {
      name: 'pdr-worker',
      script: './src/worker/worker.js',    // adjust path if worker.js lives elsewhere
      instances: 1,                        // ✅ concurrency=1
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 50,
      restart_delay: 2000,
      time: true,
      env: {
        NODE_ENV: 'production',

        // ✅ Worker identity
        PDR_WORKER_ID: 'worker-1',

        // Polling
        PDR_WORKER_POLL_MS: 1000,

        // Heartbeats
        PDR_HEARTBEAT_EVERY_LOOPS: 1,      // tick every loop (safe; low cost)
        PDR_WORKER_ACTIVE_WINDOW_MS: 15000,// used by status endpoint window

        // ✅ Enforce engine concurrency
        MAX_CONCURRENT_RUNS: 1,

        // Optional: “failed_recent” window (minutes)
        PDR_FAILED_RECENT_MINUTES: 60
      }
    }
  ]
};