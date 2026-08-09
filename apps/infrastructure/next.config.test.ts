import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/plugin', () => ({
  default: () => (config: unknown) => config,
}));

describe('Infrastructure next config rewrites', () => {
  it('falls back to the central app for shared settings APIs', async () => {
    vi.stubEnv('WEB_APP_URL', 'https://web.example.com');

    const { default: nextConfig } = await import('./next.config');
    const rewrites = await nextConfig.rewrites?.();

    expect(rewrites).toEqual({
      afterFiles: [],
      beforeFiles: [
        {
          destination: 'https://web.example.com/api/workspaces/invitations',
          source: '/api/workspaces/invitations',
        },
        {
          destination: 'https://web.example.com/api/v1/workspaces',
          source: '/api/v1/workspaces',
        },
      ],
      fallback: [
        {
          destination: 'https://web.example.com/api/:path*',
          source: '/api/:path*',
        },
      ],
    });
  });
});
