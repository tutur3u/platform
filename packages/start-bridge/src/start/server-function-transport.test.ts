import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { NextRequest } from 'next/dist/server/web/spec-extension/request';
import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_BASE_GLOBAL } from '../core/app-url';
import { withBridgeRequest } from '../server/request-context';
import { bridgeServerFnFetch } from './base-path';

const auth = vi.hoisted(() => ({
  refresh: vi.fn(),
  guard: vi.fn(),
  failure: vi.fn(),
}));
vi.mock('@tuturuuu/auth/app-session', () => ({
  hasSupportedSupabaseAuthCookie: (request: Request) =>
    request.headers.has('cookie'),
  getAppSessionTokenFromRequest: () => null,
  getWebAppSessionTokenFromRequest: () => null,
  getAppSessionRefreshTokenFromRequest: () => null,
  getWebAppSessionRefreshTokenFromRequest: () => null,
}));
vi.mock('@tuturuuu/auth/proxy', () => ({
  refreshAppSessionForRequest: auth.refresh,
  appSessionFailureResponse: auth.failure,
  preserveMfaRecoveryCookies: (_request: Request, response: Response) =>
    response,
  propagateAuthCookies: () => undefined,
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: auth.guard,
}));

import { createFunctionProxy } from '../next/function-proxy';
import { nativeFunctionProxy } from '../../../../apps/meet/src/runtime/native-function-proxy';

// Resolve the suppliers from the owning bridge, including its isolated peers.
const owner = createRequire(import.meta.url);
const start = createRequire(
  owner.resolve('@tanstack/react-start/package.json')
);
const clientRoot = dirname(
  start.resolve('@tanstack/start-client-core/package.json')
);
const serverRoot = dirname(
  start.resolve('@tanstack/start-server-core/package.json')
);
const client = createRequire(join(clientRoot, 'package.json'));
const storage = await import(
  join(
    dirname(client.resolve('@tanstack/start-storage-context/package.json')),
    'dist/esm/index.js'
  )
);
const { serverFnFetcher } = await import(
  join(clientRoot, 'src/client-rpc/serverFnFetcher.ts')
);

const effects = vi.fn();
const action = Object.assign(
  async ({ data }: { data: unknown }) => {
    if (data === 'fixture-failure') throw new Error('fixture handler failed');
    effects(data);
    return { result: Response.json({ data }) };
  },
  { method: 'POST' }
);
vi.doMock(join(serverRoot, 'src/getServerFnById.ts'), () => ({
  getServerFnById: async () => action,
}));
const { handleServerAction } = await import(
  join(serverRoot, 'src/server-functions-handler.ts')
);
const originalBase = (globalThis as Record<string, unknown>)[APP_BASE_GLOBAL];
const appStarts = await Promise.all(
  ['meet', 'learn', 'teach', 'calendar', 'mail'].map(async (app) => {
    const { startInstance } = await import(
      `../../../../apps/${app}/src/start.ts`
    );
    return [app, await startInstance.getOptions()] as const;
  })
);
const starts = new Map(appStarts);

const sharedProxy = createFunctionProxy({ targetApp: 'learn' });

beforeEach(() => {
  vi.clearAllMocks();
  auth.guard.mockResolvedValue(null);
  const session = NextResponse.next();
  session.cookies.set('fixture_session', 'refreshed', { httpOnly: true });
  auth.refresh.mockResolvedValue({ ok: true, response: session });
  auth.failure.mockReturnValue(new NextResponse('expired', { status: 401 }));
  action.method = 'POST';
});
afterEach(() => {
  vi.unstubAllGlobals();
  (globalThis as Record<string, unknown>)[APP_BASE_GLOBAL] = originalBase;
});

