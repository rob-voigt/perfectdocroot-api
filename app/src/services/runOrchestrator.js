'use strict';

const { pool } = require('../db/mysql');
const { sha256HexFromObject } = require('../utils/hash');

const { getContract } = require('./contractRepo');
const { validateAgainstSchema } = require('./schemaValidate');
const { createArtifact } = require('./artifactRepo');

// MS13 persistence
const { insertRunStep, getLastRunStep, getNextSeq } = require('../models/runSteps.model');
const { insertMutation } = require('../models/mutations.model');
const { makePatch, patchSummary } = require('../utils/jsonPatch');

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

function maxRepairAttempts() {
  const raw = Number(process.env.MAX_REPAIR_ATTEMPTS || 2);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 2;
}


/**
 * Deterministic repair attempt for candidate JSON output.
 * - Adds missing required fields (best-effort)
 * - Removes unknown properties (using schema.properties when available)
 *
 * IMPORTANT: Your validator issues look like:
 *   { path:"", keyword:"required", message:"must have required property 'hello' (missing: hello)" }
 *   { path:"", keyword:"additionalProperties", message:"must NOT have additional properties" }
 */
function attemptRepair({ previous_output, validation_report, schema }) {
  let candidate = { ...previous_output };

  const issues = validation_report?.issues;
  if (Array.isArray(issues)) {
    for (const issue of issues) {
      // required: try to parse missing property name from message
      if (issue.keyword === 'required' && typeof issue.message === 'string') {
        const m = issue.message.match(/required property '([^']+)'/);
        if (m && m[1] && candidate[m[1]] === undefined) {
          candidate[m[1]] = 'world'; // deterministic placeholder
        }
      }

      // additionalProperties: remove keys not in schema.properties
      if (issue.keyword === 'additionalProperties' && schema?.properties && typeof schema.properties === 'object') {
        const allowed = new Set(Object.keys(schema.properties));
        for (const k of Object.keys(candidate)) {
          if (!allowed.has(k)) delete candidate[k];
        }
      }
    }
  }

  return candidate;
}

