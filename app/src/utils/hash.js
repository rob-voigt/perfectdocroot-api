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
const { canonicalStringify } = require('./canonicalJson');

function sha256HexFromObject(obj) {
  const s = canonicalStringify(obj);
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

module.exports = { sha256HexFromObject };
