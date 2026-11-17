import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

function chunks(t, files, { timeout } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'mail-node-imports-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'server/assets'), { recursive: true });
  const runtime = `var f = function(name) { throw Error('Calling require: https://rolldown.rs/in-depth/bundling-cjs#require-external-modules'); }; var g = (x) => x; export { f as i, g };`;
  const all = { 'rolldown-runtime.js': runtime, ...files };
  for (const [name, code] of Object.entries(all))
    writeFileSync(join(root, 'server/assets', name), code);
  const paths = Object.keys(all).map((name) => `server/assets/${name}`);
  return () => {
    if (timeout === undefined)
      return assertMailNodeImports(root, 'mail', paths);
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `import { assertMailNodeImports } from ${JSON.stringify(new URL('./mail-node-imports.mjs', import.meta.url).href)}; assertMailNodeImports(${JSON.stringify(root)}, 'mail', ${JSON.stringify(paths)});`,
      ],
      { encoding: 'utf8', timeout }
    );
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr);
  };
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

const shadowingBodies = {
  'private-field listener':
    'class Observer { #t = []; notify(e) { e(this.#t); } }',
  'function parameter': 'function notify(e) { e(value); }',
  'arrow parameter': 'const notify = e => e(value);',
  'destructured parameter': 'const notify = ({ listener: e }) => e(value);',
  'array parameter': 'const notify = ([e]) => e(value);',
  'rest parameter': 'const notify = (...e) => e(value);',
  'default parameter': 'const notify = (e = listener) => e(value);',
  'catch binding': 'try {} catch (e) { e(value); }',
  'block let': '{ let e = listener; e(value); }',
  'block const': '{ const e = listener; e(value); }',
  'hoisted var': 'function notify() { e(value); var e = listener; }',
  'later lexical declaration': '{ e(value); let e = listener; }',
  'loop binding': 'for (const e of listeners) { e(value); }',
  'named function expression': 'const notify = function e() { e(value); };',
  'class expression': 'const Notify = class e { notify() { e(value); } };',
  'function declaration': '{ e(value); function e() {} }',
  'class declaration': '{ class e {} e(value); }',
  'object method': '({ notify(e) { e(value); } });',
  'setter parameter': '({ set notify(e) { e(value); } });',
  'getter local': '({ get notify() { const e = listener; e(value); } });',
  'class static block':
    'class Observer { static { let e = listener; e(value); } }',
  'classic for binding': 'for (let e = listener; false;) e(value);',
  'for-in binding': 'for (const e in listeners) e(value);',
};

// Assignment-based aliases and multiple initializers for one var binding are not
// tracked; helper provenance through those writes needs a separate dataflow pass.

for (const [label, body] of Object.entries(shadowingBodies)) {
  test(`allows a lexically shadowed helper: ${label}`, (t) => {
    chunks(t, {
      'entry.js': `import { i as e } from './rolldown-runtime.js'; ${body}`,
    })();
  });
  test(`retains the real helper outside a shadow: ${label}`, (t) => {
    assert.throws(
      chunks(t, {
        'entry.js': `import { i as e } from './rolldown-runtime.js'; ${body} e(value);`,
      }),
      /CommonJS Node builtin require/
    );
  });
}

test('allows a shadowed namespace but rejects the imported namespace', (t) => {
  const shadow = 'function notify(rt) { rt.i(value); }';
  chunks(t, {
    'entry.js': `import * as rt from './rolldown-runtime.js'; ${shadow}`,
  })();
  assert.throws(
    chunks(t, {
      'entry.js': `import * as rt from './rolldown-runtime.js'; ${shadow} rt.i(value);`,
    }),
    /CommonJS Node builtin require/
  );
});

test('allows computed members of a helper-free namespace', (t) => {
  chunks(t, {
    'plain.js': 'export const identity = value => value;',
    'entry.js': `import * as plain from './plain.js'; plain[key](value);`,
  })();
});

for (const expression of [
  '(0, e)(value)',
  '(0, e)("node:fs")',
  'const alias = e; alias(value)',
  'const alias = e; (0, alias)(value)',
  'const alias = rt; alias.i(value)',
  '(0, rt.i)(value)',
  'rt[key](value)',
  '(0, require)("node:fs")',
  'require(value)',
  '(0, require)(value)',
])
  test(`rejects genuine helper identity: ${expression}`, (t) => {
    assert.throws(
      chunks(t, {
        'entry.js': `import { i as e } from './rolldown-runtime.js'; import * as rt from './rolldown-runtime.js'; ${expression};`,
      }),
      /CommonJS Node builtin require/
    );
  });

test('a sibling declaration cannot shadow a real helper call', (t) => {
  assert.throws(
    chunks(t, {
      'entry.js': `import { i as e } from './rolldown-runtime.js'; function first() { e(value); } function second() { let e = listener; }`,
    }),
    /CommonJS Node builtin require/
  );
});

test('parameter defaults do not inherit body var bindings', (t) => {
  assert.throws(
    chunks(t, {
      'entry.js': `import { i as e } from './rolldown-runtime.js'; function notify(value = e(name)) { var e = listener; }`,
    }),
    /CommonJS Node builtin require/
  );
});

test('switch discriminants use the enclosing binding', (t) => {
  assert.throws(
    chunks(t, {
      'entry.js': `import { i as e } from './rolldown-runtime.js'; switch (e(value)) { case 1: let e = listener; }`,
    }),
    /CommonJS Node builtin require/
  );
});

test('nested helper declarations retain their own identity', (t) => {
  assert.throws(
    chunks(t, {
      'entry.js': `function load() { const e = value => { throw Error('https://rolldown.rs/in-depth/bundling-cjs#require-external-modules'); }; e(name); }`,
    }),
    /CommonJS Node builtin require/
  );
});

test('nested helper names do not label unrelated sibling callbacks', (t) => {
  chunks(t, {
    'entry.js': `function load() { const e = value => { throw Error('https://rolldown.rs/in-depth/bundling-cjs#require-external-modules'); }; } function notify(e) { e(value); }`,
  })();
});

for (const [label, middle] of Object.entries({
  'two star-exported namespaces': `export * from './first.js'; export * from './second.js';`,
  'explicit and star-exported namespaces': `export * as ns from './rolldown-runtime.js'; export * from './second.js';`,
}))
  test(`terminates with ${label}`, (t) => {
    chunks(
      t,
      {
        'other.js': 'export const value = 1;',
        'first.js': `export * as ns from './rolldown-runtime.js';`,
        'second.js': `export * as ns from './other.js';`,
        'mid.js': middle,
        'entry.js': `import { ns } from './mid.js'; ns.i('external-package');`,
      },
      { timeout: 2000 }
    )();
  });
