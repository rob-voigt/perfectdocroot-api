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

test('isResearchExtractCandidateShape identifies research extract payload shape', () => {
  assert.equal(
    __private.isResearchExtractCandidateShape({
      audit_case_id: 'case-r-1',
      research_request: { prompt: 'Prompt' },
      artifact_ids: []
    }),
    true
  );
  assert.equal(
    __private.isResearchExtractCandidateShape({
      audit_case_id: 'case-r-1',
      research_request: { prompt: 'Prompt' },
      artifact_ids: [],
      claims: []
    }),
    false
  );
});

test('buildDeterministicResearchExtractOutput creates claim/citation pairs for strong source-implied prompt', () => {
  const output = __private.buildDeterministicResearchExtractOutput({
    audit_case_id: 'case-r-2',
    research_request: {
      prompt: 'Research NIST AI RMF, ISO 42001, and the EU AI Act for enterprise governance.'
    },
    artifact_ids: []
  });

  assert.equal(output.claims.length >= 1, true);
  assert.equal(output.citations.length >= 1, true);
  assert.ok(output.citations.some((c) => c.source === 'NIST AI Risk Management Framework'));
  assert.ok(output.citations.some((c) => c.source === 'ISO/IEC 42001'));
  assert.ok(output.citations.some((c) => c.source === 'EU AI Act'));
});

test('maybeEnrichResearchExtractCandidate applies deterministic fallback when claims/citations are empty', async () => {
  const previousMode = process.env.PDR_EXECUTION_MODE;
  const previousOpenAiKey = process.env.PDR_OPENAI_API_KEY;
  const previousGlobalFetch = global.fetch;
  process.env.PDR_EXECUTION_MODE = 'live';
  delete process.env.PDR_OPENAI_API_KEY;
  global.fetch = async () => {
    throw new Error('fetch should not be called without API key');
  };

  try {
    const candidate = await __private.maybeEnrichResearchExtractCandidate({
      domain_id: 'research',
      stage_id: 'extract',
      candidate: {
        audit_case_id: 'case-r-3',
        research_request: { prompt: 'Research governance controls for enterprise AI systems.' },
        artifact_ids: []
      },
      input_payload: {}
    });

    assert.equal(candidate.claims.length, 1);
    assert.equal(candidate.citations.length, 1);
    assert.equal(candidate.claims[0].text, 'Research governance controls for enterprise AI systems.');
    assert.equal(candidate.claims[0].statement, 'Research governance controls for enterprise AI systems.');
    assert.equal(candidate.claims[0].confidence, 0.5);
    assert.equal(candidate.claims[0].confidence_score, 0.5);
    assert.equal(candidate.citations[0].id, 'source-1');
    assert.equal(candidate.citations[0].source, 'user_input');
    assert.equal(candidate.citations[0].text, 'Research governance controls for enterprise AI systems.');
  } finally {
    if (previousMode === undefined) delete process.env.PDR_EXECUTION_MODE; else process.env.PDR_EXECUTION_MODE = previousMode;
    if (previousOpenAiKey === undefined) delete process.env.PDR_OPENAI_API_KEY; else process.env.PDR_OPENAI_API_KEY = previousOpenAiKey;
    global.fetch = previousGlobalFetch;
  }
});

test('applyResearchExtractFallbackIfNeeded does not override non-empty llm output', () => {
  const preserved = __private.applyResearchExtractFallbackIfNeeded(
    {
      research_request: { prompt: 'ignored' }
    },
    {
      claims: [{ text: 'Claim A', confidence: 0.9 }],
      citations: [{ id: 'c-1', source: 'Source A', text: 'Evidence A' }]
    }
  );

  assert.deepEqual(preserved.claims, [{ text: 'Claim A', confidence: 0.9 }]);
  assert.deepEqual(preserved.citations, [{ id: 'c-1', source: 'Source A', text: 'Evidence A' }]);
});

test('maybeEnrichResearchExtractCandidate skips non-extract research stages', async () => {
  const previousMode = process.env.PDR_EXECUTION_MODE;
  process.env.PDR_EXECUTION_MODE = 'live';

  try {
    const seed = {
      audit_case_id: 'case-r-4',
      research_request: { prompt: 'Research NIST AI RMF' },
      artifact_ids: []
    };
    const candidate = await __private.maybeEnrichResearchExtractCandidate({
      domain_id: 'research',
      stage_id: 'report',
      candidate: seed,
      input_payload: {}
    });

    assert.deepEqual(candidate, seed);
  } finally {
    if (previousMode === undefined) delete process.env.PDR_EXECUTION_MODE; else process.env.PDR_EXECUTION_MODE = previousMode;
  }
});

test('maybeEnrichResearchSynthesizeCandidate adds minimum structured_report sections when missing', async () => {
  const candidate = await __private.maybeEnrichResearchSynthesizeCandidate({
    domain_id: 'research',
    stage_id: 'synthesize',
    candidate: {
      audit_case_id: 'case-r-5',
      claims: [{ text: 'Claim summary text.' }]
    }
  });

  assert.equal(Array.isArray(candidate.structured_report.sections), true);
  assert.equal(candidate.structured_report.sections.length, 1);
  assert.equal(candidate.structured_report.sections[0].title, 'Summary');
  assert.equal(candidate.structured_report.sections[0].content, 'Claim summary text.');
  assert.equal(candidate.executive_summary, 'Claim summary text.');
  assert.ok(candidate.limitations.includes('Fallback summary generated from user-provided research request.'));
  assert.ok(candidate.limitations.includes('No external source artifacts were provided.'));
  assert.ok(candidate.assumptions.some((a) => a.assumption_text === 'Output may be limited without external artifacts.'));
});

test('maybeEnrichResearchSynthesizeCandidate falls back to research_request text when claim text missing', async () => {
  const candidate = await __private.maybeEnrichResearchSynthesizeCandidate({
    domain_id: 'research',
    stage_id: 'synthesize',
    candidate: {
      audit_case_id: 'case-r-7',
      research_request: { prompt: 'Analyze ISO 42001 controls for governance.' },
      claims: [{ note: 'missing text field' }]
    }
  });

  assert.equal(candidate.structured_report.sections[0].content, 'Analyze ISO 42001 controls for governance.');
  assert.equal(candidate.executive_summary, 'Analyze ISO 42001 controls for governance.');
});

test('maybeEnrichResearchSynthesizeCandidate preserves existing valid sections', async () => {
  const seed = {
    audit_case_id: 'case-r-6',
    claims: [{ text: 'Claim text' }],
    structured_report: {
      sections: [{ title: 'Existing', content: 'Already valid.' }]
    },
    executive_summary: 'Keep me'
  };

  const candidate = await __private.maybeEnrichResearchSynthesizeCandidate({
    domain_id: 'research',
    stage_id: 'synthesize',
    candidate: seed
  });

  assert.deepEqual(candidate, seed);
});
