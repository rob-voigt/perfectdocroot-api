'use strict';

const fs = require("fs");
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const { upsertContract } = require('../src/services/contractRepo');
const { pool } = require('../src/db/mysql');

async function main() {
  await upsertContract({
    domain_id: 'healthcare',
    contract_version: '0.2',
    schema_json: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        hello: { type: 'string' },
        goodbye: { type: 'string' }
      },
      required: ['hello', 'goodbye']
    }
  });

  await upsertContract({
    domain_id: 'healthcare',
    contract_version: '0.1',
    schema_json: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        hello: { type: 'string' }
      },
      required: ['hello']
    }
  });

    await upsertContract({
    domain_id: 'safety',
    contract_version: '1.0',
    schema_json: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            audit_case: {
              type: 'object',
              additionalProperties: false,
              properties: {
                audit_case_id: { type: 'string', minLength: 1 },
                case_number: { type: 'string', minLength: 1 },
                title: { type: 'string', minLength: 1 },
                company_name: { type: 'string', minLength: 1 },
                site_name: { type: 'string', minLength: 1 },
                site_location: { type: 'string', minLength: 1 },
                auditor_name: { type: 'string', minLength: 1 },
                audit_date: { type: 'string', minLength: 1 }
              },
              required: [
                'audit_case_id',
                'case_number',
                'title',
                'company_name',
                'site_name',
                'site_location',
                'auditor_name',
                'audit_date'
              ]
            },
            uploaded_images: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  image_id: { type: 'string', minLength: 1 },
                  file_name: { type: 'string', minLength: 1 },
                  file_path: { type: 'string', minLength: 1 },
                  mime_type: { type: 'string', minLength: 1 },
                  file_size_bytes: { type: 'integer', minimum: 1 },
                  sha256_hash: { type: 'string', minLength: 1 },
                  sort_order: { type: 'integer', minimum: 1 }
                },
                required: [
                  'image_id',
                  'file_name',
                  'file_path',
                  'mime_type',
                  'file_size_bytes',
                  'sha256_hash',
                  'sort_order'
                ]
              }
            }
          },
          required: ['audit_case', 'uploaded_images']
        },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            audit_case_id: { type: 'string', minLength: 1 },
            artifact_ids: {
              type: 'array',
              items: { type: 'string', minLength: 1 }
            },
            hazard_taxonomy: {
              type: 'object',
              additionalProperties: false,
              properties: {
                pack_version: { type: 'string', minLength: 1 },
                domain_id: { type: 'string', const: 'safety' },
                hazards: {
                  type: 'array',
                  minItems: 1,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      id: { type: 'string', minLength: 1 },
                      label: { type: 'string', minLength: 1 },
                      description: { type: 'string', minLength: 1 }
                    },
                    required: ['id', 'label', 'description']
                  }
                }
              },
              required: ['pack_version', 'domain_id', 'hazards']
            },
            severity_scale: {
              type: 'object',
              additionalProperties: false,
              properties: {
                pack_version: { type: 'string', minLength: 1 },
                domain_id: { type: 'string', const: 'safety' },
                severity_levels: {
                  type: 'array',
                  minItems: 1,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      level: {
                        type: 'string',
                        enum: ['low', 'medium', 'high', 'critical']
                      },
                      description: { type: 'string', minLength: 1 }
                    },
                    required: ['level', 'description']
                  }
                },
                likelihood_levels: {
                  type: 'array',
                  minItems: 1,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      level: {
                        type: 'string',
                        enum: ['low', 'medium', 'high']
                      },
                      description: { type: 'string', minLength: 1 }
                    },
                    required: ['level', 'description']
                  }
                }
              },
              required: ['pack_version', 'domain_id', 'severity_levels', 'likelihood_levels']
            }
          },
          required: ['audit_case_id', 'artifact_ids', 'hazard_taxonomy', 'severity_scale']
        }
      ]
    }
  });

  console.log('[seed] inserted contracts: healthcare 0.2, healthcare 0.1, safety 1.0');
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch (err) {
      console.error('[seed] failed to close DB pool:', err?.message || err);
    }
  });