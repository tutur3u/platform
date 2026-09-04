import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/plugin', () => ({
  default: () => (config: unknown) => config,
}));

describe('Contacts next config rewrites', () => {
  it('proxies workspace feedbacks before the local user-id mutation route', async () => {
    vi.stubEnv('WEB_APP_URL', 'https://web.example.com');

    const { default: nextConfig } = await import('../next.config');
    const rewrites = await nextConfig.rewrites?.();

    expect(rewrites).toMatchObject({
      beforeFiles: expect.arrayContaining([
        {
          destination:
            'https://web.example.com/api/v1/workspaces/:wsId/users/feedbacks',
          source: '/api/v1/workspaces/:wsId/users/feedbacks',
        },
      ]),
    });
  });
});
