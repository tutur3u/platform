import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const installers = new Set([
  resolve(root, 'server/request-store.ts'),
  resolve(root, 'server/request-context.ts'),
]);

function visitGraph(entry: string, seen = new Set<string>()) {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  expect(installers.has(entry), entry).toBe(false);
  const source = ts.createSourceFile(entry, readFileSync(entry, 'utf8'), ts.ScriptTarget.Latest, true);
  function follow(specifier: string) {
    expect(specifier, entry).not.toBe('node:async_hooks');
    expect(specifier, entry).not.toBe('async_hooks');
    if (!specifier.startsWith('.')) return;
    const path = resolve(dirname(entry), specifier);
    const target = [path, `${path}.ts`, `${path}.tsx`, `${path}/index.ts`].find(existsSync);
    if (!target) throw new Error(`Unresolved local edge: ${entry} -> ${specifier}`);
    visitGraph(target, seen);
  }
  function walk(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      if (!node.importClause?.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier)) follow(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node)) {
      if (!node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) follow(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = node.arguments[0];
      if (!argument || !ts.isStringLiteral(argument)) throw new Error(`Nonliteral dynamic edge: ${entry}`);
      follow(argument.text);
    }
    ts.forEachChild(node, walk);
  }
  walk(source);
  return seen;
}

describe('explicit bridge reader graph', () => {
  it.each([
    'core/request-context.ts', 'core/csp.ts',
    'start/app-base.ts', 'start/page-params.ts',
  ])('%s has no local static or dynamic installer edge', (entry) => {
    visitGraph(resolve(root, entry));
  });
});
