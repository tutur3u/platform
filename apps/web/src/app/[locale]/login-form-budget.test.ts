import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { staticImportModules } from './static-import-modules';

const LOGIN_DIR = 'src/app/[locale]/(auth)/login';
const HEAVY_MODULES = [
  '@marsidev/react-turnstile',
  '@tuturuuu/ui/input-otp',
  './internal-app-account-confirmation',
] as const;

function read(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

function resolveLocal(fromFile: string, specifier: string) {
  const base = join(dirname(fromFile), specifier);
  return ['.tsx', '.ts']
    .map((extension) => `${base}${extension}`)
    .find((candidate) => existsSync(join(process.cwd(), candidate)));
}

/** form.tsx and every local module it reaches through static imports. */
function staticLoginFormGraph() {
  const seen = new Set<string>();
  const queue = [`${LOGIN_DIR}/form.tsx`];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of staticImportModules(read(file))) {
      if (!specifier.startsWith('./')) continue;
      const resolved = resolveLocal(file, specifier);
      if (resolved) queue.push(resolved);
    }
  }
  return [...seen];
}

// The login form renders on every /login view, so a lazy chunk saved no
// bytes; it only swapped a shorter skeleton for the form after first paint,
// which moved the centred column (layout shift). The form is imported
// eagerly, and its heavy dependencies stay behind dynamic imports anywhere
// in its static graph, so the eager form cannot bloat the shell.
describe('login form budget', () => {
  it('imports the login form eagerly from the login shell', () => {
    const content = read(`${LOGIN_DIR}/login-content.tsx`);
    expect(staticImportModules(content)).toContain('./form');
    expect(content).not.toMatch(
      /lazy\(\s*\(\)\s*=>\s*import\(\s*['"]\.\/form/u
    );
  });

  it('keeps heavy dependencies out of the form static graph', () => {
    const graph = staticLoginFormGraph();
    expect(graph.length).toBeGreaterThan(5);
    for (const file of graph) {
      for (const heavyModule of HEAVY_MODULES) {
        expect(
          staticImportModules(read(file)),
          `${file} statically imports ${heavyModule}`
        ).not.toContain(heavyModule);
      }
    }

    const form = read(`${LOGIN_DIR}/form.tsx`);
    for (const heavyModule of HEAVY_MODULES) {
      const escaped = heavyModule.replace(/[./]/gu, '\\$&');
      expect(form).toMatch(
        new RegExp(`await import\\(\\s*['"]${escaped}['"]\\s*\\)`, 'u')
      );
    }
  });
});
