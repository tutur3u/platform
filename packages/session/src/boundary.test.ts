import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parse } from '@babel/parser';
import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';

const PACKAGE_DIR = resolve(new URL('..', import.meta.url).pathname);
const REPO_ROOT = resolve(PACKAGE_DIR, '../..');
const TEST_ONLY_ENTRY = './testing';
const ALLOWED_EXTERNAL = new Map([['effect', 'type-only']]);

type ModuleImport = { specifier: string; typeOnly: boolean; dynamic: boolean };

/** Every import, re-export, dynamic import and require in a module. */
function moduleImports(file: string): ModuleImport[] {
  const ast = parse(readFileSync(file, 'utf8'), {
    sourceType: 'module',
    plugins: ['typescript'],
  });
  const found: ModuleImport[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const current = node as Record<string, unknown> & { type?: string };
    if (
      (current.type === 'ImportDeclaration' ||
        current.type === 'ExportNamedDeclaration' ||
        current.type === 'ExportAllDeclaration') &&
      current.source
    ) {
      const kind = current.importKind ?? current.exportKind;
      found.push({
        specifier: (current.source as { value: string }).value,
        typeOnly: kind === 'type',
        dynamic: false,
      });
    }
    if (
      current.type === 'ImportExpression' ||
      (current.type === 'CallExpression' &&
        (current.callee as { type?: string; name?: string })?.type === 'Import')
    ) {
      found.push({ specifier: '<dynamic>', typeOnly: false, dynamic: true });
    }
    if (
      current.type === 'CallExpression' &&
      (current.callee as { name?: string })?.name === 'require'
    ) {
      found.push({ specifier: '<require>', typeOnly: false, dynamic: true });
    }
    for (const value of Object.values(current)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(ast.program);
  return found;
}

function resolveRelative(from: string, specifier: string): string {
  const base = resolve(dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(candidate) && candidate.endsWith('.ts')) return candidate;
  }
  throw new Error(`Unresolved import ${specifier} from ${from}`);
}

/** The runtime module graph reachable from the package's portable entry points. */
function runtimeGraph() {
  const entries = Object.entries(packageJson.exports)
    .filter(([key]) => key !== TEST_ONLY_ENTRY)
    .map(([, target]) => resolve(PACKAGE_DIR, target));
  const seen = new Set<string>();
  const external: Array<{ file: string } & ModuleImport> = [];
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const entry of moduleImports(file)) {
      if (entry.specifier.startsWith('.')) {
        queue.push(resolveRelative(file, entry.specifier));
      } else {
        external.push({ file: relative(PACKAGE_DIR, file), ...entry });
      }
    }
  }
  return { files: [...seen], external };
}

describe('portable entry points', () => {
  const graph = runtimeGraph();

  it('reach no test module, including the test issuer', () => {
    for (const file of graph.files) {
      expect(file).not.toMatch(/(\.test\.ts|testing\.ts)$/);
    }
    expect(graph.files.length).toBeGreaterThan(3);
  });

  it('import only the allowlisted external packages, type-only, and nothing dynamic', () => {
    for (const entry of graph.external) {
      expect(entry.dynamic, `${entry.file} ${entry.specifier}`).toBe(false);
      expect(
        ALLOWED_EXTERNAL.get(entry.specifier),
        `${entry.file} ${entry.specifier}`
      ).toBe('type-only');
      expect(entry.typeOnly, `${entry.file} ${entry.specifier}`).toBe(true);
    }
  });

  it('read no request globals, network, environment or signing capability', () => {
    for (const file of graph.files) {
      const source = readFileSync(file, 'utf8');
      for (const forbidden of [
        /\bfetch\s*\(/,
        /\bprocess\b/,
        /\bglobalThis\b/,
        /\bcaches\b/,
        /\bXMLHttpRequest\b/,
        /\bWebSocket\b/,
        /\bnavigator\b/,
        /\bdocument\b/,
        /\blocation\b/,
        /crypto\.subtle\.(?!sign\('HMAC'|verify\()/,
        /\bgetRandomValues\b/,
      ]) {
        expect(
          source,
          `${relative(PACKAGE_DIR, file)} matches ${forbidden}`
        ).not.toMatch(forbidden);
      }
    }
  });
});

describe('test issuer entry point', () => {
  it('is imported only from test files anywhere in the repository', () => {
    let output = '';
    try {
      output = execFileSync(
        'git',
        ['grep', '-l', '@tuturuuu/session/testing', '--', 'apps', 'packages'],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
        }
      );
    } catch {
      output = '';
    }
    const importers = output.split('\n').filter(Boolean);
    for (const file of importers) {
      expect(file, file).toMatch(
        /(\.test\.tsx?|\.spec\.tsx?|\/__tests__\/.+|\.check\.ts|\.mdx?)$/
      );
    }
  });
});
