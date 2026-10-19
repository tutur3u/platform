// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const guard = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<Response | null>>(async () => null)
);
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: guard,
}));

import { apiRequest } from './api.server';

afterEach(() => {
  guard.mockReset();
  guard.mockResolvedValue(null);
});
describe('Apps central API ownership', () => {
  it('returns the actual guard denial without contacting the owner', async () => {
    guard.mockResolvedValue(new Response('denied', { status: 403 }));
    const upstream = vi.fn<typeof fetch>();
    const result = await apiRequest(
      new Request('https://apps.tuturuuu.com/api/v1/workspaces/other'),
      'https://tuturuuu.com',
      upstream
    );
    expect(result.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
    expect(guard.mock.calls[0]?.[1]).toEqual({ prefixBase: 'proxy:apps:api' });
  });
  it('forwards exact method, body, query, cookies and central denial without retry', async () => {
    let seen = 0;
    const upstream: typeof fetch = async (input) => {
      seen++;
      const request = new Request(input);
      expect(request.url).toBe(
        'https://tuturuuu.com/api/v1/workspaces/other?tag=1&tag=2'
      );
      expect(request.method).toBe('PATCH');
      expect(request.headers.get('cookie')).toBe(
        'tuturuuu_app_session=fixture'
      );
      expect(await request.text()).toBe('{"title":"exact"}');
      return new Response('tenant denied', {
        status: 403,
        headers: [
          ['Set-Cookie', 'a=1; Path=/'],
          ['Set-Cookie', 'b=2; Path=/'],
        ],
      });
    };
    const result = await apiRequest(
      new Request(
        'https://apps.tuturuuu.com/api/v1/workspaces/other?tag=1&tag=2',
        {
          method: 'PATCH',
          body: '{"title":"exact"}',
          headers: { cookie: 'tuturuuu_app_session=fixture' },
        }
      ),
      'https://tuturuuu.com',
      upstream
    );
    expect(result.status).toBe(403);
    expect(await result.text()).toBe('tenant denied');
    expect(result.headers.getSetCookie()).toEqual([
      'a=1; Path=/',
      'b=2; Path=/',
    ]);
    expect(seen).toBe(1);
  });
  it('owns only build-info and rejects central proxy loops', async () => {
    expect(
      (
        await apiRequest(
          new Request('https://apps.tuturuuu.com/api/build-info', {
            method: 'POST',
          }),
          'https://tuturuuu.com'
        )
      ).status
    ).toBe(405);
    expect(
      (
        await apiRequest(
          new Request('https://apps.tuturuuu.com/api/v1/private'),
          'https://apps.tuturuuu.com'
        )
      ).status
    ).toBe(503);
    const response = await apiRequest(
      new Request('https://apps.tuturuuu.com/api/build-info'),
      'https://tuturuuu.com'
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toMatchObject({ appName: 'apps' });
  });
});
