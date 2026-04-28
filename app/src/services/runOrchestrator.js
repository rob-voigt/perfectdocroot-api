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

const { pool } = require('../db/mysql');
const { sha256HexFromObject } = require('../utils/hash');
const crypto = require('crypto');

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

function sha256HexFromString(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
}

function isSha256Hex(s) {
  return typeof s === 'string' && /^[a-f0-9]{64}$/i.test(s);
}

function normalizeRunInputEnvelope(input_payload) {
  // MS15A: either legacy (candidate object), or envelope { input_payload, inputs }
  if (input_payload && typeof input_payload === 'object' && !Array.isArray(input_payload)) {
    if (
      Object.prototype.hasOwnProperty.call(input_payload, 'input_payload') &&
      Object.prototype.hasOwnProperty.call(input_payload, 'inputs')
    ) {
      const candidate_seed =
        input_payload.input_payload &&
        typeof input_payload.input_payload === 'object' &&
        !Array.isArray(input_payload.input_payload)
          ? input_payload.input_payload
          : {};
      const inputs = Array.isArray(input_payload.inputs) ? input_payload.inputs : [];
      return { candidate_seed, inputs, isEnvelope: true };
    }
  }
  return { candidate_seed: input_payload || {}, inputs: [], isEnvelope: false };
}

function buildSafetyIngestCandidate(workingPayload, validationReport) {
  const auditCase =
    workingPayload?.audit_case && typeof workingPayload.audit_case === 'object'
      ? workingPayload.audit_case
      : {};
  const uploadedImages = Array.isArray(workingPayload?.uploaded_images)
    ? workingPayload.uploaded_images
    : [];
  const artifact_ids = Array.from(
    new Set(
      (Array.isArray(workingPayload?.inputs) ? workingPayload.inputs : [])
        .map((input) => {
          if (!input || typeof input !== 'object') return null;
          if (typeof input.artifact_id === 'string' && input.artifact_id.trim()) {
            return input.artifact_id.trim();
          }
          return null;
        })
        .filter(Boolean)
    )
  );

  return {
    audit_case_id: auditCase.audit_case_id || null,
    artifact_ids,
    images: uploadedImages.map((image) => ({
      image_id: image.image_id,
      artifact_id: image.artifact_id || image.image_id,
      file_name: image.file_name,
      mime_type: image.mime_type,
      sha256_hash: image.sha256_hash,
      status: 'registered'
    })),
    validation_report: validationReport || {}
  };
}

const SAFETY_ONLY_FIELDS = new Set(['image_findings']);

function cloneJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cloneJsonValue(item));
  }

  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = cloneJsonValue(nested);
    }
    return out;
  }

  return value;
}

function removeSafetyOnlyFields(value) {
  if (Array.isArray(value)) {
    return value.map((item) => removeSafetyOnlyFields(item));
  }

  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      if (SAFETY_ONLY_FIELDS.has(key)) continue;
      out[key] = removeSafetyOnlyFields(nested);
    }
    return out;
  }

  return value;
}

function isSafetyIngestCandidate(candidate) {
  return !!(
    candidate &&
    typeof candidate === 'object' &&
    candidate.audit_case &&
    Array.isArray(candidate.uploaded_images)
  );
}

function selectDomainExecutionPath(domain_id) {
  if (domain_id === 'safety') return 'safety';
  if (domain_id === 'healthcare') return 'healthcare';
  if (domain_id === 'research') return 'research';
  return typeof domain_id === 'string' && domain_id.trim() ? domain_id.trim() : 'healthcare';
}

async function loadArtifactMeta(artifact_id) {
  const [uploadedRows] = await pool.execute(
    `SELECT id,
            sha256 AS content_hash,
            size_bytes,
            content_type,
            original_filename,
            created_at
       FROM uploaded_artifacts
      WHERE id = ?
      LIMIT 1`,
    [artifact_id]
  );

  if (uploadedRows && uploadedRows.length > 0) {
    const a = uploadedRows[0];
    return {
      id: a.id,
      source: 'uploaded_artifacts',
      artifact_type: 'uploaded_artifact',
      content_hash: a.content_hash,            // <-- comes from sha256 AS content_hash
      size_bytes: a.size_bytes,
      content_type: a.content_type || null,
      original_filename: a.original_filename || null,
      created_at: a.created_at instanceof Date ? a.created_at.toISOString() : a.created_at
    };
  }

  const [artifactRows] = await pool.execute(
    `SELECT id, artifact_type, content_hash, size_bytes, created_at
       FROM artifacts
      WHERE id = ?
      LIMIT 1`,
    [artifact_id]
  );

  if (!artifactRows || artifactRows.length === 0) return null;
  const legacy = artifactRows[0];
  return {
    id: legacy.id,
    source: 'artifacts',
    artifact_type: legacy.artifact_type,
    content_hash: legacy.content_hash,
    size_bytes: legacy.size_bytes,
    created_at: legacy.created_at instanceof Date ? legacy.created_at.toISOString() : legacy.created_at
  };
}

