'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { validateAgainstSchema } = require('../src/services/schemaValidate');
const {
  buildRun1IngestPayload
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
