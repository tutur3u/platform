import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  endpoint: vi.fn(),
  proxy: vi.fn(),
  start: vi.fn(),
  assets: vi.fn(),
  fetch: vi.fn(),
}));

// The real bridge, route matcher, one-origin decision and Mail mount config
// run; only the application boundaries are disposable fixtures.
vi.mock('../proxy', () => ({ proxy: calls.proxy }));
vi.mock('./api-registry.bridge.gen', () => ({
  endpoints: [
    {
      pattern: '/api/v1/mail/domains',
      module: { GET: calls.endpoint },
    },
    {
      pattern: '/api/v1/workspaces/[wsId]/mail/bootstrap',
      module: { GET: calls.endpoint },
    },
  ],
}));
vi.mock('./mail-api-server', () => ({ registerMailServerApiPaths: () => {} }));
vi.mock('@tuturuuu/start-bridge/start/server-entry', () => ({
  createBridgeStartHandler: () => ({ fetch: calls.start }),
}));

import { handleMailRequest } from './handler';

const ctx = { waitUntil: () => {} };
const env = (mode?: string) => ({
  ASSETS: { fetch: calls.assets },
  ...(mode ? { TTR_ONE_ORIGIN_MAIL: mode } : {}),
});
const navigate = (url: string) =>
  new Request(url, { headers: { 'sec-fetch-mode': 'navigate' } });

