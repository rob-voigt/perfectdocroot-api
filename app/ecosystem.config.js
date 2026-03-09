'use strict';

module.exports = {
  apps: [
    {
      name: 'pdr-api',
      script: './src/server.js',
      cwd: __dirname,
      env_file: `${__dirname}/.env`,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 20,
      restart_delay: 2000,
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        PDR_DEMO_MODE: '1'
      }
    },
    {
      name: 'pdr-worker',
      script: './scripts/worker.js',
      cwd: __dirname,
      env_file: `${__dirname}/.env`,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 50,
      restart_delay: 2000,
      time: true,
      env: {
        NODE_ENV: 'production',
        PDR_WORKER_ID: 'worker-1',
        PDR_WORKER_POLL_MS: 1000,
        PDR_HEARTBEAT_EVERY_LOOPS: 1,
        PDR_WORKER_ACTIVE_WINDOW_MS: 15000,
        MAX_CONCURRENT_RUNS: 1,
        PDR_FAILED_RECENT_MINUTES: 60
      }
    }
  ]
};