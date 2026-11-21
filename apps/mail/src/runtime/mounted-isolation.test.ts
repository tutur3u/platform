import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  endpoint: vi.fn(),
  proxy: vi.fn(),
  start: vi.fn(),
  seen: [] as string[],
}));

// The real bridge isolation, mount config and endpoint dispatcher run; the
// application handlers are fixtures that record the cookies they receive and
// attempt the provider refresh and cookie writes a mounted app must not make.
vi.mock('../proxy', () => ({ proxy: calls.proxy }));
vi.mock('./api-registry.bridge.gen', () => ({
  endpoints: [
    { pattern: '/api/v1/mail/domains', module: { GET: calls.endpoint } },
  ],
}));
vi.mock('./mail-api-server', () => ({ registerMailServerApiPaths: () => {} }));
vi.mock('@tuturuuu/start-bridge/start/server-entry', () => ({
  createBridgeStartHandler: () => ({ fetch: calls.start }),
}));

import { handleMailRequest } from './handler';
import { mailMounts, mailOwnedCookies } from './mail-mount';

const ctx = { waitUntil: () => {} };
const env = {
  ASSETS: { fetch: async () => new Response('asset') },
  TTR_ONE_ORIGIN_MAIL: 'shadow',
};
const sessionName = 'sb-abcdefghijklmnopqrst-auth-token';
const encode = (value: unknown) =>
  `base64-${Buffer.from(JSON.stringify(value)).toString('base64url')}`;
const session = (extra: Record<string, unknown> = {}) =>
  encode({
    access_token: 'access',
    refresh_token: 'refresh-secret',
    provider_token: 'provider-secret',
    expires_at: 1,
    user: { id: 'user' },
    ...extra,
  });

function writes(headers: Headers) {
  headers.append('set-cookie', `${sessionName}=${session()}; Path=/; HttpOnly`);
  headers.append('set-cookie', 'tuturuuu_app_session=x; Path=/; HttpOnly');
  headers.append('set-cookie', `${sessionName}=; Path=/; Max-Age=0`);
  headers.append('set-cookie', 'NEXT_LOCALE=vi; Path=/; Domain=tuturuuu.com');
  headers.append(
    'set-cookie',
    'mail_oauth_state=; Path=/mail/api/v1/mail/connected; Max-Age=0; HttpOnly'
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.seen.length = 0;
  calls.proxy.mockImplementation(async (request: Request) => {
    calls.seen.push(request.headers.get('cookie') ?? '');
    return NextResponse.next();
  });
  calls.endpoint.mockImplementation((request: Request) => {
    const headers = new Headers();
    writes(headers);
    return new Response(
      JSON.stringify({ cookie: request.headers.get('cookie') }),
      {
        headers,
      }
    );
  });
  calls.start.mockImplementation(async () => {
    const headers = new Headers({ 'content-type': 'text/html; charset=utf-8' });
    writes(headers);
    return new Response('<!doctype html><title>Mail</title>', { headers });
  });
});

const cookie = (...parts: string[]) => parts.join('; ');

describe('Mail apex mount isolation', () => {
  it('declares the cookies Mail owns and no session cookie', () => {
    expect(mailMounts.isolation.ownedCookies).toBe(mailOwnedCookies);
    for (const name of mailOwnedCookies)
      expect(name).not.toMatch(/^sb-|^__Host-/u);
  });

  it('gives mounted API code an access-token-only session and never emits shared cookies', async () => {
    const response = await handleMailRequest(
      new Request('https://tuturuuu.com/mail/api/v1/mail/domains', {
        headers: {
          cookie: cookie(
            `${sessionName}=${session()}`,
            'tuturuuu_app_session=app',
            'mail_oauth_state=state',
            'NEXT_LOCALE=vi',
            'analytics=1'
          ),
        },
      }),
      env,
      ctx
    );
    const { cookie: seen } = (await response.json()) as { cookie: string };
    expect(seen).toContain('mail_oauth_state=state');
    expect(seen).toContain('NEXT_LOCALE=vi');
    expect(seen).not.toMatch(
      /tuturuuu_app_session|analytics|refresh-secret|provider-secret/u
    );
    const reduced =
      seen.split('; ').find((part) => part.startsWith(sessionName)) ?? '';
    const body = JSON.parse(
      Buffer.from(
        reduced.split('=').slice(1).join('=').slice(7),
        'base64url'
      ).toString()
    );
    expect(body).toMatchObject({ access_token: 'access', refresh_token: '' });
    expect(body.provider_token).toBeUndefined();
    expect(calls.seen[0]).toBe(seen);
    const out = response.headers.getSetCookie();
    expect(out.join('\n')).not.toMatch(/sb-|tuturuuu_app_session/u);
    expect(out).toEqual([
      expect.stringMatching(/^NEXT_LOCALE=vi; .*Path=\/mail; Secure$/u),
      expect.stringMatching(
        /^mail_oauth_state=; .*Max-Age=0.*Path=\/mail; Secure$/u
      ),
    ]);
    expect(out.join('\n')).not.toContain('Domain');
  });

  it.each([
    ['malformed', `${sessionName}=base64-not-json`],
    [
      'sessionless token',
      `${sessionName}=${encode({ refresh_token: 'refresh-secret' })}`,
    ],
    ['empty', `${sessionName}=`],
  ])(
    'withholds a %s shared session from mounted code',
    async (_name, value) => {
      const response = await handleMailRequest(
        new Request('https://tuturuuu.com/mail/api/v1/mail/domains', {
          headers: { cookie: value },
        }),
        env,
        ctx
      );
      const { cookie: seen } = (await response.json()) as {
        cookie: string | null;
      };
      expect(seen ?? '').not.toContain(sessionName);
      expect(seen ?? '').not.toContain('refresh-secret');
      expect(response.headers.getSetCookie().join('\n')).not.toMatch(/sb-/u);
    }
  );

  it('keeps an expired access token but never a refresh token on a normal page', async () => {
    const response = await handleMailRequest(
      new Request('https://tuturuuu.com/mail/vi/personal/inbox', {
        headers: {
          'sec-fetch-mode': 'navigate',
          cookie: `${sessionName}=${session({ expires_at: 1 })}`,
        },
      }),
      env,
      ctx
    );
    expect(response.status).toBe(200);
    expect(calls.seen[0]).toContain(sessionName);
    expect(calls.seen[0]).not.toContain('refresh-secret');
    expect(response.headers.getSetCookie().join('\n')).not.toMatch(
      /sb-|tuturuuu_app_session/u
    );
  });

  it('leaves the subdomain cookie behaviour unchanged', async () => {
    const response = await handleMailRequest(
      new Request('https://mail.tuturuuu.com/api/v1/mail/domains', {
        headers: {
          cookie: cookie(
            `${sessionName}=${session()}`,
            'tuturuuu_app_session=app'
          ),
        },
      }),
      env,
      ctx
    );
    const { cookie: seen } = (await response.json()) as { cookie: string };
    expect(seen).toContain(session());
    expect(seen).toContain('tuturuuu_app_session=app');
    expect(response.headers.getSetCookie().join('\n')).toContain(sessionName);
  });
});
