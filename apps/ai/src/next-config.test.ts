import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/plugin', () => ({
  default: () => (config: unknown) => config,
}));

describe('AI Studio next config rewrites', () => {
  it('routes central static APIs before satellite dynamic routes', async () => {
    vi.stubEnv('WEB_APP_URL', 'https://web.example.com');

    const { default: nextConfig } = await import('../next.config');
    const rewrites = await nextConfig.rewrites?.();

    expect(rewrites).toEqual({
      afterFiles: [],
      beforeFiles: [
        {
          destination: 'https://web.example.com/api/workspaces/invitations',
          source: '/api/workspaces/invitations',
        },
        {
          destination:
            'https://web.example.com/api/v1/workspaces/:wsId/settings/permissions',
          source: '/api/v1/workspaces/:wsId/settings/permissions',
        },
        {
          destination:
            'https://web.example.com/api/v1/workspaces/:wsId/users/feedbacks',
          source: '/api/v1/workspaces/:wsId/users/feedbacks',
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
