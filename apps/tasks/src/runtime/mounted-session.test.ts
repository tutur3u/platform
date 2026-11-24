// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../../cloudflare/worker';

// The exported Worker, bridge and proxy stay real: these are the session
// boundaries a request reaching tuturuuu.com/tasks through the gateway's
// MOUNT_TASKS binding meets. Only upstream suppliers are faked.
const suppliers = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock('@tuturuuu/start-bridge/start/server-entry', () => ({
  createBridgeStartHandler: () => ({
    fetch: () => {
      throw new Error('Unexpected SSR');
    },
  }),
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tuturuuu/utils/api-proxy-guard')>()),
  guardApiProxyRequest: vi.fn().mockResolvedValue(null),
  hasAuthenticatedBearerToken: (headers: Headers) =>
    headers.get('authorization') === 'Bearer fictional-test-only',
}));

const env = {
  INTERNAL_WEB_API_ORIGIN: 'https://web.example.invalid',
  SUPABASE_SECRET_KEY: 'fictional-test-only',
  TUTURUUU_APP_COORDINATION_SECRET: 'fictional-test-only',
};
const ctx = { waitUntil: vi.fn() };
const MOUNT = 'https://tuturuuu.com/tasks';

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubGlobal('fetch', suppliers.fetch);
  suppliers.fetch
    .mockReset()
    .mockImplementation(() => Response.json({ owner: 'web' }, { status: 401 }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('the shared session on tuturuuu.com/tasks', () => {
  it.each(['/api/auth/verify-app-token', '/api/auth/refresh-app-session'])(
    'never mints a per-app session at %s',
    async (path) => {
      const response = await worker.fetch(
        new Request(`${MOUNT}${path}`, {
          method: 'POST',
          headers: { origin: 'https://tuturuuu.com' },
        }),
        env,
        ctx
      );
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        code: 'APP_SESSION_MOUNTED',
      });
      expect(suppliers.fetch).not.toHaveBeenCalled();
    }
  );

  it('refuses a cross-site cookie mutation before any upstream runs', async () => {
    const response = await worker.fetch(
      new Request(`${MOUNT}/api/v1/workspaces/personal/tasks`, {
        method: 'POST',
        body: '{}',
        headers: {
          'content-type': 'application/json',
          cookie: 'sb-ref-auth-token=fictional',
          origin: 'https://evil.example',
          'sec-fetch-site': 'cross-site',
        },
      }),
      env,
      ctx
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(suppliers.fetch).not.toHaveBeenCalled();
  });

  it('refuses a mutation carrying two different session cookies', async () => {
    const response = await worker.fetch(
      new Request(`${MOUNT}/api/v1/workspaces/personal/tasks`, {
        method: 'POST',
        body: '{}',
        headers: {
          cookie: 'sb-ref-auth-token=one; sb-ref-auth-token=two',
          origin: 'https://tuturuuu.com',
          'sec-fetch-site': 'same-origin',
        },
      }),
      env,
      ctx
    );
    expect(response.status).toBe(400);
    expect(suppliers.fetch).not.toHaveBeenCalled();
  });

  it('signs out only through a same-origin POST', async () => {
    const response = await worker.fetch(
      new Request(`${MOUNT}/api/auth/logout`),
      env,
      ctx
    );
    expect(response.status).toBe(405);
    expect(suppliers.fetch).not.toHaveBeenCalled();
  });

  it('forwards no per-app session or foreign cookie to Web', async () => {
    await worker.fetch(
      new Request(`${MOUNT}/api/workspaces/invitations?pending=1`, {
        headers: {
          authorization: 'Bearer fictional-test-only',
          cookie:
            'tuturuuu_app_session=app; tuturuuu_web_app_session=web; finance_pref=1; NEXT_LOCALE=vi',
        },
      }),
      env,
      ctx
    );
    expect(suppliers.fetch).toHaveBeenCalledOnce();
    const [forwarded, init] = suppliers.fetch.mock.calls[0]!;
    const headers = new Headers(
      forwarded instanceof Request ? forwarded.headers : init?.headers
    );
    const cookie = headers.get('cookie') ?? '';
    expect(cookie).not.toContain('tuturuuu_app_session=');
    expect(cookie).not.toContain('tuturuuu_web_app_session=');
    expect(cookie).not.toContain('finance_pref=');
  });
});