type Capture = { url: URL; method: string; body: string; headers: Headers };
async function call({
  origin = 'https://learn.tuturuuu.com',
  base = '',
  meet = false,
  headers = { origin, cookie: 'fixture_session=valid' },
  data = { path: '/en/plans/one?name=Tiếng Việt&next=%2Fa#details' },
  method = 'POST',
}: {
  origin?: string;
  base?: string;
  meet?: boolean;
  headers?: Record<string, string>;
  data?: unknown;
  method?: 'GET' | 'POST';
} = {}) {
  const captures: Capture[] = [];
  const prefix = meet ? '/_meet/functions/' : '/_serverFn/';
  (globalThis as Record<string, unknown>)[APP_BASE_GLOBAL] = base;
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new NextRequest(
      new Request(new URL(String(input), origin), init)
    );
    captures.push({
      url: new URL(request.url),
      method: request.method,
      body: await request.clone().text(),
      headers: request.headers,
    });
    return withBridgeRequest({ request, appBase: base }, async () => {
      const admission = await (meet
        ? nativeFunctionProxy(request)
        : sharedProxy(request));
      if (!admission.headers.has('x-middleware-next')) return admission;
      return storage.runWithStartContext(
        { startOptions: {}, request },
        async () => {
          const app = meet
            ? 'meet'
            : (new URL(origin).hostname.split('.')[0] ?? 'learn');
          const csrf = (starts.get(app) ?? starts.get('learn'))
            .requestMiddleware[0];
          const response = await csrf.options.server({
            request,
            pathname: new URL(request.url).pathname,
            handlerType: 'serverFn',
            context: undefined,
            next: () => handleServerAction({ request, serverFnId: 'fixture' }),
          });
          for (const cookie of admission.headers.getSetCookie())
            response.headers.append('set-cookie', cookie);
          return response;
        }
      );
    });
  };
  vi.stubGlobal('fetch', fetch);
  const result = await storage
    .runWithStartContext({ startOptions: {} }, () =>
      serverFnFetcher(
        `${prefix}fixture`,
        [{ method, data: method === 'GET' ? undefined : data, headers }],
        meet ? fetch : bridgeServerFnFetch
      )
    )
    .then(
      (response: Response) => ({ response }),
      (error: unknown) => ({ error })
    );
  return { ...result, captures };
}

