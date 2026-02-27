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