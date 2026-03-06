'use strict';

const path = require('path');

const REPO_ROOT = '/Users/robertvoigt/Sites/api-dev.perfectdocroot.com';

module.exports = {
  apps: [
    {
      name: 'pdr-api',
      cwd: REPO_ROOT,
      script: path.join(REPO_ROOT, 'app/src/server.js'),
      exec_mode: 'fork',
      instances: 1,

      // Ensure the app chooses .env.production via your NODE_ENV logic
      env: {
        NODE_ENV: 'production'
      },

      // Log files (optional; PM2 defaults are fine too)
      out_file: path.join(process.env.HOME, '.pm2/logs/pdr-api-out.log'),
      error_file: path.join(process.env.HOME, '.pm2/logs/pdr-api-error.log'),
      merge_logs: true,
      time: true,

      // Avoid noisy crash loops
      max_restarts: 20,
      restart_delay: 1000
    },

    {
      name: 'pdr-worker',
      cwd: REPO_ROOT,
      script: path.join(REPO_ROOT, 'app/scripts/worker.js'),
      exec_mode: 'fork',
      instances: 1,

      env: {
        NODE_ENV: 'production'
        // Optional knobs (uncomment if you want to lock them here instead of .env)
        // PDR_WORKER_POLL_MS: '1000',
        // PDR_REQUEUE_EVERY_LOOPS: '30',
        // PDR_HEARTBEAT_EVERY_LOOPS: '1',
      },

      out_file: path.join(process.env.HOME, '.pm2/logs/pdr-worker-out.log'),
      error_file: path.join(process.env.HOME, '.pm2/logs/pdr-worker-error.log'),
      merge_logs: true,
      time: true,

      max_restarts: 50,
      restart_delay: 1000
    }
  ]
};