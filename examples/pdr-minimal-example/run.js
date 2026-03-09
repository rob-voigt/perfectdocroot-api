'use strict';

const fs = require('fs/promises');
const path = require('path');

async function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');

  try {
    const text = await fs.readFile(envPath, 'utf8');

    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;

      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();

      if (key && process.env[key] == null) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env is optional
  }
}

async function readJsonFile(fileName) {
  const filePath = path.join(__dirname, fileName);
  const text = await fs.readFile(filePath, 'utf8');
  return JSON.parse(text);
}

async function apiFetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();

  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Non-JSON response from ${url}: ${text}`);
  }

  return { res, json };
}

async function main() {
  await loadDotEnv();

  const API_KEY = (process.env.PDR_API_KEY || '').trim();
  const BASE_URL = (process.env.PDR_BASE_URL || 'http://127.0.0.1:3000/v1').trim();
  const ADMIN_BASE_URL = (process.env.PDR_ADMIN_BASE_URL || 'http://127.0.0.1:3000/admin').trim();

  if (!API_KEY) {
    throw new Error('Missing PDR_API_KEY. Copy .env.example to .env and set your API key.');
  }

  const input_payload = await readJsonFile('payload.json');

  console.log('Creating governed run...');
  const { res: createRes, json: createJson } = await apiFetchJson(`${BASE_URL}/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PDR-API-KEY': API_KEY
    },
    body: JSON.stringify({
      domain_id: 'healthcare',
      input_payload
    })
  });

  if (!createRes.ok) {
    console.error('Run creation failed.');
    console.error(JSON.stringify(createJson, null, 2));
    process.exit(1);
  }

  const run = createJson?.run;
  if (!run?.id) {
    throw new Error('Run creation response did not include run.id');
  }

  console.log('');
  console.log('Run created:');
  console.log(`  id: ${run.id}`);
  console.log(`  domain_id: ${run.domain_id}`);
  console.log(`  contract_version: ${run.contract_version}`);
  console.log(`  status: ${run.status}`);

  console.log('');
  console.log('Fetching final run detail...');
  const { res: runRes, json: runJson } = await apiFetchJson(`${BASE_URL}/runs/${run.id}`, {
    headers: {
      'X-PDR-API-KEY': API_KEY
    }
  });

  if (!runRes.ok) {
    console.error('Run fetch failed.');
    console.error(JSON.stringify(runJson, null, 2));
    process.exit(1);
  }

  const finalRun = runJson?.run;
  if (!finalRun) {
    throw new Error('Run detail response did not include run object');
  }

  console.log('');
  console.log('Final run detail:');
  console.log(JSON.stringify(finalRun, null, 2));

  console.log('');
  console.log('Inspect this run in the admin console:');
  console.log(`${ADMIN_BASE_URL}/runs/${run.id}`);
}

main().catch((err) => {
  console.error('');
  console.error('Example failed:');
  console.error(err.message || err);
  process.exit(1);
});