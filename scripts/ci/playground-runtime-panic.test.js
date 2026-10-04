import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { classifyPanic, summarizePanics } from './playground-runtime-panic.js';

function fixture(action) {
  const root = mkdtempSync(join(tmpdir(), 'runsc-panic-contract-'));
  const directory = join(root, 'ttr-runsc-panic-ci-123-1');
  mkdirSync(directory);
  try {
    action(root, directory);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('fixed signatures classify resource failures without returning raw text', () => {
  assert.deepEqual(
    classifyPanic(
      'runtime: failed to create new OS thread: private-value\nfatal error: newosproc'
    ),
    ['host-thread-allocation-failure', 'runtime-fatal']
  );
  assert.deepEqual(
    classifyPanic('panic: cannot allocate memory SIGSYS private-value'),
    [
      'host-memory-allocation-failure',
      'runtime-syscall-signal',
      'runtime-panic',
    ]
  );
  assert.deepEqual(classifyPanic('normal container output'), []);
});

test('reader bounds files and bytes and excludes links and raw content', () =>
  fixture((root, directory) => {
    writeFileSync(join(root, 'outside'), 'out of memory');
    symlinkSync(join(root, 'outside'), join(directory, '00-link'));
    const payload =
      'panic: private-secret-value\n' +
      'x'.repeat(40000) +
      'fatal error: newosproc';
    writeFileSync(join(directory, '01-panic'), payload);
    for (let i = 2; i < 20; i++)
      writeFileSync(join(directory, String(i).padStart(2, '0')), 'normal');
    const result = summarizePanics(root, 'ci-123-1');
    assert.equal(result.inspected, 15);
    assert.equal(result.maxReadBytesPerFile, 32768);
    assert.deepEqual(result.signatures, [
      'host-thread-allocation-failure',
      'runtime-fatal',
      'runtime-panic',
    ]);
    assert.ok(!JSON.stringify(result).includes('private-secret-value'));
  }));

test('reader rejects ordinary pools and symlink directories', () =>
  fixture((root) => {
    assert.throws(() => summarizePanics(root, 'production'), /CI pool/);
    symlinkSync(
      join(root, 'ttr-runsc-panic-ci-123-1'),
      join(root, 'ttr-runsc-panic-ci-456-1')
    );
    assert.throws(() => summarizePanics(root, 'ci-456-1'), /directory/);
  }));

test('workflow retains panic-only instrumentation and unconditional owned cleanup', () => {
  const workflow = readFileSync(
    '.github/workflows/playground-runtime-acceptance.yaml',
    'utf8'
  );
  assert.ok(workflow.includes("'--panic-log=' + sys.argv[1] + '/'"));
  assert.ok(!workflow.includes("'--debug'"));
  assert.ok(!workflow.includes("'--strace'"));
  assert.ok(
    workflow.includes(
      "if: failure() && steps.sdk_acceptance.outcome == 'failure'"
    )
  );
  assert.ok(workflow.includes('sudo mkdir -m 700 "$panic_dir"'));
  assert.ok(
    workflow.includes(
      "this run's owned containers and registry volume\n        if: always()"
    )
  );
});

test('CLI accepts workflow arguments and emits only bounded JSON', () =>
  fixture((root, directory) => {
    writeFileSync(join(directory, 'panic'), 'panic: private-canary-value');
    const result = spawnSync(
      process.execPath,
      ['scripts/ci/playground-runtime-panic.js', root, 'ci-123-1'],
      { encoding: 'utf8' }
    );
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout).signatures, ['runtime-panic']);
    assert.ok(!result.stdout.includes('private-canary-value'));
    const invalid = spawnSync(
      process.execPath,
      ['scripts/ci/playground-runtime-panic.js', root, 'production'],
      { encoding: 'utf8' }
    );
    assert.deepEqual(JSON.parse(invalid.stdout), {
      diagnosticsUnavailable: true,
    });
  }));
