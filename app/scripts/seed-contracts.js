'use strict';

const fs = require("fs");
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const { upsertContract } = require('../src/services/contractRepo');
const { pool } = require('../src/db/mysql');

function readContractSchema(fileName) {
  return JSON.parse(
    fs.readFileSync(path.resolve(__dirname, `../contracts/${fileName}`), 'utf8')
  );
}

async function main() {
  await upsertContract({
    domain_id: 'healthcare',
    contract_version: '1.0',
    schema_json: readContractSchema('healthcare-1.0-input.json')
  });

  await upsertContract({
    domain_id: 'safety',
      contract_version: '1.1',
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
            images: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  image_id: { type: 'string', minLength: 1 },
                  artifact_id: { type: 'string', minLength: 1 },
                  file_name: { type: 'string', minLength: 1 },
                  mime_type: { type: 'string', minLength: 1 },
                  sha256_hash: { type: 'string', minLength: 1 },
                  status: { type: 'string', const: 'registered' }
                },
                required: [
                  'image_id',
                  'artifact_id',
                  'file_name',
                  'mime_type',
                  'sha256_hash',
                  'status'
                ]
              }
            },
            validation_report: {
              type: 'object',
              additionalProperties: false,
              properties: {
                report_id: { type: 'string', minLength: 1 },
                domain_id: { type: 'string', const: 'safety' },
                contract_version: { type: 'string', minLength: 1 },
                pass: { type: 'boolean' },
                score: { type: 'integer', minimum: 0, maximum: 100 },
                issues: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      path: { type: 'string' },
                      keyword: { type: 'string' },
                      message: { type: 'string' }
                    },
                    required: ['path', 'keyword', 'message']
                  }
                },
                created_at: { type: 'string', minLength: 1 }
              }
            }
          },
          required: ['audit_case_id', 'artifact_ids', 'images', 'validation_report']
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
        },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            audit_case_id: { type: 'string', minLength: 1 },
            image_findings: {
              type: 'array',
              items: {
                type: 'object'
              }
            }
          },
          required: ['audit_case_id', 'image_findings']
        },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            audit_case_id: { type: 'string', minLength: 1 },
            image_findings: {
              type: 'array',
              items: {
                type: 'object'
              }
            },
            assumptions: {
              type: 'array',
              items: {
                type: 'object'
              }
            },
            mitigation_guidelines: {
              type: 'object',
              additionalProperties: false,
              properties: {
                pack_version: { type: 'string', minLength: 1 },
                domain_id: { type: 'string', const: 'safety' },
                mitigations: {
                  type: 'object'
                }
              },
              required: ['pack_version', 'domain_id', 'mitigations']
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
          required: [
            'audit_case_id',
            'image_findings',
            'assumptions',
            'mitigation_guidelines',
            'severity_scale'
          ]
        },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            audit_case_id: { type: 'string', minLength: 1 },
            findings: {
              type: 'array',
              items: { type: 'object' }
            },
            assumptions: {
              type: 'array',
              items: { type: 'object' }
            },
            risks: {
              type: 'array',
              items: { type: 'object' }
            },
            evidence_references: {
              type: 'array',
              items: { type: 'string' }
            },
            report_style_guide: { type: 'string', minLength: 1 }
          },
          required: [
            'audit_case_id',
            'findings',
            'assumptions',
            'risks',
            'evidence_references',
            'report_style_guide'
          ]
        }
      ]
    }
  });

  console.log('[seed] inserted contract: healthcare 1.0');
  console.log('[seed] inserted contract: safety 1.1');
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