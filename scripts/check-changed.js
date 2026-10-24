#!/usr/bin/env node

/**
 * Fast changed-files gate. Maps paths changed since the merge base with
 * origin/main to the cheap checks CI most often fails on, without builds.
 *
 * Usage:
 *   bun check:changed [--base <ref>] [--committed] [--only <id>] [--skip <id>]
 *     [--checker auto|tsc|tsrs] [--fail-fast] [--dry-run] [--no-ttr]
 *     [--files <path>...]
 *
 * The optional pre-push hook runs this with --hook once opted in:
 *   git config tuturuuu.prePush true
 */

const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {
  trustedTtr,
  inResourceLane,
  assertWorkspaceBins,
} = require('./trusted-ttr.js');
const {
  readWorkspaces,
  assertSafePaths,
} = require('./check-changed/workspaces.js');
const {
  BIOME_VERSION,
  planChecks,
  workspaceOf,
} = require('./check-changed/plan.js');
const {
  classifyDiagnostics,
  missingDistPackages,
  typeCheckProjects,
} = require('./check-changed/type-check.js');
const {
  CHECKERS,
  TSRS_PROJECTS,
  prefersTsrs,
  resolveTsrs,
} = require('./check-changed/tsrs.js');
const { createChildEnv } = require('./pre-commit.js');
const {
  compareDiagnostics,
  diagnosticKey,
  runChecker,
} = require('./ts-diagnostics.js');

const ROOT = path.resolve(__dirname, '..');
const ZERO_SHA = /^0+$/;
const MAX_PRINTED_DIAGNOSTICS = 40;

