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

function chunks(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'mail-node-imports-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'server/assets'), { recursive: true });
  const runtime = `var f = function(name) { throw Error('Calling require: https://rolldown.rs/in-depth/bundling-cjs#require-external-modules'); }; var g = (x) => x; export { f as i, g };`;
  const all = { 'rolldown-runtime.js': runtime, ...files };
  for (const [name, code] of Object.entries(all))
    writeFileSync(join(root, 'server/assets', name), code);
  return () =>
    assertMailNodeImports(
      root,
      'mail',
      Object.keys(all).map((name) => `server/assets/${name}`)
    );
}

for (const [label, files] of Object.entries({
  'named re-export': {
    'mid.js': `export { i as forwarded } from './rolldown-runtime.js';`,
    'entry.js': `import { forwarded } from './mid.js'; forwarded("node:fs");`,
  },
  'star re-export': {
    'mid.js': `export * from './rolldown-runtime.js';`,
    'entry.js': `import { i as t } from './mid.js'; t('node:fs');`,
  },
  'namespace import': {
    'entry.js': `import * as rt from './rolldown-runtime.js'; rt.i('node:fs');`,
  },
  'namespace re-export': {
    'mid.js': `export * as ns from './rolldown-runtime.js';`,
    'entry.js': `import { ns } from './mid.js'; ns['i']('node:fs');`,
  },
  'computed specifier': {
    'entry.js': `import { i as t } from './rolldown-runtime.js'; const name = 'node:fs'; t(name);`,
  },
}))
  test(`rejects a helper call through a ${label}`, (t) => {
    assert.throws(chunks(t, files), /CommonJS Node builtin require/);
  });

test('allows computed calls to non-helper re-exports', (t) => {
  chunks(t, {
    'mid.js': `export { g as identity } from './rolldown-runtime.js';`,
    'entry.js': `import { identity } from './mid.js'; const name = 'node:fs'; identity(name);`,
  })();
});
