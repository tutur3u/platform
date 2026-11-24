import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

const SRC = new URL('.', import.meta.url).pathname;
const SOURCE = /\.(?:[cm]?[jt]s|[jt]sx)$/u;
const TEST = /\.test\.(?:[cm]?[jt]s|[jt]sx)$/u;

/**
 * A reference to the packages/sso test fixtures or to any relative
 * `__tests__` path, through a static, side-effect, re-export, dynamic or
 * `require` specifier.
 */
const FORBIDDEN_IMPORT =
  /@tuturuuu\/sso\/testing|sso\/src\/__tests__|(?:\bfrom|\bimport|\bimport\s*\(|\brequire\s*\()\s*['"`]\.{1,2}\/(?:[^'"`\n]*\/)?__tests__(?:\/|['"`])/u;

/** Every non-test source file the Worker bundle can reach. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : sourceFiles(path);
    }
    return SOURCE.test(entry.name) && !TEST.test(entry.name) ? [path] : [];
  });
}

describe('signer source boundaries', () => {
  const files = sourceFiles(SRC);

  it('finds the Worker sources', () => {
    expect(files.map((file) => relative(SRC, file))).toContain('worker.ts');
  });

  it('never imports the packages/sso test fixtures outside tests', () => {
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(text, relative(SRC, file)).not.toMatch(FORBIDDEN_IMPORT);
    }
  });

  it.each([
    "import { harness } from './__tests__/harness';",
    "import type { X } from '../__tests__/harness';",
    "import './__tests__/setup';",
    "export * from './__tests__/bundle';",
    "const m = await import('./__tests__/bundle');",
    'const m = await import(`./__tests__/bundle`);',
    "const m = require('./nested/__tests__/x');",
    "import { x } from '@tuturuuu/sso/testing';",
    "import { x } from '../../../packages/sso/src/__tests__/x';",
  ])('catches %s', (line) => {
    expect(line).toMatch(FORBIDDEN_IMPORT);
  });

  it.each([
    "import { harness } from './harness';",
    "const name = '__tests__ are excluded from the bundle';",
  ])('allows %s', (line) => {
    expect(line).not.toMatch(FORBIDDEN_IMPORT);
  });

  it.each(['worker.cts', 'view.tsx', 'entry.mjs', 'entry.cjs'])(
    'scans %s sources',
    (name) => {
      expect(SOURCE.test(name) && !TEST.test(name)).toBe(true);
    }
  );

  it.each(['worker.test.cts', 'view.test.tsx'])(
    'skips the test file %s',
    (name) => {
      expect(TEST.test(name)).toBe(true);
    }
  );
});
