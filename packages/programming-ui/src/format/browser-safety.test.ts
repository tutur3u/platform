import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { FORMATTER_ENTRYPOINTS } from './formatters';

const builtins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);
const root = new URL('../..', import.meta.url).pathname;

// One module a client bundle cannot resolve, such as a UMD file that requires
// `fs`, fails the whole page's build, not only Format. Bundling each entry the
// way a browser build does catches it before it ships.
describe('formatter modules in a browser bundle', () => {
  it.each([...FORMATTER_ENTRYPOINTS])(
    '%s bundles for the browser with no Node built-in',
    async (entry) => {
      const result = await build({
        stdin: {
          contents: `import * as formatter from '${entry}'; console.log(formatter);`,
          resolveDir: root,
        },
        bundle: true,
        platform: 'browser',
        format: 'esm',
        write: false,
        logLevel: 'silent',
        metafile: true,
        conditions: ['browser', 'import', 'module'],
      });
      expect(result.errors).toEqual([]);
      const external = Object.values(result.metafile.outputs).flatMap(
        (output) =>
          output.imports
            .filter((item) => item.external)
            .map((item) => item.path)
      );
      expect(external.filter((path) => builtins.has(path))).toEqual([]);
    },
    60_000
  );

  it('lists every module the registry imports, so none escapes the guard', () => {
    const source = readFileSync(
      new URL('./formatters.ts', import.meta.url),
      'utf8'
    );
    const imported = [...source.matchAll(/import\('([^']+)'\)/g)].map(
      (match) => match[1]
    );
    expect(imported.length).toBeGreaterThan(0);
    for (const specifier of imported)
      expect(FORMATTER_ENTRYPOINTS as readonly string[]).toContain(specifier);
    const statics = [...source.matchAll(/^import .* from '([^']+)'/gm)].map(
      (match) => match[1] ?? ''
    );
    // Static imports stay inside the package or the type-only primitives.
    for (const specifier of statics)
      expect(
        specifier.startsWith('.') || specifier.startsWith('@tuturuuu/')
      ).toBe(true);
  });

  it('catches a module that needs fs', async () => {
    // A guard that cannot fail is no guard: bundling a require of fs must error.
    await expect(
      build({
        stdin: { contents: "require('fs')", resolveDir: root },
        bundle: true,
        platform: 'browser',
        write: false,
        logLevel: 'silent',
      })
    ).rejects.toThrow();
  });
});
