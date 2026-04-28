'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const { getContract } = require('../src/services/contractRepo');
const { pool } = require('../src/db/mysql');

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
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

  const properties = contract.schema_json?.properties || {};
  const summary = {
    domain_id,
    contract_version,
    schema_hash: contract.schema_hash,
    has_hello: hasOwn(properties, 'hello'),
    has_goodbye: hasOwn(properties, 'goodbye'),
    has_audit_case: hasOwn(properties, 'audit_case'),
    has_uploaded_images: hasOwn(properties, 'uploaded_images'),
    has_inputs: hasOwn(properties, 'inputs')
  };

  console.log('[verify] contract schema summary:', JSON.stringify(summary, null, 2));

  if (domain_id === 'healthcare' && contract_version === '1.0') {
    const valid =
      summary.has_hello === false &&
      summary.has_goodbye === false &&
      summary.has_audit_case === true &&
      summary.has_uploaded_images === true;

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
