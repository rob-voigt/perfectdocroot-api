'use strict';

const { pool } = require('../db/mysql');
const { sha256HexFromObject } = require('../utils/hash');
const { getContract } = require('./contractRepo');
const { validateAgainstSchema } = require('./schemaValidate');
const { createArtifact } = require('./artifactRepo');
const { createStep, updateStep } = require('./stepRepo');

function nowIso() {
  return new Date().toISOString();
}

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

// MS10: In-phase-1 executor. Repair loop is “stubbed” (no model call yet),
// but the step lifecycle is real and future-proof.
async function executeRun(run_id) {
  // Load run record
  const [rows] = await pool.execute(
    `SELECT id, domain_id, contract_version, input_payload
       FROM runs
      WHERE id = ?
      LIMIT 1`,
    [run_id]
  );
  if (!rows || rows.length === 0) return;

  const run = rows[0];
  const domain_id = run.domain_id;
  const contract_version = run.contract_version;
  const input_payload =
    run.input_payload ? (typeof run.input_payload === 'string' ? JSON.parse(run.input_payload) : run.input_payload) : {};

  // Update run status -> running
  await pool.execute(`UPDATE runs SET status = ? WHERE id = ? LIMIT 1`, ['running', run_id]);

  const contract = await getContract({ domain_id, contract_version });
  if (!contract) {
    await pool.execute(
      `UPDATE runs SET status = ?, completed_at = ? WHERE id = ? LIMIT 1`,
      ['failed', isoToMysqlDatetime3(nowIso()), run_id]
    );
    await createArtifact({
      run_id,
      artifact_type: 'validation_report',
      content: {
        domain_id,
        contract_version,
        pass: false,
        score: 0,
        issues: [{ code: 'contract_not_found', message: 'Contract not found for domain_id and contract_version' }],
        created_at: nowIso()
      }
    });
    return;
  }

  await pool.execute(`UPDATE runs SET status = ? WHERE id = ? LIMIT 1`, ['validating', run_id]);

  // Step 1: validate (your current behavior is schema validate only)
  const step1 = await createStep({ run_id, step_type: 'validate', status: 'running', attempt_number: 1 });

  const { ok, issues } = validateAgainstSchema(contract.schema, input_payload);
  const pass = !!ok;
  const score = pass ? 100 : Math.max(0, 100 - issues.length * 10);
  const completed_at_iso = nowIso();

  console.log('DEBUG TZ CHECK', {
    nowIso: nowIso(),
    newDateIso: new Date().toISOString(),
    serverTZ: Intl.DateTimeFormat().resolvedOptions().timeZone,
    offsetMinutes: new Date().getTimezoneOffset()
  });

  const validation_report = {
    report_id: crypto.randomUUID?.() || undefined, // optional
    domain_id,
    contract_version,
    pass,
    score,
    issues,
    created_at: completed_at_iso
  };

  // Hashing (keep same rule you have today)
  const input_for_hash = { domain_id, contract_version, input_payload };
  const input_hash = sha256HexFromObject(input_for_hash);

  const result = {
    message: 'Run executed (MS10 async lifecycle)',
    input_payload
  };

  const output_for_hash = {
    validation: { pass, score, issues },
    result
  };
  const output_hash = sha256HexFromObject(output_for_hash);

  await updateStep({
    id: step1.id,
    status: pass ? 'ok' : 'fail',
    input_hash,
    output_hash,
    error_code: pass ? null : 'schema_validation_failed',
    error_message: pass ? null : 'Schema validation failed (see issues)',
    metadata: { score, issue_count: issues.length }
  });

  // Emit artifacts you already emit today
  await createArtifact({ run_id, artifact_type: 'validation_report', content: validation_report });
  await createArtifact({
    run_id,
    artifact_type: 'contract_snapshot',
    content: { domain_id, contract_version, schema_hash: contract.schema_hash }
  });

  await pool.execute(
    `UPDATE runs
        SET status = ?,
            input_hash = ?,
            output_hash = ?,
            validation_report = ?,
            result_json = ?,
            completed_at = ?
      WHERE id = ?
      LIMIT 1`,
    [
      pass ? 'succeeded' : 'failed',
      input_hash,
      output_hash,
      JSON.stringify(validation_report),
      JSON.stringify(result),
      isoToMysqlDatetime3(completed_at_iso),
      run_id
    ]
  );
}

module.exports = { executeRun };