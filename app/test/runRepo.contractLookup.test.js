'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'test';
process.env.DB_PASS = process.env.DB_PASS || 'test';
process.env.DB_NAME = process.env.DB_NAME || 'test';
process.env.DB_PORT = process.env.DB_PORT || '3306';

const runRepoPath = path.resolve(__dirname, '../src/services/runRepo.js');
const dbModulePath = path.resolve(__dirname, '../src/db/mysql.js');
const contractRepoPath = path.resolve(__dirname, '../src/services/contractRepo.js');
const artifactRepoPath = path.resolve(__dirname, '../src/services/artifactRepo.js');
const executionEnginePath = path.resolve(__dirname, '../src/execution/executionEngine.js');
const orchestratorPath = path.resolve(__dirname, '../src/services/runOrchestrator.js');

function toCacheEntry(modulePath, exports) {
  return {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports
  };
}

async function withCreateRun(contractMap, fn) {
  const modulePaths = [
    runRepoPath,
    dbModulePath,
    contractRepoPath,
    artifactRepoPath,
    executionEnginePath,
    orchestratorPath
  ];

  const originals = new Map(modulePaths.map((modulePath) => [modulePath, require.cache[modulePath]]));
  const insertedRuns = [];
  const createdArtifacts = [];

  const listContractsByDomain = async ({ domain_id }) =>
    Object.entries(contractMap)
      .filter(([key]) => key.startsWith(`${domain_id}/`))
      .map(([key]) => ({
        domain_id,
        contract_version: key.split('/')[1]
      }))
      .sort((a, b) => a.contract_version.localeCompare(b.contract_version));

  require.cache[dbModulePath] = toCacheEntry(dbModulePath, {
    pool: {
      execute: async (sql, params) => {
        insertedRuns.push({ sql, params });
        return [[], []];
      }
    }
  });

  require.cache[contractRepoPath] = toCacheEntry(contractRepoPath, {
    getContract: async ({ domain_id, contract_version }) =>
      contractMap[`${domain_id}/${contract_version}`] || null,
    getLatestContractByDomain: async ({ domain_id }) => {
      const contracts = await listContractsByDomain({ domain_id });
      const latest = contracts.at(-1);
      return latest ? contractMap[`${domain_id}/${latest.contract_version}`] : null;
    },
    listContractsByDomain
  });

  require.cache[artifactRepoPath] = toCacheEntry(artifactRepoPath, {
    createArtifact: async (artifact) => {
      createdArtifacts.push(artifact);
      return artifact;
    }
  });

  require.cache[executionEnginePath] = toCacheEntry(executionEnginePath, {});
  require.cache[orchestratorPath] = toCacheEntry(orchestratorPath, { executeRun: async () => {} });
  delete require.cache[runRepoPath];

  try {
    const { createRun } = require(runRepoPath);
    return await fn({ createRun, insertedRuns, createdArtifacts });
  } finally {
    for (const [modulePath, original] of originals.entries()) {
      if (original) {
        require.cache[modulePath] = original;
      } else {
        delete require.cache[modulePath];
      }
    }
  }
}

function contract(domain_id, contract_version) {
  return {
    id: `${domain_id}-${contract_version}`,
    domain_id,
    contract_version,
    schema_json: { type: 'object' },
    schema_hash: `hash-${domain_id}-${contract_version}`,
    created_at: '2026-04-28T00:00:00.000Z'
  };
}

test('createRun resolves healthcare/1.0 exactly', async () => {
  await withCreateRun(
    {
      'healthcare/1.0': contract('healthcare', '1.0')
    },
    async ({ createRun, insertedRuns, createdArtifacts }) => {
      const run = await createRun({
        domain_id: 'healthcare',
        contract_version: '1.0',
        input_payload: { hello: 'hi', goodbye: 'bye' }
      });

      assert.equal(run.domain_id, 'healthcare');
      assert.equal(run.contract_version, '1.0');
      assert.equal(insertedRuns.length, 1);
      assert.equal(insertedRuns[0].params.domain_id, 'healthcare');
      assert.equal(insertedRuns[0].params.contract_version, '1.0');
      assert.equal(createdArtifacts.length, 1);
      assert.equal(createdArtifacts[0].content.contract_version, '1.0');
      assert.equal(createdArtifacts[0].content.schema_hash, 'hash-healthcare-1.0');
    }
  );
});

test('createRun resolves research/1.0 exactly', async () => {
  await withCreateRun(
    {
      'research/1.0': contract('research', '1.0')
    },
    async ({ createRun, insertedRuns, createdArtifacts }) => {
      const run = await createRun({
        domain_id: 'research',
        contract_version: '1.0',
        input_payload: { topic: 'registry alignment' }
      });

      assert.equal(run.domain_id, 'research');
      assert.equal(run.contract_version, '1.0');
      assert.equal(insertedRuns.length, 1);
      assert.equal(insertedRuns[0].params.domain_id, 'research');
      assert.equal(insertedRuns[0].params.contract_version, '1.0');
      assert.equal(createdArtifacts.length, 1);
      assert.equal(createdArtifacts[0].content.contract_version, '1.0');
      assert.equal(createdArtifacts[0].content.schema_hash, 'hash-research-1.0');
    }
  );
});

test('createRun still resolves existing healthcare 0.1 and 0.2 versions exactly', async () => {
  await withCreateRun(
    {
      'healthcare/0.1': contract('healthcare', '0.1'),
      'healthcare/0.2': contract('healthcare', '0.2'),
      'healthcare/1.0': contract('healthcare', '1.0')
    },
    async ({ createRun, insertedRuns, createdArtifacts }) => {
      for (const version of ['0.1', '0.2']) {
        const run = await createRun({
          domain_id: 'healthcare',
          contract_version: version,
          input_payload: { hello: 'hi', goodbye: 'bye' }
        });

        assert.equal(run.contract_version, version);
      }

      assert.deepEqual(
        insertedRuns.map(({ params }) => params.contract_version),
        ['0.1', '0.2']
      );
      assert.deepEqual(
        createdArtifacts.map(({ content }) => content.contract_version),
        ['0.1', '0.2']
      );
    }
  );
});

test('createRun fails explicitly for an unknown version', async () => {
  await withCreateRun(
    {
      'research/1.0': contract('research', '1.0')
    },
    async ({ createRun, insertedRuns, createdArtifacts }) => {
      await assert.rejects(
        () =>
          createRun({
            domain_id: 'research',
            contract_version: '9.9',
            input_payload: { topic: 'registry alignment' }
          }),
        (err) => {
          assert.equal(err.code, 'contract_not_found');
          assert.equal(err.statusCode, 404);
          assert.equal(err.domain_id, 'research');
          assert.equal(err.contract_version, '9.9');
          assert.deepEqual(err.available_versions, ['1.0']);
          assert.match(err.message, /Contract research\/9\.9 was not found/);
          return true;
        }
      );

      assert.equal(insertedRuns.length, 0);
      assert.equal(createdArtifacts.length, 0);
    }
  );
});
