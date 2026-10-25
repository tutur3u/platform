import { isRedirect } from '@tanstack/react-router';
import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ports = vi.hoisted(() => ({
  start: vi.fn<(request: Request) => Promise<Response>>(),
  proxy: vi.fn(),
  endpoint: vi.fn(async (_request: Request) => undefined),
  native: vi.fn(() => {
    throw Error('Unexpected native proxy');
  }),
  web: vi.fn(() => {
    throw Error('Unexpected external API destination');
  }),
}));
vi.mock('@tuturuuu/start-bridge/start/server-entry', () => ({
  createBridgeStartHandler: () => ({ fetch: ports.start }),
}));
vi.mock('../proxy', () => ({ proxy: ports.proxy }));
vi.mock('./api-registry', () => ({ meetEndpoints: [] }));
vi.mock('@tuturuuu/start-bridge/endpoints', () => ({
  dispatchEndpoint: (_endpoints: unknown, request: Request) =>
    ports.endpoint(request),
}));
vi.mock('./native-function-proxy', () => ({
  nativeFunctionProxy: ports.native,
}));
vi.mock('@tuturuuu/utils/next-config', () => ({
  resolveTuturuuuWebAppUrl: ports.web,
}));

import { handleMeetRequest } from './handler';
import type { ObserveLoginNavigation } from './login-redirect-diagnostics';
import { redirect } from './next-navigation';
import { meetRequest, withMeetRequest } from './request-context';
import {
  MEET_SSR_MARKER,
  type MeetSsrRecord,
  parseMeetSsrRecord,
} from './ssr-diagnostics';

function records(lines: unknown[][]): MeetSsrRecord[] {
  return lines.map(([line]) => {
    if (typeof line !== 'string' || !line.startsWith(MEET_SSR_MARKER))
      throw Error('Unexpected diagnostic output');
    const record = parseMeetSsrRecord(
      JSON.parse(line.slice(MEET_SSR_MARKER.length))
    );
    if (!record) throw Error('Invalid diagnostic record');
    return record;
  });
}
function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw Error('Missing barrier');
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function navigate(href: string): Response {
  try {
    redirect(href);
  } catch (error) {
    if (!isRedirect(error)) throw error;
    return error;
  }
  throw Error('Missing owning redirect');
}
const ctx = { waitUntil() {} };

