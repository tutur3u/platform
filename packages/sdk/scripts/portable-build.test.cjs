const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const {
  moduleSpecifiers,
  stagePortableSources,
} = require('./portable-build.cjs');

function fixture(t, extraDependencies = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-portable-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  function write(relative, content) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  write(
    'packages/sdk/package.json',
    JSON.stringify({
      name: 'tuturuuu',
      version: '0.27.0',
      dependencies: {
        zod: '^4.0.0',
        '@tuturuuu/types': 'workspace:*',
        ...extraDependencies,
      },
      devDependencies: {
        '@tuturuuu/internal-api': 'workspace:*',
        '@tuturuuu/utils': 'workspace:*',
      },
    })
  );
  write(
    'packages/sdk/src/index.ts',
    "export { value } from '@tuturuuu/internal-api/client';\nexport type { Shape } from '@tuturuuu/internal-api/client';\n"
  );
  write(
    'packages/internal-api/src/client.ts',
    "import { value } from './internal-api-error';\nexport { value };\nexport type Shape = import('@tuturuuu/types').Json;\n"
  );
  write(
    'packages/internal-api/src/internal-api-error.ts',
    'export const value = 42;\n'
  );
  return { root, write, destination: path.join(root, 'stage/src') };
}

test('relocates runtime and declaration imports, preserves implementation and package identity', (t) => {
  const f = fixture(t);
  f.write(
    'packages/sdk/src/version.ts',
    "import pkg from '../package.json'; export const version = pkg.version;"
  );
  const sources = stagePortableSources({
    repoRoot: f.root,
    destination: f.destination,
  });
  assert.deepEqual(sources, [
    'packages/internal-api/src/client.ts',
    'packages/internal-api/src/internal-api-error.ts',
  ]);
  const entry = fs.readFileSync(path.join(f.destination, 'index.ts'), 'utf8');
  assert.equal(
    entry,
    'export { value } from "./_portable/internal-api/client.js";\nexport type { Shape } from "./_portable/internal-api/client.js";\n'
  );
  const client = fs.readFileSync(
    path.join(f.destination, '_portable/internal-api/client.ts'),
    'utf8'
  );
  assert.match(client, /from "\.\/internal-api-error.js"/);
  assert.match(client, /import\('@tuturuuu\/types'\)/);
  assert.equal(
    fs.readFileSync(
      path.join(f.destination, '_portable/internal-api/internal-api-error.ts'),
      'utf8'
    ),
    'export const value = 42;\n'
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(f.destination, '../package.json')))
      .version,
    '0.27.0'
  );
});

for (const name of ['@tuturuuu/internal-api', '@tuturuuu/utils']) {
  test(`rejects the install graph that introduced realtime through ${name}`, (t) => {
    const f = fixture(t, { [name]: 'workspace:*' });
    assert.throws(
      () =>
        stagePortableSources({ repoRoot: f.root, destination: f.destination }),
      /must not install broad package/
    );
  });
}

for (const specifier of [
  '@tuturuuu/realtime',
  '@tuturuuu/supabase',
  'next/headers',
  'server-only',
  'unlisted',
]) {
  test(`rejects nonportable or undeclared dependency ${specifier}`, (t) => {
    const f = fixture(
      t,
      specifier === 'unlisted' ? {} : { [specifier.split('/')[0]]: '1.0.0' }
    );
    f.write('packages/internal-api/src/client.ts', `import '${specifier}';`);
    assert.throws(
      () =>
        stagePortableSources({ repoRoot: f.root, destination: f.destination }),
      /nonportable SDK dependency/
    );
  });
}

test('rejects unapproved entrypoints and private relative module expansion', (t) => {
  const f = fixture(t);
  f.write(
    'packages/sdk/src/index.ts',
    "export * from '@tuturuuu/internal-api/realtime';"
  );
  assert.throws(
    () =>
      stagePortableSources({ repoRoot: f.root, destination: f.destination }),
    /Unapproved public module/
  );
  f.write(
    'packages/sdk/src/index.ts',
    "export * from '@tuturuuu/internal-api/client';"
  );
  f.write(
    'packages/internal-api/src/client.ts',
    "export * from './private-service';"
  );
  f.write(
    'packages/internal-api/src/private-service.ts',
    'export const secretService = true;'
  );
  assert.throws(
    () =>
      stagePortableSources({ repoRoot: f.root, destination: f.destination }),
    /Unapproved portable source/
  );
});

test('module parser covers import types, dynamic imports, requires and reexports', () => {
  const source =
    "import type { X } from 'a'; export * from 'b'; type Y = import('c').Y; const d = import('d'); const e = require('e');";
  assert.deepEqual(
    moduleSpecifiers(source, 'x.ts').map((node) => node.value),
    ['a', 'b', 'c', 'd', 'e']
  );
  assert.throws(
    () => moduleSpecifiers('require(variable)', 'x.ts'),
    /Nonliteral module reference/
  );
});

test('resource fixture helpers never enter the portable package closure', (t) => {
  const f = fixture(t);
  f.write(
    'packages/sdk/src/cli/resources-test-fixtures.ts',
    "import {beforeEach} from 'vitest';"
  );
  stagePortableSources({ repoRoot: f.root, destination: f.destination });
  assert.equal(
    fs.existsSync(path.join(f.destination, 'cli/resources-test-fixtures.ts')),
    false
  );
});

test('stages the actual SDK closure without server dependencies or test-only files', (t) => {
  const destination = fs.mkdtempSync(
    path.join(os.tmpdir(), 'sdk-portable-real-')
  );
  t.after(() => fs.rmSync(destination, { recursive: true, force: true }));
  const sources = stagePortableSources({
    repoRoot: path.resolve(__dirname, '../../..'),
    destination: path.join(destination, 'src'),
  });
  assert.equal(sources.length, 23);
  assert.equal(
    fs.existsSync(path.join(destination, 'src/cli/resources-test-fixtures.ts')),
    false
  );
  assert.ok(sources.includes('packages/utils/src/task-description-codec.ts'));
  assert.ok(sources.includes('packages/internal-api/src/users.ts'));
  assert.equal(
    fs.existsSync(
      path.join(destination, 'src/cli/devbox-playground-runtime.acceptance.ts')
    ),
    false
  );
  const entry = fs.readFileSync(
    path.join(destination, 'src/platform.ts'),
    'utf8'
  );
  assert.doesNotMatch(entry, /['"]@tuturuuu\/(internal-api|utils)/);
});

test('omits shared test fixtures that import test runners', (t) => {
  const f = fixture(t);
  f.write(
    'packages/sdk/src/cli/example-test-fixtures.ts',
    "import { beforeEach } from 'vitest';\nexport const ready = beforeEach;\n"
  );
  stagePortableSources({ repoRoot: f.root, destination: f.destination });
  assert.equal(
    fs.existsSync(path.join(f.destination, 'cli/example-test-fixtures.ts')),
    false
  );
});
