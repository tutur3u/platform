import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { sidebarEvidencePath } from './sidebar-evidence-path.mjs';

test('default evidence has a unique private parent and honors explicit output', () => {
  const root = mkdtempSync(join(tmpdir(), 'sidebar-test-'));
  try {
    const first = sidebarEvidencePath(undefined, root);
    assert.notEqual(first, sidebarEvidencePath(undefined, root));
    assert.equal(statSync(dirname(first)).mode & 0o077, 0);
    assert.equal(sidebarEvidencePath('chosen.json', root), 'chosen.json');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
