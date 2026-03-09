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

// IMPORTANT: use Ajv 2020 build for "$schema": draft/2020-12
const Ajv2020 = require('ajv/dist/2020');

const ajv = new Ajv2020({
  allErrors: true,
  strict: false
});

function validateAgainstSchema(schema, data) {
  const validate = ajv.compile(schema);
  const ok = validate(data);

  const issues = [];
  if (!ok && Array.isArray(validate.errors)) {
    for (const e of validate.errors) {
      const missing = e.params && e.params.missingProperty ? ` (missing: ${e.params.missingProperty})` : '';
      issues.push({
        path: e.instancePath || '',
        keyword: e.keyword,
        message: (e.message || 'schema validation error') + missing
      });
    }
  }

  return { ok: !!ok, issues };
}

module.exports = { validateAgainstSchema };
