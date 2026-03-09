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

const express = require('express');
const crypto = require('node:crypto');
const fs = require('node:fs');
const Busboy = require('busboy');
const { requireApiKey } = require('../middleware/auth');
const { storeUploadedFile } = require('../services/uploadedArtifactStore');
const { createUploadedArtifact, getUploadedArtifact } = require('../services/uploadedArtifactRepo');

const router = express.Router();
const ALLOWED_CONTENT_TYPES = new Set([
	'application/pdf',
	'text/plain',
	'text/markdown',
	'application/json',
	'text/csv'
]);

/*
MS15 regression smoke tests (curl)

- 415 on unsupported content-type must never crash the process or surface as 503.
- This route must never permit unhandled promise rejections.
- On early rejection, incoming file streams must always be drained.

# 401 (no key)
curl -i -X POST "$BASE/v1/uploaded-artifacts" \
	-F "file=@/tmp/ms15.txt;type=text/plain"

# 415 (unsupported content-type)
curl -i -X POST "$BASE/v1/uploaded-artifacts" \
	-H "X-PDR-API-KEY: $PDR_API_KEY" \
	-F "file=@/tmp/ms15.txt;type=application/x-msdownload"

# 400 (bad metadata)
curl -i -X POST "$BASE/v1/uploaded-artifacts" \
	-H "X-PDR-API-KEY: $PDR_API_KEY" \
	-F "file=@/tmp/ms15.txt;type=text/plain" \
	-F 'metadata={not-json'

# 201 (success)
curl -i -X POST "$BASE/v1/uploaded-artifacts" \
	-H "X-PDR-API-KEY: $PDR_API_KEY" \
	-F "file=@/tmp/ms15.txt;type=text/plain" \
	-F 'metadata={"label":"smoke"}'
*/

function buildError(code, message, status) {
	const err = new Error(message || code);
	err.code = code;
	if (status) err.status = status;
	return err;
}

function mapUploadError(err) {
	if (!err) return buildError('internal_error', 'Unexpected error', 500);

	if (err.code === 'payload_too_large') {
		err.status = 413;
		return err;
	}

	if (err.code === 'unsupported_media_type' || err.code === 'unsupported_content_type') {
		err.code = 'unsupported_media_type';
		err.status = 415;
		return err;
	}

	if (err.code === 'malformed_metadata') {
		err.status = 400;
		return err;
	}

	if (!err.status) err.status = 500;
	return err;
}

function parseTags(raw) {
	if (raw === undefined || raw === null || raw === '') return undefined;

	const trimmed = String(raw).trim();
	if (!trimmed) return [];

	if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
		return JSON.parse(trimmed);
	}

	return trimmed
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
}

function parseMetadata(fields) {
	let metadata = {};

	if (fields.metadata !== undefined && fields.metadata !== null && fields.metadata !== '') {
		try {
			metadata = JSON.parse(fields.metadata);
		} catch {
			throw buildError('malformed_metadata', 'metadata must be valid JSON', 400);
		}
	}

	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
		metadata = {};
	}

	if (fields.domain_id !== undefined && fields.domain_id !== '') {
		metadata.domain_id = fields.domain_id;
	}
	if (fields.label !== undefined && fields.label !== '') {
		metadata.label = fields.label;
	}
	if (fields.source !== undefined && fields.source !== '') {
		metadata.source = fields.source;
	}
	if (fields.tags !== undefined && fields.tags !== '') {
		try {
			metadata.tags = parseTags(fields.tags);
		} catch {
			throw buildError('malformed_metadata', 'tags must be comma-separated text or valid JSON', 400);
		}
	}

	return metadata;
}

function parseMultipartAndStore(req, artifact_id) {
	return new Promise((resolve, reject) => {
		const contentType = req.headers['content-type'] || '';
		if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
			reject(buildError('unsupported_media_type', 'Content-Type must be multipart/form-data', 415));
			return;
		}

		const fields = {};
		let file = null;
		let fileCount = 0;
		let storePromise = null;
		let settled = false;

		const bb = Busboy({ headers: req.headers });

		const done = (err, data) => {
			if (settled) return;
			settled = true;
			if (err) reject(err);
			else resolve(data);
		};

		bb.on('file', (fieldname, stream, info) => {
			fileCount += 1;

			if (fieldname !== 'file') {
				stream.resume();
				done(buildError('bad_request', 'Expected file field named "file"', 400));
				return;
			}

			if (file) {
				stream.resume();
				done(buildError('bad_request', 'Exactly one file is required', 400));
				return;
			}

			const { filename, mimeType } = info || {};
			if (!filename) {
				stream.resume();
				done(buildError('bad_request', 'Uploaded file is missing filename', 400));
				return;
			}

			file = {
				original_filename: filename,
				content_type: mimeType || 'application/octet-stream'
			};

			if (!ALLOWED_CONTENT_TYPES.has(file.content_type)) {
				stream.resume();
				done(buildError('unsupported_media_type', `Unsupported content_type: ${file.content_type}`, 415));
				return;
			}

			storePromise = storeUploadedFile({
				artifact_id,
				fileStream: stream,
				original_filename: file.original_filename,
				content_type: file.content_type,
				metadata: {}
			});
			storePromise.catch(() => {});
		});

		bb.on('field', (name, value) => {
			fields[name] = value;
		});

		bb.on('error', (err) => {
			done(mapUploadError(err));
		});

		bb.on('finish', () => {
			if (!file || fileCount !== 1 || !storePromise) {
				done(buildError('bad_request', 'Exactly one file field named "file" is required', 400));
				return;
			}

			storePromise
				.then((stored) => done(null, { fields, file, stored }))
				.catch((err) => done(mapUploadError(err)));
		});

		req.pipe(bb);
	});
}

router.post('/uploaded-artifacts', requireApiKey, async (req, res, next) => {
	try {
		const artifact_id = crypto.randomUUID();
		const { fields, stored } = await parseMultipartAndStore(req, artifact_id);
		const metadata = parseMetadata(fields);

		const artifact = await createUploadedArtifact({
			id: artifact_id,
			sha256: stored.sha256,
			size_bytes: stored.size_bytes,
			content_type: stored.content_type,
			original_filename: stored.original_filename,
			stored_path: stored.stored_path,
			metadata_json: metadata
		});

		return res.status(201).json({ artifact, requestId: req.requestId });
	} catch (err) {
		next(mapUploadError(err));
	}
});

router.get('/uploaded-artifacts/:id', requireApiKey, async (req, res, next) => {
	try {
		const artifact = await getUploadedArtifact(req.params.id, { includeStoredPath: true });

		if (!artifact) {
			return res.status(404).json({
				error: 'not_found',
				message: 'Uploaded artifact not found',
				requestId: req.requestId
			});
		}

		if (!artifact.stored_path) {
			return res.status(500).json({
				error: 'internal_error',
				message: 'Stored file path is missing',
				requestId: req.requestId
			});
		}

		const filename = String(artifact.original_filename || 'download.bin').replace(/"/g, '_');
		const stream = fs.createReadStream(artifact.stored_path);

		stream.on('error', (error) => {
			if (error && error.code === 'ENOENT') {
				if (!res.headersSent) {
					res.status(500).json({
						error: 'internal_error',
						message: 'Stored file is missing on disk',
						requestId: req.requestId
					});
				}
				return;
			}
			next(error);
		});

		res.setHeader('Content-Type', artifact.content_type || 'application/octet-stream');
		res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
		stream.pipe(res);
	} catch (err) {
		next(err);
	}
});

module.exports = { uploadedArtifactsRouter: router };
