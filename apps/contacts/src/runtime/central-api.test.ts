// @vitest-environment node
import {
  type BridgeEndpoint,
  dispatchEndpoint,
  sortEndpoints,
} from '@tuturuuu/start-bridge/endpoints';
import {
  dispatchThroughProxy,
  toNextRequest,
} from '@tuturuuu/start-bridge/proxy-bridge';
import { NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTACTS_CENTRAL_FIRST_API_PATHS } from '@/lib/central-api-paths';
import {
  centralFirstEndpoints,
  toBridgePattern,
  withCentralApiRewrites,
} from './central-api';

const CENTRAL = 'https://web.example.com';
const central = () => CENTRAL;

function stubCentralFetch() {
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      return new Response(
        JSON.stringify({
          url: request.url,
          method: request.method,
          body: await request.text(),
          cookie: request.headers.get('cookie'),
        }),
        { status: 201, headers: { 'content-type': 'application/json' } }
      );
    }
  );
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('central-first endpoints', () => {
  const local = {
    GET: vi.fn(() => Response.json({ route: 'local-workspace' })),
  };
  const localConfig = {
    GET: vi.fn(() => Response.json({ route: 'local-config' })),
  };
  const endpoints: BridgeEndpoint[] = sortEndpoints([
    ...centralFirstEndpoints(central),
    { pattern: '/api/workspaces/[wsId]', module: local },
    {
      pattern: '/api/v1/workspaces/[wsId]/settings/[configId]',
      module: localConfig,
    },
  ]);

  it('derives every pattern from the shared reserved list except feedbacks', () => {
    expect(CONTACTS_CENTRAL_FIRST_API_PATHS).toEqual([
      '/api/workspaces/invitations',
      '/api/v1/workspaces/:wsId/settings/permissions',
    ]);
    expect(centralFirstEndpoints(central).map((e) => e.pattern)).toEqual([
      '/api/workspaces/invitations',
      '/api/v1/workspaces/[wsId]/settings/permissions',
    ]);
    expect(toBridgePattern('/a/:wsId/b/:userId')).toBe('/a/[wsId]/b/[userId]');
  });

  it.each([
    ['/api/workspaces/invitations?status=pending'],
    ['/api/v1/workspaces/ws-1/settings/permissions'],
  ])('forwards %s to the central API ahead of local routes', async (path) => {
    const fetcher = stubCentralFetch();
    const request = toNextRequest(`https://contacts.example.com${path}`, {
      method: 'POST',
      body: 'payload',
      headers: { cookie: 'a=1' },
    });
    const response = await dispatchEndpoint(endpoints, request);

    expect(response?.status).toBe(201);
    expect(await response?.json()).toEqual({
      url: `${CENTRAL}${path}`,
      method: 'POST',
      body: 'payload',
      cookie: 'a=1',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(local.GET).not.toHaveBeenCalled();
    expect(localConfig.GET).not.toHaveBeenCalled();
  });

  it('leaves neighbouring local routes local', async () => {
    const fetcher = stubCentralFetch();
    const workspace = await dispatchEndpoint(
      endpoints,
      toNextRequest('https://contacts.example.com/api/workspaces/ws-1')
    );
    const config = await dispatchEndpoint(
      endpoints,
      toNextRequest(
        'https://contacts.example.com/api/v1/workspaces/ws-1/settings/theme'
      )
    );

    expect(await workspace?.json()).toEqual({ route: 'local-workspace' });
    expect(await config?.json()).toEqual({ route: 'local-config' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('forwards the app-relative path under a basePath', async () => {
    stubCentralFetch();
    const request = toNextRequest(
      'https://tuturuuu.example/contacts/api/workspaces/invitations?x=1',
      undefined,
      '/contacts'
    );
    const response = await dispatchEndpoint(endpoints, request, {
      pathname: request.nextUrl.pathname,
    });

    const forwarded = (await response?.json()) as { url: string };
    expect(forwarded.url).toBe(`${CENTRAL}/api/workspaces/invitations?x=1`);
  });
});

describe('central API rewrites', () => {
  const rewritingProxy = (destination: string) =>
    vi.fn(async () => {
      const response = NextResponse.rewrite(new URL(destination));
      response.cookies.set('tuturuuu_app_session', 'refreshed');
      return response;
    });

  it('forwards a central rewrite with its body and keeps middleware cookies', async () => {
    const fetcher = stubCentralFetch();
    const dispatch = vi.fn();
    const response = await dispatchThroughProxy({
      request: new Request(
        'https://contacts.example.com/api/v1/workspaces/ws-1/topic-announcements?a=b',
        { method: 'POST', body: '{"title":"x"}', headers: { cookie: 'c=1' } }
      ),
      proxy: withCentralApiRewrites(
        rewritingProxy(
          `${CENTRAL}/api/v1/workspaces/ws-1/topic-announcements?a=b`
        ),
        central
      ),
      dispatch,
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      url: `${CENTRAL}/api/v1/workspaces/ws-1/topic-announcements?a=b`,
      method: 'POST',
      body: '{"title":"x"}',
      cookie: 'c=1',
    });
    expect(response.headers.getSetCookie().join('\n')).toContain(
      'tuturuuu_app_session=refreshed'
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('passes same-origin rewrites through to dispatch', async () => {
    const fetcher = stubCentralFetch();
    const dispatch = vi.fn(async () => new Response('local'));
    const response = await dispatchThroughProxy({
      request: new Request('https://contacts.example.com/ws-1/users'),
      proxy: withCentralApiRewrites(
        rewritingProxy('https://contacts.example.com/vi/ws-1/users'),
        central
      ),
      dispatch,
    });

    expect(await response.text()).toBe('local');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('leaves rewrites to other origins for the bridge to reject', async () => {
    const fetcher = stubCentralFetch();
    await expect(
      dispatchThroughProxy({
        request: new Request('https://contacts.example.com/api/x'),
        proxy: withCentralApiRewrites(
          rewritingProxy('https://elsewhere.example.com/api/x'),
          central
        ),
        dispatch: vi.fn(),
      })
    ).rejects.toThrow('Unexpected external middleware rewrite');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
