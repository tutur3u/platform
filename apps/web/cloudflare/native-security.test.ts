import { describe, expect, it, vi } from 'vitest';
import type { Fetcher } from './fallback';
import { createWebCandidateHandler } from './handler';
import { stagingProfile } from './profile';

const env = {
  WEB_START_CANDIDATE: 'staging',
  WEB_START_NATIVE_SECURITY: 'on',
  NEXT_FALLBACK_ORIGIN: 'https://tuturuuu-next-fixture.vercel.app',
  NEXT_PUBLIC_SUPABASE_URL: stagingProfile.supabaseUrl,
  AUTH_COOKIE_PREFIX: stagingProfile.cookiePrefix,
  VERCEL_AUTOMATION_BYPASS_SECRET: 'test-bypass-secret-00000000000000000000',
  CF_ACCESS_TEAM_DOMAIN: 'fixture-team.cloudflareaccess.com',
  CF_ACCESS_AUD: 'fixture-aud',
};
const pages = [
  { kind: 'security-policy', slug: 'security/policy' },
  { kind: 'bug-bounty', slug: 'security/bug-bounty' },
] as const;
const paths = pages.flatMap(({ slug }) => [
  `/${slug}`,
  `/en/${slug}`,
  `/vi/${slug}`,
]);
function setup() {
  const start = vi.fn(async () => new Response('<main>native security</main>'));
  const fetcher = vi.fn<Fetcher>(
    async () =>
      new Response('Next', {
        headers: {
          [stagingProfile.upstreamProjectHeader]: stagingProfile.supabaseRef,
        },
      })
  );
  return {
    start,
    fetcher,
    handler: createWebCandidateHandler({
      start,
      fetcher,
      verifyAccess: async () => true,
    }),
  };
}
function request(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set('cf-connecting-ip', '203.0.113.10');
  return new Request(`https://${stagingProfile.host}${path}`, {
    ...init,
    headers,
  });
}

describe('native security slice dispatch and rollback', () => {
  it.each(paths)(
    'renders GET and HEAD %s through Start without fallback',
    async (path) => {
      const { start, fetcher, handler } = setup();
      for (const method of ['GET', 'HEAD']) {
        const response = await handler(
          request(`${path}?tag=1&tag=2`, { method }),
          env
        );
        expect(response.status).toBe(200);
        expect(response.headers.get('x-tuturuuu-web-renderer')).toBe(
          'native-Start'
        );
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
        expect(response.headers.has('set-cookie')).toBe(false);
        expect(response.headers.get('content-security-policy')).toContain(
          "frame-ancestors 'none'"
        );
        expect(await response.text()).toBe(
          method === 'HEAD' ? '' : '<main>native security</main>'
        );
      }
      expect(start).toHaveBeenCalledTimes(2);
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
  it.each([undefined, '', 'off', 'true', 'unknown'])(
    'disables every public route to a static 404 for %s',
    async (flag) => {
      const { start, fetcher, handler } = setup();
      for (const path of paths) {
        const response = await handler(request(`${path}?keep=%2f`), {
          ...env,
          WEB_START_NATIVE_SECURITY: flag,
        });
        expect(await response.text()).toContain('Not migrated yet');
        expect(response.headers.get('x-tuturuuu-web-renderer')).toBe(
          'not-migrated'
        );
        expect(response.status).toBe(404);
      }
      expect(start).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
  it('returns 404 for APIs, satellite routes, unknown locales, RSC and writes', async () => {
    const { start, fetcher, handler } = setup();
    const requests = [
      ...paths.flatMap((path) => [
        // OPTIONS never reaches Next (V5b); access-hardening.test.ts covers it.
        ...['POST', 'PUT', 'PATCH', 'DELETE'].map((method) =>
          request(path, { method })
        ),
        ...[
          'rsc',
          'next-action',
          'next-router-state-tree',
          'next-router-prefetch',
        ].map((name) => request(path, { headers: { [name]: '1' } })),
      ]),
      request('/api/v1/legal'),
      request('/ws/drive'),
      request('/fr/security/policy'),
      request('/security/policy/child'),
      request('/security/policy/'),
      request('/vi/security/bug-bounty', { method: 'POST', body: 'once' }),
      ...[
        'rsc',
        'next-action',
        'next-router-state-tree',
        'next-router-prefetch',
      ].map((name) =>
        request('/security/policy', { headers: { [name]: '1' } })
      ),
    ];
    for (const input of requests)
      expect(await (await handler(input, env)).text()).toContain(
        'Not migrated yet'
      );
    expect(start).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    for (const path of paths)
      expect(
        (await handler(request(path, { method: 'OPTIONS' }), env)).status
      ).toBe(204);
    expect(fetcher).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });
  it('does not bypass candidate admission, including signed-in requests', async () => {
    const { start, fetcher, handler } = setup();
    expect(
      (
        await handler(
          request('/security/policy', {
            headers: { cookie: 'sb-auth=fixture' },
          }),
          {
            ...env,
            WEB_START_CANDIDATE: 'off',
          }
        )
      ).status
    ).toBe(503);
    expect(start).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    const response = await handler(
      request('/security/policy', { headers: { cookie: 'sb-auth=fixture' } }),
      env
    );
    expect(response.headers.has('set-cookie')).toBe(false);
  });
});

describe('security flag isolation and production-host admission', () => {
  it('enables security independently of legal and preserves legal rollback', async () => {
    const { start, handler } = setup();
    for (const path of ['/privacy', '/vi/legal/dpa', '/community-guidelines']) {
      expect(
        (
          await handler(request(path), {
            ...env,
            WEB_START_NATIVE_LEGAL: 'off',
          })
        ).headers.get('x-tuturuuu-web-renderer')
      ).toBe('not-migrated');
    }
    for (const path of paths) {
      expect(
        (
          await handler(request(path), {
            ...env,
            WEB_START_NATIVE_LEGAL: 'on',
            WEB_START_NATIVE_SECURITY: 'off',
          })
        ).headers.get('x-tuturuuu-web-renderer')
      ).toBe('not-migrated');
    }
    expect(start).not.toHaveBeenCalled();
    expect(
      (
        await handler(request('/privacy'), {
          ...env,
          WEB_START_NATIVE_LEGAL: 'on',
          WEB_START_NATIVE_SECURITY: 'off',
        })
      ).headers.get('x-tuturuuu-web-renderer')
    ).toBe('native-Start');
  });
  it.each([
    'tuturuuu.com',
    'www.tuturuuu.com',
    'web.tuturuuu.com',
    'staging.tutur3u.com',
    'evil.invalid',
  ])('rejects %s before native rendering or egress', async (host) => {
    const { start, fetcher, handler } = setup();
    for (const path of paths) {
      const response = await handler(
        new Request(`https://${host}${path}`),
        env
      );
      expect(response.status).toBe(503);
      expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    }
    expect(start).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