async function executeRun(run_id) {
  // Load run record (include working_payload and repair_json)
  const [rows] = await pool.execute(
    `SELECT id, domain_id, contract_version, input_payload, working_payload, repair_json
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
    run.input_payload
      ? (typeof run.input_payload === 'string' ? JSON.parse(run.input_payload) : run.input_payload)
      : {};

  // working_payload: parse if present, else use input_payload
  let candidate =
    run.working_payload == null
      ? input_payload
      : (typeof run.working_payload === 'string' ? JSON.parse(run.working_payload) : run.working_payload);

  const original_input_payload = input_payload;

  // Parse repair_json safely
  let repairEnabled = false;
  let repairMaxAttempts = 2;
  if (run.repair_json) {
    try {
      const repairObj = typeof run.repair_json === 'string' ? JSON.parse(run.repair_json) : run.repair_json;
      repairEnabled = !!repairObj.enabled;
      const maxA = Number.isFinite(repairObj.max_attempts) ? Math.max(0, Math.min(5, Math.floor(repairObj.max_attempts))) : 2;
      repairMaxAttempts = maxA;
    } catch (e) {
      repairEnabled = false;
      repairMaxAttempts = 2;
    }
  }


  // Contract lookup
  let completed_at_iso = null;
  const contract = await getContract({ domain_id, contract_version });

  if (!contract) {
    completed_at_iso = nowIso();
    const report = {
      domain_id,
      contract_version,
      pass: false,
      score: 0,
      issues: [{ code: 'contract_not_found', message: 'Contract not found for domain_id and contract_version' }],
      created_at: completed_at_iso
    };

    await pool.execute(
      `UPDATE runs SET status = ?, completed_at = ? WHERE id = ? LIMIT 1`,
      ['failed', isoToMysqlDatetime3(completed_at_iso), run_id]
    );
    await createArtifact({ run_id, artifact_type: 'validation_report', content: report });
    return;
  }

  // Use parsed repair config
  const maxValidationPasses = 1 + repairMaxAttempts;

  // Draft step
  let previous_output_hash = sha256HexFromObject(candidate);
  const draftSeq = await getNextSeq(run_id);
  const draftStep = await insertRunStep({
    run_id,
    seq: draftSeq,
    type: 'draft',
    status: 'ok',
    input_hash: null,
    output_hash: previous_output_hash,
    step_output_json: candidate
  });

  let previous_step_id = draftStep.id;

  // Loop: validate, repair, validate, repair...
  let final_validation_report = null;
  let final_pass = false;

  for (let passIndex = 1; passIndex <= maxValidationPasses; passIndex++) {
    // Validate current candidate
    const { ok, issues } = validateAgainstSchema(contract.schema, candidate);
    const pass = !!ok;
    const score = pass ? 100 : Math.max(0, 100 - (issues?.length || 0) * 10);
    completed_at_iso = nowIso();

    const validation_report = {
      report_id: globalThis.crypto?.randomUUID?.() || undefined,
      domain_id,
      contract_version,
      pass,
      score,
      issues: issues || [],
      created_at: completed_at_iso
    };

    // Persist validate step
    const validateSeq = await getNextSeq(run_id);
    await insertRunStep({
      run_id,
      seq: validateSeq,
      type: 'validate',
      status: pass ? 'pass' : 'fail',
      input_hash: previous_output_hash,
      output_hash: null,
      validation_report_json: validation_report
    });

    final_validation_report = validation_report;
    final_pass = pass;

    if (pass) break;

    // Only perform repair/mutation steps if repairEnabled is true
    const repairsRemaining = repairEnabled && passIndex <= repairMaxAttempts;
    if (!repairsRemaining) break;

    // Repair attempt -> new candidate
    const repaired = attemptRepair({
      previous_output: candidate,
      validation_report,
      schema: contract.schema
    });

    const repaired_hash = sha256HexFromObject(repaired);

    // Persist repair step
    const repairSeq = await getNextSeq(run_id);
    const repairStep = await insertRunStep({
      run_id,
      seq: repairSeq,
      type: 'repair',
      status: 'ok',
      input_hash: previous_output_hash,
      output_hash: repaired_hash,
      step_output_json: repaired,
      meta_json: { attempt_number: passIndex }
    });

    // Persist mutation patch draft/repair lineage
    const patch = makePatch(candidate, repaired);
    const summary = patchSummary(patch);
    await insertMutation({
      run_id,
      from_step_id: previous_step_id,
      to_step_id: repairStep.id,
      patch_json: patch,
      summary_json: summary
    });

    // Advance
    candidate = repaired;
    previous_output_hash = repaired_hash;
    previous_step_id = repairStep.id;
  }

  // Compute final hashes/results (keep your existing approach, but based on FINAL candidate)
  const input_for_hash = { domain_id, contract_version, input_payload: candidate };
  const final_input_hash = sha256HexFromObject(input_for_hash);

  const output_for_hash = {
    validation: {
      pass: final_validation_report?.pass,
      score: final_validation_report?.score,
      issues: final_validation_report?.issues
    },
    result: { message: 'Run executed (MS14 async lifecycle)', candidate }
  };
  const final_output_hash = sha256HexFromObject(output_for_hash);

  const final_result = {
    message: 'Run executed (MS14 async lifecycle)',
    candidate,
    repair_summary: {
      enabled: repairEnabled,
      max_attempts: repairMaxAttempts,
      final_pass: !!final_validation_report?.pass
    }
  };

  // Artifacts
  await createArtifact({ run_id, artifact_type: 'validation_report', content: final_validation_report });
  await createArtifact({
    run_id,
    artifact_type: 'contract_snapshot',
    content: { domain_id, contract_version, schema_hash: contract.schema_hash }
  });

  // Finalize run ONCE (note: working_payload is FINAL candidate)
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
      JSON.stringify(candidate),
      run_id
    ]
  );
}

module.exports = { executeRun };