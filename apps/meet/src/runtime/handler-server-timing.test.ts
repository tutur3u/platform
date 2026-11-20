import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ports = vi.hoisted(() => ({
  start: vi.fn<(request: Request) => Promise<Response>>(),
  proxy: vi.fn(),
  endpoint: vi.fn<(request: NextRequest) => Promise<Response | undefined>>(
    async () => undefined
  ),
}));
vi.mock('@tuturuuu/start-bridge/start/server-entry', () => ({
  createBridgeStartHandler: () => ({ fetch: ports.start }),
}));
vi.mock('../proxy', () => ({ proxy: ports.proxy }));
vi.mock('./api-registry', () => ({ dispatchMeetEndpoint: ports.endpoint }));
vi.mock('./native-function-proxy', () => ({ nativeFunctionProxy: vi.fn() }));
vi.mock('@tuturuuu/utils/next-config', () => ({
  resolveTuturuuuWebAppUrl: () => 'https://tuturuuu.com',
}));

import { markSignedInDocument } from './document-cache';
import { handleMeetRequest } from './handler';
import {
  recordMeetPhase,
  SERVER_TIMING_LABELS,
  type ServerTimingLabel,
} from './ssr-timing';

const ctx = { waitUntil() {} };
const html = { 'content-type': 'text/html; charset=utf-8' };
const pattern = new RegExp(
  `^(?:(?:${SERVER_TIMING_LABELS.join('|')});dur=\\d+(?:\\.\\d)?)(?:, (?:${SERVER_TIMING_LABELS.join('|')});dur=\\d+(?:\\.\\d)?)*$`
);

function serve(respond: () => Response) {
  ports.start.mockImplementation(async () => respond());
  return handleMeetRequest(
    new Request('https://meet.tuturuuu.com/personal/meetings'),
    {} as never,
    ctx
  );
}
function signedIn(response: Response) {
  for (const label of [
    'actor',
    'invitation',
    'context',
    'profile',
    'hosting',
  ] as const)
    recordMeetPhase(label, 12.34);
  return response;
}

beforeEach(() => {
  vi.clearAllMocks();
  ports.proxy.mockImplementation(async () => NextResponse.next());
});
afterEach(() => vi.restoreAllMocks());

describe('Server-Timing on signed-in documents', () => {
  it('adds the closed label set with durations only to a signed-in HTML 200', async () => {
    const response = await serve(() =>
      signedIn(new Response('<html></html>', { headers: html }))
    );
    const value = response.headers.get('server-timing') ?? '';
    expect(value).toMatch(pattern);
    expect(value.split(', ').map((entry) => entry.split(';')[0])).toEqual([
      ...SERVER_TIMING_LABELS,
    ]);
    expect(value).toContain('actor;dur=12.3');
    expect(response.headers.get('timing-allow-origin')).toBeNull();
    expect(await response.text()).toBe('<html></html>');
  });

  it('keeps the document Cache-Control and other headers as Start set them', async () => {
    const cached = await serve(() =>
      signedIn(
        new Response('x', {
          headers: { ...html, 'cache-control': 'private, no-store' },
        })
      )
    );
    expect(cached.headers.get('cache-control')).toBe('private, no-store');
    const none = await serve(() =>
      signedIn(new Response('x', { headers: html }))
    );
    expect(none.headers.get('cache-control')).toBeNull();
  });

  it('appends to an existing Server-Timing value instead of replacing it', async () => {
    const response = await serve(() =>
      signedIn(
        new Response('x', {
          headers: { ...html, 'server-timing': 'edge;dur=1' },
        })
      )
    );
    const value = response.headers.get('server-timing') ?? '';
    expect(value.startsWith('edge;dur=1, ')).toBe(true);
    expect(value).toContain('total;dur=');
  });

  it('omits the header without a session actor', async () => {
    const response = await serve(() => {
      recordMeetPhase('invitation', 5);
      return new Response('x', { headers: html });
    });
    expect(response.headers.get('server-timing')).toBeNull();
  });

  it.each([
    [
      'redirect',
      () =>
        new Response(null, { status: 302, headers: { location: '/login' } }),
    ],
    ['error page', () => new Response('x', { status: 500, headers: html })],
    ['not found', () => new Response('x', { status: 404, headers: html })],
    [
      'non-HTML response',
      () =>
        new Response('{}', { headers: { 'content-type': 'application/json' } }),
    ],
  ])('omits the header on a %s', async (_name, make) => {
    const response = await serve(() => signedIn(make()));
    expect(response.headers.get('server-timing')).toBeNull();
  });

  it('cannot emit a label outside the closed set or an invalid duration', async () => {
    const response = await serve(() => {
      recordMeetPhase('actor', 1);
      recordMeetPhase('user-email' as ServerTimingLabel, 5);
      recordMeetPhase('context', Number.NaN);
      recordMeetPhase('profile', -3);
      recordMeetPhase('hosting', 2_000_000);
      return new Response('x', { headers: html });
    });
    const value = response.headers.get('server-timing') ?? '';
    expect(value).toMatch(pattern);
    expect(value).not.toContain('user-email');
    for (const label of ['context', 'profile', 'hosting'])
      expect(value).not.toContain(`${label};`);
  });
});

