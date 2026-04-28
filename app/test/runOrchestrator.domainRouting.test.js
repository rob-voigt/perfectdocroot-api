'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'test';
process.env.DB_PASS = process.env.DB_PASS || 'test';
process.env.DB_NAME = process.env.DB_NAME || 'test';
process.env.DB_PORT = process.env.DB_PORT || '3306';

const orchestratorPath = path.resolve(__dirname, '../src/services/runOrchestrator.js');
const { __private } = require(orchestratorPath);

test('selectDomainExecutionPath returns explicit domain routes', () => {
  assert.equal(__private.selectDomainExecutionPath('healthcare'), 'healthcare');
  assert.equal(__private.selectDomainExecutionPath('safety'), 'safety');
  assert.equal(__private.selectDomainExecutionPath('research'), 'research');
});

test('selectDomainExecutionPath preserves unknown non-empty domains', () => {
  assert.equal(__private.selectDomainExecutionPath('custom'), 'custom');
  assert.equal(__private.selectDomainExecutionPath(''), 'healthcare');
});

test('isSafetyIngestCandidate is true only for safety ingest shape', () => {
  assert.equal(
    __private.isSafetyIngestCandidate({
      audit_case: { audit_case_id: 'ac-1' },
      uploaded_images: [{ image_id: 'img-1' }]
    }),
    true
  );
  assert.equal(
    __private.isSafetyIngestCandidate({
      audit_case: { audit_case_id: 'ac-1' }
    }),
    false
  );
  assert.equal(
    __private.isSafetyIngestCandidate({
      uploaded_images: [{ image_id: 'img-1' }]
    }),
    false
  );
});

test('removeSafetyOnlyFields strips image_findings recursively and keeps generic fields', () => {
  const input = {
    audit_case_id: 'ac-1',
    findings: [{ id: 'f-1' }],
    image_findings: [{ image_id: 'img-1', label: 'trip' }],
    nested: {
      image_findings: [{ image_id: 'img-2', label: 'spill' }],
      keep_me: true
    }
  };

  const output = __private.removeSafetyOnlyFields(input);

  assert.equal(Object.prototype.hasOwnProperty.call(output, 'image_findings'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(output.nested, 'image_findings'), false);
  assert.deepEqual(output.findings, [{ id: 'f-1' }]);
  assert.equal(output.nested.keep_me, true);
});
