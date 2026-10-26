import { describe, expect, it, vi } from 'vitest';
import { forwardToCentralApi } from './api-forward';

describe('central API forwarding', () => {
  it('preserves method, body, raw query, cookies and every Set-Cookie', async () => {
    const fetcher = vi.fn(async (request: Request) => {
      expect(request.url).toBe(
        'https://central.example/api/v1/workspaces/w?tag=1&tag=2'
      );
      expect(request.method).toBe('PATCH');
      expect(request.redirect).toBe('manual');
      expect(request.headers.get('cookie')).toBe('a=1');
      expect(request.headers.get('connection')).toBeNull();
      expect(request.headers.get('host')).toBeNull();
      expect(await request.text()).toBe('{"title":"exact"}');
      const headers = new Headers({ 'content-type': 'application/json' });
      headers.append('Set-Cookie', 'a=1; Path=/');
      headers.append('Set-Cookie', 'b=2; Path=/');
      headers.set('Location', '/elsewhere');
      headers.set('Transfer-Encoding', 'chunked');
      return new Response('{"denied":true}', { status: 403, headers });
    });
    const response = await forwardToCentralApi(
      new Request('https://ttr.gg/api/v1/workspaces/w?tag=1&tag=2', {
        method: 'PATCH',
        headers: { cookie: 'a=1', connection: 'keep-alive', host: 'ttr.gg' },
        body: '{"title":"exact"}',
      }),
      'https://central.example',
      { search: '?tag=1&tag=2', fetcher: fetcher as unknown as typeof fetch }
    );
    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toEqual([
      'a=1; Path=/',
      'b=2; Path=/',
    ]);
    expect(response.headers.get('location')).toBe('/elsewhere');
    expect(response.headers.get('transfer-encoding')).toBeNull();
    expect(await response.text()).toBe('{"denied":true}');
  });

  it('uses the normalized request search when no raw query is supplied', async () => {
    const fetcher = vi.fn(async (request: Request) => {
      expect(request.url).toBe('https://central.example/api/x?q=a%20b');
      expect(request.method).toBe('GET');
      return new Response(null, { status: 204 });
    });
    const response = await forwardToCentralApi(
      new Request('https://apps.tuturuuu.com/api/x?q=a%20b'),
      'https://central.example',
      { fetcher: fetcher as unknown as typeof fetch }
    );
    expect(response.status).toBe(204);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('rejects unsafe or recursive central origins without fetching', async () => {
    const fetcher = vi.fn();
    for (const origin of [
      'https://ttr.gg',
      'https://user:pw@central.example',
      'https://central.example/prefix',
      'ftp://central.example',
    ]) {
      const response = await forwardToCentralApi(
        new Request('https://ttr.gg/api/v1/x'),
        origin,
        { search: '', fetcher: fetcher as unknown as typeof fetch }
      );
      expect(response.status).toBe(503);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('loop prevention by ownership', () => {
  it('allows a same-origin central API for paths the app does not own', async () => {
    const fetcher = vi.fn(
      async (request: Request) => new Response(request.url)
    );
    const mounted = await forwardToCentralApi(
      new Request('https://tuturuuu.com/api/v1/x'),
      'https://tuturuuu.com',
      {
        fetcher: fetcher as unknown as typeof fetch,
        ownsPath: (path) => path === '/meet' || path.startsWith('/meet/'),
      }
    );
    expect(await mounted.text()).toBe('https://tuturuuu.com/api/v1/x');
    const owned = await forwardToCentralApi(
      new Request('https://tuturuuu.com/meet/api/x'),
      'https://tuturuuu.com',
      {
        fetcher: fetcher as unknown as typeof fetch,
        ownsPath: (path) => path.startsWith('/meet/'),
      }
    );
    expect(owned.status).toBe(503);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
