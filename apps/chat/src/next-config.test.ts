import {
  getRewrittenUrl,
  unstable_getResponseFromNextConfig,
} from 'next/experimental/testing/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/plugin', () => ({
  default: () => (config: unknown) => config,
}));

vi.mock(
  '@tuturuuu/utils/next-config',
  () => import('../../../packages/utils/src/next-config')
);

describe('Chat central API rewrites', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('WEB_APP_URL', 'https://web.example.com');
    vi.stubEnv('INTERNAL_WEB_API_ORIGIN', '');
    vi.stubEnv('NEXT_PUBLIC_WEB_APP_URL', '');
    vi.stubEnv(
      'INTERNAL_INFRASTRUCTURE_API_ORIGIN',
      'https://infrastructure.example.com'
    );
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
        url: `https://chat.example.com${path}`,
      });

      expect(getRewrittenUrl(response)).toBe(`https://web.example.com${path}`);
    }
  );

  it('preserves the Infrastructure proxy ahead of Web', async () => {
    const { default: nextConfig } = await import('../next.config');
    const response = await unstable_getResponseFromNextConfig({
      nextConfig,
      url: 'https://chat.example.com/api/v1/infrastructure/health?scope=status',
    });
    expect(getRewrittenUrl(response)).toBe(
      'https://infrastructure.example.com/api/v1/infrastructure/health?scope=status'
    );
  });

  it('keeps the API proxy in fallback so local Chat and auth handlers win', async () => {
    const { default: nextConfig } = await import('../next.config');

    await expect(nextConfig.rewrites?.()).resolves.toEqual({
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        {
          source: '/api/v1/infrastructure/:path*',
          destination:
            'https://infrastructure.example.com/api/v1/infrastructure/:path*',
        },
        {
          source: '/api/:path*',
          destination: 'https://web.example.com/api/:path*',
        },
      ],
    });
  });
});
