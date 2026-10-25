import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { createFixtureRepo, writeTree } from './fixture-repo.mjs';
import {
  importSpecifiers,
  inventoryApp,
  loadShimmedSpecifiers,
  wrappersOf,
} from './inventory.mjs';

test('type-only imports are not framework dependencies', () => {
  const source = [
    "import type { Metadata } from 'next';",
    "import { type NextRequest } from 'next/server';",
    "import { NextResponse, type NextRequest as R } from 'next/server';",
    "export { viewport } from '@tuturuuu/utils/common/nextjs';",
    "export type { X } from 'next/og';",
    "const lazy = import('./lazy');",
    "import './side-effect.css';",
  ].join('\n');
  assert.deepEqual([...importSpecifiers(source)].sort(), [
    './lazy',
    './side-effect.css',
    '@tuturuuu/utils/common/nextjs',
    'next/server',
  ]);
});

test('layouts and templates wrap pages outermost first', () => {
  const files = [
    'layout.tsx',
    '[locale]/layout.tsx',
    '[locale]/notes/template.tsx',
    '[locale]/notes/page.tsx',
    '[locale]/other/layout.tsx',
  ];
  assert.deepEqual(wrappersOf('[locale]/notes/page.tsx', files), [
    'layout.tsx',
    '[locale]/layout.tsx',
    '[locale]/notes/template.tsx',
  ]);
});

test('pages are classified through layouts and the local import graph', (t) => {
  const root = createFixtureRepo(t);
  const inventory = inventoryApp(root, 'demo');
  const byFile = Object.fromEntries(
    inventory.pages.map((page) => [page.file, page])
  );
  assert.equal(byFile['[locale]/page.tsx'].generic, true);
  assert.deepEqual(byFile['[locale]/notes/page.tsx'].blockers, [
    {
      reason: 'server-action:src/app/[locale]/notes/actions.ts',
      file: 'src/app/[locale]/notes/actions.ts',
    },
  ]);
  assert.deepEqual(
    byFile['[locale]/og/page.tsx'].blockers.map((blocker) => blocker.reason),
    ['unshimmed:next/og']
  );
  assert.ok(byFile['[locale]/page.tsx'].features.includes('next/link'));
  assert.deepEqual(inventory.coverage, { pages: 3, generic: 1, ratio: 1 / 3 });
  assert.equal(inventory.routes.length, 1);
  assert.equal(inventory.proxy, 'src/proxy.ts');
  assert.equal(inventory.hasLocaleSegment, true);
});

test('parallel and intercepting segments are structural blockers', (t) => {
  const root = createFixtureRepo(t, 'demo', {
    'package.json': '{}\n',
    'src/app/@modal/page.tsx': 'export default function P() {}\n',
    'src/app/(.)photo/page.tsx': 'export default function P() {}\n',
    'src/app/(group)/page.tsx': 'export default function P() {}\n',
  });
  const inventory = inventoryApp(root, 'demo');
  const reasons = inventory.pages.map((page) => [
    page.file,
    page.blockers.map((b) => b.reason),
  ]);
  assert.deepEqual(reasons, [
    ['(.)photo/page.tsx', ['structure:intercepting route']],
    ['(group)/page.tsx', []],
    ['@modal/page.tsx', ['structure:parallel route']],
  ]);
  assert.equal(path.basename(root).startsWith('start-bridge-codemod-'), true);
});

test('coverage follows shims declared by the bridge preset', (t) => {
  const root = createFixtureRepo(t);
  writeTree(root, {
    'packages/start-bridge/src/vite/preset.ts':
      "export const NEXT_SHIMS = {\n  'next/headers': 'a.ts',\n  'next/og': 'og.ts',\n} as const;\n",
  });
  assert.ok(loadShimmedSpecifiers(root).has('next/og'));
  const page = inventoryApp(root, 'demo').pages.find(
    (item) => item.file === '[locale]/og/page.tsx'
  );
  assert.equal(page.generic, true);
});
