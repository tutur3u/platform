import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/plugin', () => ({
  default: () => (config: unknown) => config,
}));

describe('Contacts next config rewrites', () => {
  it('keeps workspace feedbacks on the local app-session route', async () => {
    vi.stubEnv('WEB_APP_URL', 'https://web.example.com');

    const { default: nextConfig } = await import('../next.config');
    const rewrites = await nextConfig.rewrites?.();

    expect(rewrites).toMatchObject({
      beforeFiles: expect.not.arrayContaining([
        expect.objectContaining({
          source: '/api/v1/workspaces/:wsId/users/feedbacks',
        }),
      ]),
      fallback: expect.arrayContaining([
        {
          source: '/api/:path*',
          destination: 'https://web.example.com/api/:path*',
        },
      ]),
    });
  });
});
