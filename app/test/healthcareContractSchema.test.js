'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { validateAgainstSchema } = require('../src/services/schemaValidate');
const {
  buildRun1IngestPayload,
  buildRun3ClarifyPayload,
  buildRun4RiskAssessPayload,
  buildRun5ReportPayload
} = require('/Users/robertvoigt/Sites/pdr-safety-audit-app/domain-packs/healthcare/payloads/buildHealthcarePayloads');

function readSchema(fileName) {
  const filePath = path.resolve(__dirname, '../contracts', fileName);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('healthcare ingest payload builder matches the downstream healthcare/1.0 schema', () => {
  const schema = readSchema('healthcare-1.0-input.json');
  const payload = buildRun1IngestPayload({
    auditCase: {
      id: 'case-healthcare-1',
      case_number: 'HC-1',
      title: 'Healthcare Review',
      company_name: 'Clinic',
      site_name: 'Ward',
      site_location: 'Unit 1',
      auditor_name: 'Reviewer',
      audit_date: '2026-04-28',
      ingest_text: 'Clinical context'
    },
    images: [],
    artifacts: [
      {
        artifact_id: 'artifact-1',
        source_image_id: null
      }
    ],
    contractVersion: '1.0'
  });

  const result = validateAgainstSchema(schema, payload.input_payload);

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
});

test('healthcare clarify payload builder matches the downstream healthcare/1.0 schema', () => {
  const schema = readSchema('healthcare-1.0-input.json');
  const payload = buildRun3ClarifyPayload({
    auditCaseId: 'case-healthcare-1',
    hazardDetectResult: {
      output: {
        findings: [
          {
            finding_id: 'finding-1',
            source_image_id: 'img-1',
            hazard_code: 'FALL_RISK',
            severity: 'high',
            confidence_score: 0.95,
            description: 'Missing mobility aid near transfer area.',
            evidence_notes: 'Confirm ambulation controls.'
          }
        ]
      }
    },
    contractVersion: '1.0'
  });

  const result = validateAgainstSchema(schema, payload.input_payload);
  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
});

test('healthcare clarify schema fails explicitly when findings is missing', () => {
  const schema = readSchema('healthcare-1.0-input.json');
  const clarifyCandidateMissingFindings = {
    audit_case_id: 'case-healthcare-1'
  };

  const result = validateAgainstSchema(schema, clarifyCandidateMissingFindings);

  assert.equal(result.ok, false);
  assert.ok(
    (result.issues || []).some(
      (issue) =>
        issue.keyword === 'required' &&
        typeof issue.message === 'string' &&
        issue.message.includes("'findings'")
    ),
    JSON.stringify(result.issues, null, 2)
  );
});

test('healthcare risk_assess payload builder matches the downstream healthcare/1.0 schema', () => {
  const schema = readSchema('healthcare-1.0-input.json');
  const payload = buildRun4RiskAssessPayload({
    auditCaseId: 'case-healthcare-1',
    hazardDetectResult: {
      output: {
        findings: []
      }
    },
    clarifyResult: {
      output: {
        assumptions: []
      }
    },
    mitigationGuidelines: {
      version: '1',
      interventions: {}
    },
    severityScale: {
      version: '1',
      levels: []
    },
    contractVersion: '1.0'
  });

  const result = validateAgainstSchema(schema, payload.input_payload);
  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
});

test('healthcare risk_assess schema fails explicitly when intervention_guidelines is missing', () => {
  const schema = readSchema('healthcare-1.0-input.json');
  const riskAssessCandidateMissingGuidelines = {
    audit_case_id: 'case-healthcare-1',
    findings: [],
    assumptions: [],
    acuity_scale: {}
  };

  const result = validateAgainstSchema(schema, riskAssessCandidateMissingGuidelines);

  assert.equal(result.ok, false);
  assert.ok(
    (result.issues || []).some(
      (issue) =>
        issue.keyword === 'required' &&
        typeof issue.message === 'string' &&
        issue.message.includes("'intervention_guidelines'")
    ),
    JSON.stringify(result.issues, null, 2)
  );
});

test('healthcare report payload builder matches the downstream healthcare/1.0 schema', () => {
  const schema = readSchema('healthcare-1.0-input.json');
  const payload = buildRun5ReportPayload({
    auditCaseId: 'case-healthcare-1',
    ingestResult: {
      output: {
        artifactIds: ['artifact-1']
      }
    },
    hazardDetectResult: {
      output: {
        findings: []
      }
    },
    clarifyResult: {
      output: {
        assumptions: []
      }
    },
    riskAssessResult: {
      output: {
        risks: []
      }
    },
    reportStyleGuide: 'style-guide-v1',
    contractVersion: '1.0'
  });

  const result = validateAgainstSchema(schema, payload.input_payload);
  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
});

test('healthcare report schema fails explicitly when risks is missing', () => {
  const schema = readSchema('healthcare-1.0-input.json');
  const reportCandidateMissingRisks = {
    audit_case_id: 'case-healthcare-1',
    findings: [],
    evidence_references: [],
    report_style_guide: 'style-guide-v1'
  };

  const result = validateAgainstSchema(schema, reportCandidateMissingRisks);

  assert.equal(result.ok, false);
  assert.ok(
    (result.issues || []).some(
      (issue) =>
        issue.keyword === 'required' &&
        typeof issue.message === 'string' &&
        issue.message.includes("'risks'")
    ),
    JSON.stringify(result.issues, null, 2)
  );
});
