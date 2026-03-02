'use strict';

const { pool } = require('../db/mysql');

function serializeMetadata(metadata_json) {
	if (metadata_json === undefined) return null;
	if (metadata_json === null) return null;
	return (typeof metadata_json === 'object')
		? JSON.stringify(metadata_json)
		: metadata_json;
}

function parseMetadata(metadata_json) {
	if (typeof metadata_json !== 'string') return metadata_json;
	try {
		return JSON.parse(metadata_json);
	} catch {
		return metadata_json;
	}
}

function shapeUploadedArtifact(row, { includeStoredPath = false } = {}) {
	if (!row) return null;

	const result = {
		id: row.id,
		sha256: row.sha256,
		size_bytes: row.size_bytes,
		content_type: row.content_type,
		original_filename: row.original_filename,
		metadata_json: parseMetadata(row.metadata_json),
		created_at: row.created_at
	};

	if (includeStoredPath) {
		result.stored_path = row.stored_path;
	}

	return result;
}

async function createUploadedArtifact({
	id,
	sha256,
	size_bytes,
	content_type,
	original_filename,
	stored_path,
	metadata_json
}) {
	await pool.execute(
		`INSERT INTO uploaded_artifacts
			(id, sha256, size_bytes, content_type, original_filename, stored_path, metadata_json)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		[
			id,
			sha256,
			size_bytes,
			content_type,
			original_filename,
			stored_path,
			serializeMetadata(metadata_json)
		]
	);

	return getUploadedArtifact(id);
}

async function getUploadedArtifact(id, { includeStoredPath = false } = {}) {
	const [rows] = await pool.execute(
		`SELECT id, sha256, size_bytes, content_type, original_filename, stored_path, metadata_json, created_at
		 FROM uploaded_artifacts
		 WHERE id = ?
		 LIMIT 1`,
		[id]
	);

	if (!rows.length) return null;
	return shapeUploadedArtifact(rows[0], { includeStoredPath });
}

module.exports = { createUploadedArtifact, getUploadedArtifact };