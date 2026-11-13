// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Calendar native build configuration', () => {
  it.each([
    [
      'production',
      '/calendar/',
      '/calendar',
      '/calendar/_fn',
      'https://tuturuuu.com/calendar',
    ],
    ['staging', '/', '', '/_fn', 'https://calendar.tutur3u.com'],
    ['development', '/', '', '/_fn', 'http://localhost:7806'],
  ])(
    'builds the explicit %s asset, router and function contract',
    async (profile, assetBase, basePath, functionBase, publicUrl) => {
      vi.resetModules();
      vi.stubEnv('CALENDAR_DEPLOYMENT_PROFILE', profile);
      vi.stubEnv('TUTURUUU_BASE_PATH', basePath);
      vi.stubEnv(
        'NEXT_PUBLIC_APP_URL',
        profile === 'production' ? 'https://calendar.tuturuuu.com' : publicUrl
      );
      vi.stubEnv(
        'NEXT_PUBLIC_CALENDAR_APP_URL',
        profile === 'production' ? 'https://calendar.tuturuuu.com' : publicUrl
      );
      const { bridge } = await import('./vite.config.mjs');
      expect(bridge.base).toBe(assetBase);
      expect(bridge.basePath.routerBasepath).toBe(basePath || '/');
      expect(bridge.tanstackStart.serverFns.base).toBe(functionBase);
      expect(bridge.define['import.meta.env.VITE_TUTURUUU_BASE_PATH']).toBe(
        JSON.stringify(basePath)
      );
      expect(
        JSON.parse(bridge.clientDefine('build')['process.env'] ?? '{}')
          .NEXT_PUBLIC_CALENDAR_APP_URL
      ).toBe(publicUrl);
    },
    15_000
  );

  it.each([
    ['production', ''],
    ['production', '/other'],
    ['staging', '/calendar'],
  ])(
    'rejects profile %s with conflicting build base %s',
    async (profile, base) => {
      vi.resetModules();
      vi.stubEnv('CALENDAR_DEPLOYMENT_PROFILE', profile);
      vi.stubEnv('TUTURUUU_BASE_PATH', base);
      await expect(import('./vite.config.mjs')).rejects.toThrow(
        'Calendar build base must match its deployment profile'
      );
    }
  );
});
