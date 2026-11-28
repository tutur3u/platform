import { afterEach, describe, expect, it, vi } from 'vitest';
import { manifest } from './manifest';
import {
  FIRST_PARTY_SERVICE_WORKER_PATHS,
  serviceWorkerScriptRefusal,
} from './service-worker-scripts';
import { withWebRest } from './web-rest.test-helper';
import worker, { type CacheLike, createHandler, type Env } from './worker';

class MemoryCache implements CacheLike {
  entries = new Map<string, Response>();
  async match(request: Request) {
    return this.entries.get(request.url)?.clone();
  }
  async put(request: Request, response: Response) {
    this.entries.set(request.url, response);
  }
}

const ENV = { PUBLIC_HOST: 'tuturuuu.com', ...withWebRest() } as Env;
const CTX = { waitUntil() {} };

function stubRuntime() {
  const upstream = vi.fn(async (_request: Request) => new Response('web'));
  vi.stubGlobal('fetch', upstream);
  vi.stubGlobal('caches', { default: new MemoryCache() });
  return upstream;
}

function script(path: string, host = 'tuturuuu.com') {
  return new Request(`https://${host}${path}`, {
    headers: { 'Service-Worker': 'script' },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('service-worker script allowlist', () => {
  it('lists exactly the first-party worker scripts', () => {
    expect([...FIRST_PARTY_SERVICE_WORKER_PATHS].sort()).toEqual([
      '/calendar/serwist/sw.js',
      '/serwist/sw.js',
      '/tasks/serwist/sw.js',
    ]);
  });

  it.each([
    '/serwist/sw.js',
    '/serwist/sw.js?v=abc',
    '/tasks/serwist/sw.js',
    '/calendar/serwist/sw.js?v=1',
  ])('admits the worker fetch for %s', (path) => {
    expect(serviceWorkerScriptRefusal(script(path))).toBeNull();
  });

  it.each([
    '/',
    '/en/sw.js',
    '/sw.js',
    '/serwist/sw.js/',
    '/serwist/sw.js.map',
    '/serwist/other.js',
    '/serwist/%73w.js',
    '/serwist//sw.js',
    '/api/v1/jsonp?callback=x',
    '/media/upload.js',
    '/mastermind/serwist/sw.js',
    '/mastermind/en',
    '/tasks/en/sw.js',
  ])('refuses the worker fetch for %s with an uncached 403', async (path) => {
    const response = serviceWorkerScriptRefusal(script(path));
    expect(response?.status).toBe(403);
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(await response?.text()).toBe('');
  });

  it('refuses on any host the gateway serves', () => {
    for (const host of [
      'tuturuuu.com',
      'www.tuturuuu.com',
      'acceptance.example',
    ])
      expect(serviceWorkerScriptRefusal(script('/x.js', host))?.status).toBe(
        403
      );
  });

  it('applies for any value of the header', () => {
    const request = new Request('https://tuturuuu.com/x.js', {
      headers: { 'Service-Worker': '' },
    });
    expect(serviceWorkerScriptRefusal(request)?.status).toBe(403);
  });

  it('never touches a request without the header', () => {
    for (const path of ['/x.js', '/en', '/serwist/sw.js', '/mastermind/en']) {
      const request = new Request(`https://tuturuuu.com${path}`, {
        headers: { 'Service-Worker-Navigation-Preload': 'true' },
      });
      expect(serviceWorkerScriptRefusal(request)).toBeNull();
    }
  });
});

describe('gateway entry point', () => {
  it('answers 403 before any origin work and without calling upstream', async () => {
    const upstream = stubRuntime();
    const response = await worker.fetch(script('/media/upload.js'), ENV, CTX);
    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('serves an allowlisted worker script as before', async () => {
    const upstream = stubRuntime();
    const response = await worker.fetch(script('/serwist/sw.js?v=1'), ENV, CTX);
    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('answers ordinary requests exactly as the handler does', async () => {
    for (const path of ['/', '/en/settings', '/serwist/sw.js', '/x.js']) {
      const make = () =>
        new Request(`https://tuturuuu.com${path}`, {
          headers: {
            cookie: 'sb-r-auth-token=s; NEXT_LOCALE=vi',
            'Service-Worker-Navigation-Preload': 'true',
          },
        });
      const direct = stubRuntime();
      const handler = createHandler({
        cache: () => new MemoryCache(),
        now: () => 0,
        manifest,
      });
      const expected = await handler(make(), ENV, CTX);
      const expectedBody = await expected.text();
      const [directRequest] = direct.mock.calls[0] as [Request];
      const sentDirect = directRequest.headers.get('cookie');
      vi.unstubAllGlobals();
      const through = stubRuntime();
      const actual = await worker.fetch(make(), ENV, CTX);
      expect(actual.status).toBe(expected.status);
      expect(await actual.text()).toBe(expectedBody);
      expect([...actual.headers].sort()).toEqual([...expected.headers].sort());
      expect(through).toHaveBeenCalledTimes(direct.mock.calls.length);
      const [throughRequest] = through.mock.calls[0] as [Request];
      expect(throughRequest.headers.get('cookie')).toBe(sentDirect);
      vi.unstubAllGlobals();
    }
  });
});