describe('document caching for signed-in responses', () => {
  const signedInMark = (response: Response) => {
    markSignedInDocument();
    return response;
  };

  it.each([
    ['document', () => new Response('x', { headers: html })],
    [
      'redirect',
      () => new Response(null, { status: 302, headers: { location: '/x' } }),
    ],
    ['not found', () => new Response('x', { status: 404, headers: html })],
    ['error page', () => new Response('x', { status: 500, headers: html })],
  ])('sends private, no-store on a signed-in %s', async (_name, make) => {
    const response = await serve(() => signedInMark(make()));
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('replaces a shareable Cache-Control that Start set', async () => {
    const response = await serve(() =>
      signedInMark(
        new Response('x', {
          headers: { ...html, 'cache-control': 'public, max-age=3600' },
        })
      )
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('leaves anonymous responses exactly as Start returned them', async () => {
    const shareable = await serve(
      () =>
        new Response('x', {
          headers: { ...html, 'cache-control': 'public, max-age=3600' },
        })
    );
    expect(shareable.headers.get('cache-control')).toBe('public, max-age=3600');
    const bare = await serve(() => new Response('x', { headers: html }));
    expect(bare.headers.get('cache-control')).toBeNull();
  });
});

it('strips the Meet base only for the asset binding', async () => {
  const fetch = vi.fn(async (request: Request) => new Response(request.url));
  const response = await handleMeetRequest(
    new Request('https://tuturuuu.com/meet/assets/app.js?cache=1'),
    { ASSETS: { fetch } },
    ctx
  );
  expect(await response.text()).toBe(
    'https://tuturuuu.com/assets/app.js?cache=1'
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('selects the mounted endpoint with an app-relative path and public origin', async () => {
  ports.proxy.mockImplementation(async () => NextResponse.next());
  ports.endpoint.mockImplementationOnce(async (request) => {
    expect(request.nextUrl.pathname).toBe('/api/build-info');
    expect(request.nextUrl.basePath).toBe('/meet');
    expect(request.url).toBe(
      'https://tuturuuu.com/meet/api/build-info?probe=1'
    );
    return Response.json({ app: 'meet' });
  });
  const response = await handleMeetRequest(
    new Request('https://tuturuuu.com/meet/api/build-info?probe=1'),
    {},
    ctx
  );
  expect(await response.json()).toEqual({ app: 'meet' });
});

it('refuses per-app session minting on the apex', async () => {
  const response = await handleMeetRequest(
    new Request('https://tuturuuu.com/meet/api/auth/verify-app-token', {
      method: 'POST',
    }),
    {},
    ctx
  );
  expect(response.status).toBe(409);
  expect(response.headers.has('set-cookie')).toBe(false);
});

it('passes the public document URL and the compiled server function URL to Start', async () => {
  ports.proxy.mockImplementation(async () => NextResponse.next());
  ports.start.mockImplementation(
    async (request) =>
      new Response(`${request.url}|${await request.text()}`, { headers: html })
  );
  const page = await handleMeetRequest(
    new Request('https://tuturuuu.com/meet/vi/personal/meetings'),
    {},
    ctx
  );
  expect(await page.text()).toBe(
    'https://tuturuuu.com/meet/vi/personal/meetings|'
  );
  expect(page.headers.get('content-security-policy')).toContain(
    "'strict-dynamic'"
  );

  const result = await handleMeetRequest(
    new Request('https://tuturuuu.com/meet/_meet/functions/example?x=1', {
      method: 'POST',
      headers: {
        Origin: 'https://tuturuuu.com',
        'content-type': 'application/json',
      },
      body: '{"value":1}',
    }),
    {},
    ctx
  );
  expect(await result.text()).toBe(
    'https://tuturuuu.com/_meet/functions/example?x=1|{"value":1}'
  );
});
