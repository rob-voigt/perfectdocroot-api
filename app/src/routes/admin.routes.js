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

const express = require('express');
const router = express.Router();
const { requireApiKey } = require('../middleware/auth');
const { pool } = require('../db/mysql');
const { listContracts, listContractsByDomain, getContract } = require('../services/contractRepo');
const { getRun, listRuns } = require('../services/runRepo');
const { listRunSteps } = require('../models/runSteps.model');
const { listMutations } = require('../models/mutations.model');
const { listArtifactsForRun } = require('../services/artifactRepo');

function isDemoModeEnabled() {
  return process.env.PDR_DEMO_MODE === '1';
}

function normalizeDemoPath(path) {
  const s = String(path || '').trim();
  if (!s) return '/';
  if (s.length > 1 && s.endsWith('/')) return s.slice(0, -1);
  return s;
}

function allowPublicDemo(req) {
  if (!isDemoModeEnabled()) {
    return false;
  }
  if (req.method !== 'GET') {
    return false;
  }
  const path = normalizeDemoPath(req.path);
  if (path === '/') return true;
  if (path === '/runs') return true;
  if (path.startsWith('/runs/')) return true;
  if (path === '/contracts') return true;
  if (path.startsWith('/contracts/')) return true;
  return false;
}

function requireAdminAccess(req, res, next) {
  console.log('DEMO DEBUG', {
    demo: process.env.PDR_DEMO_MODE,
    method: req.method,
    path: req.path,
    normalized: normalizeDemoPath(req.path),
    allowed: allowPublicDemo(req)
  });
  if (allowPublicDemo(req)) {
    return next();
  }
  return requireApiKey(req, res, next);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pageShell({ title, body }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="5" />
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 0;
      background: #f6f7f9;
      color: #1f2937;
    }
    header {
      background: #111827;
      color: #fff;
      padding: 16px 20px;
    }
    main {
      max-width: 1100px;
      margin: 0 auto;
      padding: 24px 20px 40px;
    }
    h1, h2, h3 {
      margin-top: 0;
    }
    .card {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 16px 18px;
      margin-bottom: 16px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
    }
    a {
      color: #2563eb;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    code, pre {
      background: #f3f4f6;
      border-radius: 6px;
    }
    code {
      padding: 2px 6px;
    }
    pre {
      padding: 12px;
      overflow: auto;
    }
    ul {
      margin: 8px 0 0 20px;
    }
    .muted {
      color: #6b7280;
    }
    .table-container {
      overflow-x: auto;
      width: 100%;
    }
    .hash-cell {
      max-width: 220px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: monospace;
      font-size: 12px;
    }
    .mono-sm {
      font-family: monospace;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <header>
    <h1>PerfectDocRoot API Admin</h1>
  </header>
  <main>
    ${process.env.PDR_DEMO_MODE === '1' ? `
      <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 12px; margin-bottom: 16px; color: #92400e;">
        <strong>PerfectDocRoot Demo Mode</strong><br>
        This page shows recent governed runs stored in the configured local demo database.<br>
        To create a new run in this environment, run the minimal example and refresh this page.
      </div>
    ` : ''}
    ${body}
  </main>
</body>
</html>`;
}

router.get('/', requireAdminAccess, async (req, res, next) => {
  try {
    const body = `
      <div class="card">
        <h2>MS18 Operator Console</h2>
        <p class="muted">
          Read-only operator pages for contracts, runs, artifacts, provenance surfaces, and worker status.
        </p>
      </div>

      <div class="grid">
        <div class="card">
          <h3><a href="/admin/contracts">Contracts Overview</a></h3>
          <p>Browse governed domains and contract versions.</p>
        </div>

        <div class="card">
          <h3><a href="/admin/runs">Runs Overview</a></h3>
          <p>Browse recent runs and inspect execution outcomes.</p>
        </div>

        <div class="card">
          <h3><a href="/admin/workers">Worker Status</a></h3>
          <p>Inspect active workers and queue health.</p>
        </div>
      </div>

      <div class="card">
        <h3>Planned MS18 pages</h3>
        <ul>
          <li><code>/admin/contracts</code></li>
          <li><code>/admin/contracts/:domain_id</code></li>
          <li><code>/admin/contracts/:domain_id/:contract_version</code></li>
          <li><code>/admin/runs</code></li>
          <li><code>/admin/runs/:id</code></li>
          <li><code>/admin/workers</code></li>
        </ul>
      </div>
    `;

    return res.status(200).send(pageShell({
      title: 'PDR API Admin',
      body
    }));
  } catch (err) {
    return next(err);
  }
});

router.get('/contracts', requireAdminAccess, async (req, res, next) => {
  try {
    const contracts = await listContracts();

    const rows = contracts.length
      ? contracts.map((c) => `
          <tr>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb;">
              <a href="/admin/contracts/${encodeURIComponent(c.domain_id)}">${escapeHtml(c.domain_id)}</a>
            </td>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb;">
              <a href="/admin/contracts/${encodeURIComponent(c.domain_id)}/${encodeURIComponent(c.contract_version)}">
                ${escapeHtml(c.contract_version)}
              </a>
            </td>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb;">
              <code>${escapeHtml(c.schema_hash)}</code>
            </td>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb;">
              ${escapeHtml(String(c.created_at ?? ''))}
            </td>
          </tr>
        `).join('')
      : `
          <tr>
            <td colspan="4" class="muted" style="padding:8px;">
              No contracts found.
            </td>
          </tr>
        `;

    const body = `
      <div class="card">
        <h2>Contracts Overview</h2>
        <p class="muted">
          Read-only registry view of all governed contracts in the system.
        </p>
      </div>

      <div class="card">
        <h3>All Contracts</h3>
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr>
              <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">domain_id</th>
              <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">contract_version</th>
              <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">schema_hash</th>
              <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">created_at</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>

      <div class="card">
        <p><a href="/admin">← Back to Admin Home</a></p>
      </div>
    `;

    return res.status(200).send(pageShell({
      title: 'Contracts Overview',
      body
    }));
  } catch (err) {
    return next(err);
  }
});

router.get('/runs', requireAdminAccess, async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const runs = await listRuns({ limit });

    const rows = runs.length
      ? runs.map((run) => `
          <tr>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb;">
              <a href="/admin/runs/${encodeURIComponent(run.id)}">
                ${escapeHtml(run.id)}
              </a>
            </td>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb;">
              ${escapeHtml(run.domain_id || '')}
            </td>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb;">
              ${escapeHtml(run.contract_version || '')}
            </td>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb;">
              ${escapeHtml(run.status || '')}
            </td>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb;">
              ${escapeHtml(run.created_at || '')}
            </td>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb;">
              ${escapeHtml(run.completed_at || '')}
            </td>
          </tr>
        `).join('')
      : `
          <tr>
            <td colspan="6" class="muted" style="padding:8px;">
              No runs found.
            </td>
          </tr>
        `;

    const body = `
      <div class="card">
        <h2>Runs Overview</h2>
        <p class="muted">
          Read-only view of recent governed runs.
        </p>
      </div>

      <div class="card">
        <h3>Recent Runs</h3>
        <p class="muted">Showing up to ${limit} runs, newest first.</p>
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr>
              <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">run_id</th>
              <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">domain_id</th>
              <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">contract_version</th>
              <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">status</th>
              <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">created_at</th>
              <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">completed_at</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>

      <div class="card">
        <p><a href="/admin">← Back to Admin Home</a></p>
      </div>
    `;

    return res.status(200).send(pageShell({
      title: 'Runs Overview',
      body
    }));
  } catch (err) {
    return next(err);
  }
});

router.get('/workers', requireApiKey, async (req, res, next) => {
  try {
    const activeWindowMs = Number(process.env.PDR_WORKER_ACTIVE_WINDOW_MS || 15000);
    const failedRecentMinutes = Number(process.env.PDR_FAILED_RECENT_MINUTES || 60);

    const [workers] = await pool.execute(
      `
      SELECT worker_id, host, pid, poll_ms, requeue_every_loops, last_seen_at
      FROM worker_heartbeats
      WHERE last_seen_at >= (NOW(3) - INTERVAL ? MICROSECOND)
      ORDER BY last_seen_at DESC
      `,
      [activeWindowMs * 1000]
    );

    const [[queuedRow]] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM runs WHERE status='queued'`
    );

    const [[runningRow]] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM runs WHERE status='running'`
    );

    const [[failedRecentRow]] = await pool.execute(
      `
      SELECT COUNT(*) AS cnt
      FROM runs
      WHERE status='failed'
        AND completed_at >= (NOW(3) - INTERVAL ? MINUTE)
      `,
      [failedRecentMinutes]
    );

    const queued = Number(queuedRow?.cnt || 0);
    const running = Number(runningRow?.cnt || 0);
    const failedRecent = Number(failedRecentRow?.cnt || 0);
    const activeWorkers = Array.isArray(workers) ? workers : [];

    const workerRows = activeWorkers.length
      ? activeWorkers.map((w) => `
          <tr>
            <td>${escapeHtml(w.worker_id || '')}</td>
            <td>${escapeHtml(w.host || '')}</td>
            <td>${escapeHtml(String(w.pid ?? ''))}</td>
            <td>${escapeHtml(String(w.poll_ms ?? ''))}</td>
            <td>${escapeHtml(String(w.requeue_every_loops ?? ''))}</td>
            <td>${escapeHtml(String(w.last_seen_at ?? ''))}</td>
          </tr>
        `).join('')
      : `
          <tr>
            <td colspan="6" class="muted">No active workers found in current heartbeat window.</td>
          </tr>
        `;

    const body = `
      <div class="card">
        <h2>Worker Status</h2>
        <p class="muted">
          Read-only operational view of worker heartbeats and run queue state.
        </p>
      </div>

      <div class="grid">
        <div class="card">
          <h3>Active Workers</h3>
          <p style="font-size: 32px; margin: 0;"><strong>${activeWorkers.length}</strong></p>
        </div>

        <div class="card">
          <h3>Queued Runs</h3>
          <p style="font-size: 32px; margin: 0;"><strong>${queued}</strong></p>
        </div>

        <div class="card">
          <h3>Running Runs</h3>
          <p style="font-size: 32px; margin: 0;"><strong>${running}</strong></p>
        </div>

        <div class="card">
          <h3>Failed Recent</h3>
          <p style="font-size: 32px; margin: 0;"><strong>${failedRecent}</strong></p>
        </div>
      </div>

      <div class="card">
        <h3>Window Settings</h3>
        <ul>
          <li><strong>Active window ms:</strong> ${activeWindowMs}</li>
          <li><strong>Failed recent minutes:</strong> ${failedRecentMinutes}</li>
          <li><strong>Generated at:</strong> ${escapeHtml(new Date().toISOString())}</li>
        </ul>
      </div>

      <div class="card">
        <h3>Active Worker Heartbeats</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">worker_id</th>
              <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">host</th>
              <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">pid</th>
              <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">poll_ms</th>
              <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">requeue_every_loops</th>
              <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">last_seen_at</th>
            </tr>
          </thead>
          <tbody>
            ${workerRows}
          </tbody>
        </table>
      </div>

      <div class="card">
        <p><a href="/admin">← Back to Admin Home</a></p>
      </div>
    `;

    return res.status(200).send(pageShell({
      title: 'Worker Status',
      body
    }));
  } catch (err) {
    return next(err);
  }
});

router.get('/contracts/:domain_id/:contract_version', requireAdminAccess, async (req, res, next) => {
  try {
    const domain_id = String(req.params.domain_id || '').trim();
    const contract_version = String(req.params.contract_version || '').trim();

    const contract = await getContract({ domain_id, contract_version });

    if (!contract) {
      return res.status(404).send(pageShell({
        title: 'Contract Not Found',
        body: `
          <div class="card">
            <h2>Contract Not Found</h2>
            <p class="muted">
              No contract found for <code>${escapeHtml(domain_id)}</code> /
              <code>${escapeHtml(contract_version)}</code>.
            </p>
          </div>
          <div class="card">
            <p><a href="/admin/contracts/${encodeURIComponent(domain_id)}">← Back to Domain Contracts</a></p>
          </div>
        `
      }));
    }

    const schemaJsonPretty = escapeHtml(JSON.stringify(contract.schema_json, null, 2));

    const body = `
      <div class="card">
        <h2>Contract Detail</h2>
        <p><strong>domain_id:</strong> ${escapeHtml(contract.domain_id)}</p>
        <p><strong>contract_version:</strong> ${escapeHtml(contract.contract_version)}</p>
        <p><strong>schema_hash:</strong> <code>${escapeHtml(contract.schema_hash)}</code></p>
        <p><strong>created_at:</strong> ${escapeHtml(String(contract.created_at ?? ''))}</p>
      </div>

      <div class="card">
        <h3>Schema JSON</h3>
        <pre>${schemaJsonPretty}</pre>
      </div>

      <div class="card">
        <p>
          <a href="/admin/contracts/${encodeURIComponent(domain_id)}">← Back to Domain Contracts</a>
        </p>
      </div>
    `;

    return res.status(200).send(pageShell({
      title: `Contract ${domain_id} / ${contract_version}`,
      body
    }));
  } catch (err) {
    return next(err);
  }
});

router.get('/contracts/:domain_id', requireAdminAccess, async (req, res, next) => {
  try {
    const domain_id = String(req.params.domain_id || '').trim();
    const contracts = await listContractsByDomain({ domain_id });

    const rows = contracts.length
      ? contracts.map((c) => `
          <tr>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb;">
              <a href="/admin/contracts/${encodeURIComponent(c.domain_id)}/${encodeURIComponent(c.contract_version)}">
                ${escapeHtml(c.contract_version)}
              </a>
            </td>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb;">
              <code>${escapeHtml(c.schema_hash)}</code>
            </td>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb;">
              ${escapeHtml(String(c.created_at ?? ''))}
            </td>
          </tr>
        `).join('')
      : `
          <tr>
            <td colspan="3" class="muted" style="padding:8px;">
              No contracts found for this domain.
            </td>
          </tr>
        `;

    const body = `
      <div class="card">
        <h2>Domain Contracts</h2>
        <p><strong>domain_id:</strong> ${escapeHtml(domain_id)}</p>
      </div>

      <div class="card">
        <h3>Versions</h3>
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr>
              <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">contract_version</th>
              <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">schema_hash</th>
              <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">created_at</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>

      <div class="card">
        <p>
          <a href="/admin/contracts">← Back to Contracts Overview</a>
        </p>
      </div>
    `;

    return res.status(200).send(pageShell({
      title: `Contracts — ${domain_id}`,
      body
    }));
  } catch (err) {
    return next(err);
  }
});

router.get('/runs/:id', requireAdminAccess, async (req, res, next) => {
  try {
    const run_id = String(req.params.id || '').trim();

    const [run, steps, mutations, artifacts] = await Promise.all([
      getRun(run_id),
      listRunSteps(run_id),
      listMutations(run_id),
      listArtifactsForRun(run_id)
    ]);

    if (!run) {
      return res.status(404).send(pageShell({
        title: 'Run Not Found',
        body: `
          <div class="card">
            <h2>Run Not Found</h2>
            <p class="muted">No run found for id <code>${escapeHtml(run_id)}</code>.</p>
          </div>
          <div class="card">
            <p><a href="/admin/runs">← Back to Runs Overview</a></p>
          </div>
        `
      }));
    }

    const validationReportPretty = run.validation_report
      ? escapeHtml(JSON.stringify(run.validation_report, null, 2))
      : '';

    const provenancePretty = run.provenance
      ? escapeHtml(JSON.stringify(run.provenance, null, 2))
      : '';

    const resultPretty = run.result
      ? escapeHtml(JSON.stringify(run.result, null, 2))
      : '';

    const workingPayloadPretty = run.working_payload
      ? escapeHtml(JSON.stringify(run.working_payload, null, 2))
      : '';

    const stepsRows = Array.isArray(steps) && steps.length
      ? steps.map((step) => `
          <tr>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb;">${escapeHtml(String(step.step_index ?? ''))}</td>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb;">${escapeHtml(step.step_type || '')}</td>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb;">${escapeHtml(step.status || '')}</td>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb;">${escapeHtml(String(step.attempt_number ?? ''))}</td>
            <td class="hash-cell" style="padding:8px; border-bottom:1px solid #e5e7eb;">${escapeHtml(step.input_hash || '')}</td>
            <td class="hash-cell" style="padding:8px; border-bottom:1px solid #e5e7eb;">${escapeHtml(step.output_hash || '')}</td>
            <td class="mono-sm" style="padding:8px; border-bottom:1px solid #e5e7eb;">${escapeHtml(String(step.created_at ?? ''))}</td>
          </tr>
        `).join('')
      : `
          <tr>
            <td colspan="7" class="muted" style="padding:8px;">No step records found.</td>
          </tr>
        `;

    const mutationRows = Array.isArray(mutations) && mutations.length
      ? mutations.map((m) => `
          <tr>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb;">${escapeHtml(String(m.id ?? ''))}</td>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb;">${escapeHtml(String(m.step_index ?? ''))}</td>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb;">${escapeHtml(m.mutation_type || '')}</td>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb;">${escapeHtml(String(m.created_at ?? ''))}</td>
          </tr>
        `).join('')
      : `
          <tr>
            <td colspan="4" class="muted" style="padding:8px;">No mutations found.</td>
          </tr>
        `;

    const artifactRows = Array.isArray(artifacts) && artifacts.length
      ? artifacts.map((a) => `
          <tr>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb;">
              <a href="/v1/artifacts/${encodeURIComponent(a.id)}">${escapeHtml(a.id)}</a>
            </td>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb;">${escapeHtml(a.artifact_type || '')}</td>
            <td class="hash-cell" style="padding:8px; border-bottom:1px solid #e5e7eb;">${escapeHtml(a.content_hash || '')}</td>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb;">${escapeHtml(String(a.size_bytes ?? ''))}</td>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb;">${escapeHtml(String(a.created_at ?? ''))}</td>
          </tr>
        `).join('')
      : `
          <tr>
            <td colspan="5" class="muted" style="padding:8px;">No artifacts found.</td>
          </tr>
        `;

    const body = `
      <div class="card">
        <h2>Run Detail</h2>
        <p><strong>run_id:</strong> ${escapeHtml(run.id)}</p>
        <p><strong>domain_id:</strong> ${escapeHtml(run.domain_id || '')}</p>
        <p><strong>contract_version:</strong> ${escapeHtml(run.contract_version || '')}</p>
        <p><strong>status:</strong> ${escapeHtml(run.status || '')}</p>
        <p><strong>created_at:</strong> ${escapeHtml(run.created_at || '')}</p>
        <p><strong>completed_at:</strong> ${escapeHtml(run.completed_at || '')}</p>
        <p><strong>input_hash:</strong> <code>${escapeHtml(run.input_hash || '')}</code></p>
        <p><strong>output_hash:</strong> <code>${escapeHtml(run.output_hash || '')}</code></p>
      </div>

      <div class="card">
        <h3>Validation Report</h3>
        ${validationReportPretty
          ? `<pre>${validationReportPretty}</pre>`
          : `<p class="muted">No validation report stored.</p>`
        }
      </div>

      <div class="card">
        <h3>Working Payload</h3>
        ${workingPayloadPretty
          ? `<pre>${workingPayloadPretty}</pre>`
          : `<p class="muted">No working payload stored.</p>`
        }
      </div>

      <div class="card">
        <h3>Result</h3>
        ${resultPretty
          ? `<pre>${resultPretty}</pre>`
          : `<p class="muted">No result stored.</p>`
        }
      </div>

      <div class="card">
        <h3>Provenance</h3>
        ${provenancePretty
          ? `<pre>${provenancePretty}</pre>`
          : `<p class="muted">No provenance stored.</p>`
        }
      </div>

      <div class="card">
        <h3>Execution Steps</h3>
        <div class="table-container">
          <table style="width:100%; border-collapse:collapse;">
            <thead>
              <tr>
                <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">step_index</th>
                <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">step_type</th>
                <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">status</th>
                <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">attempt</th>
                <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">input_hash</th>
                <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">output_hash</th>
                <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">created_at</th>
              </tr>
            </thead>
            <tbody>
              ${stepsRows}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <h3>Mutations</h3>
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr>
              <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">id</th>
              <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">step_index</th>
              <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">mutation_type</th>
              <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">created_at</th>
            </tr>
          </thead>
          <tbody>
            ${mutationRows}
          </tbody>
        </table>
      </div>

      <div class="card">
        <h3>Artifacts</h3>
        <div class="table-container">
          <table style="width:100%; border-collapse:collapse;">
            <thead>
              <tr>
                <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">artifact_id</th>
                <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">artifact_type</th>
                <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">content_hash</th>
                <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">size_bytes</th>
                <th style="text-align:left; border-bottom:1px solid #e5e7eb; padding:8px;">created_at</th>
              </tr>
            </thead>
            <tbody>
              ${artifactRows}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <p><a href="/admin/runs">← Back to Runs Overview</a></p>
      </div>
    `;

    return res.status(200).send(pageShell({
      title: `Run ${run.id}`,
      body
    }));
  } catch (err) {
    return next(err);
  }
});

module.exports = { adminRouter: router };
