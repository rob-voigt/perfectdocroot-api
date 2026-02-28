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