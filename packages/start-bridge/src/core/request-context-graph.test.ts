import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from '@babel/parser';

const root = fileURLToPath(new URL('../', import.meta.url));
const installers = new Set([
  resolve(root, 'server/request-store.ts'),
  resolve(root, 'server/request-context.ts'),
]);

function visitGraph(entry: string, seen = new Set<string>()) {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  expect(installers.has(entry), entry).toBe(false);
  const source = parse(readFileSync(entry, 'utf8'), {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
    createImportExpressions: true,
  });
  function follow(specifier: string) {
    expect(specifier, entry).not.toBe('node:async_hooks');
    expect(specifier, entry).not.toBe('async_hooks');
    if (!specifier.startsWith('.')) return;
    const path = resolve(dirname(entry), specifier);
    const target = [path, `${path}.ts`, `${path}.tsx`, `${path}/index.ts`].find(
      existsSync
    );
    if (!target)
      throw new Error(`Unresolved local edge: ${entry} -> ${specifier}`);
    visitGraph(target, seen);
  }
  function walk(node: unknown) {
    if (!node || typeof node !== 'object') return;
    if ('type' in node) {
      if (
        node.type === 'ImportDeclaration' ||
        node.type === 'ExportNamedDeclaration' ||
        node.type === 'ExportAllDeclaration'
      ) {
        const typeOnly =
          ('importKind' in node && node.importKind === 'type') ||
          ('exportKind' in node && node.exportKind === 'type');
        if (
          !typeOnly &&
          'source' in node &&
          node.source &&
          typeof node.source === 'object' &&
          'value' in node.source &&
          typeof node.source.value === 'string'
        )
          follow(node.source.value);
      } else if (node.type === 'ImportExpression') {
        if (
          !('source' in node) ||
          !node.source ||
          typeof node.source !== 'object' ||
          !('type' in node.source) ||
          node.source.type !== 'StringLiteral' ||
          !('value' in node.source) ||
          typeof node.source.value !== 'string'
        )
          throw new Error(`Nonliteral dynamic edge: ${entry}`);
        follow(node.source.value);
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  }
  walk(source);
  return seen;
}

describe('explicit bridge reader graph', () => {
  it.each([
    'core/request-context.ts',
    'core/csp.ts',
    'start/app-base.ts',
    'start/page-params.ts',
  ])('%s has no local static or dynamic installer edge', (entry) => {
    visitGraph(resolve(root, entry));
  });
});

describe('reader graph negative controls', () => {
  it.each(['import', 'export', 'dynamic', 'computed', 'builtin'])(
    'rejects %s forbidden edges',
    (kind) => {
      const directory = mkdtempSync(resolve(tmpdir(), 'bridge-reader-'));
      const entry = resolve(directory, 'entry.ts');
      const installer = relative(
        directory,
        resolve(root, 'server/request-store.ts')
      );
      const edge = installer.startsWith('.') ? installer : `./${installer}`;
      const sources: Record<string, string> = {
        import: `import ${JSON.stringify(edge)};`,
        export: `export * from ${JSON.stringify(edge)};`,
        dynamic: `void import(${JSON.stringify(edge)});`,
        computed: 'const name = "./store"; void import(name);',
        builtin: 'import { AsyncLocalStorage } from "node:async_hooks";',
      };
      try {
        writeFileSync(entry, sources[kind]!);
        expect(() => visitGraph(entry)).toThrow();
      } finally {
        rmSync(directory, { recursive: true });
      }
    }
  );
});
