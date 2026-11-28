// Regression coverage for launching Performance Factory CLIs through a staged
// copy reached via a symlink (the dispatcher stages origin/main into a mktemp
// directory, and macOS mktemp paths live under the /var -> /private/var link).
// Before the realpath entry guard, these runs exited 0 with empty stdout.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, describe, mock, test } from 'node:test';
import { entryStatus, failIfMisrouted } from './perf-entry.mjs';

const PERF_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(PERF_DIR, 'fixtures', 'forms-rollback-2026-11-20.json');
const NODE_EXEC = process.execPath;
const ROOT = mkdtempSync(join(tmpdir(), 'perf-staged-entry-'));

after(() => rmSync(ROOT, { recursive: true, force: true }));

/**
 * Copies the runtime files of scripts/perf (not tests) into a real directory and
 * returns a symlink to it. Callers launch scripts through the symlink, which is
 * the path shape that broke the raw `argv[1]` comparison.
 */
function stageThroughSymlink(name, { omit = [] } = {}) {
  const real = mkdtempSync(join(ROOT, `${name}-real-`));
  for (const file of readdirSync(PERF_DIR)) {
    const source = join(PERF_DIR, file);
    if (statSync(source).isDirectory() || file.endsWith('.test.mjs')) continue;
    if (omit.includes(file)) continue;
    copyFileSync(source, join(real, file));
  }
  chmodSync(join(real, 'run-detector-local.sh'), 0o755);
  const link = join(ROOT, `${name}-link`);
  symlinkSync(real, link, 'dir');
  return link;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

const TASK = {
  taskKey: 'perf-forms-p95_ttfb_ms-2026-11-19t220000000z',
  stage: 'investigate',
  list: 'Queued',
  regression: {
    id: 'perf-forms-p95_ttfb_ms-2026-11-19T220000000Z',
    app: 'forms',
    metric: 'p95_ttfb_ms',
  },
};

describe('staged gate CLI through a symlinked launch path', () => {
  const link = stageThroughSymlink('gate');
  const work = mkdtempSync(join(ROOT, 'gate-work-'));
  const gate = join(link, 'perf-dispatch-gate.mjs');
  const tasksPath = join(work, 'open-tasks.json');
  const detectionPath = join(work, 'detection.json');
  writeFileSync(tasksPath, JSON.stringify([TASK]));
  writeFileSync(
    detectionPath,
    JSON.stringify({
      generatedAt: '2026-11-28T06:00:00.000Z',
      candidates: [
        {
          id: TASK.regression.id,
          app: 'forms',
          metric: 'p95_ttfb_ms',
          state: 'ready',
        },
      ],
      regressions: [],
    })
  );

  test('the launch path is a symlink, not the real module path', () => {
    assert.notEqual(realpathSync(link), link);
    assert.equal(
      realpathSync(gate),
      join(realpathSync(link), 'perf-dispatch-gate.mjs')
    );
  });

  test('extract-candidates emits real JSON and writes --out', () => {
    const out = join(work, 'candidates.json');
    const result = run(NODE_EXEC, [
      gate,
      'extract-candidates',
      '--tasks',
      tasksPath,
      '--out',
      out,
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.candidates.length, 1);
    assert.equal(parsed.candidates[0].id, TASK.regression.id);
    assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')), parsed);
  });

  test('intake-check emits real JSON for a fresh regression', () => {
    const intakePath = join(work, 'intake-detection.json');
    writeFileSync(
      intakePath,
      JSON.stringify({
        candidates: [],
        regressions: [{ id: 'perf-tools-error_rate-2026-11-28T0500Z' }],
      })
    );
    const result = run(NODE_EXEC, [
      gate,
      'intake-check',
      '--detection',
      intakePath,
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.degraded, false);
    assert.equal(parsed.ingestible.length, 1);
    assert.equal(parsed.blocked.length, 0);
  });

  test('gate mode dispatches the ready regression task', () => {
    const out = join(work, 'gate.json');
    const result = run(NODE_EXEC, [
      gate,
      '--tasks',
      tasksPath,
      '--detection',
      detectionPath,
      '--detector-exit',
      '0',
      '--out',
      out,
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.degraded, false);
    assert.deepEqual(parsed.dispatchable, [TASK.taskKey]);
    assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')), parsed);
  });

  test('gate mode fails closed with a DEGRADED marker when detection is missing', () => {
    const result = run(NODE_EXEC, [
      gate,
      '--tasks',
      tasksPath,
      '--detection',
      join(work, 'absent.json'),
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.degraded, true);
    assert.deepEqual(parsed.dispatchable, []);
  });

  test('gate mode handles empty tasks: quiet by default, DEGRADED with --expect-nonempty', () => {
    const emptyPath = join(work, 'empty-tasks.json');
    writeFileSync(emptyPath, '[]');

    const quiet = run(NODE_EXEC, [
      gate,
      '--tasks',
      emptyPath,
      '--detection',
      detectionPath,
      '--detector-exit',
      '0',
    ]);
    assert.equal(quiet.status, 0, quiet.stderr);
    const quietParsed = JSON.parse(quiet.stdout);
    assert.equal(quietParsed.degraded, false);
    assert.deepEqual(quietParsed.dispatchable, []);

    const guarded = run(NODE_EXEC, [
      gate,
      '--tasks',
      emptyPath,
      '--detection',
      detectionPath,
      '--detector-exit',
      '0',
      '--expect-nonempty',
    ]);
    assert.equal(guarded.status, 0, guarded.stderr);
    const guardedParsed = JSON.parse(guarded.stdout);
    assert.equal(guardedParsed.degraded, true);
    assert.equal(guardedParsed.degradedReason, 'empty_task_list');
    assert.equal(
      guardedParsed.marker,
      'DEGRADED: dispatch gate closed (empty_task_list)'
    );
    assert.deepEqual(guardedParsed.dispatchable, []);
  });
});

describe('staged detector and wrapper through a symlinked launch path', () => {
  test('detector --fixture writes its --out file through the symlink', () => {
    const link = stageThroughSymlink('detector');
    const work = mkdtempSync(join(ROOT, 'detector-work-'));
    const out = join(work, 'detection.json');
    const result = run(NODE_EXEC, [
      join(link, 'perf-regression-detector.mjs'),
      '--fixture',
      FIXTURE,
      '--out',
      out,
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(parsed.source, 'fixture');
    assert.ok(Array.isArray(parsed.checked));
    assert.ok(parsed.checked.length > 0);
  });

  test('run-detector-local.sh --fixture writes --out through the symlink', () => {
    const link = stageThroughSymlink('wrapper');
    const work = mkdtempSync(join(ROOT, 'wrapper-work-'));
    const out = join(work, 'detection.json');
    const result = run('/bin/sh', [
      join(link, 'run-detector-local.sh'),
      '--fixture',
      FIXTURE,
      '--out',
      out,
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(readFileSync(out, 'utf8')).source, 'fixture');
  });

  test('run-detector-local.sh fails loudly when the detector exits 0 without writing --out', () => {
    const link = stageThroughSymlink('silent');
    // A detector whose main-guard never fires: node exits 0 with no output.
    writeFileSync(join(link, 'perf-regression-detector.mjs'), '// no main\n');
    const work = mkdtempSync(join(ROOT, 'silent-work-'));
    const out = join(work, 'detection.json');
    const result = run('/bin/sh', [
      join(link, 'run-detector-local.sh'),
      '--fixture',
      FIXTURE,
      '--out',
      out,
    ]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /DEGRADED: detector exited 0 without writing/u);
    assert.equal(existsSync(out), false);
  });

  test('run-detector-local.sh removes stale --out before running and fails loudly on silent exit', () => {
    const link = stageThroughSymlink('stale-out');
    writeFileSync(join(link, 'perf-regression-detector.mjs'), '// no main\n');
    const work = mkdtempSync(join(ROOT, 'stale-out-work-'));
    const out = join(work, 'detection.json');
    writeFileSync(out, '{"stale":true}\n');
    const result = run('/bin/sh', [
      join(link, 'run-detector-local.sh'),
      '--fixture',
      FIXTURE,
      '--out',
      out,
    ]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /DEGRADED: detector exited 0 without writing/u);
    assert.equal(existsSync(out), false);
  });

  test('run-detector-local.sh without --out fails loudly on empty stdout', () => {
    const link = stageThroughSymlink('silent-stdout');
    writeFileSync(join(link, 'perf-regression-detector.mjs'), '// no main\n');
    const result = run('/bin/sh', [
      join(link, 'run-detector-local.sh'),
      '--fixture',
      FIXTURE,
    ]);
    assert.equal(result.status, 2);
    assert.match(
      result.stderr,
      /DEGRADED: detector exited 0 with empty stdout/u
    );
  });

  test('run-detector-local.sh fails loudly when a staged module is missing', () => {
    const link = stageThroughSymlink('incomplete', {
      omit: ['perf-apps.json'],
    });
    const work = mkdtempSync(join(ROOT, 'incomplete-work-'));
    const result = run('/bin/sh', [
      join(link, 'run-detector-local.sh'),
      '--fixture',
      FIXTURE,
      '--out',
      join(work, 'detection.json'),
    ]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /DEGRADED: detector staging incomplete in /u);
    assert.ok(result.stderr.includes(realpathSync(link)));
    assert.match(result.stderr, /perf-apps\.json/u);
  });
});

describe('entry-point classification', () => {
  const link = stageThroughSymlink('classify');
  const selfUrl = pathToFileURL(join(PERF_DIR, 'perf-entry.mjs')).href;

  test('direct launch is an entry point', () => {
    assert.equal(
      entryStatus(selfUrl, join(PERF_DIR, 'perf-entry.mjs')),
      'entry'
    );
  });

  test('a symlinked launch path is an entry point', () => {
    assert.equal(
      entryStatus(
        pathToFileURL(join(link, 'perf-entry.mjs')).href,
        join(link, 'perf-entry.mjs')
      ),
      'entry'
    );
  });

  test('a loader that does not name this module is imported', () => {
    assert.equal(
      entryStatus(selfUrl, '/somewhere/else/runner.mjs'),
      'imported'
    );
    assert.equal(entryStatus(selfUrl, undefined), 'imported');
  });

  test('argv naming this module without resolving to it is misrouted', () => {
    assert.equal(
      entryStatus(selfUrl, '/no/such/dir/perf-entry.mjs'),
      'misrouted'
    );
  });

  test('failIfMisrouted warns to stderr without changing exitCode', () => {
    const previous = process.exitCode;
    const errors = mock.method(console, 'error', () => {});
    try {
      const direct = join(PERF_DIR, 'perf-entry.mjs');
      assert.equal(failIfMisrouted(selfUrl, direct), false);
      assert.equal(process.exitCode, previous);
      const misrouted = '/no/such/dir/perf-entry.mjs';
      assert.equal(failIfMisrouted(selfUrl, misrouted), true);
      assert.equal(process.exitCode, previous);
      assert.match(
        errors.mock.calls[0].arguments[0],
        /WARNING: entry guard skipped main/u
      );
    } finally {
      process.exitCode = previous;
      errors.mock.restore();
    }
  });
});
