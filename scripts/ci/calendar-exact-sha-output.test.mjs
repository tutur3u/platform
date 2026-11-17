import assert from 'node:assert/strict';
import {
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertSafeOutputTree,
  isContained,
  listOutput,
} from './calendar-exact-sha-output.mjs';
import { GUARD_CODES, StageStop } from './calendar-exact-sha-stop.mjs';

function throwsStop(fn, guardCode, label) {
  assert.ok(GUARD_CODES.includes(guardCode), guardCode);
  assert.throws(
    fn,
    (error) => error instanceof StageStop && error.guardCode === guardCode,
    label ?? guardCode
  );
}

function withTree(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'calendar-output-'));
  try {
    const output = path.join(dir, 'output');
    const nested = path.join(output, 'functions', 'index.func');
    mkdirSync(nested, { recursive: true });
    mkdirSync(path.join(output, 'static', 'calendar', '_next'), {
      recursive: true,
    });
    writeFileSync(path.join(nested, 'index.js'), 'legacy');
    writeFileSync(path.join(output, 'config.json'), '{"version":3}');
    fn({ dir, output, nested });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a clean tree passes and lists only regular files', () => {
  withTree(({ output }) => {
    assert.deepEqual(assertSafeOutputTree(output), [
      'config.json',
      'functions/index.func/index.js',
    ]);
  });
});

test('sensitive names are refused by the tree check and the hash walk', () => {
  for (const [name, isDir, code] of [
    ['.env', false, 'OUTPUT_ENV_FILE'],
    ['.env.production.local', false, 'OUTPUT_ENV_FILE'],
    ['.vercel', true, 'OUTPUT_NESTED_VERCEL'],
    ['server.pem', false, 'OUTPUT_KEY_FILE'],
    ['tls.key', false, 'OUTPUT_KEY_FILE'],
    ['TLS.PEM', false, 'OUTPUT_KEY_FILE'],
  ]) {
    withTree(({ output, nested }) => {
      const target = path.join(nested, name);
      if (isDir) mkdirSync(target);
      else writeFileSync(target, 'SECRET=1');
      throwsStop(() => assertSafeOutputTree(output), code, name);
      throwsStop(() => listOutput(output), code, name);
    });
  }
});

test('symlinks are refused at any depth, to files or directories', () => {
  withTree(({ output, nested }) => {
    symlinkSync(path.join(nested, 'index.js'), path.join(output, 'top.js'));
    throwsStop(() => assertSafeOutputTree(output), 'OUTPUT_SYMLINK', 'top');
    throwsStop(() => listOutput(output), 'OUTPUT_SYMLINK', 'top hash walk');
  });
  withTree(({ output, nested }) => {
    symlinkSync(path.join(nested, 'index.js'), path.join(nested, 'deep.js'));
    throwsStop(() => assertSafeOutputTree(output), 'OUTPUT_SYMLINK', 'deep');
  });
  withTree(({ dir, output, nested }) => {
    const outside = path.join(dir, 'outside');
    mkdirSync(outside);
    writeFileSync(path.join(outside, 'secret.txt'), 'x');
    symlinkSync(outside, path.join(nested, 'linked-dir'));
    throwsStop(() => assertSafeOutputTree(output), 'OUTPUT_SYMLINK', 'dir');
  });
  withTree(({ dir, output }) => {
    const linkedRoot = path.join(dir, 'linked-output');
    symlinkSync(output, linkedRoot);
    throwsStop(
      () => assertSafeOutputTree(linkedRoot),
      'OUTPUT_ROOT_INVALID',
      'root'
    );
  });
});

test('an entry whose real path leaves the root is refused', () => {
  withTree(({ dir, output }) => {
    const realRoot = realpathSync(output);
    const fs = {
      lstat: lstatSync,
      readdir: readdirSync,
      realpath: (candidate) =>
        candidate === output || candidate === realRoot
          ? realRoot
          : path.join(dir, 'elsewhere', path.basename(candidate)),
    };
    throwsStop(() => assertSafeOutputTree(output, fs), 'OUTPUT_OUTSIDE_ROOT');
  });
  assert.equal(isContained('/out', '/out/a/b.js'), true);
  assert.equal(isContained('/out', '/out/..a.js'), true);
  assert.equal(isContained('/out', '/out'), false);
  assert.equal(isContained('/out', '/other/a.js'), false);
  assert.equal(isContained('/out', '/out/../other/a.js'), false);
});

test('a missing or non-directory root stops', () => {
  withTree(({ dir, output }) => {
    throwsStop(
      () => assertSafeOutputTree(path.join(dir, 'absent')),
      'OUTPUT_MISSING'
    );
    throwsStop(
      () => assertSafeOutputTree(path.join(output, 'config.json')),
      'OUTPUT_ROOT_INVALID'
    );
  });
});

test('output listing hashes the opened file', () => {
  withTree(({ output }) => {
    const files = listOutput(output);
    assert.deepEqual(
      files.map((file) => file.path),
      ['config.json', 'functions/index.func/index.js']
    );
    for (const file of files) assert.match(file.sha256, /^[a-f0-9]{64}$/u);
  });
});
