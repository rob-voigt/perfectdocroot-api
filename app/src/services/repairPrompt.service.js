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
// Repair prompt builder for MS12/13 (deterministic, compact)

/**
 * Build a repair prompt for a model or stub.
 * @param {Object} opts
 * @param {string} opts.domain_id
 * @param {string} opts.contract_version
 * @param {Object} opts.previous_output
 * @param {Object} opts.validation_report
 * @returns {{ system: string, user: string }}
 */
function buildRepairPrompt({ domain_id, contract_version, previous_output, validation_report }) {
  const system = `You are a JSON repair assistant. Given a domain and contract version, you will correct the provided JSON to pass validation.`;
  const user = [
    `Domain: ${domain_id}`,
    `Contract version: ${contract_version}`,
    `Previous JSON:`,
    JSON.stringify(previous_output, null, 2),
    `Validation issues:`,
    JSON.stringify(validation_report.issues || [], null, 2),
    `\nInstruction: Return corrected JSON only (no prose).`
  ].join('\n');
  return { system, user };
}

module.exports = { buildRepairPrompt };
