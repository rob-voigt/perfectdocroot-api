/*
Copyright 2026 Robert Scott Voigt

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
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

async function createArtifact({ run_id, artifact_type, content }) {
  const id = crypto.randomUUID();
  const created_at_iso = nowIso();
  const created_at = isoToMysqlDatetime3(created_at_iso);

  const content_hash = sha256HexFromObject(content);
  const size_bytes = Buffer.byteLength(JSON.stringify(content), 'utf8');

  const sql = `
    INSERT INTO artifacts
      (id, run_id, artifact_type, content_json, content_hash, size_bytes, created_at)
    VALUES
      (:id, :run_id, :artifact_type, :content_json, :content_hash, :size_bytes, :created_at)
  `;

  await pool.execute(sql, {
    id,
    run_id,
    artifact_type,
    content_json: JSON.stringify(content),
    content_hash,
    size_bytes,
    created_at
  });

  return {
    id,
    run_id,
    artifact_type,
    content_hash,
    size_bytes,
    created_at: created_at_iso,
    content
  };
}

async function listArtifactsForRun(run_id) {
  const [rows] = await pool.execute(
    `SELECT id, artifact_type, content_hash, size_bytes, created_at
     FROM artifacts WHERE run_id = ?`,
    [run_id]
  );

  return rows;
}

async function getArtifact(id) {
  const [rows] = await pool.execute(
    `SELECT * FROM artifacts WHERE id = ? LIMIT 1`,
    [id]
  );

  if (!rows.length) return null;

  const r = rows[0];
  return {
    id: r.id,
    run_id: r.run_id,
    artifact_type: r.artifact_type,
    content_hash: r.content_hash,
    size_bytes: r.size_bytes,
    created_at: r.created_at,
    content: typeof r.content_json === 'string'
      ? JSON.parse(r.content_json)
      : r.content_json
  };
}

module.exports = { createArtifact, listArtifactsForRun, getArtifact };
