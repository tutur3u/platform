// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { forwardCentralApi } from './api.server';

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: vi.fn(),
}));

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
      expect(await request.text()).toBe('{"title":"exact"}');
      const headers = new Headers({ 'content-type': 'application/json' });
      headers.append('Set-Cookie', 'a=1; Path=/');
      headers.append('Set-Cookie', 'b=2; Path=/');
      headers.set('Location', '/elsewhere');
      return new Response('{"denied":true}', { status: 403, headers });
    });
    const response = await forwardCentralApi(
      new Request('https://ttr.gg/api/v1/workspaces/w?tag=1&tag=2', {
        method: 'PATCH',
        headers: { cookie: 'a=1', connection: 'keep-alive' },
        body: '{"title":"exact"}',
      }),
      'https://central.example',
      '?tag=1&tag=2',
      fetcher as unknown as typeof fetch
    );
    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toEqual([
      'a=1; Path=/',
      'b=2; Path=/',
    ]);
    expect(response.headers.get('location')).toBe('/elsewhere');
    expect(await response.text()).toBe('{"denied":true}');
  });

  it('rejects unsafe or recursive central origins without fetching', async () => {
    const fetcher = vi.fn();
    for (const origin of [
      'https://ttr.gg',
      'https://user:pw@central.example',
      'https://central.example/prefix',
      'ftp://central.example',
    ]) {
      const response = await forwardCentralApi(
        new Request('https://ttr.gg/api/v1/x'),
        origin,
        '',
        fetcher as unknown as typeof fetch
      );
      expect(response.status).toBe(503);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});
