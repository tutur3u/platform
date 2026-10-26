import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'vitest';
import { inspectModule, inventoryApp } from './inventory.mjs';

test('distinguishes directives, runtime imports, type imports, and method aliases from comments', () => {
  const result = inspectModule(
    'route.ts',
    `
    'use server';
    import type { NextRequest } from 'next/server';
    import { NextResponse } from 'next/server';
    // export function DELETE() {} and import('next/cache') are not code.
    export { handler as GET } from './implementation';
    export const { POST, PATCH: PUT } = handlers;
    export async function change() {}
    const lazy = () => import('next/headers');
    const legacy = require('next/navigation');
  `
  );
  assert.deepEqual(result.exports, ['GET', 'POST', 'PUT', 'change']);
  assert.deepEqual(
    result.imports.map(({ module, typeOnly }) => [module, typeOnly]),
    [
      ['next/server', true],
      ['next/server', false],
      ['./implementation', false],
      ['next/headers', false],
      ['next/navigation', false],
    ]
  );
  assert.deepEqual(result.actions[0].exports, ['GET', 'POST', 'PUT', 'change']);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
});

test('finds inline actions but ignores non-directive string expressions', () => {
  const result = inspectModule(
    'page.tsx',
    `
    export async function Page() {
      async function save() { 'use server'; return 'saved'; }
      async function ordinary() { console.log('x'); 'use server'; }
      return <form action={save} />;
    }
  `
  );
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].kind, 'inline');
  assert.equal(result.actions[0].name, 'save');
});

test('inventories grouped pages, local handlers and actions without evaluating source', () => {
  const root = mkdtempSync(join(tmpdir(), 'finance-inventory-'));
  try {
    const files = {
      'app/[locale]/(dashboard)/[wsId]/page.tsx':
        'export default function Page() { return null; }',
      'app/[locale]/layout.tsx':
        'export default function Layout() { return null; }',
      'app/api/local/[id]/route.ts':
        "export { handler as GET } from './implementation'; throw new Error('must not evaluate');",
      'app/[locale]/(dashboard)/[wsId]/actions.ts':
        "'use server'; export async function fetchWorkspaces() {}",
      'app/api/local/[id]/route.test.ts': "import 'next/cache';",
    };
    for (const [file, content] of Object.entries(files)) {
      const target = join(root, 'apps/finance/src', file);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    const result = inventoryApp('finance', root);
    assert.equal(result.summary.modules, 4);
    assert.equal(result.summary.pages, 1);
    assert.equal(result.summary.layouts, 1);
    assert.equal(result.summary.handlers, 1);
    assert.equal(result.summary.serverActions, 1);
    assert.equal(result.summary.frameworkImports, 0);
    assert.equal(
      result.routes.find((route) => route.kind === 'page').path,
      '/:locale/:wsId'
    );
    assert.deepEqual(
      result.routes.find((route) => route.methods.length).methods,
      ['GET']
    );
    assert.deepEqual(result.serverActions[0].exports, ['fetchWorkspaces']);
    assert.deepEqual(inventoryApp('finance', root), result);
    assert.throws(
      () => inventoryApp('../web', root),
      /Expected finance or pay/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