async function buildEvidenceManifest(inputs) {
  const inputs_resolved = [];
  const errors = [];

  for (let i = 0; i < inputs.length; i++) {
    const item = inputs[i];
    const type = item?.type;
    const purpose = typeof item?.purpose === 'string' && item.purpose.trim() ? item.purpose.trim() : null;
    const required = typeof item?.required === 'boolean' ? item.required : false;

    if (type === 'artifact_ref') {
      const artifact_id = typeof item?.artifact_id === 'string' ? item.artifact_id.trim() : '';
      const expected_hash = item?.expect?.content_hash;

      const meta = artifact_id ? await loadArtifactMeta(artifact_id) : null;

      if (!meta) {
        inputs_resolved.push({
          type,
          artifact_id: artifact_id || null,
          purpose,
          required,
          resolved: false,
          error: { code: 'artifact_not_found', message: 'Referenced artifact not found' }
        });
        if (required) {
          errors.push({
            code: 'artifact_not_found',
            message: `Required artifact not found: ${artifact_id || '(missing)'} `
          });
        }
        continue;
      }

      if (expected_hash != null) {
        if (!isSha256Hex(expected_hash)) {
          const invalidEntry = {
            type,
            artifact_id: meta.id,
            source: meta.source,
            purpose,
            required,
            resolved: false,
            error: { code: 'expected_hash_invalid', message: 'expect.content_hash must be sha256 hex' }
          };
          if (meta.artifact_type != null) invalidEntry.artifact_type = meta.artifact_type;
          inputs_resolved.push(invalidEntry);
          errors.push({ code: 'expected_hash_invalid', message: `Invalid expect.content_hash for artifact ${meta.id}` });
          continue;
        }

        if (String(meta.content_hash).toLowerCase() !== String(expected_hash).toLowerCase()) {
          const mismatchEntry = {
            type,
            artifact_id: meta.id,
            source: meta.source,
            purpose,
            required,
            resolved: false,
            content_hash: meta.content_hash,
            size_bytes: meta.size_bytes,
            created_at: meta.created_at,
            error: { code: 'artifact_hash_mismatch', message: 'Artifact content_hash did not match expect.content_hash' }
          };
          if (meta.artifact_type != null) mismatchEntry.artifact_type = meta.artifact_type;
          inputs_resolved.push(mismatchEntry);
          errors.push({ code: 'artifact_hash_mismatch', message: `Artifact hash mismatch: ${meta.id}` });
          continue;
        }
      }

      const resolvedEntry = {
        type,
        artifact_id: meta.id,
        source: meta.source,
        purpose,
        required,
        resolved: true,
        content_hash: meta.content_hash,
        size_bytes: meta.size_bytes,
        created_at: meta.created_at
      };
      if (meta.artifact_type != null) resolvedEntry.artifact_type = meta.artifact_type;
      inputs_resolved.push(resolvedEntry);
      continue;
    }

    if (type === 'inline_text') {
      const name = typeof item?.name === 'string' ? item.name.trim() : '';
      const content = typeof item?.content === 'string' ? item.content : '';
      const content_hash = sha256HexFromString(content);
      const size_bytes = Buffer.byteLength(content, 'utf8');
      inputs_resolved.push({
        type,
        name: name || null,
        purpose,
        required,
        resolved: true,
        content_hash,
        size_bytes
      });
      continue;
    }

    // Unknown types should not reach here (validated in routes), but be defensive.
    inputs_resolved.push({
      type: type || null,
      purpose,
      required,
      resolved: false,
      error: { code: 'unsupported_input_type', message: 'Unsupported input type' }
    });
    errors.push({ code: 'unsupported_input_type', message: `Unsupported input type: ${type}` });
  }

  return {
    evidence_manifest_version: '1',
    inputs_resolved,
    errors
  };
}

