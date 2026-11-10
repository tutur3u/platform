import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { findForbiddenMarkers, scanClientBundle } from './client-bundle-guard.mjs';

test('flags a chunk that constructs an AsyncLocalStorage', () => {
  assert.deepEqual(
    findForbiddenMarkers('nn(new V.AsyncLocalStorage),w(`x`)'),
    ['AsyncLocalStorage']
  );
  assert.deepEqual(findForbiddenMarkers('import "node:async_hooks"'), [
    'node:async_hooks',
  ]);
  assert.deepEqual(findForbiddenMarkers('console.log("clean")'), []);
});

test('scans nested client chunks and ignores non-script files', () => {
  const root = mkdtempSync(join(tmpdir(), 'client-guard-'));
  try {
    mkdirSync(join(root, 'assets'));
    writeFileSync(join(root, 'assets', 'ok.js'), 'export const a = 1');
    writeFileSync(join(root, 'assets', 'note.css'), 'AsyncLocalStorage');
    assert.deepEqual(scanClientBundle(root), []);
    writeFileSync(
      join(root, 'assets', 'bad.js'),
      'new x.AsyncLocalStorage()'
    );
    const violations = scanClientBundle(root);
    assert.equal(violations.length, 1);
    assert.match(violations[0].file, /bad\.js$/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
