import { describe, expect, it } from 'vitest';
import { createBasePath } from '../core/base-path';
import { presetBasePath, startBridgePreset } from './preset';

const appRoot = 'file:///repo/apps/apps/vite.config.mts';

describe('Vite preset', () => {
  it('builds root-mode values identical to the pre-bridge app config', () => {
    const preset = startBridgePreset(
      {
        appRoot,
        app: 'apps',
        navigation: 'document',
        shims: [
          'next/headers',
          'next/server',
          'next/navigation',
          'next/link',
          'next-intl',
        ],
        serverOnlySpecifiers: ['@tuturuuu/satellite/auth'],
      },
      { NEXT_PUBLIC_A: 'a', SECRET: 's' }
    );
    expect(preset.base).toBe('/');
    expect(preset.tanstackStart.serverFns.base).toBe('/_serverFn');
    expect(preset.tanstackStart.importProtection.client.specifiers).toEqual([
      'node:async_hooks',
      '@tuturuuu/satellite/auth',
    ]);
    expect(preset.alias.map((alias) => String(alias.find))).toEqual([
      '/^next\\/headers(?:\\.js)?$/u',
      '/^next\\/server(?:\\.js)?$/u',
      '/^next\\/navigation(?:\\.js)?$/u',
      '/^next\\/link(?:\\.js)?$/u',
      '/^next-intl$/u',
      '@/',
    ]);
    expect(
      startBridgePreset(
        {
          appRoot,
          app: 'calendar',
          shims: ['next/headers'],
          inertVercel: true,
        },
        {}
      ).alias.map((alias) => String(alias.find))
    ).toContain('/^@tuturuuu\\/vercel$/u');
    const targets = preset.alias.map((alias) => alias.replacement);
    expect(targets[2]).toMatch(/src\/next\/navigation-document\.tsx$/u);
    expect(targets[3]).toBe(targets[2]);
    expect(targets[5]).toBe('/repo/apps/apps/src/');
    expect(
      JSON.parse(preset.clientDefine('build')['process.env'] ?? '')
    ).toEqual({ NEXT_PUBLIC_A: 'a', NODE_ENV: 'production' });
    expect(preset.define['import.meta.env.VITE_TUTURUUU_BASE_PATH']).toBe('""');
  });

  it('applies a basePath to assets, server functions and the router define', () => {
    const preset = startBridgePreset(
      { appRoot, app: 'meet' },
      { TUTURUUU_BASE_PATH: '/meet/' }
    );
    expect(preset.base).toBe('/meet/');
    expect(preset.tanstackStart.serverFns.base).toBe('/meet/_serverFn');
    expect(preset.define['import.meta.env.VITE_TUTURUUU_BASE_PATH']).toBe(
      '"/meet"'
    );
    expect(preset.alias.at(-1)?.find).toBe('@/');
    // 14 shims, server-only, the nuqs adapter swap, the inert Vercel
    // scripts and '@/'; no request config exists under the fixture root.
    expect(preset.alias).toHaveLength(18);
  });

  it('adds the remaining shims and runtime asset URLs', () => {
    const preset = startBridgePreset(
      {
        appRoot,
        app: 'meet',
        intlServer: './src/runtime/intl-server.ts',
        og: '/og.js',
      },
      {}
    );
    const finds = preset.alias.map((alias) => String(alias.find));
    expect(finds).toContain('/^@tuturuuu\\/satellite\\/i18n$/u');
    expect(finds).toContain('/^server-only$/u');
    const byFind = (find: string) =>
      preset.alias.find((alias) => String(alias.find) === find)?.replacement;
    expect(byFind('/^next-intl\\/server$/u')).toBe(
      '/repo/apps/apps/src/runtime/intl-server.ts'
    );
    expect(byFind('/^next\\/og$/u')).toBe('/og.js');
    expect(byFind('/^@tuturuuu\\/vercel$/u')).toMatch(
      /src\/next\/vercel\.tsx$/u
    );
    expect(byFind('/^nuqs\\/adapters\\/next\\/app$/u')).toBe(
      'nuqs/adapters/tanstack-router'
    );
    expect(
      finds.filter((find) => find.startsWith('/^next-intl\\/server'))
    ).toHaveLength(1);
    expect(
      new RegExp(String(finds[0]).slice(1, -2), 'u').test('next/headers.js')
    ).toBe(true);
    const render = preset.experimental.renderBuiltUrl;
    expect(render('assets/a.png', { hostType: 'css' })).toEqual({
      relative: true,
    });
    expect(render('index.html', { hostType: 'html' })).toBeUndefined();
    const runtime = render('assets/a.png', { hostType: 'js' });
    const evaluate = (base: unknown) => {
      (globalThis as Record<string, unknown>).__tuturuuuAppBase = base;
      return new Function(
        `return ${(runtime as { runtime: string }).runtime}`
      )();
    };
    const saved = (globalThis as Record<string, unknown>).__tuturuuuAppBase;
    expect(evaluate('/meet')).toBe('/meet/assets/a.png');
    expect(evaluate(() => '')).toBe('/assets/a.png');
    expect(evaluate(undefined)).toBe('/assets/a.png');
    (globalThis as Record<string, unknown>).__tuturuuuAppBase = saved;
  });

  it('matches createBasePath for every accepted and rejected input', () => {
    const keys = [
      'basePath',
      'app',
      'isRoot',
      'assetBase',
      'serverFnBase',
      'routerBasepath',
    ] as const;
    for (const input of [
      undefined,
      '',
      '/',
      '/meet',
      '/meet/',
      '/meet///',
      '/a/b-c',
    ]) {
      const full = createBasePath({ app: 'meet', basePath: input });
      expect(presetBasePath('meet', input)).toEqual(
        Object.fromEntries(keys.map((key) => [key, full[key]]))
      );
    }
    for (const input of ['meet', '/Meet', '//x', '/a?b'])
      expect(() => presetBasePath('meet', input)).toThrow('Invalid basePath');
    expect(() => presetBasePath('Meet', '')).toThrow('Invalid app id');
  });

  it('imports only Node built-ins so native type stripping can load it', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(
      new URL('./preset.ts', import.meta.url),
      'utf8'
    );
    expect(source.match(/^import .* from '(?!node:)[^']*';$/gmu)).toBeNull();
  });

  it('aliases next-intl/config to the app request config for the generic server shim', () => {
    const preset = startBridgePreset(
      { appRoot, app: 'contacts', intlRequestConfig: './src/i18n/request.ts' },
      {}
    );
    const byFind = (find: string) =>
      preset.alias.find((alias) => String(alias.find) === find)?.replacement;
    expect(byFind('/^next-intl\\/config$/u')).toBe(
      '/repo/apps/apps/src/i18n/request.ts'
    );
    expect(byFind('/^next-intl\\/server$/u')).toMatch(
      /src\/intl\/next-intl-server\.ts$/u
    );
    expect(byFind('/^next\\/root-params(?:\\.js)?$/u')).toMatch(
      /src\/next\/root-params\.ts$/u
    );
  });

  it('adds RSC shims and leaves navigation and intl to the RSC plugin', () => {
    const preset = startBridgePreset({ appRoot, app: 'tools', rsc: true }, {});
    const finds = preset.alias.map((alias) => String(alias.find));
    expect(preset.tanstackStart.rsc).toEqual({ enabled: true });
    expect(finds.some((find) => find.includes('next\\/navigation'))).toBe(
      false
    );
    expect(finds).not.toContain(String(/^next-intl\/navigation$/u));
    expect(finds).toContain(String(/^next-intl\/server$/u));
    expect(finds).toContain(String(/^next\/root-params(?:\.js)?$/u));
    expect(
      startBridgePreset({ appRoot, app: 'tools' }, {}).tanstackStart.rsc
    ).toBeUndefined();
  });
});
