import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fontModule, importedNames, startBridgeRscPlugin } from './rsc';

describe('RSC plugin', () => {
  it('reads imported font names, including default and aliases', () => {
    const source = [
      "import { Noto_Sans, Inter as Body, type NextFont } from 'next/font/google';",
      "import localFont from 'next/font/local';",
    ].join('\n');
    expect(importedNames(source, 'next/font/google')).toEqual([
      'Inter',
      'NextFont',
      'Noto_Sans',
    ]);
    expect(importedNames(source, 'next/font/local')).toEqual(['default']);
    expect(fontModule(['Noto_Sans', 'default'])).toContain(
      'export const Noto_Sans = font("Noto Sans");'
    );
  });

  it('resolves navigation and intl per environment', () => {
    const plugin = startBridgeRscPlugin();
    const resolve = (name: string, id: string) =>
      plugin.resolveId.call({ environment: { name } }, id);
    expect(resolve('rsc', 'next/navigation')).toMatch(/rsc\/navigation\.ts$/u);
    expect(resolve('ssr', 'next/navigation')).toMatch(
      /next\/navigation\.tsx$/u
    );
    expect(resolve('rsc', 'next/navigation.js')).toMatch(
      /rsc\/navigation\.ts$/u
    );
    expect(resolve('rsc', 'next-intl')).toMatch(/rsc\/next-intl\.tsx$/u);
    expect(resolve('client', 'next-intl')).toMatch(/intl\/use-intl\.tsx$/u);
    expect(resolve('rsc', 'next-intl/navigation')).toMatch(
      /rsc\/intl-navigation\.tsx$/u
    );
    expect(resolve('ssr', 'next-intl/navigation')).toMatch(
      /intl\/navigation\.tsx$/u
    );
    expect(resolve('client', 'react')).toBeNull();
    const document = startBridgeRscPlugin({ navigation: 'document' });
    expect(
      document.resolveId.call(
        { environment: { name: 'client' } },
        'next/navigation'
      )
    ).toMatch(/navigation-document\.tsx$/u);
  });

  it('pins the rsc entry name plugin-rsc imports from SSR', () => {
    const plugin = startBridgeRscPlugin();
    expect(plugin.configEnvironment('rsc')).toEqual({
      resolve: expect.objectContaining({
        noExternal: true,
        conditions: expect.arrayContaining(['workerd', 'worker']),
        builtins: expect.arrayContaining(['cloudflare:workers']),
      }),
      build: {
        target: 'es2026',
        rollupOptions: expect.objectContaining({
          platform: 'neutral',
          output: { entryFileNames: '[name].js' },
        }),
      },
    });
    expect(plugin.configEnvironment('ssr')).toBeNull();
  });

  it('adds route-handler entries to the rsc environment only', () => {
    const plugin = startBridgeRscPlugin({
      rscEntries: {
        'bridge-api': new URL('file:///app/src/start-bridge/api.ts'),
      },
    });
    expect(plugin.configEnvironment('rsc')).toEqual({
      resolve: expect.objectContaining({ noExternal: true }),
      build: {
        target: 'es2026',
        rollupOptions: expect.objectContaining({
          input: { 'bridge-api': '/app/src/start-bridge/api.ts' },
          platform: 'neutral',
          output: { entryFileNames: '[name].js' },
        }),
      },
    });
    expect(plugin.configEnvironment('ssr')).toBeNull();
  });
  it('turns CommonJS requires of Node built-ins into ESM imports in rsc', () => {
    const config = startBridgeRscPlugin().configEnvironment('rsc') as {
      resolve: { builtins: (string | RegExp)[] };
      build: { rollupOptions: { plugins: unknown[] } };
    };
    const builtin = config.resolve.builtins.find(
      (entry): entry is RegExp => entry instanceof RegExp
    );
    for (const name of ['child_process', 'node:child_process', 'tty'])
      expect(builtin?.test(name), name).toBe(true);
    expect(builtin?.test('react')).toBe(false);
    expect(config.build.rollupOptions.plugins).toHaveLength(1);
  });

  it('loads wasm and binary data as Wrangler modules in rsc (next/og)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'start-bridge-binary-'));
    try {
      const font = join(dir, 'noto.ttf.bin');
      writeFileSync(font, new Uint8Array([0, 159, 255]));
      const plugin = startBridgeRscPlugin();
      const importer = join(dir, 'index.js');
      const resolved = plugin.resolveId.call(
        { environment: { name: 'rsc' } },
        './noto.ttf.bin',
        importer
      ) as { id: string; external: boolean };
      expect(resolved.external).toBe(true);
      expect(
        plugin.resolveId.call(
          { environment: { name: 'client' } },
          './noto.ttf.bin',
          importer
        )
      ).toBeNull();
      const emitted: { name: string; source: Uint8Array }[] = [];
      const code = plugin.renderChunk.call(
        {
          environment: { name: 'rsc' },
          emitFile: (file) => {
            emitted.push(file);
            return 'ref';
          },
          getFileName: () => 'assets/noto.ttf-abc.bin',
        },
        `import font from "${resolved.id}";`,
        { fileName: 'assets/og-route.js' }
      );
      expect(code).toBe('import font from "./noto.ttf-abc.bin";');
      expect([...(emitted[0]?.source ?? [])]).toEqual([0, 159, 255]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
