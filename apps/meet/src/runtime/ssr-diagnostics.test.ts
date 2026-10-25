import { redirect } from '@tanstack/react-router';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ports = vi.hoisted(() => ({
  proxy: vi.fn(),
  start: vi.fn(),
  unusedProxy: vi.fn(() => {
    throw Error('Unexpected proxy port');
  }),
  unusedNative: vi.fn(() => {
    throw Error('Unexpected native proxy port');
  }),
  webOrigin: vi.fn(() => 'https://unused.invalid'),
  endpoint: vi.fn(async (request: Request) => {
    if (
      ![
        '/login',
        '/vi/verify-token',
        '/unknown/SECRET',
        '/verify-token',
      ].includes(new URL(request.url).pathname)
    )
      throw Error('Unexpected endpoint fixture path');
    return undefined;
  }),
}));
vi.mock('@tuturuuu/start-bridge/start/server-entry', () => ({
  createBridgeStartHandler: () => ({ fetch: ports.start }),
}));
vi.mock('@tuturuuu/start-bridge/proxy-bridge', () => ({
  dispatchThroughProxy: ports.proxy,
}));
vi.mock('../proxy', () => ({ proxy: ports.unusedProxy }));
vi.mock('./native-function-proxy', () => ({
  nativeFunctionProxy: ports.unusedNative,
}));
vi.mock('./api-registry', () => ({ meetEndpoints: [] }));
vi.mock('@tuturuuu/start-bridge/endpoints', () => ({
  dispatchEndpoint: (_endpoints: unknown, request: Request) =>
    ports.endpoint(request),
}));
vi.mock('@tuturuuu/utils/next-config', () => ({
  resolveTuturuuuWebAppUrl: ports.webOrigin,
}));

import { handleMeetRequest } from './handler';
import {
  classifyMeetSsrRequest,
  observeMeetSsr,
  parseMeetSsrRecord,
  projectMeetSsr,
  reportMeetSsr,
} from './ssr-diagnostics';

afterEach(() => {
  expect(ports.unusedProxy).not.toHaveBeenCalled();
  expect(ports.unusedNative).not.toHaveBeenCalled();
  expect(ports.webOrigin).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});
