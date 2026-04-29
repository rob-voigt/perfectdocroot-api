'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const { getContract } = require('../src/services/contractRepo');
const { pool } = require('../src/db/mysql');

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function listSchemaBranches(schemaJson) {
  if (!schemaJson || typeof schemaJson !== 'object') return [];
  if (Array.isArray(schemaJson.oneOf)) return schemaJson.oneOf;
  return [schemaJson];
}

async function main() {
  const domain_id = process.argv[2] || 'healthcare';
  const contract_version = process.argv[3] || '1.0';

  const contract = await getContract({ domain_id, contract_version });

  if (!contract) {
    console.error(`[verify] contract not found: ${domain_id} ${contract_version}`);
    process.exitCode = 1;
    return;
  }

  const branches = listSchemaBranches(contract.schema_json);
  const ingestBranch = branches.find((branch) => {
    const required = Array.isArray(branch?.required) ? branch.required : [];
    return required.includes('audit_case') && required.includes('uploaded_images');
  }) || {};
  const clarifyBranch = branches.find((branch) => {
    const required = Array.isArray(branch?.required) ? branch.required : [];
    return required.includes('audit_case_id') && required.includes('findings');
  }) || {};
  const riskAssessBranch = branches.find((branch) => {
    const required = Array.isArray(branch?.required) ? branch.required : [];
    return required.includes('audit_case_id')
      && required.includes('findings')
      && required.includes('assumptions')
      && required.includes('intervention_guidelines')
      && required.includes('acuity_scale');
  }) || {};
  const reportBranch = branches.find((branch) => {
    const required = Array.isArray(branch?.required) ? branch.required : [];
    return required.includes('audit_case_id')
      && required.includes('findings')
      && required.includes('risks')
      && required.includes('evidence_references')
      && required.includes('report_style_guide');
  }) || {};
  const properties = ingestBranch?.properties || {};
  const clarifyProperties = clarifyBranch?.properties || {};
  const riskAssessProperties = riskAssessBranch?.properties || {};
  const reportProperties = reportBranch?.properties || {};
  const summary = {
    domain_id,
    contract_version,
    schema_hash: contract.schema_hash,
    branch_count: branches.length,
    has_hello: hasOwn(properties, 'hello'),
    has_goodbye: hasOwn(properties, 'goodbye'),
    has_audit_case: hasOwn(properties, 'audit_case'),
    has_uploaded_images: hasOwn(properties, 'uploaded_images'),
    has_inputs: hasOwn(properties, 'inputs'),
    has_clarify_audit_case_id: hasOwn(clarifyProperties, 'audit_case_id'),
    has_clarify_findings: hasOwn(clarifyProperties, 'findings'),
    has_risk_assess_findings: hasOwn(riskAssessProperties, 'findings'),
    has_risk_assess_assumptions: hasOwn(riskAssessProperties, 'assumptions'),
    has_risk_assess_intervention_guidelines: hasOwn(riskAssessProperties, 'intervention_guidelines'),
    has_risk_assess_acuity_scale: hasOwn(riskAssessProperties, 'acuity_scale'),
    has_report_findings: hasOwn(reportProperties, 'findings'),
    has_report_risks: hasOwn(reportProperties, 'risks'),
    has_report_evidence_references: hasOwn(reportProperties, 'evidence_references'),
    has_report_style_guide: hasOwn(reportProperties, 'report_style_guide')
  };

  console.log('[verify] contract schema summary:', JSON.stringify(summary, null, 2));

  if (domain_id === 'healthcare' && contract_version === '1.0') {
    const valid =
      summary.has_hello === false &&
      summary.has_goodbye === false &&
      summary.has_audit_case === true &&
      summary.has_uploaded_images === true &&
      summary.has_clarify_audit_case_id === true &&
      summary.has_clarify_findings === true &&
      summary.has_risk_assess_findings === true &&
      summary.has_risk_assess_assumptions === true &&
      summary.has_risk_assess_intervention_guidelines === true &&
      summary.has_risk_assess_acuity_scale === true &&
      summary.has_report_findings === true &&
      summary.has_report_risks === true &&
      summary.has_report_evidence_references === true &&
      summary.has_report_style_guide === true;

    if (!valid) {
      console.error('[verify] healthcare/1.0 schema is still stale');
      process.exitCode = 1;
      return;
    }

    console.log('[verify] healthcare/1.0 schema repair confirmed');
  }
}

main()
  .catch((err) => {
    console.error('[verify] failed:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch (err) {
      console.error('[verify] failed to close DB pool:', err?.message || err);
    }
  });
