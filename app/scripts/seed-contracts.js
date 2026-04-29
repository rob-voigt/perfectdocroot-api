'use strict';

const fs = require("fs");
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const { getContract, upsertContract } = require('../src/services/contractRepo');
const { pool } = require('../src/db/mysql');
const { sha256HexFromObject } = require('../src/utils/hash');

function readContractSchema(fileName) {
  return JSON.parse(
    fs.readFileSync(path.resolve(__dirname, `../contracts/${fileName}`), 'utf8')
  );
}

async function ensureContract({ domain_id, contract_version, schema_json }) {
  const existing = await getContract({ domain_id, contract_version });
  const schema_hash = sha256HexFromObject(schema_json);

  if (existing) {
    if (existing.schema_hash === schema_hash) {
      console.log(`[seed] unchanged contract: ${domain_id} ${contract_version}`);
      return existing;
    }

    await pool.execute(
      `UPDATE contracts
          SET schema_json = ?,
              schema_hash = ?
        WHERE id = ?
        LIMIT 1`,
      [JSON.stringify(schema_json), schema_hash, existing.id]
    );

    console.log(`[seed] updated contract schema: ${domain_id} ${contract_version}`);
    return getContract({ domain_id, contract_version });
  }

  await upsertContract({ domain_id, contract_version, schema_json });
  console.log(`[seed] created contract: ${domain_id} ${contract_version}`);
  return getContract({ domain_id, contract_version });
}

async function main() {
  await ensureContract({
    domain_id: 'healthcare',
    contract_version: '1.0',
    schema_json: readContractSchema('healthcare-1.0-input.json')
  });

  await ensureContract({
    domain_id: 'research',
    contract_version: '1.0',
    schema_json: readContractSchema('research-1.0-input.json')
  });

  await ensureContract({
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
            },
            inputs: {
              type: 'object',
              additionalProperties: false,
              properties: {
                text: { type: ['string', 'null'] },
                images: {
                  type: 'array',
                  items: {
                    type: 'object'
                  }
                },
                artifacts: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      artifact_id: { type: 'string', minLength: 1 },
                      source_image_id: { type: ['string', 'null'] }
                    },
                    required: ['artifact_id']
                  }
                }
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
            report_style_guide: { type: 'string', minLength: 1 },
            no_findings_basis: { type: 'string', minLength: 1 },
            input_limitations: {
              type: 'array',
              items: { type: 'string', minLength: 1 }
            },
            recommended_next_inputs: {
              type: 'array',
              items: { type: 'string', minLength: 1 }
            },
            confidence_level: {
              type: 'string',
              enum: ['low', 'moderate', 'high']
            },
            clarification_summary: {
              type: 'string',
              minLength: 1
            },
            clarification_questions: {
              type: 'array',
              items: {
                oneOf: [
                  {
                    type: 'string',
                    minLength: 1
                  },
                  {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      question_id: { type: 'string', minLength: 1 },
                      question: { type: 'string', minLength: 1 },
                      priority: {
                        type: 'string',
                        enum: ['low', 'medium', 'high']
                      }
                    },
                    required: ['question']
                  }
                ]
              }
            }
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
