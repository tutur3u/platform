import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ initDev: vi.fn() }));
vi.mock('@opennextjs/cloudflare', () => ({
  initOpenNextCloudflareForDev: mocks.initDev,
}));
vi.mock('@tuturuuu/utils/next-config', () => ({
  createTuturuuuNextConfig: (config: unknown) => config,
  resolveTuturuuuWebAppUrl: () => 'https://web.example',
  createTuturuuuWebWorkspaceApiRewrites: () => [
    {
      source: '/workspace-api',
      destination: 'https://web.example/workspace-api',
    },
  ],
}));
vi.mock('next-intl/plugin', () => ({
  default: () => (config: unknown) => config,
}));

import configureLettin from './next.config';

afterEach(() => vi.unstubAllEnvs());
it('preserves the original proxy URL and existing web API rewrite ordering', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  const config = await configureLettin();
  expect(config.skipProxyUrlNormalize).toBe(true);
  expect(typeof config.rewrites).toBe('function');
  if (typeof config.rewrites !== 'function')
    throw new Error('Missing Lettin API rewrites');
  expect(await config.rewrites()).toEqual({
    beforeFiles: [],
    afterFiles: [
      {
        source: '/workspace-api',
        destination: 'https://web.example/workspace-api',
      },
    ],
    fallback: [
      { source: '/api/:path*', destination: 'https://web.example/api/:path*' },
    ],
  });
  expect(mocks.initDev).not.toHaveBeenCalled();
});
