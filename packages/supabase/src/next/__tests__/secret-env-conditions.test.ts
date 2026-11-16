import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Proves the SUPABASE_SECRET_KEY reader cannot reach a client bundle: every
// client toolchain's condition set resolves `#secret-env` and
// `./next/secret-env` to the browser stub, every server runtime resolves the
// real reader, and the browser-reachable module graph of the server entry
// points never contains the secret key name.

const packageRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..'
);
const manifest = JSON.parse(
  readFileSync(join(packageRoot, 'package.json'), 'utf8')
) as {
  name: string;
  imports: Record<string, unknown>;
  exports: Record<string, unknown>;
};

const CLIENT_CONDITIONS = {
  'next-client': ['browser', 'import', 'module', 'production', 'default'],
  'vite-client': ['browser', 'module', 'import', 'production', 'default'],
  // Vite+ apps (Calendar, Tasks) enable `bun` for workspace sources.
  'vite-plus-client': [
    'bun',
    'module',
    'browser',
    'import',
    'production',
    'default',
  ],
  'esbuild-browser': ['browser', 'import', 'default'],
};
const SERVER_CONDITIONS = {
  node: ['node', 'import', 'default'],
  'bun-runtime': ['bun', 'node', 'import', 'default'],
  'next-react-server': ['react-server', 'node', 'import', 'default'],
  'next-edge': ['edge-light', 'worker', 'browser', 'import', 'default'],
  'cloudflare-workerd': [
    'workerd',
    'worker',
    'browser',
    'module',
    'import',
    'default',
  ],
};
const SECRET_NAMES = ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE'];
const SERVER_RUNTIME_KEYS = [
  'workerd',
  'worker',
  'edge-light',
  'react-server',
  'node',
];
const BROWSER_STUBS = [
  './dist/next/secret-env.browser.js',
  './src/next/secret-env.browser.ts',
];
const SERVER_READERS = [
  './dist/next/secret-env.js',
  './src/next/secret-env.ts',
];

// Node's conditional-export algorithm: the first key, in object order, that is
// an active condition (or `default`) wins.
function resolveTarget(target: unknown, conditions: string[]): string | null {
  if (typeof target === 'string') return target;
  if (!target || typeof target !== 'object') return null;
  for (const [key, value] of Object.entries(target)) {
    if (key !== 'default' && !conditions.includes(key)) continue;
    const resolved = resolveTarget(value, conditions);
    if (resolved) return resolved;
  }
  return null;
}

// Build targets point at dist; scan the source file that produces them.
function toSource(target: string): string {
  const relative = target.replace(/^\.\//u, '');
  const source = relative.startsWith('dist/')
    ? relative.replace(/^dist\//u, 'src/').replace(/\.js$/u, '.ts')
    : relative;
  return join(packageRoot, source);
}

function resolveSpecifier(
  specifier: string,
  from: string,
  conditions: string[]
): string | null {
  if (specifier.startsWith('.')) {
    const base = resolve(dirname(from), specifier);
    for (const candidate of [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      join(base, 'index.ts'),
    ]) {
      if (existsSync(candidate) && candidate.match(/\.tsx?$/u)) {
        return candidate;
      }
    }
    return null;
  }
  if (specifier.startsWith('#')) {
    const target = resolveTarget(manifest.imports[specifier], conditions);
    return target ? toSource(target) : null;
  }
  if (specifier.startsWith(`${manifest.name}/`)) {
    const subpath = `./${specifier.slice(manifest.name.length + 1)}`;
    const target = resolveTarget(manifest.exports[subpath], conditions);
    return target ? toSource(target) : null;
  }
  return null; // External package: outside this package's graph.
}

function reachableFiles(entry: string, conditions: string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [join(packageRoot, entry)];
  const pattern =
    /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/gu;
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const match of readFileSync(file, 'utf8').matchAll(pattern)) {
      const specifier = match[1] ?? match[2] ?? match[3];
      if (!specifier) continue;
      const resolved = resolveSpecifier(specifier, file, conditions);
      if (resolved) queue.push(resolved);
    }
  }
  return seen;
}

