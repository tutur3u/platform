import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { createLegacyApiDispatcher } from './dispatcher';
import type { LegacyApiRouteContext } from './types';

function request(pathname: string) {
  return new NextRequest(`https://tuturuuu.test${pathname}`);
}

describe('legacy API dispatcher', () => {
  it('matches v1 routes after stripping the /api/v1 request prefix', async () => {
    const get = vi.fn(
      async (_request: NextRequest, context: LegacyApiRouteContext) => {
        return Response.json({ params: await context.params });
      }
    );
    const dispatch = createLegacyApiDispatcher(
      {
        'v1/widgets/[widgetId]/route.ts': async () => ({ GET: get }),
      },
      {
        requestPrefixSegments: ['v1'],
        routeFilePrefixSegments: ['v1'],
      }
    );

    const response = await dispatch(request('/api/v1/widgets/widget-1'), 'GET');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      params: { widgetId: 'widget-1' },
    });
    expect(get).toHaveBeenCalledOnce();
  });

  it('does not match a scoped v1 route outside the v1 request prefix', async () => {
    const get = vi.fn(async () => Response.json({ ok: true }));
    const dispatch = createLegacyApiDispatcher(
      {
        'v1/widgets/route.ts': async () => ({ GET: get }),
      },
      {
        requestPrefixSegments: ['v1'],
        routeFilePrefixSegments: ['v1'],
      }
    );

    const response = await dispatch(request('/api/widgets'), 'GET');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Not found' });
    expect(get).not.toHaveBeenCalled();
  });

  it('returns 405 with supported methods when a route lacks the requested method', async () => {
    const dispatch = createLegacyApiDispatcher({
      'v1/widgets/route.ts': async () => ({
        POST: async () => Response.json({ ok: true }),
      }),
    });

    const response = await dispatch(request('/api/v1/widgets'), 'GET');

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });

  it('uses GET as the HEAD fallback and strips the response body', async () => {
    const dispatch = createLegacyApiDispatcher({
      'v1/widgets/route.ts': async () => ({
        GET: async () =>
          new Response('body', {
            headers: { 'x-widget': 'ok' },
            status: 201,
          }),
      }),
    });

    const response = await dispatch(request('/api/v1/widgets'), 'HEAD');

    expect(response.status).toBe(201);
    expect(response.headers.get('x-widget')).toBe('ok');
    await expect(response.text()).resolves.toBe('');
  });
});