describe('closed Meet SSR observations', () => {
  it('preserves actual router redirect and normal error identities', async () => {
    const sink = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const original of [
      redirect({ href: 'https://private.invalid/token' }),
      new Error('private-message'),
    ]) {
      await expect(
        observeMeetSsr('loader-model', () => {
          throw original;
        })
      ).rejects.toBe(original);
    }
    const records = sink.mock.calls.map(([line]) =>
      JSON.parse(String(line).split('meet-ssr-diagnostic ')[1]!)
    );
    expect(records.map((r) => [r.phase, r.outcome, r.kind])).toEqual([
      ['loader-model', 'threw', 'router-redirect'],
      ['loader-model', 'threw', 'error'],
    ]);
    expect(JSON.stringify(records)).not.toMatch(/private|token/);
  });
  it('observes import and model independently and preserves response identity', async () => {
    const sink = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const [status, outcome] of [
      [500, 'returned500'],
      [307, 'returnedredirect'],
      [200, 'returnedother'],
    ] as const) {
      const response = new Response(null, { status });
      expect(await observeMeetSsr('handler', () => response)).toBe(response);
      expect(
        JSON.parse(
          String(sink.mock.calls.at(-1)?.[0]).split('meet-ssr-diagnostic ')[1]!
        ).outcome
      ).toBe(outcome);
    }
    const model = {};
    expect(await observeMeetSsr('loader-import', () => model)).toBe(model);
    expect(await observeMeetSsr('loader-model', () => model)).toBe(model);
    expect(sink.mock.calls.map(([s]) => String(s))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('"phase":"loader-import"'),
        expect.stringContaining('"phase":"loader-model"'),
      ])
    );
  });
  it('does not invoke cause, message, stack or name accessors or serialize payloads', () => {
    const accessed = vi.fn(() => {
      throw new Error('SECRET');
    });
    const error = new Error();
    for (const key of ['cause', 'message', 'stack', 'name', 'code', 'toJSON'])
      Object.defineProperty(error, key, { get: accessed });
    const record = projectMeetSsr(error, 'render-boundary', 'threw');
    expect(record.kind).toBe('error');
    expect(record.inspection).toBe('unavailable');
    expect(accessed).not.toHaveBeenCalled();
    expect(JSON.stringify(record)).not.toContain('SECRET');
  });
  it('allows only four known frames and bounded locations, never raw paths', () => {
    const error = new TypeError('SECRET');
    Object.defineProperty(error, 'stack', {
      value:
        'SECRET\n' +
        Array.from(
          { length: 6 },
          () => ' at loadPageModel (/private/SECRET:12:3)'
        ).join('\n') +
        '\n at privateFunction (/SECRET:1:2)',
    });
    const record = projectMeetSsr(error, 'loader-model', 'threw');
    expect(record.frames).toEqual(
      Array.from({ length: 4 }, () => ({
        function: 'loadPageModel',
        line: 12,
        column: 3,
      }))
    );
    expect(record.inspection).toBe('overflow');
    expect(JSON.stringify(record)).not.toContain('SECRET');
  });
  it('reports hostile inspection unavailable and a throwing sink cannot mask primary', async () => {
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw Error('SECRET');
        },
      }
    );
    expect(projectMeetSsr(hostile, 'handler', 'threw').kind).toBe('UNKNOWN');
    vi.spyOn(console, 'error').mockImplementation(() => {
      throw Error('sink');
    });
    await expect(
      observeMeetSsr('handler', () => {
        throw hostile;
      })
    ).rejects.toBe(hostile);
    expect(() =>
      reportMeetSsr(hostile, 'render-boundary', 'threw')
    ).not.toThrow();
  });
  it('does not classify Response lookalike names or Location headers as router redirects', () => {
    expect(
      projectMeetSsr(
        { name: 'Redirect', headers: { Location: 'SECRET' } },
        'loader-model',
        'threw'
      ).kind
    ).toBe('other');
    expect(
      projectMeetSsr(
        new Response(null, { status: 307, headers: { Location: 'SECRET' } }),
        'loader-model',
        'threw'
      ).kind
    ).toBe('response-other');
  });
});

it('async rejection remains the same primary and returned response bodies stay unread', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const original = new Error('SECRET');
  await expect(
    observeMeetSsr('loader-import', async () => {
      throw original;
    })
  ).rejects.toBe(original);
  const response = new Response('SECRET');
  expect(await observeMeetSsr('handler', async () => response)).toBe(response);
  expect(response.bodyUsed).toBe(false);
  expect(await response.text()).toBe('SECRET');
});
it('throwing owning redirect inspection and parser getters cannot replace primary or escape', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const original = new Response(null, { status: 307 });
  Object.defineProperty(original, 'options', {
    get() {
      throw Error('SECRET');
    },
  });
  const record = projectMeetSsr(original, 'loader-model', 'threw');
  expect(record.kind).toBe('UNKNOWN');
  expect(record.inspection).toBe('unavailable');
  await expect(
    observeMeetSsr('loader-model', () => {
      throw original;
    })
  ).rejects.toBe(original);
  expect(
    parseMeetSsrRecord({
      get version() {
        throw Error('SECRET');
      },
    })
  ).toBeUndefined();
});
it('emission is bounded per instance with explicit overflow, not silent success', async () => {
  vi.resetModules();
  const { reportMeetSsr: freshReport } = await import('./ssr-diagnostics');
  const sink = vi.spyOn(console, 'error').mockImplementation(() => {});
  for (let i = 0; i < 70; i++) freshReport(null, 'handler', 'returnedother');
  expect(sink).toHaveBeenCalledTimes(65);
  expect(sink.mock.calls.at(-1)?.[0]).toBe(
    'meet-ssr-diagnostic {"version":1,"overflow":true}'
  );
});

