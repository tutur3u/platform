import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import {
  isRoadmapPublicPath,
  proxyRoadmapPublicRequest,
} from './roadmap-public-proxy';

describe('roadmap public proxy', () => {
  it('proxies roadmap children and keeps the worker cache headers', async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response('asset', {
          headers: {
            'cache-control': 'public, max-age=86400',
            'set-cookie': 'worker=secret',
          },
          status: 200,
        })
    );

    const response = await proxyRoadmapPublicRequest(
      new NextRequest('https://tuturuuu.com/roadmap/assets/app.js', {
        headers: {
          authorization: 'Bearer secret',
          cookie: 'sb-auth=secret',
        },
      }),
      fetchImpl
    );

    expect(response?.status).toBe(200);
    expect(response?.headers.get('location')).toBeNull();
    expect(response?.headers.get('cache-control')).toBe(
      'public, max-age=86400'
    );
    expect(response?.headers.get('set-cookie')).toBeNull();
    expect(await response?.text()).toBe('asset');
    const invocation = fetchImpl.mock.calls[0];
    expect(invocation).toBeDefined();
    if (!invocation) return;
    const [url, init] = invocation;
    expect(String(url)).toBe(
      'https://roadmap.tuturuuu.com/roadmap/assets/app.js'
    );
    const sent = new Headers((init as RequestInit | undefined)?.headers);
    expect(sent.get('cookie')).toBeNull();
    expect(sent.get('authorization')).toBeNull();
  });

  it('does not treat a neighbouring private path as the roadmap', async () => {
    const fetchImpl = vi.fn();

    expect(isRoadmapPublicPath('/personal')).toBe(false);
    expect(isRoadmapPublicPath('/roadmap-private')).toBe(false);
    expect(
      await proxyRoadmapPublicRequest(
        new NextRequest('https://tuturuuu.com/personal'),
        fetchImpl
      )
    ).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
