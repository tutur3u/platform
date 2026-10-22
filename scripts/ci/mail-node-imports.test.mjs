import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertMailNodeImports } from './mail-node-imports.mjs';

function fixture(t, expression) {
  const root = mkdtempSync(join(tmpdir(), 'mail-node-imports-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'server/assets'), { recursive: true });
  const runtime = 'server/assets/rolldown-runtime-abc.js';
  const entry = 'server/assets/worker-entry-abc.js';
  writeFileSync(
    join(root, runtime),
    `var f = function(name) { throw Error('Calling require: https://rolldown.rs/in-depth/bundling-cjs#require-external-modules'); }; export { f as i };`
  );
  writeFileSync(
    join(root, entry),
    `import { i as t } from './rolldown-runtime-abc.js'; ${expression};`
  );
  return () => assertMailNodeImports(root, 'mail', [runtime, entry]);
}

for (const expression of [
  't(`node:buffer`)',
  't("node:crypto")',
  "t('dns')",
  't(`https`)',
  '__require("node:buffer")',
  '__require$1(`node:stream`)',
  'require("buffer")',
])
  test(`rejects emitted ${expression}`, (t) => {
    assert.throws(fixture(t, expression), /CommonJS Node builtin require/);
  });

test('allows ESM builtin imports and unrelated calls', (t) => {
  fixture(
    t,
    'import("node:buffer"); const resolve = x => x; resolve("path")'
  )();
});