it('R9 own and inherited options accessors are unavailable without invocation and retain primary identity', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  for (const inherited of [false, true]) {
    const getter = vi.fn(() => {
      throw Error('SECRET');
    });
    const original = new Response(null, { status: 307 });
    const target = inherited
      ? Object.create(Object.getPrototypeOf(original))
      : original;
    Object.defineProperty(target, 'options', { get: getter });
    if (inherited) Object.setPrototypeOf(original, target);
    const record = projectMeetSsr(original, 'loader-model', 'threw');
    expect(record.kind).toBe('UNKNOWN');
    expect(record.inspection).toBe('unavailable');
    await expect(
      observeMeetSsr('loader-model', () => {
        throw original;
      })
    ).rejects.toBe(original);
    expect(getter).not.toHaveBeenCalled();
  }
});

it('R9 beyond-bound prototype options remain unavailable without reading a later accessor', () => {
  const getter = vi.fn(() => {
    throw Error('SECRET');
  });
  const original = new Response(null, { status: 307 });
  const inherited = Object.create(Response.prototype);
  Object.defineProperty(inherited, 'options', { get: getter });
  Object.setPrototypeOf(
    original,
    Object.create(Object.create(Object.create(inherited)))
  );
  expect(projectMeetSsr(original, 'loader-model', 'threw').inspection).toBe(
    'unavailable'
  );
  expect(getter).not.toHaveBeenCalled();
});
it('R9 rejected-promise options accessors never run and late operation rejection stays observed', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const accessor = vi.fn(() => Promise.reject(new Error('UNOBSERVED')));
  const original = new Response(null, { status: 307 });
  Object.defineProperty(original, 'options', { get: accessor });
  expect(projectMeetSsr(original, 'loader-model', 'threw').inspection).toBe(
    'unavailable'
  );
  expect(accessor).not.toHaveBeenCalled();
  const unhandled = vi.fn();
  process.on('unhandledRejection', unhandled);
  try {
    let rejectOperation: (reason: unknown) => void = () => {
      throw Error('operation not acquired');
    };
    const operation = new Promise<never>((_, reject) => {
      rejectOperation = reject;
    });
    const observed = observeMeetSsr('loader-model', () => operation);
    const assertion = expect(observed).rejects.toBe(original);
    await Promise.resolve();
    rejectOperation(original);
    await assertion;
    await Promise.resolve();
    expect(unhandled).not.toHaveBeenCalled();
  } finally {
    process.off('unhandledRejection', unhandled);
  }
});
it('R9 predicate instanceof accessor is checked before invocation', () => {
  const previous = Object.getOwnPropertyDescriptor(
    Response,
    Symbol.hasInstance
  );
  const getter = vi.fn(() => {
    throw Error('SECRET');
  });
  let record: ReturnType<typeof projectMeetSsr> | undefined;
  try {
    Object.defineProperty(Response, Symbol.hasInstance, {
      configurable: true,
      get: getter,
    });
    record = projectMeetSsr({}, 'loader-model', 'threw');
  } finally {
    if (previous) Object.defineProperty(Response, Symbol.hasInstance, previous);
    else Reflect.deleteProperty(Response, Symbol.hasInstance);
  }
  expect(record?.kind).toBe('UNKNOWN');
  expect(record?.inspection).toBe('unavailable');
  expect(getter).not.toHaveBeenCalled();
});