describe('installed server-function transport through existing admission', () => {
  it('handwritten page loaders publish POST method metadata', async () => {
    for (const app of ['meet', 'mail', 'calendar']) {
      const loaders = await import(
        `../../../../apps/${app}/src/runtime/page-loader.ts`
      );
      const names =
        app === 'calendar'
          ? ['loadCalendarLocale', 'loadCalendarPage']
          : [app === 'meet' ? 'loadMeetPage' : 'loadMailPage'];
      for (const name of names) expect(loaders[name].method).toBe('POST');
    }
  });

  it.each([
    ['https://meet.tuturuuu.com', '', true],
    ['https://learn.tuturuuu.com', '', false],
    ['https://teach.tuturuuu.com', '', false],
    ['https://calendar.tuturuuu.com', '', false],
    ['https://mail.tuturuuu.com', '', false],
    ['https://tuturuuu.com', '/learn', false],
    ['https://tuturuuu.com', '', false],
  ] as const)(
    'POST decodes an app-valid location at %s%s',
    async (origin, base, meet) => {
      const result = await call({ origin, base, meet });
      expect(result).not.toHaveProperty('error');
      expect(effects).toHaveBeenCalledOnce();
      expect(effects).toHaveBeenCalledWith({
        path: '/en/plans/one?name=Tiếng Việt&next=%2Fa#details',
      });
      const [capture] = result.captures;
      expect(capture.url.pathname).toBe(
        `${base}${meet ? '/_meet/functions/' : '/_serverFn/'}fixture`
      );
      expect(capture.url.search).toBe('');
      expect(capture.method).toBe('POST');
      expect(capture.headers.get('content-type')).toBe('application/json');
      expect(capture.headers.get('cookie')).toBe('fixture_session=valid');
      expect(capture.body).toContain('Tiếng Việt');
      expect(capture.body).toContain('%2Fa');
      if (!base && 'response' in result)
        expect(result.response.headers.getSetCookie()).toContain(
          'fixture_session=refreshed; Path=/; HttpOnly'
        );
      if (base) expect(auth.refresh).not.toHaveBeenCalled();
    }
  );

  it('decodes the generated loader href without changing its encoding', async () => {
    const data = '/en/plans/one?name=Tiếng Việt&next=%2Fa#details';
    const result = await call({ data });
    expect(result).not.toHaveProperty('error');
    expect(result.captures[0].url.search).toBe('');
    expect(effects).toHaveBeenCalledWith(data);
  });

  it('retains supplier serialization for dates, maps and undefined fields', async () => {
    const data = {
      date: new Date('2026-11-12T00:00:00Z'),
      values: new Map([['name', 'Việt']]),
      absent: undefined,
    };
    const result = await call({ data });
    expect(result).not.toHaveProperty('error');
    expect(effects).toHaveBeenCalledWith(data);
  });

  it('preserves the serialized error envelope consumed by client middleware', async () => {
    const result = await call({ data: 'fixture-failure' });
    expect(result).toHaveProperty('response', {
      error: new Error('fixture handler failed'),
    });
    expect(effects).not.toHaveBeenCalled();
  });

  it('keeps a large payload entirely in the body', async () => {
    const data = { path: '/en/' + 'large&?=測試'.repeat(4000) };
    const result = await call({ data });
    expect(result).not.toHaveProperty('error');
    expect(result.captures[0].url.search).toBe('');
    expect(result.captures[0].method).toBe('POST');
    expect(result.captures[0].url.searchParams.has('payload')).toBe(false);
    expect(result.captures[0].body.length).toBeGreaterThan(32000);
    expect(effects).toHaveBeenCalledWith(data);
  });

  it.each([false, true])(
    'rejects expired auth before dispatch (Meet=%s)',
    async (meet) => {
      auth.refresh.mockResolvedValue({ ok: false, error: 'expired' });
      const result = await call({ meet });
      expect(result).toHaveProperty('error', new Error('expired'));
      expect(effects).not.toHaveBeenCalled();
      expect(auth.guard).not.toHaveBeenCalled();
    }
  );

  it.each([false, true])(
    'rejects forbidden origins and missing CSRF metadata (Meet=%s)',
    async (meet) => {
      const deniedHeaders: Record<string, string>[] = [
        { origin: 'https://foreign.invalid', cookie: 'fixture_session=valid' },
        {
          origin: 'https://foreign.invalid',
          'x-forwarded-host': 'foreign.invalid',
          'x-forwarded-proto': 'https',
          cookie: 'fixture_session=valid',
        },
        { 'sec-fetch-site': 'cross-site', cookie: 'fixture_session=valid' },
        {
          referer: 'https://learn.tuturuuu.com.foreign.invalid/',
          cookie: 'fixture_session=valid',
        },
        { cookie: 'fixture_session=valid' },
      ];
      for (const headers of deniedHeaders) {
        const result = await call({ meet, headers });
        expect(result).toHaveProperty('error', new Error('Forbidden'));
        expect(effects).not.toHaveBeenCalled();
      }
    }
  );

  it('retains API guard rejection and error semantics', async () => {
    auth.guard.mockResolvedValue(new NextResponse('limited', { status: 429 }));
    const result = await call();
    expect(result).toHaveProperty('error', new Error('limited'));
    expect(effects).not.toHaveBeenCalled();
  });

  it('preserves supported payload-free GET calls', async () => {
    action.method = 'GET';
    const result = await call({ method: 'GET', data: undefined });
    expect(result).not.toHaveProperty('error');
    expect(result.captures[0].url.search).toBe('');
    expect(result.captures[0].body).toBe('');
    expect(effects).toHaveBeenCalledWith(undefined);
  });

  it('retains declared-method enforcement with zero effects', async () => {
    action.method = 'GET';
    const result = await call();
    expect(result).toHaveProperty(
      'error',
      new Error('expected GET method. Got POST')
    );
    expect(effects).not.toHaveBeenCalled();
  });
});
