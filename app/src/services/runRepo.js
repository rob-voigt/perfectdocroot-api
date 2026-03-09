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

const { sha256HexFromObject } = require('../utils/hash');
const { config } = require('../config');
const executionEngine = require('../execution/executionEngine');
const { executeRun } = require('./runOrchestrator');

const crypto = require('crypto');
const { pool } = require('../db/mysql');
const {getContract, getLatestContractByDomain,listContractsByDomain} = require('./contractRepo');
const { validateAgainstSchema } = require('./schemaValidate');
const { createArtifact } = require('./artifactRepo');

function nowIso() {
  return new Date().toISOString();
}

// MySQL DATETIME(3) expects 'YYYY-MM-DD HH:MM:SS.mmm'
function isoToMysqlDatetime3(iso) {
  const d = new Date(iso);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const yyyy = d.getUTCFullYear();
  const mm = pad(d.getUTCMonth() + 1);
  const dd = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mi = pad(d.getUTCMinutes());
  const ss = pad(d.getUTCSeconds());
  const ms = pad(d.getUTCMilliseconds(), 3);
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}.${ms}`;
}

function mysqlDatetime3ToIso(dt) {
  if (!dt) return null;

  // mysql2 may return a JS Date depending on config
  if (dt instanceof Date) return dt.toISOString();

  const s = String(dt).trim();

  // Expect "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DD HH:MM:SS.mmm"
  const [datePart, timePartRaw] = s.split(' ');
  if (!datePart || !timePartRaw) {
    // Fallback for unexpected formats
    return new Date(s).toISOString();
  }

  const [y, m, d] = datePart.split('-').map((v) => Number(v));
  const [hms, msRaw] = timePartRaw.split('.');
  const [hh, mm, ss] = hms.split(':').map((v) => Number(v));
  const ms = msRaw ? Number(String(msRaw).padEnd(3, '0').slice(0, 3)) : 0;

  return new Date(Date.UTC(y, m - 1, d, hh, mm, ss, ms)).toISOString();
}

async function markRunFailedFromExecutorCrash(run_id, err) {
  const completed_at = isoToMysqlDatetime3(nowIso());

  await pool.execute(
    `UPDATE runs
        SET status = ?,
            completed_at = ?
      WHERE id = ?
        AND status IN ('queued', 'running')
      LIMIT 1`,
    ['failed', completed_at, run_id]
  );

  console.error('executeRun failed', { run_id, error: err?.message });
}

async function createRun({
  domain_id,
  contract_version,
  input_payload,
  correlation_id,
  execution_mode = 'sync',
  repair = {},
  status: statusOverride
} = {}) {
  const normalized_domain_id =
    typeof domain_id === 'string' ? domain_id.trim() : '';

  const requested_contract_version =
    typeof contract_version === 'string' ? contract_version.trim() : '';

  let contract = null;
  let resolved_contract_version = requested_contract_version;

  if (requested_contract_version) {
    contract = await getContract({
      domain_id: normalized_domain_id,
      contract_version: requested_contract_version
    });

    if (!contract) {
      const versions = await listContractsByDomain({ domain_id: normalized_domain_id });
      const available_versions = versions.map((r) => r.contract_version);

      const err = new Error(
        `Contract ${normalized_domain_id}/${requested_contract_version} was not found`
      );
      err.statusCode = 404;
      err.code = 'contract_not_found';
      err.domain_id = normalized_domain_id;
      err.contract_version = requested_contract_version;
      err.available_versions = available_versions;
      throw err;
    }
  } else {
    contract = await getLatestContractByDomain({ domain_id: normalized_domain_id });

    if (!contract) {
      const err = new Error(`No contracts exist for domain ${normalized_domain_id}`);
      err.statusCode = 404;
      err.code = 'domain_has_no_contracts';
      err.domain_id = normalized_domain_id;
      throw err;
    }

    resolved_contract_version = contract.contract_version;
  }

  const id = crypto.randomUUID();
  const created_at_iso = nowIso();

  const status =
    typeof statusOverride === 'string'
      ? statusOverride
      : (execution_mode === 'async' ? 'queued' : 'running');

  const created_at = isoToMysqlDatetime3(created_at_iso);

  let enabled = typeof repair.enabled === 'boolean' ? repair.enabled : false;
  let max_attempts = Number.isFinite(repair.max_attempts)
    ? Math.max(0, Math.min(5, Math.floor(repair.max_attempts)))
    : 2;

  const repair_json = JSON.stringify({ enabled, max_attempts });

  const sql = `
    INSERT INTO runs
      (id, correlation_id, status, domain_id, contract_version, input_payload, created_at, repair_json)
    VALUES
      (:id, :correlation_id, :status, :domain_id, :contract_version, :input_payload, :created_at, :repair_json)
  `;

  await pool.execute(sql, {
    id,
    correlation_id: correlation_id || null,
    status,
    domain_id: normalized_domain_id,
    contract_version: resolved_contract_version,
    input_payload: JSON.stringify(input_payload),
    created_at,
    repair_json
  });

  await createArtifact({
    run_id: id,
    artifact_type: 'contract_snapshot',
    content: {
      domain_id: normalized_domain_id,
      contract_version: resolved_contract_version,
      schema_hash: contract.schema_hash
    }
  });

  return {
    id,
    correlation_id: correlation_id || null,
    status,
    domain_id: normalized_domain_id,
    contract_version: resolved_contract_version,
    created_at: created_at_iso,
    completed_at: null
  };
}

async function getRun(id) {
  const [rows] = await pool.execute(
    `SELECT id, correlation_id, input_hash, output_hash,
            status, domain_id, contract_version,
            input_payload, working_payload, result_json, validation_report, provenance,
            created_at, completed_at
     FROM runs
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  
  if (!rows || rows.length === 0) return null;

  const r = rows[0];

  console.log('DEBUG created_at type', {
  type: typeof r.created_at,
  isDate: r.created_at instanceof Date,
  value: r.created_at
  });
  
  const input_payload =
    r.input_payload ? (typeof r.input_payload === 'string' ? JSON.parse(r.input_payload) : r.input_payload) : {};

  const working_payload =
    r.working_payload == null
      ? null
      : (typeof r.working_payload === 'string' ? JSON.parse(r.working_payload) : r.working_payload);

  const result =
    r.result_json ? (typeof r.result_json === 'string' ? JSON.parse(r.result_json) : r.result_json) : null;

  const validation_report =
    r.validation_report
      ? (typeof r.validation_report === 'string' ? JSON.parse(r.validation_report) : r.validation_report)
      : null;

  const provenance =
    r.provenance ? (typeof r.provenance === 'string' ? JSON.parse(r.provenance) : r.provenance) : null;

  return {
    id: r.id,
    correlation_id: r.correlation_id,
    input_hash: r.input_hash,
    output_hash: r.output_hash,
    status: r.status,
    domain_id: r.domain_id,
    contract_version: r.contract_version,
    created_at: mysqlDatetime3ToIso(r.created_at),
    completed_at: r.completed_at ? mysqlDatetime3ToIso(r.completed_at) : null,
    validation_report,
    provenance,
    result,
    working_payload
  };
}

async function listRuns({ limit = 50 } = {}) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));

  const [rows] = await pool.query(
    `SELECT id, status, domain_id, contract_version, created_at, completed_at
     FROM runs
     ORDER BY created_at DESC
     LIMIT ${safeLimit}`
  );

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    domain_id: r.domain_id,
    contract_version: r.contract_version,
    created_at: mysqlDatetime3ToIso(r.created_at),
    completed_at: r.completed_at ? mysqlDatetime3ToIso(r.completed_at) : null
  }));
}

module.exports = { createRun, getRun, listRuns };
