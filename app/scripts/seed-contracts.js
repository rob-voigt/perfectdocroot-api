'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const { upsertContract } = require('../src/services/contractRepo');
const { pool } = require('../src/db/mysql');

async function main() {
  await upsertContract({
    domain_id: 'healthcare',
    contract_version: '0.2',
    schema_json: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        hello: { type: 'string' },
        goodbye: { type: 'string' }
      },
      required: ['hello', 'goodbye']
    }
  });

  await upsertContract({
    domain_id: 'healthcare',
    contract_version: '0.1',
    schema_json: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        hello: { type: 'string' }
      },
      required: ['hello']
    }
  });

  console.log('[seed] inserted healthcare contracts: 0.2 and 0.1');
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch (err) {
      console.error('[seed] failed to close DB pool:', err?.message || err);
    }
  });