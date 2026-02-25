'use strict';

const express = require('express');

const router = express.Router();

router.get('/', (req, res) => {
  res.status(200).json({
    message: 'PDR API v1 (stub)',
    requestId: req.requestId
  });
});

module.exports = { v1Router: router };