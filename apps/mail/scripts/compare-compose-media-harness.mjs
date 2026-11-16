#!/usr/bin/env node
// Prints a before/after table from two floating-composer-media harness results.
// Usage: node scripts/compare-compose-media-harness.mjs baseline.json after.json
import { readFileSync } from 'node:fs';

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) {
  console.error('Usage: compare-compose-media-harness.mjs <before.json> <after.json>');
  process.exit(2);
}
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const before = read(beforePath);
const after = read(afterPath);
const fixed = (value) =>
  typeof value === 'number' ? value.toFixed(value >= 100 ? 0 : 2) : String(value);
const ratio = (a, b) => (a > 0 ? `${(b / a).toFixed(2)}x` : 'n/a');

const rows = [];
const row = (name, a, b) => rows.push([name, fixed(a), fixed(b), ratio(a, b)]);
for (const phase of ['idle', 'uploading', 'churn', 'afterCompletion']) {
  for (const key of ['p50', 'p95', 'max']) {
    row(
      `keystroke ${phase} ${key} (ms)`,
      before.summary.keystrokeMs[phase][key],
      after.summary.keystrokeMs[phase][key]
    );
  }
}
const per = (key) =>
  row(key, before.summary.perRunMedian[key], after.summary.perRunMedian[key]);
for (const key of [
  'editorRenders',
  'editorRendersAtSelect',
  'editorAttachmentRefsAtSelect',
  'editorRendersWhileUploading',
  'commits',
  'commitMs',
  'transactions',
  'editorIdentities',
]) {
  per(key);
}

const width = Math.max(...rows.map((entry) => entry[0].length));
console.log(`before: ${before.label} (${before.runs} runs, ${before.node})`);
console.log(`after:  ${after.label} (${after.runs} runs, ${after.node})`);
console.log(`${'metric'.padEnd(width)}  ${'before'.padStart(10)} ${'after'.padStart(10)} ${'ratio'.padStart(7)}`);
for (const [name, a, b, r] of rows) {
  console.log(`${name.padEnd(width)}  ${a.padStart(10)} ${b.padStart(10)} ${r.padStart(7)}`);
}
console.log('\nbehavior (per measured run):');
for (const key of Object.keys(before.summary.behavior)) {
  console.log(
    `  ${key}: before=${JSON.stringify(before.summary.behavior[key])} after=${JSON.stringify(after.summary.behavior[key])}`
  );
}
console.log(
  '\nControl: compare the idle rows. A ratio far from 1.00 there means the two runs are not comparable (machine noise or load); rerun interleaved.'
);
