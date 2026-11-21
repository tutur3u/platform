// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
vi.mock('@tuturuuu/start-bridge/start/server-entry', () => ({
  createBridgeStartHandler: () => ({
    fetch: async (request: Request) => {
      const response = Response.json({
        cookie: request.headers.get('cookie'),
      });
      response.headers.append('set-cookie', 'tracker=1; Path=/');
      response.headers.append(
        'set-cookie',
        'sb-ref-auth-token=rotated; Path=/; Domain=.tuturuuu.com'
      );
      return response;
    },
  }),
}));
vi.mock('../src/native/api.server', () => ({
  apiRequest: async () => new Response('api'),
}));
import { appsRequest } from './worker';

const env = {
  ASSETS: { fetch: async () => new Response('asset') },
  APPS_CANONICAL_HOST_ENABLED: '1',
};
const SESSION = `base64-${btoa(
  JSON.stringify({ access_token: 'access', refresh_token: 'refresh' })
).replace(/=+$/u, '')}`;

describe('Apps apex isolation', () => {
  it('hands the mount only its own cookies and an access-token-only session', async () => {
    const response = await appsRequest(
      new Request('https://tuturuuu.com/apps', {
        headers: {
          cookie: `NEXT_LOCALE=vi; web_secret=1; sb-ref-auth-token=${SESSION}`,
        },
      }),
      env
    );
    const { cookie } = (await response.json()) as { cookie: string };
    expect(cookie).toContain('NEXT_LOCALE=vi');
    expect(cookie).not.toContain('web_secret');
    expect(cookie).not.toContain(SESSION);
  });

  it('confines every Set-Cookie to owned names at Path=/apps', async () => {
    const response = await appsRequest(
      new Request('https://tuturuuu.com/apps'),
      env
    );
    const cookies = response.headers.getSetCookie();
    expect(cookies.every((value) => value.startsWith('NEXT_LOCALE='))).toBe(
      true
    );
    expect(cookies.join('\n')).not.toMatch(/domain=|path=\/(;|$)/iu);
  });

  it('refuses a cross-site mutation on the mount', async () => {
    const response = await appsRequest(
      new Request('https://tuturuuu.com/apps/_serverFn/x', {
        method: 'POST',
        headers: {
          origin: 'https://evil.example',
          'sec-fetch-site': 'cross-site',
          cookie: `sb-ref-auth-token=${SESSION}`,
        },
        body: '{}',
      }),
      env
    );
    expect(response.status).toBe(403);
  });

  it('leaves the subdomain root untouched', async () => {
    const response = await appsRequest(
      new Request('https://apps.tuturuuu.com/', {
        headers: { cookie: 'web_secret=1' },
      }),
      env
    );
    expect(((await response.json()) as { cookie: string }).cookie).toContain(
      'web_secret=1'
    );
  });
});
