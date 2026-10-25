import { dispatchEndpoint } from '@tuturuuu/start-bridge/endpoints';
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { financeEndpoints } from './reserved-api.server';

describe.each(['', '/finance'])(
  'Finance reserved APIs under %s',
  (basePath) => {
    it('forwards invitations before the local workspace wildcard with the mount stripped', async () => {
      const fetcher = vi.fn<typeof fetch>(async (request) => {
        const forwarded = new Request(request);
        expect(forwarded.url).toBe(
          'https://central.example.test/api/workspaces/invitations?ref=a&ref=b'
        );
        expect(forwarded.headers.get('authorization')).toBe('Bearer fixture');
        const headers = new Headers();
        headers.append('set-cookie', 'first=fixture; Path=/');
        headers.append('set-cookie', 'second=fixture; Path=/');
        return new Response('central', { status: 202, headers });
      });
      const request = new NextRequest(
        `https://example.test${basePath}/api/workspaces/invitations?ref=a&ref=b`,
        {
          nextConfig: { basePath },
          headers: { authorization: 'Bearer fixture' },
        }
      );
      const response = await dispatchEndpoint(
        financeEndpoints({
          origin: 'https://central.example.test',
          fetcher,
          local: [
            {
              pattern: '/api/workspaces/[wsId]',
              module: {
                GET: () => new Response('wrong owner', { status: 418 }),
              },
            },
          ],
        }),
        request,
        { pathname: request.nextUrl.pathname }
      );
      expect(response?.status).toBe(202);
      expect(await response?.text()).toBe('central');
      expect(response?.headers.getSetCookie()).toHaveLength(2);
      expect(fetcher).toHaveBeenCalledOnce();
    });

    it('preserves feedback mutation bytes and the upstream response', async () => {
      const fetcher = vi.fn<typeof fetch>(async (request) => {
        const forwarded = new Request(request);
        expect(forwarded.url).toBe(
          'https://central.example.test/api/v1/workspaces/ws-1/users/feedbacks'
        );
        expect(forwarded.method).toBe('POST');
        expect(await forwarded.text()).toBe('{"feedback":"fixture"}');
        return new Response('permission denied', { status: 403 });
      });
      const request = new NextRequest(
        `https://example.test${basePath}/api/v1/workspaces/ws-1/users/feedbacks`,
        {
          nextConfig: { basePath },
          method: 'POST',
          body: '{"feedback":"fixture"}',
        }
      );
      const response = await dispatchEndpoint(
        financeEndpoints({
          local: [],
          origin: 'https://central.example.test',
          fetcher,
        }),
        request,
        { pathname: request.nextUrl.pathname }
      );
      expect(response?.status).toBe(403);
      expect(await response?.text()).toBe('permission denied');
    });
  }
);

it('forwards reserved OPTIONS instead of synthesizing a local response', async () => {
  const fetcher = vi.fn<typeof fetch>(
    async () => new Response(null, { status: 401 })
  );
  const request = new NextRequest(
    'https://example.test/finance/api/v1/workspaces/ws-1/settings/permissions',
    { nextConfig: { basePath: '/finance' }, method: 'OPTIONS' }
  );
  const response = await dispatchEndpoint(
    financeEndpoints({
      local: [],
      origin: 'https://central.example.test',
      fetcher,
    }),
    request,
    { pathname: request.nextUrl.pathname }
  );
  expect(response?.status).toBe(401);
  expect(fetcher).toHaveBeenCalledOnce();
});

it('keeps an ordinary Finance-owned route local', async () => {
  const fetcher = vi.fn<typeof fetch>();
  const request = new NextRequest(
    'https://example.test/api/workspaces/ws-1/wallets'
  );
  const response = await dispatchEndpoint(
    financeEndpoints({
      origin: 'https://central.example.test',
      fetcher,
      local: [
        {
          pattern: '/api/workspaces/[wsId]/wallets',
          module: { GET: () => new Response(null, { status: 204 }) },
        },
      ],
    }),
    request
  );
  expect(response?.status).toBe(204);
  expect(fetcher).not.toHaveBeenCalled();
});
