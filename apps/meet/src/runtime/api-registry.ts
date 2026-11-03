import type { NextRequest } from 'next/dist/server/web/spec-extension/request';
import {
  matchRoute,
  type RouteParams,
  routeParam,
  routeSegments,
} from './route-match';

// Each endpoint module loads on its first request. Importing them statically
// put every API dependency (AI SDKs, S3, OG image rendering) into the worker
// entry, so a cold isolate evaluated all of them before serving any page.
const roomPreview = () => import('../app/[locale]/r/[code]/preview/route');
const api0 = () => import('../app/api/auth/logout/route');
const api1 = () => import('../app/api/auth/refresh-app-session/route');
const api2 = () => import('../app/api/auth/verify-app-token/route');
const api3 = () => import('../app/api/build-info/route');
const api4 = () => import('../app/api/meet-ai/[wsId]/[meetingId]/chunks/route');
const api5 = () =>
  import('../app/api/meet-ai/[wsId]/[meetingId]/followups/route');
const api6 = () => import('../app/api/meet-ai/[wsId]/[meetingId]/route');
const api7 = () =>
  import('../app/api/meet-call/[meetingId]/assistant/personal/route');
const api8 = () =>
  import('../app/api/meet-call/[meetingId]/assistant/review/route');
const api9 = () => import('../app/api/meet-call/[meetingId]/assistant/route');
const api10 = () => import('../app/api/meet-call/[meetingId]/costs/route');
const api11 = () => import('../app/api/meet-call/[meetingId]/document/route');
const api12 = () => import('../app/api/meet-call/[meetingId]/files/route');
const api13 = () =>
  import(
    '../app/api/meet-call/[meetingId]/programming/preview/[port]/[[...path]]/route'
  );
const api14 = () =>
  import('../app/api/meet-call/[meetingId]/programming/route');
const api15 = () =>
  import('../app/api/meet-call/[meetingId]/public-info/route');
const api16 = () => import('../app/api/meet-call/[meetingId]/recording/route');
const api17 = () => import('../app/api/meet-call/[meetingId]/state/route');
const api18 = () => import('../app/api/meet-call/[meetingId]/title/route');
const api19 = () => import('../app/api/meet-call/[meetingId]/token/route');
const api20 = () => import('../app/api/meet-live/[meetingId]/review/route');
const api21 = () => import('../app/api/meet-live/[meetingId]/route');
const api22 = () => import('../app/api/meet-live/memory/route');

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
      GET: async () => (await api0()).GET(),
      POST: async () => (await api0()).POST(),
    },
  },
  {
    pattern: '/api/auth/refresh-app-session',
    methods: {
      POST: async (request) => (await api1()).POST(request),
    },
  },
  {
    pattern: '/api/auth/verify-app-token',
    methods: {
      POST: async (request) => (await api2()).POST(request),
    },
  },
  {
    pattern: '/api/build-info',
    methods: {
      GET: async () => (await api3()).GET(),
    },
  },
  {
    pattern: '/api/meet-ai/[wsId]/[meetingId]/chunks',
    methods: {
      POST: async (request, params) =>
        (await api4()).POST(request, {
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
      GET: async (request, params) =>
        (await api5()).GET(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
      POST: async (request, params) =>
        (await api5()).POST(request, {
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
      GET: async (request, params) =>
        (await api6()).GET(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
      POST: async (request, params) =>
        (await api6()).POST(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/assistant/personal',
    methods: {
      POST: async (request, params) =>
        (await api7()).POST(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/assistant/review',
    methods: {
      GET: async (request, params) =>
        (await api8()).GET(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
      POST: async (request, params) =>
        (await api8()).POST(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/assistant',
    methods: {
      POST: async (request, params) =>
        (await api9()).POST(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/costs',
    methods: {
      GET: async (request, params) =>
        (await api10()).GET(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/document',
    methods: {
      GET: async (request, params) =>
        (await api11()).GET(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/files',
    methods: {
      DELETE: async (request, params) =>
        (await api12()).DELETE(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
      GET: async (request, params) =>
        (await api12()).GET(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
      POST: async (request, params) =>
        (await api12()).POST(request, {
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
      GET: async (request, params) =>
        (await api13()).GET(request, {
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
      GET: async (request, params) =>
        (await api14()).GET(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
      POST: async (request, params) =>
        (await api14()).POST(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
      PUT: async (request, params) =>
        (await api14()).PUT(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/public-info',
    methods: {
      GET: async (request, params) =>
        (await api15()).GET(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
      PATCH: async (request, params) =>
        (await api15()).PATCH(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/recording',
    methods: {
      GET: async (request, params) =>
        (await api16()).GET(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
      POST: async (request, params) =>
        (await api16()).POST(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
      PUT: async (request, params) =>
        (await api16()).PUT(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/state',
    methods: {
      GET: async (request, params) =>
        (await api17()).GET(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
      POST: async (request, params) =>
        (await api17()).POST(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/title',
    methods: {
      PATCH: async (request, params) =>
        (await api18()).PATCH(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/token',
    methods: {
      POST: async (request, params) =>
        (await api19()).POST(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-live/[meetingId]/review',
    methods: {
      POST: async (request, params) =>
        (await api20()).POST(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-live/[meetingId]',
    methods: {
      POST: async (request, params) =>
        (await api21()).POST(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-live/memory',
    methods: {
      GET: async () => (await api22()).GET(),
      POST: async (request) => (await api22()).POST(request),
    },
  },
  {
    pattern: '/[locale]/r/[code]/preview',
    methods: {
      GET: async (request, params) =>
        (await roomPreview()).GET(request, {
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
      GET: async (request, params) =>
        (await roomPreview()).GET(request, {
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
