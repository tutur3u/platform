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
function moduleImports(
  file: string,
  source = readFileSync(file, 'utf8')
): ModuleImport[] {
  const ast = parse(source, {
    sourceType: 'module',
    plugins: file.endsWith('x') ? ['typescript', 'jsx'] : ['typescript'],
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
    if (current.type === 'TSImportEqualsDeclaration') {
      const reference = current.moduleReference as
        | { type?: string; expression?: { value?: string } }
        | undefined;
      const external = reference?.type === 'TSExternalModuleReference';
      found.push({
        specifier: external
          ? (reference?.expression?.value ?? '<import-equals>')
          : '<import-equals>',
        typeOnly: current.importKind === 'type',
        dynamic: !external,
      });
    }
    const literalTarget = (argument: unknown): string | null => {
      const node = argument as
        | {
            type?: string;
            value?: unknown;
            quasis?: Array<{ value: { cooked?: string } }>;
            expressions?: unknown[];
          }
        | undefined;
      if (node?.type === 'StringLiteral' && typeof node.value === 'string')
        return node.value;
      if (node?.type === 'TemplateLiteral' && node.expressions?.length === 0) {
        return node.quasis?.[0]?.value.cooked ?? null;
      }
      return null;
    };
    const callee = current.callee as
      | { type?: string; name?: string }
      | undefined;
    const isDynamicImport =
      current.type === 'ImportExpression' ||
      (current.type === 'CallExpression' && callee?.type === 'Import');
    const isRequire =
      current.type === 'CallExpression' && callee?.name === 'require';
    if (isDynamicImport || isRequire) {
      const argument =
        current.type === 'ImportExpression'
          ? current.source
          : (current.arguments as unknown[] | undefined)?.[0];
      const target = literalTarget(argument);
      found.push({
        specifier: target ?? (isRequire ? '<require>' : '<dynamic>'),
        typeOnly: false,
        dynamic: true,
      });
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

const TESTING_PATH = join(PACKAGE_DIR, 'src', 'testing.ts');
const TEST_FILE = /(\.test\.tsx?|\.spec\.tsx?|\/__tests__\/.+|\.check\.ts)$/;

/** Whether a module imports the test issuer, resolving relative specifiers. */
function importsTestIssuer(file: string, source?: string): boolean {
  return moduleImports(file, source).some(({ specifier }) => {
    if (specifier === '@tuturuuu/session/testing') return true;
    if (!specifier.startsWith('.')) {
      return /session\/src\/testing(\.[cm]?[jt]s)?$/.test(specifier);
    }
    const base = resolve(dirname(file), specifier).replace(/\.[cm]?js$/, '');
    return [base, `${base}.ts`, join(base, 'index.ts')].includes(TESTING_PATH);
  });
}

/**
 * Scan scope: every tracked JavaScript or TypeScript source under `apps` and
 * `packages` whose text contains `testing` followed by a quote, optionally
 * with an extension. Computed specifiers are out of scope; the issuer itself
 * refuses to run outside Vitest, so this scan is a second line of defence.
 */
const CANDIDATE_PATTERN = 'testing(\\.[cm]?[jt]sx?)?[\'"`]';
const SOURCE_GLOBS = [
  'ts',
  'tsx',
  'mts',
  'cts',
  'js',
  'jsx',
  'mjs',
  'cjs',
].flatMap((extension) => [`apps/*.${extension}`, `packages/*.${extension}`]);

/** Tracked source files in the scan scope whose text names a `testing` module. */
function candidateImporters(): string[] {
  let output = '';
  try {
    output = execFileSync(
      'git',
      ['grep', '-l', '-E', CANDIDATE_PATTERN, '--', ...SOURCE_GLOBS],
      { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );
  } catch (error) {
    // git grep exits 1 when nothing matches; any other failure fails the test.
    if ((error as { status?: number }).status !== 1) throw error;
  }
  return output.split('\n').filter(Boolean);
}

describe('test issuer', () => {
  it('is not a package entry point', () => {
    expect(Object.keys(packageJson.exports)).not.toContain('./testing');
    expect(Object.values(packageJson.exports)).not.toContain(
      './src/testing.ts'
    );
  });

  it('is reachable from no runtime entry point', () => {
    expect(
      runtimeGraph().files.some((file) => file.endsWith('testing.ts'))
    ).toBe(false);
  });

  it('is imported only from test files anywhere in the repository', () => {
    const candidates = candidateImporters();
    // The package's own tests import the issuer, so an empty scan means it is broken.
    expect(candidates).toContain('packages/session/src/verify.test.ts');
    const offenders: string[] = [];
    for (const file of candidates) {
      if (TEST_FILE.test(file)) continue;
      if (importsTestIssuer(join(REPO_ROOT, file))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it.each([
    "import { createTestIssuer } from './testing';",
    "export * from './testing.ts';",
    "import x = require('./testing');",
    "const m = await import('./testing');",
    'const m = await import(`./testing`);',
    "const m = require('./testing.js');",
    "import { createTestIssuer } from './testing.js';",
  ])('selects and resolves the sibling import %s', (source) => {
    const sibling = join(PACKAGE_DIR, 'src', 'sibling-runtime.ts');
    expect(new RegExp(CANDIDATE_PATTERN).test(source)).toBe(true);
    expect(importsTestIssuer(sibling, source)).toBe(true);
  });

  it('detects a sibling runtime import of the issuer', () => {
    const sibling = join(PACKAGE_DIR, 'src', 'sibling-runtime.ts');
    expect(
      importsTestIssuer(
        sibling,
        "import { createTestIssuer } from './testing';"
      )
    ).toBe(true);
    expect(importsTestIssuer(sibling, "export * from './testing.ts';")).toBe(
      true
    );
    expect(importsTestIssuer(sibling, "import x = require('./testing');")).toBe(
      true
    );
    expect(
      importsTestIssuer(
        sibling,
        "import { verifyIdentityAssertion } from './verify';"
      )
    ).toBe(false);
  });
});

describe('test issuer runtime guard', () => {
  it('refuses to create an issuer outside Vitest', async () => {
    const { createTestIssuer } = await import('./testing');
    const previous = process.env.VITEST;
    delete process.env.VITEST;
    try {
      await expect(createTestIssuer()).rejects.toThrow(/only under Vitest/);
    } finally {
      process.env.VITEST = previous;
    }
  });
});
