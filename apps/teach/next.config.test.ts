import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/plugin', () => ({
  default: () => (config: unknown) => config,
}));

describe('Teach next config rewrites', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('forwards ai and v1 api routes to the central web app', async () => {
    vi.stubEnv('WEB_APP_URL', 'https://web.example.com');

    const { default: nextConfig } = await import('./next.config');
    const rewrites = await nextConfig.rewrites?.();

    expect(rewrites).toEqual({
      afterFiles: [],
      beforeFiles: [],
      fallback: [
        {
          destination: 'https://web.example.com/api/ai/:path*',
          source: '/api/ai/:path*',
        },
        {
          destination: 'https://web.example.com/api/v1/:path*',
          source: '/api/v1/:path*',
        },
      ],
    });
  });
});