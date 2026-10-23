#!/usr/bin/env node

// Opt-in, finite qualification. It never changes the authoritative type gate.
const { execFileSync, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { inventory, assertNoCheckScripts } = require('./bun-check-inventory.js');
const {
  compareDiagnostics,
  diagnosticKey,
  locationKey,
  parseDiagnostics,
  parseMaxRssBytes,
} = require('../ts-diagnostics.js');
const ROOT = path.resolve(__dirname, '../..');
const SAMPLE = [
  'packages/types/tsconfig.build.json',
  'packages/utils/tsconfig.typecheck.json',
  'packages/ui/tsconfig.typecheck.json',
  'packages/supabase/tsconfig.typecheck.json',
  'packages/internal-api/tsconfig.typecheck.json',
  'apps/tasks/tsconfig.json',
  'apps/calendar/tsconfig.json',
  'apps/calendar/tsconfig.worker.json',
  'apps/meet/tsconfig.app.json',
  'apps/meet/tsconfig.cloudflare.json',
  'apps/web/tsconfig.json',
];
const FLAGS = ['--noEmit', '--incremental', 'false', '--composite', 'false'];
const sha256 = (bytes) =>
  crypto.createHash('sha256').update(bytes).digest('hex');

function parseArgs(argv) {
  const options = { out: null, threads: 6, runs: 5, projects: [], tsrs: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[++i];
    if (!value) throw new Error(`Missing value for ${arg}`);
    if (arg === '--out') options.out = path.resolve(value);
    else if (arg === '--threads') options.threads = Number(value);
    else if (arg === '--runs') options.runs = Number(value);
    else if (arg === '--project') options.projects.push(value);
    else if (arg === '--tsrs') options.tsrs = path.resolve(value);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.out)
    throw new Error('--out is required (use a private artifact directory)');
  if (
    !Number.isInteger(options.threads) ||
    options.threads < 1 ||
    options.threads > 8
  )
    throw new Error('--threads must be 1..8');
  if (!Number.isInteger(options.runs) || options.runs < 1 || options.runs > 10)
    throw new Error('--runs must be 1..10');
  if (!options.projects.length) options.projects = [...SAMPLE];
  return options;
}

function checkerArgs(checker, project, threads) {
  const flags = ['-p', project, ...FLAGS];
  if (checker === 'bun')
    return [
      'check',
      '--no-script',
      '--no-pretty',
      '--all',
      '--threads',
      String(threads),
      ...flags,
    ];
  if (checker === 'tsc') return [...flags, '--pretty', 'false'];
  return [...flags, '--pretty', 'false'];
}

function run(checker, binary, project, options, label) {
  const args = checkerArgs(checker, project, options.threads);
  const start = process.hrtime.bigint();
  const result = spawnSync(
    '/usr/bin/time',
    ['-v', 'timeout', '--kill-after=5s', '180s', binary, ...args],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        NO_COLOR: '1',
        RAYON_NUM_THREADS: String(options.threads),
        GOMAXPROCS: String(options.threads),
      },
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    }
  );
  if (result.error) throw result.error;
  const diagnostics = parseDiagnostics(result.stdout ?? '');
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  fs.writeFileSync(path.join(options.out, `${label}-${checker}.log`), log);
  return {
    checker,
    command: [binary, ...args],
    exitCode: result.status,
    signal: result.signal,
    wallMs: Number(process.hrtime.bigint() - start) / 1e6,
    maxRssBytes: parseMaxRssBytes(result.stderr ?? ''),
    diagnostics,
    failedWithoutDiagnostics: result.status !== 0 && diagnostics.length === 0,
  };
}

function compare(expected, actual) {
  const exact = compareDiagnostics(expected.diagnostics, actual.diagnostics);
  const locations = compareDiagnostics(
    expected.diagnostics,
    actual.diagnostics,
    locationKey
  );
  return {
    parity:
      exact.equal &&
      !expected.failedWithoutDiagnostics &&
      !actual.failedWithoutDiagnostics &&
      expected.signal === null &&
      actual.signal === null &&
      (expected.exitCode === 0) === (actual.exitCode === 0),
    locationParity: locations.equal,
    onlyBaseline: exact.onlyExpected.map(diagnosticKey),
    onlyCandidate: exact.onlyActual.map(diagnosticKey),
    matchedCount: expected.diagnostics.length - exact.onlyExpected.length,
    matchedSample: expected.diagnostics
      .filter((d) => !exact.onlyExpected.includes(d))
      .slice(0, 8)
      .map(diagnosticKey),
  };
}

function configClosure(project, seen = new Set()) {
  const file = path.resolve(ROOT, project);
  if (seen.has(file)) return [];
  seen.add(file);
  const result = spawnSync(
    path.join(ROOT, 'node_modules/.bin/tsc'),
    ['-p', file, '--showConfig'],
    { cwd: ROOT, encoding: 'utf8' }
  );
  let config;
  try {
    config = JSON.parse(result.stdout);
  } catch {
    return [{ project, unresolved: result.stdout || result.stderr }];
  }
  const references = (config.references ?? []).map((reference) => {
    const target = path.resolve(path.dirname(file), reference.path);
    return path.relative(
      ROOT,
      target.endsWith('.json') ? target : path.join(target, 'tsconfig.json')
    );
  });
  return [
    {
      project,
      rawHash: sha256(fs.readFileSync(file)),
      resolvedHash: sha256(result.stdout),
      compilerOptions: config.compilerOptions,
      files: config.files ?? [],
      references,
    },
    ...references.flatMap((reference) => configClosure(reference, seen)),
  ];
}

