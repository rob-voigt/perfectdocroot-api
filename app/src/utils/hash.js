'use strict';

const crypto = require('crypto');
const { canonicalStringify } = require('./canonicalJson');

function sha256HexFromObject(obj) {
  const s = canonicalStringify(obj);
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

module.exports = { sha256HexFromObject };