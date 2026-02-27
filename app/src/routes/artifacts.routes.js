'use strict';

const express = require('express');
const { listArtifactsForRun, getArtifact } = require('../services/artifactRepo');

const router = express.Router();

router.get('/runs/:id/artifacts', async (req, res, next) => {
  try {
    const artifacts = await listArtifactsForRun(req.params.id);
    return res.status(200).json({ artifacts, requestId: req.requestId });
  } catch (err) { next(err); }
});

router.get('/artifacts/:artifact_id', async (req, res, next) => {
  try {
    const artifact = await getArtifact(req.params.artifact_id);
    if (!artifact) {
      return res.status(404).json({
        error: 'not_found',
        requestId: req.requestId
      });
    }
    return res.status(200).json({ artifact, requestId: req.requestId });
  } catch (err) { next(err); }
});

module.exports = { artifactsRouter: router };