function computeEvidenceHashFromManifest(manifest) {
  const identity_inputs = (manifest?.inputs_resolved || []).map((x) => {
    if (x.type === 'artifact_ref') {
      return {
        type: 'artifact_ref',
        artifact_id: x.artifact_id,
        content_hash: x.content_hash || null,
        purpose: x.purpose || null,
        required: !!x.required,
        resolved: !!x.resolved
      };
    }
    if (x.type === 'inline_text') {
      return {
        type: 'inline_text',
        name: x.name || null,
        content_hash: x.content_hash || null,
        purpose: x.purpose || null,
        required: !!x.required,
        resolved: !!x.resolved
      };
    }
    return { type: x.type || null, required: !!x.required, resolved: !!x.resolved };
  });

  return sha256HexFromObject({ evidence_manifest_version: '1', inputs: identity_inputs });
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
  try {
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

    const input_payload = run.input_payload
      ? typeof run.input_payload === 'string'
        ? JSON.parse(run.input_payload)
        : run.input_payload
      : {};

    // MS15A: normalize legacy payload vs envelope
    const { candidate_seed, inputs } = normalizeRunInputEnvelope(input_payload);

    // working_payload: parse if present, else use input_payload
    let candidate =
      run.working_payload == null
        ? candidate_seed
        : typeof run.working_payload === 'string'
          ? JSON.parse(run.working_payload)
          : run.working_payload;

    const original_candidate_seed = candidate_seed;

    // Parse repair_json safely
    let repairEnabled = false;
    let repairMaxAttempts = 2;
    if (run.repair_json) {
      try {
        const repairObj = typeof run.repair_json === 'string' ? JSON.parse(run.repair_json) : run.repair_json;
        repairEnabled = !!repairObj.enabled;
        const maxA = Number.isFinite(repairObj.max_attempts)
          ? Math.max(0, Math.min(5, Math.floor(repairObj.max_attempts)))
          : 2;
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

      await pool.execute(`UPDATE runs SET status = ?, completed_at = ? WHERE id = ? LIMIT 1`, [
        'failed',
        isoToMysqlDatetime3(completed_at_iso),
        run_id
      ]);
      await createArtifact({ run_id, artifact_type: 'validation_report', content: report });
      return;
    }

    // Use parsed repair config
    const maxValidationPasses = 1 + repairMaxAttempts;

    // ----------------------------
    // MS15A: Resolve evidence inputs[] and compute deterministic hashes
    // ----------------------------
    const evidence_manifest = await buildEvidenceManifest(inputs);
    const seed_hash = sha256HexFromObject({ domain_id, contract_version, input_payload: original_candidate_seed });
    const evidence_hash = computeEvidenceHashFromManifest(evidence_manifest);
    const final_input_hash = sha256HexFromObject({
      domain_id,
      contract_version,
      contract_schema_hash: contract.schema_hash,
      seed_hash,
      evidence_hash
    });

    const provenance = {
      provenance_version: '1',
      hashes: { seed_hash, evidence_hash, input_hash: final_input_hash },
      evidence_manifest
    };

    // MS15A improvement: persist provenance + input_hash early so evidence is recorded
    // even if later steps (repairs/mutations/finalize) crash.
    await pool.execute(
      `UPDATE runs
          SET input_hash = ?,
              provenance = ?
        WHERE id = ?
        LIMIT 1`,
      [final_input_hash, JSON.stringify(provenance), run_id]
    );

    // If required evidence failed to resolve, fail run immediately.
    if (Array.isArray(evidence_manifest.errors) && evidence_manifest.errors.length > 0) {
      completed_at_iso = nowIso();
      const report = {
        report_id: crypto.randomUUID(),
        domain_id,
        contract_version,
        pass: false,
        score: 0,
        issues: evidence_manifest.errors.map((e) => ({ code: e.code, message: e.message })),
        created_at: completed_at_iso
      };

      await createArtifact({ run_id, artifact_type: 'validation_report', content: report });
      await pool.execute(
        `UPDATE runs
            SET status = ?,
                input_hash = ?,
                output_hash = NULL,
                validation_report = ?,
                result_json = ?,
                provenance = ?,
                completed_at = ?,
                working_payload = ?
          WHERE id = ?
          LIMIT 1`,
        [
          'failed',
          final_input_hash,
          JSON.stringify(report),
          JSON.stringify({ message: 'Evidence resolution failed (MS15A)', candidate: null }),
          JSON.stringify(provenance),
          isoToMysqlDatetime3(completed_at_iso),
          JSON.stringify(candidate),
          run_id
        ]
      );
      return;
    }

    // Draft step
    let previous_output_hash = sha256HexFromObject(candidate);
    const draftSeq = await getNextSeq(run_id);
    const draftStep = await insertRunStep({
      run_id,
      seq: draftSeq,
      type: 'draft',
      status: 'ok',
      input_hash: final_input_hash,
      output_hash: previous_output_hash,
      step_output_json: candidate
    });

    let previous_step_id = draftStep.id;

    // Loop: validate, repair, validate, repair...
    let final_validation_report = null;
    let final_pass = false;

    for (let passIndex = 1; passIndex <= maxValidationPasses; passIndex++) {
      // Validate current candidate
      const { ok, issues } = validateAgainstSchema(contract.schema_json, candidate);
      const pass = !!ok;
      const score = pass ? 100 : Math.max(0, 100 - (issues?.length || 0) * 10);
      completed_at_iso = nowIso();

      const validation_report = {
        report_id: crypto.randomUUID(),
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
        schema: contract.schema_json
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

    let finalCandidate = candidate;
    let finalValidationReport = final_validation_report;
    let finalPass = final_pass;

    const workingPayload = cloneJsonValue(candidate);
    const domainPath = selectDomainExecutionPath(domain_id);
    console.log(`[execution] domain_path_selected: ${domainPath}`);

    if (domainPath === 'safety' && isSafetyIngestCandidate(workingPayload)) {
      const ingestContract = await getContract({ domain_id: 'safety', contract_version: '1.1' });
      const validationSchema = ingestContract?.schema_json || contract.schema_json;

      finalCandidate = buildSafetyIngestCandidate(workingPayload, {});
      const { ok, issues } = validateAgainstSchema(validationSchema, finalCandidate);

      const pass = !!ok;
      const score = pass ? 100 : Math.max(0, 100 - (issues?.length || 0) * 10);

      finalValidationReport = {
        report_id: crypto.randomUUID(),
        domain_id,
        contract_version: ingestContract?.contract_version || contract_version,
        pass,
        score,
        issues: issues || [],
        created_at: nowIso()
      };

      finalPass = pass;
      finalCandidate.validation_report = finalValidationReport;
    } else if (domainPath !== 'safety') {
      finalCandidate = removeSafetyOnlyFields(workingPayload);

      const { ok, issues } = validateAgainstSchema(contract.schema_json, finalCandidate);
      const pass = !!ok;
      const score = pass ? 100 : Math.max(0, 100 - (issues?.length || 0) * 10);

      finalValidationReport = {
        report_id: crypto.randomUUID(),
        domain_id,
        contract_version,
        pass,
        score,
        issues: issues || [],
        created_at: nowIso()
      };
      finalPass = pass;
    }

    // Compute final output hash (include input_hash linkage)
    const output_for_hash = {
      input_hash: final_input_hash,
      validation: {
        pass: finalValidationReport?.pass,
        score: finalValidationReport?.score,
        issues: finalValidationReport?.issues
      },
      result: { message: 'Run executed (MS14 async lifecycle)', candidate: finalCandidate }
    };
    const final_output_hash = sha256HexFromObject(output_for_hash);

    const final_result = {
      message: 'Run executed (MS14 async lifecycle)',
      candidate: finalCandidate,
      repair_summary: {
        enabled: repairEnabled,
        max_attempts: repairMaxAttempts,
        final_pass: !!finalValidationReport?.pass
      }
    };

    // Artifacts
    await createArtifact({ run_id, artifact_type: 'validation_report', content: finalValidationReport });
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
              provenance = ?,
              completed_at = ?,
              working_payload = ?
        WHERE id = ?
        LIMIT 1`,
      [
        finalPass ? 'succeeded' : 'failed',
        final_input_hash,
        final_output_hash,
        JSON.stringify(finalValidationReport),
        JSON.stringify(final_result),
        JSON.stringify(provenance),
        isoToMysqlDatetime3(completed_at_iso),
        JSON.stringify(finalCandidate),
        run_id
      ]
    );
  } catch (err) {
    const completed_at_iso = nowIso();
    await pool.execute(
      `UPDATE runs
          SET status = ?,
              last_error = ?,
              completed_at = ?
        WHERE id = ?
        LIMIT 1`,
      ['failed', err?.stack || String(err), isoToMysqlDatetime3(completed_at_iso), run_id]
    );
    throw err;
  }
}

module.exports = {
  executeRun,
  __private: {
    isSafetyIngestCandidate,
    selectDomainExecutionPath,
    removeSafetyOnlyFields
  }
};
