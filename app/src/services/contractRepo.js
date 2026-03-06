'use strict';

const crypto = require('crypto');
const { pool } = require('../db/mysql');
const { sha256HexFromObject } = require('../utils/hash');

function nowIso() {
  return new Date().toISOString();
}

function isoToMysqlDatetime3(iso) {
  const d = new Date(iso);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(),3)}`;
}

async function listContracts() {
  const [rows] = await pool.execute(
    `SELECT domain_id, contract_version, schema_hash, created_at
     FROM contracts
     ORDER BY domain_id ASC, contract_version ASC`
  );
  return rows;
}

async function getContract({ domain_id, contract_version }) {
  const [rows] = await pool.execute(
    `SELECT id, domain_id, contract_version, schema_json, schema_hash, created_at
     FROM contracts
     WHERE domain_id = ? AND contract_version = ?
     LIMIT 1`,
    [domain_id, contract_version]
  );

  if (!rows.length) return null;
  const r = rows[0];

  const schema_json = (typeof r.schema_json === 'string') ? JSON.parse(r.schema_json) : r.schema_json;

  return {
    id: r.id,
    domain_id: r.domain_id,
    contract_version: r.contract_version,
    schema_json,
    schema_hash: r.schema_hash,
    created_at: r.created_at
  };
}

async function upsertContract({ domain_id, contract_version, schema_json }) {
  const created_at_iso = nowIso();
  const created_at = isoToMysqlDatetime3(created_at_iso);

  const schema_hash = sha256HexFromObject(schema_json);

  // Does it already exist?
  const existing = await getContract({ domain_id, contract_version });

  if (existing) {
    await pool.execute(
      `UPDATE contracts
       SET schema_json = ?, schema_hash = ?, created_at = ?
       WHERE domain_id = ? AND contract_version = ?`,
      [JSON.stringify(schema_json), schema_hash, created_at, domain_id, contract_version]
    );

    return {
      id: existing.id,
      domain_id,
      contract_version,
      schema_hash,
      created_at: created_at_iso
    };
  }

  const id = crypto.randomUUID();

  await pool.execute(
    `INSERT INTO contracts (id, domain_id, contract_version, schema_json, schema_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, domain_id, contract_version, JSON.stringify(schema_json), schema_hash, created_at]
  );

  return {
    id,
    domain_id,
    contract_version,
    schema_hash,
    created_at: created_at_iso
  };
}

module.exports = { listContracts, getContract, upsertContract };