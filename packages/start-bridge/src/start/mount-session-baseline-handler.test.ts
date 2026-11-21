import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { describe, expect, it, vi } from 'vitest';
import { createBridgeHandler } from './handler';

// A mount WITHOUT an isolation policy, run through the whole bridge handler:
// the Supabase session is still reduced and never written by the app.
const seen: Array<string | null> = [];
const handle = createBridgeHandler<
  Record<string, never>,
  { waitUntil(work: Promise<unknown>): void }
>({
  mounts: {
    app: 'learn',
    rootHosts: ['learn.tuturuuu.com'],
    mountHosts: ['tuturuuu.com'],
    basePath: '/learn',
    unknownHost: 'reject',
  },
  start: {
    fetch: async (request) => {
      seen.push(request.headers.get('cookie'));
      const response = new Response('<html></html>', {
        headers: { 'content-type': 'text/html' },
      });
      response.headers.append(
        'set-cookie',
        'sb-ref-auth-token=rotated; Path=/; Domain=.tuturuuu.com'
      );
      response.headers.append('set-cookie', 'NEXT_LOCALE=vi; Path=/learn');
      return response;
    },
  },
  proxy: async () => NextResponse.next(),
  assets: () => undefined,
  centralApiOrigin: () => 'https://tuturuuu.com',
});
const ctx = { waitUntil: vi.fn() };
const SESSION = `base64-${btoa(
  JSON.stringify({
    access_token: 'access.fixture',
    refresh_token: 'refresh-fixture',
    expires_at: 2_000_000_000,
  })
)
  .replaceAll('+', '-')
  .replaceAll('/', '_')
  .replace(/=+$/u, '')}`;

describe('baseline session hardening on a non-isolated mount', () => {
  it('hands app code an access-token-only session and drops its session writes', async () => {
    seen.length = 0;
    const response = await handle(
      new Request('https://tuturuuu.com/learn/en', {
        headers: { cookie: `sb-ref-auth-token=${SESSION}; NEXT_LOCALE=en` },
      }),
      {},
      ctx
    );
    const cookie = seen.at(-1) ?? '';
    expect(cookie).toContain('NEXT_LOCALE=en');
    expect(cookie).not.toContain(SESSION);
    expect(cookie).toContain('sb-ref-auth-token=base64-');
    expect(response.headers.getSetCookie()).toEqual([
      'NEXT_LOCALE=vi; Path=/learn',
    ]);
  });

  it('leaves the subdomain root untouched', async () => {
    seen.length = 0;
    const response = await handle(
      new Request('https://learn.tuturuuu.com/en', {
        headers: { cookie: `sb-ref-auth-token=${SESSION}` },
      }),
      {},
      ctx
    );
    expect(seen.at(-1)).toBe(`sb-ref-auth-token=${SESSION}`);
    expect(response.headers.getSetCookie()).toContain(
      'sb-ref-auth-token=rotated; Path=/; Domain=.tuturuuu.com'
    );
  });

  it('refuses a mounted mutation with duplicate session cookies', async () => {
    const response = await handle(
      new Request('https://tuturuuu.com/learn/en/x', {
        method: 'POST',
        headers: {
          cookie: `sb-ref-auth-token=${SESSION}; sb-ref-auth-token=${SESSION}`,
          origin: 'https://tuturuuu.com',
          'sec-fetch-site': 'same-origin',
        },
        body: 'x',
      }),
      {},
      ctx
    );
    expect(response.status).toBe(400);
  });
});