beforeEach(() => {
  vi.clearAllMocks();
  ports.proxy.mockImplementation(async () => NextResponse.next());
});
afterEach(() => {
  expect(ports.native).not.toHaveBeenCalled();
  expect(ports.web).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe('R21 actual handler request-local diagnostic handoff with fixed dependency ports', () => {
  it('joins actual navigation and final Start/proxy headers on one existing terminal record before logging', async () => {
    let late: ObserveLoginNavigation | undefined;
    let startResponse: Response | undefined;
    const sink = vi.spyOn(console, 'error').mockImplementation((line) => {
      if (typeof line === 'string' && line.includes('"loginRedirect"')) {
        // The sink runs after sealing, including callbacks at this exact boundary.
        late?.(
          '/vi/verify-token',
          new Response(null, { headers: { location: '/' } })
        );
      }
    });
    ports.proxy.mockImplementation(async () => {
      late = meetRequest().observeNavigation;
      const middleware = NextResponse.rewrite('https://meet.invalid/en/login');
      middleware.headers.set('location', '/vi/verify-token');
      return middleware;
    });
    ports.start.mockImplementation(async (request) => {
      expect(request.url).toBe('https://meet.invalid/login?SECRET_REQUEST=one');
      expect(meetRequest().request.url).toBe('https://meet.invalid/en/login');
      expect(meetRequest().observeNavigation).toBe(late);
      withMeetRequest({ ...meetRequest() }, () =>
        navigate('https://tuturuuu.com/login?SECRET_NAV=two')
      );
      startResponse = new Response('SECRET_BODY', {
        status: 307,
        headers: { location: '/login' },
      });
      return startResponse;
    });
    const final = await handleMeetRequest(
      new Request('https://meet.invalid/login?SECRET_REQUEST=one'),
      {},
      ctx
    );
    expect(ports.start).toHaveBeenCalledTimes(1);
    expect(ports.proxy).toHaveBeenCalledTimes(1);
    expect(ports.endpoint).toHaveBeenCalledTimes(1);
    expect(final.bodyUsed).toBe(false);
    expect(startResponse?.bodyUsed).toBe(false);
    const all = records(sink.mock.calls);
    expect(all.map(({ stage, outcome }) => [stage, outcome])).toEqual([
      ['proxy', 'delegating'],
      ['start', 'delegating'],
      ['start', 'returnedredirect'],
      ['proxy', 'returnedredirect'],
    ]);
    expect(all.filter((record) => record.loginRedirect)).toHaveLength(1);
    expect(all.at(-1)?.loginRedirect).toEqual({
      navigationCalls: 'one',
      navigationInput: { origin: 'CENTRAL', path: 'LOGIN' },
      navigationResponse: { origin: 'CENTRAL', path: 'LOGIN' },
      startResponse: { origin: 'SAME', path: 'LOGIN' },
      proxyResponse: { origin: 'SAME', path: 'VERIFY_TOKEN' },
      inspection: 'available',
    });
    expect(sink.mock.calls.map(([line]) => line).join('')).not.toContain(
      'SECRET'
    );
    for (const record of all)
      expect(
        new TextEncoder().encode(JSON.stringify(record)).byteLength
      ).toBeLessThan(2048);
  });

  it('retains exact early proxy Response identity with no Start call or navigation', async () => {
    const sink = vi.spyOn(console, 'error').mockImplementation(() => {});
    const original = NextResponse.redirect(
      'https://tuturuuu.com/login?SECRET=one'
    );
    ports.proxy.mockResolvedValue(original);
    expect(
      await handleMeetRequest(
        new Request('https://meet.invalid/login'),
        {},
        ctx
      )
    ).toBe(original);
    expect(ports.start).not.toHaveBeenCalled();
    expect(original.bodyUsed).toBe(false);
    expect(records(sink.mock.calls).at(-1)?.loginRedirect).toMatchObject({
      navigationCalls: 'none',
      startResponse: { origin: 'MISSING', path: 'MISSING' },
      proxyResponse: { origin: 'CENTRAL', path: 'LOGIN' },
    });
  });

  it('seals on exact Start throw and ignores retained callback after terminal rejection', async () => {
    const sink = vi.spyOn(console, 'error').mockImplementation(() => {});
    const original = new Error('SECRET_PRIMARY');
    let late: ObserveLoginNavigation | undefined;
    ports.start.mockImplementation(async () => {
      late = meetRequest().observeNavigation;
      navigate('https://tuturuuu.com/login');
      throw original;
    });
    await expect(
      handleMeetRequest(new Request('https://meet.invalid/login'), {}, ctx)
    ).rejects.toBe(original);
    const before = JSON.stringify(records(sink.mock.calls));
    late?.('/', new Response(null));
    expect(JSON.stringify(records(sink.mock.calls))).toBe(before);
    const terminal = records(sink.mock.calls).at(-1);
    expect(terminal).toMatchObject({
      stage: 'proxy',
      outcome: 'threw',
      loginRedirect: {
        navigationCalls: 'one',
        startResponse: { origin: 'MISSING', path: 'MISSING' },
        proxyResponse: { origin: 'MISSING', path: 'MISSING' },
      },
    });
    expect(ports.start).toHaveBeenCalledTimes(1);
  });

  it('isolates concurrent login callbacks, saturation and reverse completion without correlation state', async () => {
    const sink = vi.spyOn(console, 'error').mockImplementation(() => {});
    const first = deferred<Response>();
    const second = deferred<Response>();
    const entered = deferred<void>();
    const callbacks: ObserveLoginNavigation[] = [];
    ports.start.mockImplementation(async (request) => {
      const callback = meetRequest().observeNavigation;
      if (!callback) throw Error('Missing probe');
      callbacks.push(callback);
      if (callbacks.length === 2) entered.resolve();
      if (new URL(request.url).pathname === '/login') {
        await Promise.resolve();
        navigate('https://tuturuuu.com/login');
        return first.promise;
      }
      navigate('/vi/verify-token');
      navigate('/');
      return second.promise;
    });
    const a = handleMeetRequest(
      new Request('https://meet.invalid/login'),
      {},
      ctx
    );
    const b = handleMeetRequest(
      new Request('https://meet.invalid/vi/login'),
      {},
      ctx
    );
    await entered.promise;
    expect(callbacks[0]).not.toBe(callbacks[1]);
    second.resolve(
      new Response('SECOND', {
        status: 307,
        headers: { location: '/vi/verify-token' },
      })
    );
    expect((await b).bodyUsed).toBe(false);
    first.resolve(
      new Response('FIRST', {
        status: 307,
        headers: { location: 'https://tuturuuu.com/login' },
      })
    );
    expect((await a).bodyUsed).toBe(false);
    const projections = records(sink.mock.calls).flatMap((record) =>
      record.loginRedirect ? [record.loginRedirect] : []
    );
    expect(projections).toHaveLength(2);
    expect(projections[0]).toMatchObject({
      navigationCalls: 'multiple',
      navigationInput: { origin: 'UNKNOWN', path: 'UNKNOWN' },
      startResponse: { origin: 'SAME', path: 'VERIFY_TOKEN' },
      proxyResponse: { origin: 'SAME', path: 'VERIFY_TOKEN' },
    });
    expect(projections[1]).toMatchObject({
      navigationCalls: 'one',
      navigationInput: { origin: 'CENTRAL', path: 'LOGIN' },
      startResponse: { origin: 'CENTRAL', path: 'LOGIN' },
      proxyResponse: { origin: 'CENTRAL', path: 'LOGIN' },
    });
    expect(ports.start).toHaveBeenCalledTimes(2);
    const closed = JSON.stringify(projections);
    for (const callback of callbacks)
      callback('/SECRET_LATE', new Response(null));
    expect(JSON.stringify(projections)).toBe(closed);
  });
});

it('R21 late asynchronous navigation keeps inherited ALS wiring after terminal return without new records', async () => {
  const sink = vi.spyOn(console, 'error').mockImplementation(() => {});
  const release = deferred<void>();
  let lateWork: Promise<void> | undefined;
  ports.start.mockImplementation(async () => {
    const callback = meetRequest().observeNavigation;
    if (!callback) throw Error('Missing handler probe');
    navigate('https://tuturuuu.com/login');
    lateWork = release.promise.then(() => {
      expect(meetRequest().observeNavigation).toBe(callback);
      navigate('/vi/verify-token');
    });
    return new Response(null, { status: 307, headers: { location: '/login' } });
  });
  const response = await handleMeetRequest(
    new Request('https://meet.invalid/login'),
    {},
    ctx
  );
  expect(response.bodyUsed).toBe(false);
  const output = JSON.stringify(records(sink.mock.calls));
  expect(lateWork).toBeDefined();
  release.resolve();
  await lateWork;
  expect(JSON.stringify(records(sink.mock.calls))).toBe(output);
  expect(records(sink.mock.calls).at(-1)?.loginRedirect?.navigationCalls).toBe(
    'one'
  );
});

it('uses the resolved mounted base without claiming adjacent or root Web API paths', async () => {
  const { runtimeAppBase } = await import('@tuturuuu/start-bridge/app-url');
  ports.start.mockImplementation(async (request) =>
    Response.json({ url: request.url, appBase: runtimeAppBase() })
  );
  const env = { APP_ORIGIN: 'https://tuturuuu.com', APP_BASE_PATH: '/meet' };
  const result = await handleMeetRequest(
    new Request('https://tuturuuu.com/meet/vi/r/code?tag=one&tag=two'),
    env,
    ctx
  );
  expect(await result.json()).toEqual({
    url: 'https://tuturuuu.com/meet/vi/r/code?tag=one&tag=two',
    appBase: '/meet',
  });
  const count = ports.start.mock.calls.length;
  for (const path of ['/api/meet-call/one', '/meet-together', '/meeting']) {
    const denied = await handleMeetRequest(
      new Request(`https://tuturuuu.com${path}`),
      env,
      ctx
    );
    expect(denied.status).toBe(404);
  }
  expect(ports.start).toHaveBeenCalledTimes(count);
});