function inputClosure(project) {
  const listed = spawnSync(
    path.join(ROOT, 'node_modules/.bin/tsc'),
    ['-p', project, ...FLAGS, '--listFilesOnly'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  if (listed.error || listed.status !== 0)
    throw new Error(`Cannot inventory input closure: ${project}`);
  const files = listed.stdout.trim().split(/\r?\n/).filter(Boolean);
  return {
    files: files.map((file) => path.relative(ROOT, file)),
    hash: sha256(
      files
        .map(
          (file) =>
            `${path.relative(ROOT, file)}:${sha256(fs.readFileSync(file))}`
        )
        .join('\n')
    ),
  };
}

function main(argv) {
  const options = parseArgs(argv);
  fs.mkdirSync(options.out, { recursive: true });
  const entries = inventory(ROOT);
  assertNoCheckScripts(entries);
  const tsc = path.join(ROOT, 'node_modules/.bin/tsc');
  const report = {
    sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim(),
    lockHash: sha256(fs.readFileSync(path.join(ROOT, 'bun.lock'))),
    host: os.hostname(),
    cpus: os.cpus().length,
    load: os.loadavg(),
    threads: options.threads,
    versions: {
      bunTypeScript: execFileSync(
        'bun',
        ['-p', 'process.versions.typescript'],
        { encoding: 'utf8' }
      ).trim(),
      bun: execFileSync('bun', ['--version'], { encoding: 'utf8' }).trim(),
      tsc: execFileSync(tsc, ['--version'], { encoding: 'utf8' }).trim(),
      tsrs: options.tsrs
        ? execFileSync(options.tsrs, ['--version'], { encoding: 'utf8' }).trim()
        : null,
    },
    method:
      'No-emit projection only: noEmit=true, incremental=false, composite=false. First process-cold run then repeated warm-OS-cache fresh processes; no host cache eviction. Not emit/build equivalence.',
    inventory: entries,
    projects: [],
    negative: [],
  };
  if (report.versions.bun !== '1.4.4')
    throw new Error('Qualification requires Bun 1.4.4');
  const binaries = {
    tsc,
    bun: 'bun',
    ...(options.tsrs ? { tsrs: options.tsrs } : {}),
  };
  const save = () =>
    fs.writeFileSync(
      path.join(options.out, 'report.json'),
      `${JSON.stringify(report, null, 2)}\n`
    );
  save();
  for (const [index, project] of options.projects.entries()) {
    const entry = {
      project,
      closure: configClosure(project),
      inputsBefore: inputClosure(project),
      runs: [],
    };
    report.projects.push(entry);
    for (let iteration = 0; iteration < options.runs; iteration++) {
      const order = Object.keys(binaries);
      if (iteration % 2) order.reverse();
      const results = {};
      for (const checker of order)
        results[checker] = run(
          checker,
          binaries[checker],
          project,
          options,
          `project-${index}-run-${iteration}`
        );
      entry.runs.push({
        phase: iteration === 0 ? 'process-cold' : 'warm',
        ...results,
        bunComparison: compare(results.tsc, results.bun),
        ...(results.tsrs
          ? { tsrsComparison: compare(results.tsc, results.tsrs) }
          : {}),
      });
      save();
      console.log(
        `${project} run=${iteration} tsc=${results.tsc.diagnostics.length} bun=${results.bun.diagnostics.length} parity=${entry.runs.at(-1).bunComparison.parity}`
      );
    }
  }
  for (const entry of report.projects) {
    entry.inputsAfter = inputClosure(entry.project);
    entry.inputClosureUnchanged =
      entry.inputsBefore.hash === entry.inputsAfter.hash;
  }
  save();
  const control = path.join(
    ROOT,
    'packages/types/src/__bun_native_negative_control__.ts'
  );
  const controlSource =
    'export const bunNativeNegativeControl: number = "known-invalid";\n';
  fs.writeFileSync(control, controlSource, { flag: 'wx' });
  report.negativeSource = {
    path: path.relative(ROOT, control),
    hash: sha256(controlSource),
    mutation: 'one added file, removed in finally',
  };
  try {
    for (let iteration = 0; iteration < options.runs; iteration++) {
      const order = Object.keys(binaries);
      if (iteration % 2) order.reverse();
      const results = {};
      for (const checker of order)
        results[checker] = run(
          checker,
          binaries[checker],
          SAMPLE[0],
          options,
          `negative-${iteration}`
        );
      const detected = Object.values(results).every(
        (result) =>
          result.exitCode !== 0 &&
          result.diagnostics.some(
            (d) =>
              d.code === 2322 &&
              d.file?.endsWith('__bun_native_negative_control__.ts')
          )
      );
      report.negative.push({
        iteration,
        detected,
        ...results,
        bunComparison: compare(results.tsc, results.bun),
      });
      save();
    }
  } finally {
    fs.unlinkSync(control);
  }
  report.verdict =
    'NOT QUALIFIED: sampled no-emit diagnostic evidence cannot replace the complete type/build/emit gate';
  report.sampleParity = report.projects.every(
    (p) =>
      p.inputClosureUnchanged && p.runs.every((r) => r.bunComparison.parity)
  );
  report.negativePassed = report.negative.every((r) => r.detected);
  save();
  console.log(
    JSON.stringify({
      sourceSha: report.sourceSha,
      sampleParity: report.sampleParity,
      negativePassed: report.negativePassed,
      verdict: report.verdict,
    })
  );
  return report.negativePassed ? 0 : 1;
}
if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
module.exports = { parseArgs, checkerArgs, compare, configClosure };