it('real handler binds login/callback/other locally and records proxy/start before delegation and outcomes', async () => {
  const sink = vi.spyOn(console, 'error').mockImplementation(() => {});
  const records = () =>
    sink.mock.calls.map(([line]) =>
      JSON.parse(String(line).split('meet-ssr-diagnostic ')[1]!)
    );
  for (const [path, scope] of [
    ['/login?SECRET=value', 'login'],
    ['/vi/verify-token?SECRET=value', 'callback'],
    ['/unknown/SECRET', 'other'],
  ]) {
    sink.mockClear();
    const request = new NextRequest(`https://meet.invalid${path}`);
    const response = new Response(null, { status: 307 });
    ports.proxy.mockImplementation(
      async ({
        dispatch,
      }: {
        dispatch: (request: Request) => Promise<Response>;
      }) => {
        expect(records().at(-1)).toMatchObject({
          phase: 'handler',
          scope,
          stage: 'proxy',
          outcome: 'delegating',
        });
        return dispatch(request);
      }
    );
    ports.start.mockImplementation(() => {
      expect(records().at(-1)).toMatchObject({
        phase: 'handler',
        scope,
        stage: 'start',
        outcome: 'delegating',
      });
      return response;
    });
    expect(await handleMeetRequest(request, {}, { waitUntil() {} })).toBe(
      response
    );
    expect(records().map(({ stage, outcome }) => [stage, outcome])).toEqual([
      ['proxy', 'delegating'],
      ['start', 'delegating'],
      ['start', 'returnedredirect'],
      ['proxy', 'returnedredirect'],
    ]);
    expect(JSON.stringify(records())).not.toContain('SECRET');
  }
});
it('real handler retains exact proxy and Start throw identities with separate stage outcomes', async () => {
  const sink = vi.spyOn(console, 'error').mockImplementation(() => {});
  const original = new RangeError('SECRET');
  for (const failingStage of ['proxy', 'start']) {
    sink.mockClear();
    ports.proxy.mockImplementation(
      async ({
        dispatch,
      }: {
        dispatch: (request: Request) => Promise<Response>;
      }) => {
        if (failingStage === 'proxy') throw original;
        return dispatch(new NextRequest('https://meet.invalid/login'));
      }
    );
    ports.start.mockImplementation(() => {
      throw original;
    });
    await expect(
      handleMeetRequest(
        new Request('https://meet.invalid/login'),
        {},
        { waitUntil() {} }
      )
    ).rejects.toBe(original);
    const records = sink.mock.calls.map(([line]) =>
      JSON.parse(String(line).split('meet-ssr-diagnostic ')[1]!)
    );
    expect(
      records.some(
        (entry) =>
          entry.scope === 'login' &&
          entry.stage === failingStage &&
          entry.outcome === 'threw' &&
          entry.name === 'RangeError'
      )
    ).toBe(true);
    expect(JSON.stringify(records)).not.toContain('SECRET');
  }
});

it('scope is a closed canonical pathname classification, never query text or a raw path', () => {
  for (const prefix of ['', '/en', '/vi']) {
    expect(
      classifyMeetSsrRequest(
        new Request(`https://meet.invalid${prefix}/login?SECRET=value`)
      )
    ).toBe('login');
    expect(
      classifyMeetSsrRequest(
        new Request(`https://meet.invalid${prefix}/verify-token?SECRET=value`)
      )
    ).toBe('callback');
  }
  for (const path of [
    '/login/extra',
    '/LOGIN',
    '/en/verify-token/extra',
    '/other?next=/login',
    '/SECRET',
  ]) {
    expect(
      classifyMeetSsrRequest(new Request(`https://meet.invalid${path}`))
    ).toBe('other');
  }
});
it('concurrent real handler outcomes retain their own local scope and response identities', async () => {
  const sink = vi.spyOn(console, 'error').mockImplementation(() => {});
  const completions = new Map<string, (response: Response) => void>();
  let enteredResolve = () => {};
  const entered = new Promise<void>((resolve) => {
    enteredResolve = resolve;
  });
  ports.proxy.mockImplementation(
    ({
      request,
      dispatch,
    }: {
      request: Request;
      dispatch: (request: NextRequest) => Promise<Response>;
    }) => dispatch(new NextRequest(request))
  );
  ports.start.mockImplementation(
    (request: Request) =>
      new Promise<Response>((resolve) => {
        completions.set(new URL(request.url).pathname, resolve);
        if (completions.size === 2) enteredResolve();
      })
  );
  const loginResponse = new Response(null, { status: 200 });
  const callbackResponse = new Response(null, { status: 500 });
  const login = handleMeetRequest(
    new Request('https://meet.invalid/login'),
    {},
    { waitUntil() {} }
  );
  const callback = handleMeetRequest(
    new Request('https://meet.invalid/verify-token'),
    {},
    { waitUntil() {} }
  );
  await entered;
  completions.get('/verify-token')!(callbackResponse);
  expect(await callback).toBe(callbackResponse);
  completions.get('/login')!(loginResponse);
  expect(await login).toBe(loginResponse);
  const records = sink.mock.calls.map(([line]) =>
    JSON.parse(String(line).split('meet-ssr-diagnostic ')[1]!)
  );
  expect(
    records
      .filter(
        (record) => record.stage === 'start' && record.outcome !== 'delegating'
      )
      .map(({ scope, outcome }) => [scope, outcome])
  ).toEqual([
    ['callback', 'returned500'],
    ['login', 'returnedother'],
  ]);
});

