import { describe, expect, it } from 'vitest';
import { startBridgePreset } from './preset';

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
      '/^next\\/headers$/u',
      '/^next\\/server$/u',
      '/^next\\/navigation$/u',
      '/^next\\/link$/u',
      '/^next-intl$/u',
      '@/',
    ]);
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
    expect(preset.alias).toHaveLength(10);
  });
});
