import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { parse } from '@babel/parser';
import { traverseFast } from '@babel/types';
import { sourceResolver } from './inventory-resolve';

export function createSourceGraph(repo: string) {
  repo = resolve(repo);
  const resolveSource = sourceResolver(repo);
  const modules = new Map<string, ReturnType<typeof inspect>>();

  function inspect(file: string) {
    const source = readFileSync(file, 'utf8');
    const node = parse(source, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });
    const imports = new Set<string>();
    const unresolved = new Set<string>();
    const signals = {
      serverActions: new Set<number>(),
      after: new Set<number>(),
      connection: new Set<number>(),
      useCache: new Set<number>(),
    };
    const callNames = new Map<string, 'after' | 'connection'>();
    const namespaces = new Set<string>();
    for (const statement of node.program.body) {
      if (statement.type !== 'ImportDeclaration') continue;
      if (
        !['next/server', '@vercel/functions'].includes(statement.source.value)
      )
        continue;
      for (const binding of statement.specifiers) {
        if (binding.type === 'ImportNamespaceSpecifier')
          namespaces.add(binding.local.name);
        if (binding.type !== 'ImportSpecifier') continue;
        const name =
          binding.imported.type === 'Identifier'
            ? binding.imported.name
            : binding.imported.value;
        if (name === 'after' || name === 'connection')
          callNames.set(binding.local.name, name);
      }
    }
    function dependency(specifier: string) {
      const found = resolveSource(specifier, file);
      if (
        found &&
        /\.[cm]?[jt]sx?$/u.test(found) &&
        !found.includes('/node_modules/') &&
        found.startsWith(`${repo}/`)
      ) {
        imports.add(relative(repo, found));
      } else if (
        specifier.startsWith('.') ||
        specifier.startsWith('@/') ||
        specifier.startsWith('@tuturuuu/')
      ) {
        // Assets and declarations are not executable source edges.
        if (!/\.(?:json|css|svg|png|jpg|woff2?|d\.ts)$/u.test(specifier))
          unresolved.add(specifier);
      }
    }
    traverseFast(node, (current) => {
      const line = current.loc?.start.line ?? 1;
      if (current.type === 'DirectiveLiteral') {
        if (current.value === 'use server') signals.serverActions.add(line);
        if (current.value.startsWith('use cache')) signals.useCache.add(line);
      }
      if (
        (current.type === 'ImportDeclaration' &&
          current.importKind !== 'type') ||
        current.type === 'ExportNamedDeclaration' ||
        current.type === 'ExportAllDeclaration'
      ) {
        if (current.source) dependency(current.source.value);
      }
      if (
        current.type === 'ImportExpression' &&
        current.source.type === 'StringLiteral'
      )
        dependency(current.source.value);
      if (current.type === 'CallExpression') {
        const name =
          current.callee.type === 'Identifier'
            ? callNames.get(current.callee.name)
            : current.callee.type === 'MemberExpression' &&
                current.callee.object.type === 'Identifier' &&
                namespaces.has(current.callee.object.name) &&
                current.callee.property.type === 'Identifier'
              ? current.callee.property.name
              : undefined;
        if (name === 'after' || name === 'connection') signals[name].add(line);
        if (
          current.callee.type === 'Import' &&
          current.arguments[0]?.type === 'StringLiteral'
        )
          dependency(current.arguments[0].value);
      }
    });
    return {
      sha256: createHash('sha256').update(source).digest('hex'),
      imports: [...imports].sort(),
      unresolved: [...unresolved].sort(),
      ...Object.fromEntries(
        Object.entries(signals).map(([key, lines]) => [
          key,
          [...lines].sort((a, b) => a - b),
        ])
      ),
      signals: Object.fromEntries(
        Object.entries(signals).map(([key, lines]) => [key, lines.size > 0])
      ),
    };
  }

  function load(path: string) {
    if (modules.has(path) || !existsSync(resolve(repo, path))) return;
    const source = inspect(resolve(repo, path));
    modules.set(path, source);
    for (const dependency of source.imports) load(dependency);
  }

  function boundaries(roots: string[]) {
    const seen = new Set<string>();
    const evidence: Record<string, string[]> = {
      serverActions: [],
      after: [],
      connection: [],
      useCache: [],
    };
    function walk(path: string) {
      if (seen.has(path)) return;
      seen.add(path);
      load(path);
      const source = modules.get(path);
      if (!source) return;
      for (const [signal, present] of Object.entries(source.signals)) {
        if (present) evidence[signal]?.push(path);
      }
      source.imports.forEach(walk);
    }
    roots.forEach(walk);
    for (const paths of Object.values(evidence)) paths.sort();
    return evidence;
  }

  return { modules, boundaries };
}