it('R21 accepts only strict enum projection on the terminal handler/login/proxy record', async () => {
  const { createLoginRedirectProbe } = await import(
    './login-redirect-diagnostics'
  );
  const loginRedirect = createLoginRedirectProbe(
    'https://meet.invalid/login'
  ).seal(new Response(null), 'returnedother');
  const terminal = projectMeetSsr(
    new Response(null),
    'handler',
    'returnedother',
    {
      scope: 'login',
      stage: 'proxy',
      loginRedirect,
    }
  );
  expect(parseMeetSsrRecord(terminal)).toEqual(terminal);
  expect(
    new TextEncoder().encode(JSON.stringify(terminal)).byteLength
  ).toBeLessThan(2048);
  for (const delta of [
    { phase: 'loader-model', scope: 'UNKNOWN', stage: 'UNKNOWN' },
    { scope: 'callback' },
    { scope: 'other' },
    { stage: 'start' },
    { outcome: 'delegating' },
  ])
    expect(parseMeetSsrRecord({ ...terminal, ...delta })).toBeUndefined();
  for (const bad of [
    { ...loginRedirect, raw: 'SECRET' },
    { ...loginRedirect, navigationCalls: 'SECRET' },
    { ...loginRedirect, inspection: 'SECRET' },
    {
      ...loginRedirect,
      navigationInput: { origin: 'SAME', path: 'LOGIN', url: 'SECRET' },
    },
    ...[
      'navigationInput',
      'navigationResponse',
      'startResponse',
      'proxyResponse',
    ].map((key) => ({
      ...loginRedirect,
      [key]: { origin: 'https://SECRET', path: '/SECRET' },
    })),
  ])
    expect(
      parseMeetSsrRecord({ ...terminal, loginRedirect: bad })
    ).toBeUndefined();
  const legacy = projectMeetSsr(null, 'handler', 'returnedother');
  expect(legacy).not.toHaveProperty('loginRedirect');
  expect(parseMeetSsrRecord(legacy)).toEqual(legacy);
  expect(
    projectMeetSsr(null, 'handler', 'delegating', {
      scope: 'login',
      stage: 'proxy',
      loginRedirect,
    })
  ).not.toHaveProperty('loginRedirect');
});

it('R21 terminal hook failures preserve the exact primary result and the existing record', async () => {
  const sink = vi.spyOn(console, 'error').mockImplementation(() => {});
  const hook = vi.fn(() => {
    throw Error('SECRET');
  });
  const context = { scope: 'login', stage: 'proxy' } as const;
  const response = new Response('SECRET_BODY');
  expect(await observeMeetSsr('handler', () => response, context, hook)).toBe(
    response
  );
  expect(response.bodyUsed).toBe(false);
  const original = new Error('SECRET_PRIMARY');
  await expect(
    observeMeetSsr(
      'handler',
      () => {
        throw original;
      },
      context,
      hook
    )
  ).rejects.toBe(original);
  expect(hook).toHaveBeenCalledTimes(2);
  expect(sink).toHaveBeenCalledTimes(4);
  expect(sink.mock.calls.map(([line]) => String(line)).join('')).not.toContain(
    'SECRET'
  );
});
