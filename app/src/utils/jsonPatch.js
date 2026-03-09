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

/**
 * Minimal JSON diff generator (not full RFC6902 compliant,
 * but deterministic and sufficient for mutation tracking).
 *
 * Generates operations:
 *  - { op: 'add', path: '/a/b', value: ... }
 *  - { op: 'remove', path: '/a/b' }
 *  - { op: 'replace', path: '/a/b', value: ... }
 */

function isObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function makePatch(fromObj, toObj, basePath = '') {
  const patch = [];

  const fromKeys = isObject(fromObj) ? Object.keys(fromObj) : [];
  const toKeys = isObject(toObj) ? Object.keys(toObj) : [];

  const allKeys = new Set([...fromKeys, ...toKeys]);

  for (const key of allKeys) {
    const path = `${basePath}/${key}`;

    if (!(key in toObj)) {
      patch.push({ op: 'remove', path });
      continue;
    }

    if (!(key in fromObj)) {
      patch.push({ op: 'add', path, value: toObj[key] });
      continue;
    }

    const fromVal = fromObj[key];
    const toVal = toObj[key];

    if (isObject(fromVal) && isObject(toVal)) {
      patch.push(...makePatch(fromVal, toVal, path));
      continue;
    }

    if (JSON.stringify(fromVal) !== JSON.stringify(toVal)) {
      patch.push({ op: 'replace', path, value: toVal });
    }
  }

  return patch;
}

function patchSummary(patch) {
  return {
    changed_paths: patch.map(op => op.path),
    changed_count: patch.length
  };
}

module.exports = { makePatch, patchSummary };
