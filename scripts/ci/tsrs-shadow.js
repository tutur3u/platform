#!/usr/bin/env node

// Shadow-compare the experimental tsrs checker (Rust TypeScript port) against
// the authoritative tsc gate. tsc stays the required check; this script only
// measures speed/memory and reports diagnostic-set differences.
//
// Usage:
//   node scripts/ci/tsrs-shadow.js [--project <tsconfig>]... [--tsrs <bin>]
//     [--tsc <bin>] [--json <file>] [--summary <file>] [--annotate]
//     [--fail-on-diff]

const fs = require('node:fs');
const path = require('node:path');

const {
  DIAGNOSTIC_LINE,
  compareDiagnostics,
  diagnosticKey,
  locationKey,
  runChecker,
} = require('../ts-diagnostics.js');

const ROOT = path.resolve(__dirname, '../..');
const TSRS_VERSION = '0.18.0-ts7.1.0-dev.20260929';
// Projects whose diagnostics matched tsc during the recorded evaluation. Keep
// this list aligned with the promotion criteria in the tsrs shadow docs.
const DEFAULT_PROJECTS = [
  'packages/types/tsconfig.build.json',
  'packages/utils/tsconfig.typecheck.json',
  'packages/supabase/tsconfig.typecheck.json',
  'packages/internal-api/tsconfig.typecheck.json',
  'apps/tasks/tsconfig.json',
  'apps/calendar/tsconfig.json',
];
const MAX_ANNOTATIONS = 20;

function parseArgs(argv) {
  const options = {
    projects: [],
    tsc: path.join(ROOT, 'node_modules', '.bin', 'tsc'),
    tsrs: 'tsrs',
    json: null,
    summary: null,
    annotate: false,
    failOnDiff: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const next = () => {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for ${arg}`);
      return value;
    };
    if (arg === '--project') options.projects.push(next());
    else if (arg === '--tsc') options.tsc = next();
    else if (arg === '--tsrs') options.tsrs = next();
    else if (arg === '--json') options.json = next();
    else if (arg === '--summary') options.summary = next();
    else if (arg === '--annotate') options.annotate = true;
    else if (arg === '--fail-on-diff') options.failOnDiff = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.projects.length) options.projects = [...DEFAULT_PROJECTS];
  return options;
}

function compareProject(project, options) {
  const tsc = runChecker(options.tsc, project, options);
  const tsrs = runChecker(options.tsrs, project, options);
  const comparison = compareDiagnostics(tsc.diagnostics, tsrs.diagnostics);
  const locations = compareDiagnostics(
    tsc.diagnostics,
    tsrs.diagnostics,
    locationKey
  );
  const strip = (run) => ({
    exitCode: run.exitCode,
    signal: run.signal,
    wallMs: run.wallMs,
    maxRssBytes: run.maxRssBytes,
    crashed: run.crashed,
    diagnosticCount: run.diagnostics.length,
  });
  return {
    project,
    tsc: strip(tsc),
    tsrs: strip(tsrs),
    parity:
      comparison.equal &&
      !tsrs.crashed &&
      (tsc.exitCode === 0) === (tsrs.exitCode === 0),
    locationParity: locations.equal,
    onlyTsc: comparison.onlyExpected.map(diagnosticKey),
    onlyTsrs: comparison.onlyActual.map(diagnosticKey),
    speedup: tsrs.wallMs > 0 ? +(tsc.wallMs / tsrs.wallMs).toFixed(2) : null,
  };
}

function escapeAnnotation(value) {
  return String(value)
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
}

// Checkers run from the repository root, so reported paths are repo-relative.
function annotationsFor(result) {
  const lines = [];
  const add = (key, side) => {
    const match = DIAGNOSTIC_LINE.exec(key.split('\n')[0]);
    const file = match ? match.groups.file : result.project;
    const position = match
      ? `,line=${match.groups.line},col=${match.groups.column}`
      : '';
    lines.push(
      `::warning file=${file}${position},title=tsrs shadow (${side})::${escapeAnnotation(key)}`
    );
  };
  if (result.tsrs.crashed) {
    lines.push(
      `::warning file=${result.project},title=tsrs shadow::tsrs exited ${result.tsrs.exitCode ?? result.tsrs.signal} without diagnostics`
    );
  }
  for (const key of result.onlyTsc.slice(0, MAX_ANNOTATIONS))
    add(key, 'tsc only');
  for (const key of result.onlyTsrs.slice(0, MAX_ANNOTATIONS))
    add(key, 'tsrs only');
  return lines;
}

function formatMb(bytes) {
  return bytes == null ? 'n/a' : `${Math.round(bytes / 1024 / 1024)} MB`;
}

function summaryTable(results) {
  const rows = results.map(
    (result) =>
      `| \`${result.project}\` | ${result.tsc.wallMs} ms / ${formatMb(result.tsc.maxRssBytes)} | ${result.tsrs.wallMs} ms / ${formatMb(result.tsrs.maxRssBytes)} | ${result.speedup ?? 'n/a'}x | ${result.tsc.diagnosticCount} / ${result.tsrs.diagnosticCount} | ${result.parity ? 'yes' : 'NO'} | ${result.locationParity ? 'yes' : 'NO'} |`
  );
  return [
    `### tsrs shadow type-check (tsrs ${TSRS_VERSION})`,
    '',
    '| Project | tsc time / RSS | tsrs time / RSS | Speedup | Diagnostics tsc / tsrs | Set parity | Location parity |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    'tsc remains the required gate; differences are advisory.',
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const results = options.projects.map((project) =>
    compareProject(project, options)
  );
  const summary = summaryTable(results);
  console.log(summary);
  if (options.summary) fs.appendFileSync(options.summary, `${summary}\n`);
  if (options.annotate) {
    for (const result of results) {
      for (const line of annotationsFor(result)) console.log(line);
    }
  }
  if (options.json) {
    fs.mkdirSync(path.dirname(path.resolve(options.json)), { recursive: true });
    fs.writeFileSync(
      options.json,
      `${JSON.stringify({ tsrsVersion: TSRS_VERSION, results }, null, 2)}\n`
    );
  }
  const mismatched = results.filter((result) => !result.parity);
  return options.failOnDiff && mismatched.length ? 1 : 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_PROJECTS,
  TSRS_VERSION,
  annotationsFor,
  compareProject,
  parseArgs,
  summaryTable,
};