function parseArgs(argv) {
  const options = {
    base: null,
    checker: 'auto',
    committed: false,
    dryRun: false,
    failFast: false,
    files: null,
    hook: false,
    only: [],
    skip: [],
    ttr: true,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const next = () => {
      const value = argv[++index];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${arg}`);
      }
      return value;
    };
    if (arg === '--base') options.base = next();
    else if (arg === '--checker') options.checker = next();
    else if (arg === '--committed') options.committed = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--fail-fast') options.failFast = true;
    else if (arg === '--hook') options.hook = options.committed = true;
    else if (arg === '--only') options.only.push(next());
    else if (arg === '--skip') options.skip.push(next());
    else if (arg === '--no-ttr') options.ttr = false;
    else if (arg === '--files') options.files = argv.slice(index + 1);
    else throw new Error(`Unknown argument: ${arg}`);
    if (options.files) break;
  }
  if (options.files) assertSafePaths(options.files);
  if (!CHECKERS.has(options.checker)) {
    throw new Error(`--checker must be one of ${[...CHECKERS].join(', ')}`);
  }
  return options;
}

function git(args, execFile = execFileSync) {
  const output = execFile('git', args, { cwd: ROOT, encoding: 'utf8' });
  return args.includes('-z') ? output : output.trim();
}

function tryGit(args, execFile) {
  try {
    return git(args, execFile);
  } catch {
    return null;
  }
}

function validationBranch(execFile) {
  const local = tryGit(['branch', '--show-current'], execFile);
  if (!local?.startsWith('tmp/')) return { branch: local };
  const upstream = tryGit(
    ['for-each-ref', '--format=%(upstream:remoteref)', `refs/heads/${local}`],
    execFile
  );
  return upstream?.startsWith('refs/heads/')
    ? { branch: upstream.slice('refs/heads/'.length), localBranch: local }
    : { branch: local };
}

function resolveBase(explicit, execFile) {
  if (explicit)
    return git(['rev-parse', '--verify', `${explicit}^{commit}`], execFile);
  // A merge base equal to HEAD still diffs uncommitted work against HEAD.
  const mergeBase = tryGit(['merge-base', 'HEAD', 'origin/main'], execFile);
  return mergeBase ?? tryGit(['rev-parse', '--verify', 'HEAD^'], execFile);
}

function parseNameStatus(output) {
  if (!output) return [];
  const fields = output.split('\0');
  if (fields.at(-1) === '') fields.pop();
  if (fields.length % 2)
    throw new Error('Invalid NUL-delimited git name-status output');
  const changes = [];
  for (let i = 0; i < fields.length; i += 2)
    changes.push({ status: fields[i][0], file: fields[i + 1] });
  return changes;
}

function collectChanges(base, committed, execFile) {
  const range = committed ? [base, 'HEAD'] : [base];
  const changes = parseNameStatus(
    git(
      ['diff', '--name-status', '-z', '--no-renames', ...range, '--'],
      execFile
    )
  );
  if (!committed) {
    const untracked = git(
      ['ls-files', '--others', '--exclude-standard', '-z'],
      execFile
    );
    for (const file of untracked.split('\0').filter(Boolean)) {
      changes.push({ status: 'A', file });
    }
  }
  const unique = new Map(changes.map((change) => [change.file, change]));
  return [...unique.values()].sort((a, b) => a.file.localeCompare(b.file));
}

// Pre-push stdin: "<local ref> <local sha> <remote ref> <remote sha>" lines.
function hookDecision({ stdin, env, execFile }) {
  const configured = tryGit(['config', '--bool', 'tuturuuu.prePush'], execFile);
  const optedIn =
    env.TUTURUUU_PRE_PUSH === '1' ||
    (env.TUTURUUU_PRE_PUSH !== '0' && configured === 'true');
  if (!optedIn) return { run: false, reason: 'not opted in' };
  const pushed = stdin
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2 && !ZERO_SHA.test(parts[1]));
  if (!pushed.length) return { run: false, reason: 'nothing to check' };
  const head = tryGit(['rev-parse', 'HEAD'], execFile);
  if (!pushed.some((parts) => parts[1] === head)) {
    return {
      run: false,
      reason: 'pushed commits are not HEAD; run bun check:changed manually',
    };
  }
  if (
    git(['status', '--porcelain=v1', '-z', '--untracked-files=no'], execFile)
  ) {
    return {
      run: false,
      failed: true,
      reason:
        'tracked files are dirty; commit or preserve them before checking a pushed HEAD',
    };
  }
  return { run: true };
}

function ttrPrefix(
  enabled,
  execFile,
  env = process.env,
  resolveCli = trustedTtr
) {
  assertWorkspaceBins();
  if (!enabled || inResourceLane(env)) return null;
  const cli = resolveCli();
  try {
    const status = JSON.parse(
      execFile(cli, ['resources', 'status', '--json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    );
    return status.installed && status.enabled
      ? [cli, 'resources', 'run', '--']
      : null;
  } catch (cause) {
    throw new Error(
      `Trusted global ttr resource status failed at ${cli}; refusing unadmitted validation. ${cause.message}`,
      { cause }
    );
  }
}

function localBiome(root = ROOT) {
  try {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(root, 'node_modules/@biomejs/biome/package.json'),
        'utf8'
      )
    );
    return manifest.version === BIOME_VERSION
      ? path.join(root, 'node_modules/.bin/biome')
      : null;
  } catch {
    return null;
  }
}

function selectSteps(steps, only, skip) {
  const matches = (id, prefixes) =>
    prefixes.some((prefix) => id === prefix || id.startsWith(`${prefix}:`));
  return steps.filter(
    (step) =>
      (!only.length || matches(step.id, only)) && !matches(step.id, skip)
  );
}

function runTypeCheck(step, context) {
  const { workspace } = step.typeCheck;
  const manifest = JSON.parse(
    fs.readFileSync(path.join(context.root, workspace, 'package.json'), 'utf8')
  );
  const projects = typeCheckProjects(workspace, manifest.scripts).filter(
    (project) => fs.existsSync(path.join(context.root, project))
  );
  if (!projects.length)
    return { status: 'skip', detail: 'no tsc type-check script' };
  const totals = { blocking: [], advisory: 0, ignored: 0 };
  const used = { tsc: 0, tsrs: 0 };
  let shadowCount = 0;
  const parityOutput = [];
  const check = (name, project) => {
    const result = runChecker(context.checkers[name], project, {
      cwd: context.root,
      env: context.env,
      spawn: context.spawn,
      timer: null,
    });
    return { result, groups: classifyDiagnostics(result.diagnostics, context) };
  };
  for (const project of projects) {
    let name =
      context.checkers.tsrs &&
      TSRS_PROJECTS.has(project) &&
      prefersTsrs(context.checker)
        ? 'tsrs'
        : 'tsc';
    let { result, groups } = check(name, project);
    // Positive and negative tsrs outcomes are advisory; tsc alone decides.
    if (name === 'tsrs') {
      shadowCount++;
      const shadow = result;
      name = 'tsc';
      ({ result, groups } = check(name, project));
      const parity = compareDiagnostics(result.diagnostics, shadow.diagnostics);
      if (shadow.crashed || !parity.equal) {
        parityOutput.push(
          `advisory tsrs parity ${project}: ${parity.onlyActual.length} tsrs-only, ${parity.onlyExpected.length} tsc-only${shadow.crashed ? ', tsrs crashed' : ''}`
        );
        for (const [label, diagnostics] of Object.entries({
          'tsrs-only': parity.onlyActual,
          'tsc-only': parity.onlyExpected,
        })) {
          parityOutput.push(
            ...diagnostics
              .slice(0, MAX_PRINTED_DIAGNOSTICS)
              .map((diagnostic) => `[${label}] ${diagnosticKey(diagnostic)}`)
          );
        }
      }
    }
    used[name]++;
    if (result.crashed) {
      return {
        status: 'fail',
        detail: `${project} crashed`,
        output: result.output,
        parityOutput: parityOutput.join('\n'),
      };
    }
    totals.blocking.push(...groups.blocking);
    totals.advisory += groups.advisory.length;
    totals.ignored += groups.ignored.length;
  }
  const notes = [
    Object.entries(used)
      .filter(([, count]) => count)
      .map(([name, count]) => `${name} x${count}`)
      .join(', '),
  ];
  if (shadowCount) notes.push(`tsrs advisory x${shadowCount}`);
  if (totals.ignored) notes.push(`${totals.ignored} missing-dist ignored`);
  if (totals.advisory)
    notes.push(`${totals.advisory} advisory outside changed files`);
  return {
    status: totals.blocking.length ? 'fail' : 'pass',
    detail: notes.join(', '),
    parityOutput: parityOutput.join('\n'),
    output: totals.blocking
      .slice(0, MAX_PRINTED_DIAGNOSTICS)
      .map(diagnosticKey)
      .join('\n'),
  };
}

function runStep(step, context) {
  if (step.inline) return { status: step.inline() ? 'pass' : 'fail' };
  if (step.typeCheck) return runTypeCheck(step, context);
  const prefix = step.heavy && context.ttr ? context.ttr : [];
  const [command, ...args] = [...prefix, step.command, ...step.args];
  const result = context.spawn(command, args, {
    cwd: path.join(context.root, step.cwd ?? ''),
    encoding: 'utf8',
    env: context.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) {
    return { status: 'fail', detail: result.error.message };
  }
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (result.status === 0) return { status: 'pass' };
  return { status: step.advisory ? 'advisory' : 'fail', output };
}

const ICONS = { pass: 'ok  ', fail: 'FAIL', advisory: 'warn', skip: 'skip' };

function runChecks(steps, context, log = console.log) {
  const results = [];
  for (const step of steps) {
    const started = Date.now();
    const result = runStep(step, context);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    results.push({ step, ...result });
    log(
      `${ICONS[result.status]} ${step.label} (${seconds}s)${result.detail ? ` - ${result.detail}` : ''}`
    );
    if (result.parityOutput) log(result.parityOutput.replace(/^/gm, '     '));
    if (result.status === 'fail' || result.status === 'advisory') {
      if (result.output) log(result.output.replace(/^/gm, '     '));
      for (const hint of [step.failureHint, step.fixHint].filter(Boolean)) {
        log(`     hint: ${hint}`);
      }
    }
    if (result.status === 'fail' && context.failFast) break;
  }
  return results;
}

function main(argv = process.argv.slice(2), deps = {}) {
  const execFile = deps.execFile ?? execFileSync;
  const log = deps.log ?? console.log;
  const options = parseArgs(argv);
  if (options.hook) {
    const decision = hookDecision({
      stdin: deps.stdin ?? readStdin(),
      env: deps.env ?? process.env,
      execFile,
    });
    if (!decision.run) {
      if (decision.reason !== 'not opted in')
        log(`check:changed skipped: ${decision.reason}`);
      return decision.failed ? 1 : 0;
    }
  }
  const base = resolveBase(options.base, execFile);
  const changes = options.files
    ? options.files.map((file) => ({ status: 'M', file }))
    : base
      ? collectChanges(base, options.committed, execFile)
      : [];
  if (!changes.length) {
    log('check:changed: no changed files to check.');
    return 0;
  }
  const root = deps.root ?? ROOT;
  const exists = (file) => fs.existsSync(path.join(root, file));
  const plan = planChecks(changes, {
    base,
    biomeBinary: localBiome(root),
    ...validationBranch(execFile),
    exists,
    readSource: (file) => fs.readFileSync(path.join(root, file), 'utf8'),
    workspaces: readWorkspaces(root),
    hasVitest: (workspace) =>
      ['ts', 'mts', 'js', 'mjs'].some((ext) =>
        exists(`${workspace}/vitest.config.${ext}`)
      ),
  });
  const steps = selectSteps(plan.steps, options.only, options.skip);
  if (options.hook) {
    const selected = [
      ...new Set(
        [
          ...changes.map((change) => workspaceOf(change.file)),
          ...(steps.some((step) => step.id === 'script-tests')
            ? ['scripts', 'plugins', '.github/actions']
            : []),
          ...steps.map((step) => step.typeCheck?.workspace ?? step.cwd),
          ...steps
            .filter((step) => step.id === 'script-tests')
            .flatMap((step) => step.args.filter((arg) => !arg.startsWith('-')))
            .map((file) => path.posix.dirname(file)),
        ].filter(Boolean)
      ),
    ];
    const untracked = selected.length
      ? git(
          [
            'ls-files',
            '--others',
            '--exclude-standard',
            '-z',
            '--',
            ...selected,
          ],
          execFile
        )
          .split('\0')
          .filter(Boolean)
      : [];
    if (untracked.length) {
      log(
        `check:changed refused: untracked files in selected workspaces or script directories can affect pushed HEAD checks: ${untracked.map((file) => JSON.stringify(file)).join(', ')}`
      );
      return 1;
    }
  }
  const missing = missingDistPackages(root);
  log(
    `check:changed: ${changes.length} changed file(s) since ${base?.slice(0, 10) ?? 'n/a'}; ${steps.length} step(s).`
  );
  for (const [id, reason] of plan.skipped) log(`  ${id}: ${reason}`);
  if (missing.size) {
    log(
      `  cold workspace declarations (${[...missing.keys()].join(', ')}): type errors outside changed files are advisory; CI stays authoritative.`
    );
  }
  if (options.dryRun) {
    for (const step of steps) {
      const command = step.typeCheck
        ? `${options.checker === 'tsrs' ? 'tsrs advisory + tsc' : 'tsc'} -p <projects of ${step.typeCheck.workspace}>`
        : step.inline
          ? '(inline)'
          : [step.command, ...step.args].join(' ');
      log(`  ${step.id}: ${command}`);
    }
    return 0;
  }
  const ttr = ttrPrefix(options.ttr, execFile, deps.env ?? process.env);
  const tsrs =
    options.checker === 'tsrs' &&
    steps.some((step) => {
      if (!step.typeCheck) return false;
      const { workspace } = step.typeCheck;
      const manifest = JSON.parse(
        fs.readFileSync(path.join(root, workspace, 'package.json'), 'utf8')
      );
      return typeCheckProjects(workspace, manifest.scripts).some(
        (project) => TSRS_PROJECTS.has(project) && exists(project)
      );
    })
      ? (deps.resolveTsrs ?? resolveTsrs)({
          env: deps.env ?? process.env,
          allowNetwork: !options.hook,
        })
      : null;
  if (options.checker === 'tsrs' && !tsrs) {
    log('  tsrs unavailable; type-checking with tsc.');
  }
  const context = {
    changedFiles: new Set(changes.map((change) => change.file)),
    checker: options.checker,
    checkers: {
      tsc: [...(ttr ?? []), path.join(root, 'node_modules/.bin/tsc')],
      tsrs: tsrs ? [...(ttr ?? []), tsrs] : null,
    },
    env: createChildEnv(deps.env ?? process.env),
    failFast: options.failFast,
    missing,
    root,
    spawn: deps.spawn ?? spawnSync,
    ttr,
  };
  const started = Date.now();
  const results = runChecks(steps, context, log);
  const failed = results.filter((result) => result.status === 'fail');
  log(
    `check:changed: ${failed.length ? `${failed.length} failed` : 'all passed'} in ${((Date.now() - started) / 1000).toFixed(1)}s${failed.length ? ` (${failed.map((r) => r.step.id).join(', ')})` : ''}.`
  );
  return failed.length ? 1 : 0;
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
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
  collectChanges,
  hookDecision,
  main,
  parseArgs,
  parseNameStatus,
  resolveBase,
  runChecks,
  runStep,
  runTypeCheck,
  selectSteps,
  ttrPrefix,
};
