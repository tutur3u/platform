import type { NextRequest } from 'next/dist/server/web/spec-extension/request';
import * as roomPreview from '../app/[locale]/r/[code]/preview/route';
import * as api0 from '../app/api/auth/logout/route';
import * as api1 from '../app/api/auth/refresh-app-session/route';
import * as api2 from '../app/api/auth/verify-app-token/route';
import * as api3 from '../app/api/build-info/route';
import * as api4 from '../app/api/meet-ai/[wsId]/[meetingId]/chunks/route';
import * as api5 from '../app/api/meet-ai/[wsId]/[meetingId]/followups/route';
import * as api6 from '../app/api/meet-ai/[wsId]/[meetingId]/route';
import * as api7 from '../app/api/meet-call/[meetingId]/assistant/personal/route';
import * as api8 from '../app/api/meet-call/[meetingId]/assistant/review/route';
import * as api9 from '../app/api/meet-call/[meetingId]/assistant/route';
import * as api10 from '../app/api/meet-call/[meetingId]/costs/route';
import * as api11 from '../app/api/meet-call/[meetingId]/document/route';
import * as api12 from '../app/api/meet-call/[meetingId]/files/route';
import * as api13 from '../app/api/meet-call/[meetingId]/programming/preview/[port]/[[...path]]/route';
import * as api14 from '../app/api/meet-call/[meetingId]/programming/route';
import * as api15 from '../app/api/meet-call/[meetingId]/public-info/route';
import * as api16 from '../app/api/meet-call/[meetingId]/recording/route';
import * as api17 from '../app/api/meet-call/[meetingId]/state/route';
import * as api18 from '../app/api/meet-call/[meetingId]/title/route';
import * as api19 from '../app/api/meet-call/[meetingId]/token/route';
import * as api20 from '../app/api/meet-live/[meetingId]/review/route';
import * as api21 from '../app/api/meet-live/[meetingId]/route';
import * as api22 from '../app/api/meet-live/memory/route';
import * as api23 from '../app/api/meet-ai/finalize/route';
import {
  matchRoute,
  type RouteParams,
  routeParam,
  routeSegments,
} from './route-match';

type Handler = (
  request: NextRequest,
  params: RouteParams
) => Response | Promise<Response>;
interface Endpoint {
  pattern: string;
  methods: Partial<Record<string, Handler>>;
}

export const meetEndpoints: Endpoint[] = [
  {
    pattern: '/api/auth/logout',
    methods: {
      GET: () => api0.GET(),
      POST: () => api0.POST(),
    },
  },
  {
    pattern: '/api/auth/refresh-app-session',
    methods: {
      POST: (request) => api1.POST(request),
    },
  },
  {
    pattern: '/api/auth/verify-app-token',
    methods: {
      POST: (request) => api2.POST(request),
    },
  },
  {
    pattern: '/api/build-info',
    methods: {
      GET: () => api3.GET(),
    },
  },
  {
    pattern: '/api/meet-ai/[wsId]/[meetingId]/chunks',
    methods: {
      POST: (request, params) =>
        api4.POST(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-ai/[wsId]/[meetingId]/followups',
    methods: {
      GET: (request, params) =>
        api5.GET(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
      POST: (request, params) =>
        api5.POST(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-ai/[wsId]/[meetingId]',
    methods: {
      GET: (request, params) =>
        api6.GET(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
      POST: (request, params) =>
        api6.POST(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    // Room-signed server call; authenticated by its bearer token, not a session.
    pattern: '/api/meet-ai/finalize',
    methods: {
      POST: (request) => api23.POST(request),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/assistant/personal',
    methods: {
      POST: (request, params) =>
        api7.POST(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/assistant/review',
    methods: {
      GET: (request, params) =>
        api8.GET(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
      POST: (request, params) =>
        api8.POST(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/assistant',
    methods: {
      POST: (request, params) =>
        api9.POST(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/costs',
    methods: {
      GET: (request, params) =>
        api10.GET(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/document',
    methods: {
      GET: (request, params) =>
        api11.GET(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/files',
    methods: {
      DELETE: (request, params) =>
        api12.DELETE(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
      GET: (request, params) =>
        api12.GET(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
      POST: (request, params) =>
        api12.POST(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern:
      '/api/meet-call/[meetingId]/programming/preview/[port]/[[...path]]',
    methods: {
      GET: (request, params) =>
        api13.GET(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
            port: routeParam(params, 'port'),
            path: routeSegments(params, 'path'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/programming',
    methods: {
      GET: (request, params) =>
        api14.GET(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
      POST: (request, params) =>
        api14.POST(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
      PUT: (request, params) =>
        api14.PUT(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/public-info',
    methods: {
      GET: (request, params) =>
        api15.GET(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
      PATCH: (request, params) =>
        api15.PATCH(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/recording',
    methods: {
      GET: (request, params) =>
        api16.GET(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
      POST: (request, params) =>
        api16.POST(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
      PUT: (request, params) =>
        api16.PUT(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/state',
    methods: {
      GET: (request, params) =>
        api17.GET(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
      POST: (request, params) =>
        api17.POST(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/title',
    methods: {
      PATCH: (request, params) =>
        api18.PATCH(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/token',
    methods: {
      POST: (request, params) =>
        api19.POST(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-live/[meetingId]/review',
    methods: {
      POST: (request, params) =>
        api20.POST(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-live/[meetingId]',
    methods: {
      POST: (request, params) =>
        api21.POST(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-live/memory',
    methods: {
      GET: () => api22.GET(),
      POST: (request) => api22.POST(request),
    },
  },
  {
    pattern: '/[locale]/r/[code]/preview',
    methods: {
      GET: (request, params) =>
        roomPreview.GET(request, {
          params: Promise.resolve({
            locale: routeParam(params, 'locale'),
            code: routeParam(params, 'code'),
          }),
        }),
    },
  },
  {
    pattern: '/r/[code]/preview',
    methods: {
      GET: (request, params) =>
        roomPreview.GET(request, {
          params: Promise.resolve({
            locale: 'en',
            code: routeParam(params, 'code'),
          }),
        }),
    },
  },
];

export async function dispatchMeetEndpoint(
  request: NextRequest
): Promise<Response | null> {
  // Static endpoints such as /meet-live/memory outrank /meet-live/[meetingId].
  const endpoints = meetEndpoints.toSorted(
    (a, b) =>
      (a.pattern.match(/\[/gu)?.length ?? 0) -
      (b.pattern.match(/\[/gu)?.length ?? 0)
  );
  for (const endpoint of endpoints) {
    let params: RouteParams | null;
    try {
      params = matchRoute(endpoint.pattern, request.nextUrl.pathname);
    } catch (error) {
      if (error instanceof URIError)
        return new Response('Bad Request', { status: 400 });
      throw error;
    }
    if (!params) continue;
    const allowed = [...Object.keys(endpoint.methods)];
    if (endpoint.methods.GET && !endpoint.methods.HEAD) allowed.push('HEAD');
    if (!endpoint.methods.OPTIONS) allowed.push('OPTIONS');
    if (request.method === 'OPTIONS' && !endpoint.methods.OPTIONS)
      return new Response(null, {
        status: 204,
        headers: { Allow: allowed.join(', ') },
      });
    const method =
      request.method === 'HEAD' && !endpoint.methods.HEAD
        ? 'GET'
        : request.method;
    const handler = endpoint.methods[method];
    if (!handler)
      return new Response(null, {
        status: 405,
        headers: { Allow: allowed.join(', ') },
      });
    const response = await handler(request, params);
    if (request.method === 'HEAD')
      return new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    return response;
  }
  return null;
}
