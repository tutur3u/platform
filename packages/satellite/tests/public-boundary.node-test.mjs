import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const manifest = (name) => JSON.parse(read(`packages/${name}/package.json`));

function resolveExportPattern(pattern, subpath) {
  return pattern.replaceAll('*', () => subpath.join('/'));
}

// Traverse local source exports too: a harmless-looking UI import can hide auth.
function sourceGraph(entry) {
  const visited = new Set();
  const external = new Set();
  function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const source = read(file);
    assert.doesNotMatch(
      source,
      /\b(?:cookies|headers|getSatelliteAppSessionUser|createClient|fetch)\s*\(/,
      file
    );
    const imports = source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g);
    for (const [, specifier] of imports) {
      if (specifier.endsWith('.css?url')) continue;
      assert.doesNotMatch(
        specifier,
        /supabase|(?:^|\/)auth(?:\/|$)|next\/(?:headers|server|image|link)|server-only/,
        file
      );
      let target;
      if (specifier.startsWith('.')) {
        target = resolve(root, dirname(file), specifier);
      } else if (specifier.startsWith('@tuturuuu/')) {
        const [name, ...subpath] = specifier
          .slice('@tuturuuu/'.length)
          .split('/');
        const exports = manifest(name).exports;
        const value =
          exports[subpath.length ? `./${subpath.join('/')}` : '.'] ??
          (typeof exports['./*'] === 'string'
            ? resolveExportPattern(exports['./*'], subpath)
            : undefined);
        assert.ok(value, `Missing export ${specifier}`);
        target = resolve(
          root,
          'packages',
          name,
          typeof value === 'string' ? value : value.import
        );
      } else {
        external.add(specifier);
        continue;
      }
      const found = ['', '.ts', '.tsx', '/index.ts']
        .map((suffix) => target + suffix)
        .find(existsSync);
      assert.ok(found, `Missing source ${specifier}`);
      visit(found.slice(root.length + 1));
    }
  }
  visit(entry);
  return { visited, external };
}

test('package export patterns replace every wildcard with literal subpaths', () => {
  assert.equal(
    resolveExportPattern('./src/*.ts', ['button']),
    './src/button.ts'
  );
  const nested = ['nested', '$&$$'];
  assert.equal(
    resolveExportPattern('./src/*.ts', nested),
    './src/nested/$&$$.ts'
  );
  assert.equal(
    resolveExportPattern('./src/*/copy-*.ts', nested),
    './src/nested/$&$$/copy-nested/$&$$.ts'
  );
});

test('public source graph excludes request and authentication modules', () => {
  const { visited, external } = sourceGraph('packages/satellite/src/public.ts');
  assert.ok(
    visited.has('packages/ui/src/components/ui/custom/satellite-brand.tsx')
  );
  assert.ok(
    visited.has('packages/ui/src/components/ui/custom/tuturuuu-logo-urls.ts')
  );
  assert.deepEqual([...external].sort(), [
    '@lucide/lab',
    '@radix-ui/react-slot',
    '@radix-ui/react-tooltip',
    'class-variance-authority',
    'cn',
    'lucide-react',
    'next-themes',
    'react',
  ]);
});

test('authenticated defaults retain their qualified byte preimages', () => {
  const expected = {
    'auth.ts': [
      0x43, 0xcd, 0x93, 0xc1, 0xc1, 0xde, 0x6c, 0x37, 0x6b, 0xe7, 0xe6, 0x94,
      0x1e, 0x7a, 0xc0, 0xb0, 0xb8, 0x0e, 0x91, 0x28,
    ],
    'index.ts': [
      0x9e, 0xcb, 0x54, 0xe8, 0x50, 0xb5, 0x6e, 0x52, 0x3d, 0x13, 0xdb, 0xaf,
      0xe7, 0x1a, 0x2e, 0x01, 0x1c, 0x36, 0x48, 0xb9,
    ],
    'providers/client-providers.tsx': [
      0xaf, 0xb1, 0x02, 0x5f, 0x40, 0x42, 0x25, 0x07, 0x01, 0xb4, 0xf8, 0x10,
      0x70, 0x4f, 0xbb, 0x51, 0x8d, 0xfb, 0xeb, 0x13,
    ],
    'providers/providers.tsx': [
      0x1b, 0xd2, 0x3b, 0x2a, 0x78, 0x7b, 0x79, 0x23, 0x2e, 0x43, 0x2a, 0xb5,
      0x35, 0x14, 0x60, 0x7a, 0x88, 0x92, 0xaf, 0x9c,
    ],
    'workspace-access.ts': [
      0x8d, 0x10, 0x4b, 0x17, 0x93, 0x93, 0x2b, 0x32, 0xc7, 0xbe, 0x3f, 0x1c,
      0xca, 0xe6, 0x41, 0xc7, 0xb7, 0x7c, 0xe3, 0xa8,
    ],
  };
  for (const [path, hash] of Object.entries(expected)) {
    const bytes = Buffer.from(read(`packages/satellite/src/${path}`));
    const actual = createHash('sha1')
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest('hex');
    assert.equal(actual, Buffer.from(hash).toString('hex'), path);
  }
  assert.equal(manifest('satellite').exports['.'], './src/index.ts');
  assert.equal(manifest('satellite').exports['./public'], './src/public.ts');
});

test('roadmap document and page source retain an auth-free first-party graph', () => {
  for (const entry of [
    'apps/roadmap/src/routes/__root.tsx',
    'apps/roadmap/src/routes/index.tsx',
  ]) {
    const { external } = sourceGraph(entry);
    assert.ok(external.has('@tanstack/react-router'));
    for (const item of external)
      assert.doesNotMatch(item, /supabase|(?:^|\/)auth(?:\/|$)|^next\//);
  }
});