beforeEach(() => {
  vi.clearAllMocks();
  calls.proxy.mockResolvedValue(NextResponse.next());
  calls.assets.mockImplementation(
    async () => new Response('asset', { headers: { 'cache-control': 'x' } })
  );
  calls.endpoint.mockImplementation((request: Request) => {
    const url = new URL(request.url);
    return Response.json({
      path: (request as { nextUrl?: URL }).nextUrl?.pathname,
      search: url.search,
    });
  });
  calls.start.mockImplementation(
    async () =>
      new Response('<!doctype html><title>Mail</title>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
  );
  vi.stubGlobal('fetch', calls.fetch);
});

describe('Mail host and apex are served side by side', () => {
  it.each([
    ['https://mail.tuturuuu.com/assets/app.js', '/assets/app.js'],
    ['https://tuturuuu.com/mail/assets/app.js', '/assets/app.js'],
    ['https://web.tutur3u.com/mail/assets/app.js', '/assets/app.js'],
    ['https://mail.tuturuuu.com/robots.txt', '/robots.txt'],
    ['https://tuturuuu.com/mail/robots.txt', '/robots.txt'],
  ])('serves %s from the asset binding at the app path', async (url, path) => {
    const response = await handleMailRequest(
      new Request(`${url}?v=1`),
      env('shadow'),
      ctx
    );
    expect(response.status).toBe(200);
    expect(calls.assets).toHaveBeenCalledTimes(1);
    const [requested] = calls.assets.mock.calls[0] ?? [];
    expect(new URL(String(requested)).pathname).toBe(path);
    expect(new URL(String(requested)).search).toBe('?v=1');
    expect(new URL(String(requested)).host).toBe(new URL(url).host);
    expect(calls.start).not.toHaveBeenCalled();
    expect(calls.proxy).not.toHaveBeenCalled();
  });

  it.each([
    ['https://mail.tuturuuu.com', '/api/v1/mail/domains?limit=2&q=a+b'],
    ['https://tuturuuu.com/mail', '/api/v1/mail/domains?limit=2&q=a+b'],
    [
      'https://tuturuuu.com/mail',
      '/api/v1/workspaces/tenant/mail/bootstrap?folder=sent',
    ],
  ])(
    'dispatches %s API paths with their query to the app handler',
    async (base, path) => {
      const response = await handleMailRequest(
        new Request(`${base}${path}`),
        env('shadow'),
        ctx
      );
      expect(response.status).toBe(200);
      expect(calls.endpoint).toHaveBeenCalledTimes(1);
      expect(calls.fetch).not.toHaveBeenCalled();
      expect(await response.json()).toEqual({
        path: path.slice(0, path.indexOf('?')),
        search: path.slice(path.indexOf('?')),
      });
    }
  );

  it('never forwards unowned mounted API paths to the central origin', async () => {
    const response = await handleMailRequest(
      new Request('https://tuturuuu.com/mail/api/v1/not-mail?x=1'),
      env('shadow'),
      ctx
    );
    expect(response.status).toBe(404);
    expect(calls.fetch).not.toHaveBeenCalled();
  });

  it.each([
    'https://mail.tuturuuu.com/vi/personal/inbox?folder=sent',
    'https://tuturuuu.com/mail/vi/personal/inbox?folder=sent',
  ])(
    'renders %s through the proxy and Start at the visible URL',
    async (url) => {
      const response = await handleMailRequest(
        navigate(url),
        env('shadow'),
        ctx
      );
      expect(response.status).toBe(200);
      expect(calls.proxy).toHaveBeenCalledTimes(1);
      expect(calls.start).toHaveBeenCalledTimes(1);
      const [rendered] = calls.start.mock.calls[0] ?? [];
      expect((rendered as Request).url).toBe(url);
      expect(response.headers.get('location')).toBeNull();
    }
  );

  it.each([undefined, 'off', 'shadow'])(
    'keeps subdomain navigations on their own host in %s mode',
    async (mode) => {
      const response = await handleMailRequest(
        navigate('https://mail.tuturuuu.com/vi/personal/inbox?folder=sent'),
        env(mode),
        ctx
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    }
  );
});

describe('Mail one-origin redirect gate', () => {
  it.each([
    [
      'https://mail.tuturuuu.com/vi/personal/inbox?folder=sent&q=a+b',
      'https://tuturuuu.com/mail/vi/personal/inbox?folder=sent&q=a+b',
    ],
    [
      'https://mail.tuturuuu.com/en/a%2Fb/inbox/?tag=1&tag=2',
      'https://tuturuuu.com/mail/en/a%2Fb/inbox?tag=1&tag=2',
    ],
    ['https://mail.tuturuuu.com/', 'https://tuturuuu.com/mail?'],
  ])('moves subdomain navigation %s only in on mode', async (url, target) => {
    const response = await handleMailRequest(navigate(url), env('on'), ctx);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(target.replace(/\?$/u, ''));
    expect(calls.start).not.toHaveBeenCalled();
  });

  it.each([
    'https://mail.tuturuuu.com/verify-token?token=t&nextUrl=%2Fpersonal%2Finbox',
    'https://mail.tuturuuu.com/vi/verify-token?token=t',
    'https://mail.tuturuuu.com/api/v1/mail/domains',
    'https://mail.tuturuuu.com/_fn/page',
    'https://mail.tuturuuu.com/assets/app.js',
    'https://mail.tuturuuu.com/robots.txt',
  ])('keeps machine path %s on the subdomain in on mode', async (url) => {
    const response = await handleMailRequest(navigate(url), env('on'), ctx);
    expect(response.status).not.toBe(307);
    expect(response.headers.get('location')).toBeNull();
  });

  it('serves the apex mount canonically (no redirect, no host change) in on mode', async () => {
    const response = await handleMailRequest(
      navigate('https://tuturuuu.com/mail/vi/personal/inbox?folder=sent'),
      env('on'),
      ctx
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(calls.start).toHaveBeenCalledTimes(1);
  });

  it('serves the apex mount from the same artifact only when admitted', async () => {
    for (const mode of [undefined, 'off']) {
      const response = await handleMailRequest(
        navigate('https://tuturuuu.com/mail/vi/personal/inbox'),
        env(mode),
        ctx
      );
      expect(response.status).toBe(404);
    }
    expect(calls.start).not.toHaveBeenCalled();
    expect(calls.proxy).not.toHaveBeenCalled();
  });
});
