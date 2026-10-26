import type { CsrfMode } from '@tuturuuu/auth/csrf';
import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBridgeHandler } from './handler';

const ctx = { waitUntil: vi.fn() };
type Env = { CSRF_MODE: CsrfMode };

const proxy = vi.fn(async () => NextResponse.next());
const start = vi.fn(async () => new Response('start'));
const handle = createBridgeHandler<Env, typeof ctx>({
  mounts: {
    app: 'meet',
    rootHosts: ['meet.tuturuuu.com'],
    mountHosts: ['tuturuuu.com'],
    basePath: '/meet',
  },
  start: { fetch: start },
  proxy,
  endpoints: [
    {
      pattern: '/api/own',
      module: { POST: async () => new Response('own') },
    },
    {
      pattern: '/api/hooks/[name]',
      module: { POST: async () => new Response('hook') },
    },
  ],
  assets: () => undefined,
  centralApiOrigin: () => 'https://central.example',
  csrf: {
    mode: (env) => env.CSRF_MODE,
    exemptions: [{ pathname: '/api/hooks/', reason: 'signed webhook' }],
  },
});

const SESSION = 'sb-abc-auth-token=value';
const post = (url: string, mode: CsrfMode, headers: Record<string, string>) =>
  handle(
    new Request(url, { headers, method: 'POST' }),
    { CSRF_MODE: mode },
    ctx
  );

describe('bridge CSRF admission', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('refuses a sibling-subdomain mutation on a mount before proxy.ts runs', async () => {
    const response = await post(
      'https://tuturuuu.com/meet/api/own',
      'enforce',
      {
        cookie: SESSION,
        origin: 'https://evil.tuturuuu.com',
        'sec-fetch-site': 'same-site',
      }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: 'CSRF_REJECTED',
      error: 'Cross-origin request rejected',
    });
    expect(proxy).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it('admits a same-origin mutation on a mount', async () => {
    const response = await post(
      'https://tuturuuu.com/meet/api/own',
      'enforce',
      {
        cookie: SESSION,
        origin: 'https://tuturuuu.com',
        'sec-fetch-site': 'same-origin',
      }
    );

    expect(await response.text()).toBe('own');
  });

  it('checks Origin against the apex when Fetch Metadata is absent', async () => {
    const ok = await post('https://tuturuuu.com/meet/api/own', 'enforce', {
      cookie: SESSION,
      origin: 'https://tuturuuu.com',
    });
    const refused = await post('https://tuturuuu.com/meet/api/own', 'enforce', {
      cookie: SESSION,
      origin: 'https://meet.tuturuuu.com',
    });

    expect(await ok.text()).toBe('own');
    expect(refused.status).toBe(403);
  });

  it('applies app-relative exemptions', async () => {
    const response = await post(
      'https://tuturuuu.com/meet/api/hooks/provider',
      'enforce',
      { cookie: SESSION, 'sec-fetch-site': 'cross-site' }
    );

    expect(await response.text()).toBe('hook');
    expect(proxy).toHaveBeenCalled();
  });

  it('only reports in report mode', async () => {
    const response = await post('https://tuturuuu.com/meet/api/own', 'report', {
      cookie: SESSION,
      'sec-fetch-site': 'cross-site',
    });

    expect(await response.text()).toBe('own');
    expect(console.warn).toHaveBeenCalledWith(
      'CSRF check failed',
      expect.objectContaining({
        mounted: true,
        reason: 'cross-site',
        route: '/api/own',
      })
    );
  });

  it('leaves root-mode (subdomain) requests to the app, even in enforce mode', async () => {
    const response = await post(
      'https://meet.tuturuuu.com/api/own',
      'enforce',
      {
        cookie: SESSION,
        'sec-fetch-site': 'cross-site',
      }
    );

    expect(await response.text()).toBe('own');
  });

  it('admits everything when the mode is off', async () => {
    const response = await post('https://tuturuuu.com/meet/api/own', 'off', {
      cookie: SESSION,
      'sec-fetch-site': 'cross-site',
    });

    expect(await response.text()).toBe('own');
  });
});
