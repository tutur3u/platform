import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/plugin', () => ({
  default: () => (config: unknown) => config,
}));

describe('Teach next config rewrites', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('forwards every api route to the central web app as a fallback', async () => {
    vi.stubEnv('WEB_APP_URL', 'https://web.example.com');

    const { default: nextConfig } = await import('./next.config');
    const rewrites = await nextConfig.rewrites?.();

    expect(rewrites).toEqual({
      afterFiles: [],
      beforeFiles: [],
      fallback: [
        {
          destination: 'https://web.example.com/api/:path*',
          source: '/api/:path*',
        },
      ],
    });
  });});
