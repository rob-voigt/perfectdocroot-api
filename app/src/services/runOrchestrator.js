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

// Helper: configurable max repair attempts
function maxRepairAttempts() {
  const raw = Number(process.env.MAX_REPAIR_ATTEMPTS || 2);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 2;
}

// MS10: In-phase-1 executor. Repair loop is “stubbed” (no model call yet),
// but the step lifecycle is real and future-proof.
async function executeRun(run_id) {
  // Load run record (include working_payload)
  const [rows] = await pool.execute(
    `SELECT id, domain_id, contract_version, input_payload, working_payload
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

  // working_payload: parse if present, else null
  const working_payload =
    run.working_payload == null
      ? input_payload
      : (typeof run.working_payload === 'string' ? JSON.parse(run.working_payload) : run.working_payload);

  // Immutable reference to original input
  const original_input_payload = input_payload;

  // Update run status -> running
  await pool.execute(`UPDATE runs SET status = ? WHERE id = ? LIMIT 1`, ['running', run_id]);

  const contract = await getContract({ domain_id, contract_version });
  if (!contract) {
    const completed_at = nowIso();
    await pool.execute(
      `UPDATE runs SET status = ?, completed_at = ? WHERE id = ? LIMIT 1`,
      ['failed', isoToMysqlDatetime3(completed_at), run_id]
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
        created_at: completed_at
      }
    });
    return;
  }

  await pool.execute(`UPDATE runs SET status = ? WHERE id = ? LIMIT 1`, ['validating', run_id]);

  // MS12: Multi-step validation/repair loop
  const maxAttempts = 1 + maxRepairAttempts();
  let final_validation_report = null;
  let final_input_hash = null;
  let final_output_hash = null;
  let final_result = null;
  let final_pass = false;
  let final_score = 0;
  let final_issues = [];
  let completed_at_iso = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Step: validate
    const validateStep = await createStep({
      run_id,
      step_type: 'validate',
      status: 'running',
      attempt_number: attempt
    });

    const { ok, issues } = validateAgainstSchema(contract.schema, working_payload);
    const pass = !!ok;
    const score = pass ? 100 : Math.max(0, 100 - issues.length * 10);
    completed_at_iso = nowIso();

    const validation_report = {
      report_id: globalThis.crypto?.randomUUID?.() || undefined, // optional
      domain_id,
      contract_version,
      pass,
      score,
      issues,
      created_at: completed_at_iso
    };

    // Hashing (use working_payload)
    const input_for_hash = { domain_id, contract_version, input_payload: working_payload };
    const input_hash = sha256HexFromObject(input_for_hash);

    const result = {
      message: 'Run executed (MS12 multi-step)',
      working_payload
    };

    const output_for_hash = {
      validation: { pass, score, issues },
      result
    };
    const output_hash = sha256HexFromObject(output_for_hash);

    await updateStep({
      id: validateStep.id,
      status: pass ? 'ok' : 'fail',
      input_hash,
      output_hash,
      error_code: pass ? null : 'schema_validation_failed',
      error_message: pass ? null : 'Schema validation failed (see issues)',
      metadata: { score, issue_count: issues.length }
    });

    // If pass, break and store final
    if (pass) {
      final_validation_report = validation_report;
      final_input_hash = input_hash;
      final_output_hash = output_hash;
      final_result = result;
      final_pass = true;
      final_score = score;
      final_issues = issues;
      break;
    }

    // If fail and more attempts allowed, stub repair
    if (attempt <= maxRepairAttempts()) {
      // Step: repair (stub)
      const repairStep = await createStep({
        run_id,
        step_type: 'repair',
        status: 'running',
        attempt_number: attempt
      });
      // No mutation yet
      await updateStep({
        id: repairStep.id,
        status: 'ok',
        metadata: { stub: true, note: 'ms12 repair stub (no mutation yet)' }
      });
      // Persist working_payload (even if unchanged)
      await pool.execute(
        `UPDATE runs SET working_payload = ? WHERE id = ? LIMIT 1`,
        [JSON.stringify(working_payload), run_id]
      );
      // Only after repair step and persistence, continue to next validate
      continue;
    } else {
      // Fail and no attempts left
      final_validation_report = validation_report;
      final_input_hash = input_hash;
      final_output_hash = output_hash;
      final_result = result;
      final_pass = false;
      final_score = score;
      final_issues = issues;
      break;
    }
  }

  // Emit artifacts (final only)
  await createArtifact({ run_id, artifact_type: 'validation_report', content: final_validation_report });
  await createArtifact({
    run_id,
    artifact_type: 'contract_snapshot',
    content: { domain_id, contract_version, schema_hash: contract.schema_hash }
  });

  // Final run update (reflect final attempt)
  await pool.execute(
    `UPDATE runs
        SET status = ?,
            input_hash = ?,
            output_hash = ?,
            validation_report = ?,
            result_json = ?,
            completed_at = ?,
            working_payload = ?
      WHERE id = ?
      LIMIT 1`,
    [
      final_pass ? 'succeeded' : 'failed',
      final_input_hash,
      final_output_hash,
      JSON.stringify(final_validation_report),
      JSON.stringify(final_result),
      isoToMysqlDatetime3(completed_at_iso),
      JSON.stringify(working_payload),
      run_id
    ]
  );
}

module.exports = { executeRun };