const SECRET_ENTRIES = [
  ['#secret-env', manifest.imports['#secret-env']],
  ['./next/secret-env', manifest.exports['./next/secret-env']],
] as const;

describe('secret-env resolution conditions', () => {
  for (const [name, target] of SECRET_ENTRIES) {
    for (const [toolchain, conditions] of Object.entries(CLIENT_CONDITIONS)) {
      it(`${toolchain} resolves ${name} to the browser stub`, () => {
        expect(BROWSER_STUBS).toContain(resolveTarget(target, conditions));
      });
    }
    for (const [runtime, conditions] of Object.entries(SERVER_CONDITIONS)) {
      it(`${runtime} resolves ${name} to the server reader`, () => {
        expect(SERVER_READERS).toContain(resolveTarget(target, conditions));
      });
    }
  }

  it('keeps source resolution for Bun and Vite+ while gating secrets', () => {
    for (const [, target] of SECRET_ENTRIES) {
      expect(resolveTarget(target, CLIENT_CONDITIONS['vite-plus-client'])).toBe(
        './src/next/secret-env.browser.ts'
      );
      expect(resolveTarget(target, SERVER_CONDITIONS['bun-runtime'])).toBe(
        './src/next/secret-env.ts'
      );
      expect(resolveTarget(target, SERVER_CONDITIONS.node)).toBe(
        './dist/next/secret-env.js'
      );
    }
  });

  // Conditions match in object order, so a `bun` key ahead of `browser` hands
  // the server source to any client build that also enables `bun`.
  it('orders server runtimes, then browser, then bun in every entry', () => {
    const entries = [
      ...Object.entries(manifest.exports).map(
        ([subpath, target]) => [`exports ${subpath}`, target] as const
      ),
      ...Object.entries(manifest.imports).map(
        ([specifier, target]) => [`imports ${specifier}`, target] as const
      ),
    ];
    const violations: string[] = [];
    const visit = (label: string, target: unknown) => {
      if (!target || typeof target !== 'object') return;
      const keys = Object.keys(target);
      const browser = keys.indexOf('browser');
      const bun = keys.indexOf('bun');
      if (browser >= 0 && bun >= 0 && bun < browser)
        violations.push(`${label}: bun before browser`);
      for (const runtime of SERVER_RUNTIME_KEYS) {
        const index = keys.indexOf(runtime);
        if (browser >= 0 && index > browser)
          violations.push(`${label}: ${runtime} after browser`);
      }
      for (const [key, value] of Object.entries(target))
        visit(`${label}.${key}`, value);
    };
    for (const [label, target] of entries) visit(label, target);

    expect(entries.length).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });

  it('keeps the browser stub free of secret names and environment reads', () => {
    const stub = readFileSync(
      join(packageRoot, 'src/next/secret-env.browser.ts'),
      'utf8'
    );

    for (const name of SECRET_NAMES) expect(stub).not.toContain(name);
    expect(stub).not.toContain('process.env');
  });

  for (const entry of ['src/next/server.ts', 'src/request/server.ts']) {
    for (const [toolchain, conditions] of Object.entries(CLIENT_CONDITIONS)) {
      it(`${toolchain} graph of ${entry} never contains a secret name`, () => {
        const files = reachableFiles(entry, conditions);

        expect(files).toContain(
          join(packageRoot, 'src/next/secret-env.browser.ts')
        );
        for (const file of files) {
          const source = readFileSync(file, 'utf8');
          for (const name of SECRET_NAMES) {
            expect(source, `${file} contains ${name}`).not.toContain(name);
          }
        }
      });
    }

    it(`node graph of ${entry} reaches the server reader (control)`, () => {
      const files = reachableFiles(entry, SERVER_CONDITIONS.node);

      expect(files).toContain(join(packageRoot, 'src/next/secret-env.ts'));
    });
  }
});
