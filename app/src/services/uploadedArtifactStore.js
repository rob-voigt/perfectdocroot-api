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

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const ALLOWED_CONTENT_TYPES = new Set([
	'application/pdf',
	'text/plain',
	'text/markdown',
	'application/json',
	'text/csv'
]);

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;

function getArtifactsBaseDir() {
	const baseDir = process.env.PDR_ARTIFACTS_DIR;
	if (!baseDir || !baseDir.trim()) {
		throw new Error('PDR_ARTIFACTS_DIR is required');
	}
	return baseDir;
}

function getMaxBytes() {
	const raw = process.env.PDR_ARTIFACT_MAX_BYTES;
	if (!raw || !raw.trim()) return DEFAULT_MAX_BYTES;

	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return DEFAULT_MAX_BYTES;
	}
	return parsed;
}

function sanitizeFilename(originalFilename) {
	if (!originalFilename || typeof originalFilename !== 'string') {
		return 'upload.bin';
	}

	const basename = path.basename(originalFilename.trim());
	const safe = basename.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
	if (!safe || safe === '.' || safe === '..') {
		return 'upload.bin';
	}
	return safe;
}

function toDateParts(date = new Date()) {
	const year = String(date.getUTCFullYear());
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	return { year, month, day };
}

function buildPayloadTooLargeError(message = 'Uploaded payload exceeds maximum allowed size') {
	const err = new Error(message);
	err.code = 'payload_too_large';
	return err;
}

async function deleteFileIfExists(filePath) {
	try {
		await fs.promises.unlink(filePath);
	} catch (error) {
		if (error && error.code !== 'ENOENT') {
			throw error;
		}
	}
}

async function storeUploadedFile({ artifact_id, fileStream, original_filename, content_type, metadata }) {
	void metadata;

	if (!artifact_id || typeof artifact_id !== 'string') {
		throw new Error('artifact_id is required');
	}

	if (!fileStream || typeof fileStream.pipe !== 'function') {
		throw new Error('fileStream must be a readable stream');
	}

	if (!ALLOWED_CONTENT_TYPES.has(content_type)) {
		const err = new Error(`Unsupported content_type: ${content_type}`);
		err.code = 'unsupported_content_type';
		throw err;
	}

	const baseDir = getArtifactsBaseDir();
	const maxBytes = getMaxBytes();
	const safeOriginalFilename = sanitizeFilename(original_filename);

	const { year, month, day } = toDateParts();
	const targetDir = path.join(baseDir, year, month, day, artifact_id);
	await fs.promises.mkdir(targetDir, { recursive: true });

	const storedPath = path.join(targetDir, safeOriginalFilename);
	const hash = crypto.createHash('sha256');
	let sizeBytes = 0;

	const meter = new Transform({
		transform(chunk, encoding, callback) {
			sizeBytes += chunk.length;
			if (sizeBytes > maxBytes) {
				callback(buildPayloadTooLargeError());
				return;
			}

			hash.update(chunk);
			callback(null, chunk);
		}
	});

	const writeStream = fs.createWriteStream(storedPath, { flags: 'wx' });

	try {
		await pipeline(fileStream, meter, writeStream);
	} catch (error) {
		await deleteFileIfExists(storedPath);
		throw error;
	}

	return {
		stored_path: storedPath,
		sha256: hash.digest('hex'),
		size_bytes: sizeBytes,
		content_type,
		original_filename: safeOriginalFilename
	};
}

module.exports = { storeUploadedFile };
