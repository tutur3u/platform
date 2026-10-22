import {
  getRewrittenUrl,
  unstable_getResponseFromNextConfig,
} from 'next/experimental/testing/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/plugin', () => ({
  default: () => (config: unknown) => config,
}));

vi.mock(
  '@tuturuuu/utils/portless',
  () => import('../../../packages/utils/src/portless')
);

vi.mock(
  '@tuturuuu/utils/next-config',
  () => import('../../../packages/utils/src/next-config')
);

describe('Hive central API rewrites', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('WEB_APP_URL', 'https://web.example.com');
    vi.stubEnv('INTERNAL_WEB_API_ORIGIN', '');
    vi.stubEnv('NEXT_PUBLIC_WEB_APP_URL', '');
    vi.stubEnv('HIVE_REALTIME_HTTP_URL', 'https://realtime.example.com');
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each([
    '/api/workspaces/invitations',
    '/api/workspaces/00000000-0000-4000-8000-000000000001',
    '/api/v1/users/me?scope=profile',
    '/api/ai/chat/upload-url',
  ])(
    'forwards an unhandled %s to Web without changing its path',
    async (path) => {
      const { default: nextConfig } = await import('../next.config');
      const response = await unstable_getResponseFromNextConfig({
        nextConfig,
        url: `https://hive.example.com${path}`,
      });

      expect(getRewrittenUrl(response)).toBe(`https://web.example.com${path}`);
    }
  );

  it('keeps the API proxy in fallback so local Hive and auth handlers win', async () => {
    const { default: nextConfig } = await import('../next.config');

    await expect(nextConfig.rewrites?.()).resolves.toEqual({
      beforeFiles: [
        {
          source: '/realtime/:path*',
          destination: 'https://realtime.example.com/realtime/:path*',
        },
      ],
      afterFiles: [],
      fallback: [
        {
          source: '/api/:path*',
          destination: 'https://web.example.com/api/:path*',
        },
      ],
    });
  });
});
