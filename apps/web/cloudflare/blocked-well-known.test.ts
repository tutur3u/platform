import { describe, expect, it, vi } from 'vitest';
import { createWebCandidateHandler } from './handler';
import { stagingProfile, type WebCandidateEnv } from './profile';

const env: WebCandidateEnv = {
  WEB_START_CANDIDATE: 'staging',
  NEXT_PUBLIC_SUPABASE_URL: stagingProfile.supabaseUrl,
  AUTH_COOKIE_PREFIX: stagingProfile.cookiePrefix,
  CF_ACCESS_TEAM_DOMAIN: 'fixture.cloudflareaccess.com',
  CF_ACCESS_AUD: 'fixture-aud',
};

describe('native blocked well-known endpoint', () => {
  it.each(['GET', 'HEAD'])(
    'preserves the empty Next 404 for %s',
    async (method) => {
      const start = vi.fn();
      const fetcher = vi.fn();
      const handler = createWebCandidateHandler({
        start,
        fetcher,
        verifyAccess: async () => true,
      });
      for (const path of [
        '/.well-known/openid-configuration',
        '/.well-known/jwks.json',
        '/.well-known/nested/file?query=kept',
      ]) {
        const response = await handler(
          new Request(`https://${stagingProfile.host}${path}`, { method }),
          env
        );
        expect(response.status).toBe(404);
        expect(await response.text()).toBe('');
        expect(response.headers.get('cache-control')).toBe(
          'public, max-age=300, must-revalidate'
        );
        expect(response.headers.get('x-tuturuuu-web-renderer')).toBe(
          'native-Worker'
        );
        expect(response.headers.get('cdn-cache-control')).toBe('no-store');
        expect(response.headers.has('set-cookie')).toBe(false);
      }
      expect(start).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it('retains host, default-off and Access admission before the response', async () => {
    const start = vi.fn();
    const fetcher = vi.fn();
    const handler = createWebCandidateHandler({
      start,
      fetcher,
      verifyAccess: async () => false,
    });
    for (const [host, bindings, status] of [
      [stagingProfile.host, env, 403],
      ['tuturuuu.com', env, 503],
      [stagingProfile.host, { ...env, WEB_START_CANDIDATE: 'off' }, 503],
    ] as const) {
      const response = await handler(
        new Request(`https://${host}/.well-known/jwks.json`),
        bindings
      );
      expect(response.status).toBe(status);
      expect(response.headers.has('set-cookie')).toBe(false);
    }
    expect(start).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(['/.well-known', '/.well-known/', '/.well-known-other/jwks.json'])(
    'does not claim the adjacent path %s',
    async (path) => {
      const handler = createWebCandidateHandler({
        start: vi.fn(),
        verifyAccess: async () => true,
      });
      const response = await handler(
        new Request(`https://${stagingProfile.host}${path}`),
        env
      );
      expect(response.headers.get('x-tuturuuu-web-renderer')).toBe(
        'not-migrated'
      );
      expect(await response.text()).toContain('Not migrated yet');
    }
  );
});
