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
        rollupOptions: {
          platform: 'neutral',
          output: { entryFileNames: '[name].js' },
        },
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
        rollupOptions: {
          input: { 'bridge-api': '/app/src/start-bridge/api.ts' },
          platform: 'neutral',
          output: { entryFileNames: '[name].js' },
        },
      },
    });
    expect(plugin.configEnvironment('ssr')).toBeNull();
  });
});
