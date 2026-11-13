import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { init, parse } from 'es-module-lexer';
await init;

function virtualImports(source) {
  return parse(source)[0]
    .map((entry) => entry.specifier)
    .filter((name) => name?.startsWith('virtual:'));
}

test('native Worker modules contain no unresolved virtual import specifiers', async () => {
  const root = fileURLToPath(new URL('../dist/server/', import.meta.url));
  const modules = (await readdir(root, { recursive: true })).filter((path) =>
    /\.[cm]?js$/u.test(path)
  );
  assert.ok(modules.length > 0, 'native build must execute before this gate');
  const violations = [];
  const emitted = [];
  for (const path of modules) {
    const source = await readFile(join(root, path), 'utf8');
    emitted.push(source);
    for (const specifier of virtualImports(source))
      violations.push({ path, specifier });
  }
  assert.deepEqual(violations, []);
  const mapping = JSON.parse(
    await readFile(
      new URL('../dist/client/landing-styles.json', import.meta.url),
      'utf8'
    )
  );
  assert.equal(
    Object.keys(mapping).length,
    1,
    'native build must carry its nonempty CSS mapping'
  );
  for (const { critical, remaining } of Object.values(mapping)) {
    for (const asset of [critical, remaining])
      assert.ok(
        emitted.some((source) => source.includes(asset)),
        `native modules must embed ${asset}`
      );
  }
});

test('broken static, re-export and dynamic virtual imports are rejected', () => {
  assert.deepEqual(
    virtualImports(
      `import x from 'virtual:map'; export {x} from 'virtual:other'; import('virtual:dynamic');`
    ),
    ['virtual:map', 'virtual:other', 'virtual:dynamic']
  );
  assert.throws(() =>
    assert.deepEqual(virtualImports(`import 'virtual:broken';`), [])
  );
  assert.deepEqual(
    virtualImports(
      `const text = "import('virtual:example')"; import('node:fs');`
    ),
    []
  );
});

test('native qualification can import app-owned config without Vite', async () => {
  const { default: config } = await import('../start-bridge.config.ts');
  assert.equal(typeof config.wrapResponse, 'function');
});
