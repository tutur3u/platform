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
      'https://tuturuuu-roadmap.tuturuuu-e89.workers.dev/roadmap/assets/app.js'
    );
    const sent = new Headers((init as RequestInit | undefined)?.headers);
    expect(sent.get('cookie')).toBeNull();
    expect(sent.get('authorization')).toBeNull();
  });

  it('does not follow a satellite redirect back into the proxy', async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.redirect).toBe('manual');
        return new Response(null, {
          headers: {
            location: 'https://roadmap.tuturuuu.com/roadmap/?q=1',
          },
          status: 301,
        });
      }
    );

    const response = await proxyRoadmapPublicRequest(
      new NextRequest('https://tuturuuu.com/roadmap/?q=1'),
      fetchImpl
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const invocation = fetchImpl.mock.calls[0];
    expect(invocation).toBeDefined();
    if (!invocation) return;
    const [url] = invocation;
    expect(String(url)).toBe(
      'https://tuturuuu-roadmap.tuturuuu-e89.workers.dev/roadmap/?q=1'
    );
    expect(String(url)).not.toContain('roadmap.tuturuuu.com');
    expect(response?.status).toBe(301);
    expect(response?.headers.get('location')).toBe(
      'https://tuturuuu.com/roadmap/?q=1'
    );
  });

  it('sends a bare satellite roadmap location to the slashed canonical path', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          headers: { location: 'https://roadmap.tuturuuu.com/roadmap?q=1' },
          status: 301,
        })
    );

    const response = await proxyRoadmapPublicRequest(
      new NextRequest('https://tuturuuu.com/roadmap/?q=1'),
      fetchImpl
    );

    expect(response?.status).toBe(301);
    expect(response?.headers.get('location')).toBe(
      'https://tuturuuu.com/roadmap/?q=1'
    );
  });

  it('serves the mount root without redirecting back to the slash form', async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response('root', { status: 200 })
    );

    const response = await proxyRoadmapPublicRequest(
      new NextRequest('https://tuturuuu.com/roadmap?q=1'),
      fetchImpl
    );

    expect(response?.status).toBe(200);
    expect(response?.headers.get('location')).toBeNull();
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      'https://tuturuuu-roadmap.tuturuuu-e89.workers.dev/roadmap/?q=1'
    );
  });

  it('redirects a localized mount to the unlocalized path without a slash', async () => {
    const fetchImpl = vi.fn();

    const response = await proxyRoadmapPublicRequest(
      new NextRequest('https://tuturuuu.com/vi/roadmap?q=1'),
      fetchImpl
    );

    expect(response?.status).toBe(308);
    expect(response?.headers.get('location')).toBe(
      'https://tuturuuu.com/roadmap?q=1'
    );
    expect(fetchImpl).not.toHaveBeenCalled();
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
