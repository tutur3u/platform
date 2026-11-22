import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createAppSessionToken,
  createAppSessionTokenPair,
} from '@tuturuuu/auth/app-session-core';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Admitted, MastermindEnvironment } from './auth';
import { currentFleetActor, currentOwner, withOwner } from './context';
import {
  FLEET_SERVER_FUNCTIONS,
  fleetServerFunctionId,
} from './fleet-admission';
import { mastermindRequest } from './request';
import { exchangeHandoff, refreshSession } from './session';

const now = Date.now();
const owner = { id: 'owner', email: 'owner@example.invalid' };
const grantee = { id: 'grantee', email: 'ops@example.invalid' };
const secret = randomBytes(48).toString('hex');
const host = 'https://mastermind.tuturuuu.com';
const VERIFIER = 'v'.repeat(43);
let env: MastermindEnvironment;
const rootFetch = vi.fn<typeof fetch>();
const grantFetch = vi.fn<typeof fetch>();
const web = vi.fn<typeof fetch>();

beforeEach(() => {
  env = {
    MASTERMIND_OWNER_EMAIL: owner.email,
    OWNER_IDS: owner.id,
    TUTURUUU_APP_COORDINATION_SECRET: secret,
  };
  for (const mock of [rootFetch, grantFetch, web]) mock.mockReset();
  rootFetch.mockImplementation(async () => Response.json({ enabled: true }));
  grantFetch.mockImplementation(async () => live());
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === 'https://tuturuuu.com/api/v1/mastermind/access')
        return rootFetch(input, init);
      if (url === 'https://tuturuuu.com/api/v1/fleet/access')
        return grantFetch(input, init);
      return web(input, init);
    }
  );
});
afterEach(() => vi.unstubAllGlobals());

const live = (enabled = true, stopped = false) =>
  Response.json(
    enabled
      ? {
          enabled,
          tier: 'observer',
          projects: ['web'],
          capabilities: ['status.read'],
          stopped,
        }
      : { enabled, tier: null, projects: [], capabilities: [], stopped }
  );

/** An MFA (aal2) proof as Web carries it into the app session. */
const mfa = {
  sessionId: 'web-session',
  verifiedAt: Math.floor(now / 1000) - 60,
};

const session = (user: { id: string; email: string }) =>
  createAppSessionToken(
    {
      targetApp: 'mastermind',
      userId: user.id,
      email: user.email,
      expiresInSeconds: 300,
      mfa,
    },
    { secret, now: new Date(now - 1000) }
  ).token;

async function call(
  path: string,
  {
    method = 'GET',
    as = grantee,
    headers = {},
  }: {
    method?: string;
    as?: { id: string; email: string };
    headers?: Record<string, string>;
  } = {}
) {
  const roles: Admitted['role'][] = [];
  const response = await mastermindRequest(
    new Request(`${host}${path}`, {
      method,
      headers: {
        cookie: `__Host-mastermind_session=${session(as)}`,
        ...headers,
      },
    }),
    env,
    (_request, admitted) => {
      roles.push(admitted.role);
      return new Response('rendered');
    },
    now
  );
  return { status: response.status, roles, response };
}

const sameOrigin = { Origin: host, 'Sec-Fetch-Site': 'same-origin' };

test('a live grantee reaches the Fleet page, assets and Fleet server functions', async () => {
  for (const path of [
    '/fleet-access',
    '/vi/fleet-access?tab=requests',
    '/assets/index-abc123.js',
    '/_serverFn/fleet-access.fleetDigestFn?payload=x',
  ]) {
    expect(await call(path)).toMatchObject({ status: 200, roles: ['fleet'] });
  }
  expect(
    await call('/_serverFn/fleet-access.submitFleetIntentFn', {
      method: 'POST',
      headers: sameOrigin,
    })
  ).toMatchObject({ status: 200, roles: ['fleet'] });
  expect(grantFetch).toHaveBeenCalledTimes(5);
  expect(grantFetch).toHaveBeenLastCalledWith(
    'https://tuturuuu.com/api/v1/fleet/access',
    expect.objectContaining({
      headers: { Authorization: expect.stringContaining('Bearer ttr_app_') },
      cache: 'no-store',
      redirect: 'manual',
    })
  );
  expect(rootFetch).not.toHaveBeenCalled();
});

const ownerRoutes = [
  ['/', 'GET'],
  ['/', 'GET'],
  ['/vi', 'GET'],
  ['/fleet-access/extra', 'GET'],
  ['/fr/fleet-access', 'GET'],
  ['/settings', 'GET'],
  ['/login-ish', 'GET'],
  ['/_serverFn/answer', 'POST'],
  ['/_serverFn/0f3a9c', 'GET'],
  ['/_serverFn/fleet-access.loadFleet', 'GET'],
  ['/_serverFn/fleet-access.fleetDigestFn/extra', 'GET'],
  ['/fleet-access', 'POST'],
  ['/assets/../ship', 'GET'],
] as const;
test.each(ownerRoutes)(
  'a grantee gets 403 on owner route %s %s with no session or data work',
  async (path, method) => {
    const result = await call(path, {
      method,
      headers: { ...sameOrigin, 'Sec-Fetch-Mode': 'navigate' },
    });
    expect(result.status).toBe(403);
    expect(result.roles).toEqual([]);
    expect(result.response.headers.get('Location')).toBeNull();
    expect(rootFetch).not.toHaveBeenCalled();
    expect(web).not.toHaveBeenCalled();
  }
);

test('a revoked, stopped or unverifiable grant denies the next request', async () => {
  expect((await call('/fleet-access')).status).toBe(200);
  for (const answer of [
    async () => live(false),
    async () => live(true, true),
    async () => new Response(null, { status: 403 }),
    async () =>
      new Response(null, {
        status: 302,
        headers: { Location: 'https://evil.invalid' },
      }),
    async () => Response.json({ enabled: 'true', stopped: false }),
    async () => {
      throw new Error('offline');
    },
  ]) {
    grantFetch.mockImplementationOnce(answer);
    expect(await call('/_serverFn/fleet-access.fleetDigestFn')).toMatchObject({
      status: 403,
      roles: [],
    });
  }
});

test('forged Access headers are ignored: the session alone is the identity', async () => {
  const forged = {
    'Cf-Access-Jwt-Assertion': ['eyJhbGciOiJSUzI1NiJ9', 'e30', 'sig'].join('.'),
    'Cf-Access-Authenticated-User-Email': owner.email,
  };
  for (const path of ['/', '/_serverFn/answer']) {
    expect(
      await call(path, { headers: { ...forged, ...sameOrigin } })
    ).toMatchObject({ status: 403, roles: [] });
  }
  expect(await call('/fleet-access', { headers: forged })).toMatchObject({
    status: 200,
    roles: ['fleet'],
  });
  expect(rootFetch).not.toHaveBeenCalled();
  const anonymous = await mastermindRequest(
    new Request(`${host}/ship`, { headers: forged }),
    env,
    () => new Response('rendered'),
    now
  );
  expect(anonymous.status).toBe(403);
  expect(grantFetch).toHaveBeenCalledTimes(1);
});

test('an owner id under another email is never a grantee', async () => {
  env.OWNER_IDS = `${owner.id},${grantee.id}`;
  for (const path of ['/', '/fleet-access']) {
    expect(await call(path)).toMatchObject({ status: 403, roles: [] });
  }
  expect(rootFetch).not.toHaveBeenCalled();
  expect(grantFetch).not.toHaveBeenCalled();
});

/** `GET /api/v1/fleet/access` for the configured Owner: no grant row. */
const ownerAnswer = () =>
  Response.json({
    enabled: true,
    tier: 'owner',
    projects: ['web'],
    capabilities: ['status.read', 'ask', 'access.grant', 'fleet.stop'],
    stopped: false,
  });

test('the Owner tier never admits the grantee path', async () => {
  grantFetch.mockImplementation(async () => ownerAnswer());
  expect(await call('/fleet-access')).toMatchObject({
    status: 403,
    roles: [],
  });
  web.mockResolvedValueOnce(Response.json(pair(grantee)));
  expect(await exchangeHandoff('t', VERIFIER, env, now)).toBeNull();
  web.mockResolvedValueOnce(Response.json(pair(grantee)));
  expect(
    await refreshSession(
      new Request(`${host}/fleet-access`, {
        headers: {
          cookie: `__Host-mastermind_refresh=${pair(grantee).appSessionRefreshToken}`,
        },
      }),
      env,
      now
    )
  ).toBeNull();
});

test('an owner id cannot get a session under another email', async () => {
  env.OWNER_IDS = `${owner.id},${grantee.id}`;
  web.mockResolvedValueOnce(Response.json(pair(grantee)));
  expect(await exchangeHandoff('t', VERIFIER, env, now)).toBeNull();
  expect(grantFetch).not.toHaveBeenCalled();
  expect(
    await refreshSession(
      new Request(`${host}/fleet-access`, {
        headers: {
          cookie: `__Host-mastermind_refresh=${pair(grantee).appSessionRefreshToken}`,
        },
      }),
      env,
      now
    )
  ).toBeNull();
  expect(web).toHaveBeenCalledTimes(1);
});

test('a grantee login and callback return only to the Fleet page', async () => {
  const returnOf = async (path: string, as = grantee) => {
    const response = await mastermindRequest(
      new Request(`${host}${path}`, {
        headers: { cookie: `__Host-mastermind_session=${session(as)}` },
      }),
      env,
      () => new Response('unreachable'),
      now
    );
    const location = response.headers.get('Location') ?? '';
    if (!location.startsWith('https://tuturuuu.com/login')) return location;
    const next = new URL(
      new URL(
        new URL(location).searchParams.get('returnUrl') ?? ''
      ).searchParams.get('nextUrl') ?? '',
      host
    );
    next.searchParams.delete('mm_state');
    return `${next.pathname}${next.search}`;
  };
  expect(await returnOf('/login?nextUrl=%2F')).toBe('/fleet-access');
  expect(await returnOf('/login?nextUrl=%2F_serverFn%2Fanswer')).toBe(
    '/fleet-access'
  );
  expect(
    await returnOf('/login?nextUrl=%2Fvi%2Ffleet-access%3Ftab%3Dlink')
  ).toBe('/vi/fleet-access?tab=link');
  expect(await returnOf('/login')).toBe('/fleet-access');
  expect(await returnOf('/login?nextUrl=%2Fvi', owner)).toBe('/vi');

  web.mockResolvedValueOnce(Response.json(pair(grantee)));
  const callback = await mastermindRequest(
    new Request(
      `${host}/verify-token?token=${'b'.repeat(64)}&nextUrl=${encodeURIComponent(`/?mm_state=${'s'.repeat(22)}`)}`,
      {
        headers: {
          cookie: `__Host-mastermind_login_state=${'s'.repeat(22)}.${VERIFIER}`,
        },
      }
    ),
    env,
    () => new Response('unreachable'),
    now
  );
  expect(callback.headers.get('Location')).toBe('/fleet-access');
});

test('a grantee may use only GET for the page and assets', async () => {
  for (const [path, method] of [
    ['/fleet-access', 'HEAD'],
    ['/assets/index.js', 'HEAD'],
    ['/assets/index.js', 'POST'],
    ['/_serverFn/fleet-access.fleetDigestFn', 'PUT'],
    ['/_serverFn/fleet-access.fleetDigestFn', 'HEAD'],
  ] as const) {
    expect(await call(path, { method, headers: sameOrigin })).toMatchObject({
      status: 403,
      roles: [],
    });
  }
  expect(grantFetch).not.toHaveBeenCalled();
});

test('the owner is unchanged and never falls back to a Fleet grant', async () => {
  for (const path of ['/', '/fleet-access', '/_serverFn/answer']) {
    expect(await call(path, { as: owner })).toMatchObject({
      status: 200,
      roles: ['owner'],
    });
  }
  expect(grantFetch).not.toHaveBeenCalled();
  rootFetch.mockImplementation(async () => Response.json({ enabled: false }));
  expect(await call('/fleet-access', { as: owner })).toMatchObject({
    status: 403,
    roles: [],
  });
  expect(grantFetch).not.toHaveBeenCalled();
});

test('a grantee context has a Fleet actor and no owner identity', () => {
  const user = { ...grantee, token: 't', expiresAt: now + 1000, mfa: true };
  const request = new Request(`${host}/fleet-access`);
  withOwner(request, { ...user, role: 'fleet' }, () => {
    expect(currentFleetActor().id).toBe(grantee.id);
    expect(() => currentOwner()).toThrow('Missing authenticated owner');
  });
  withOwner(request, { ...user, id: owner.id, role: 'owner' }, () => {
    expect(currentOwner().id).toBe(owner.id);
    expect(currentFleetActor().id).toBe(owner.id);
  });
});

// The compiler passes a root-relative filename and `<name>_createServerFn_handler`.
test('only the Fleet API module gets readable server-function IDs', () => {
  const file = 'src/fleet-access/api.ts';
  const handler = (name: string) => `${name}_createServerFn_handler`;
  for (const name of FLEET_SERVER_FUNCTIONS) {
    expect(
      fleetServerFunctionId({ filename: file, functionName: handler(name) })
    ).toBe(`fleet-access.${name}`);
  }
  expect(
    fleetServerFunctionId({
      filename: 'src\\fleet-access\\api.ts',
      functionName: handler('fleetDigestFn'),
    })
  ).toBe('fleet-access.fleetDigestFn');
  for (const [filename, functionName] of [
    [file, handler('loadFleet')],
    [file, 'fleetDigestFn'],
    [file, handler('fleetDigestFn_1')],
    ['src/fleet/server.ts', handler('fleetDigestFn')],
    ['apps/mastermind/src/fleet-access/api.ts', handler('fleetDigestFn')],
    ['src/fleet-access/api.ts.bak', handler('fleetDigestFn')],
  ] as const) {
    expect(fleetServerFunctionId({ filename, functionName })).toBeUndefined();
  }
  const source = readFileSync(
    resolve(import.meta.dirname, '../fleet-access/api.ts'),
    'utf8'
  );
  const exported = [...source.matchAll(/export const (\w+) = createServerFn/g)]
    .map((match) => match[1])
    .sort();
  expect(exported).toEqual([...FLEET_SERVER_FUNCTIONS].sort());
});

const pair = (user: { id: string; email: string }) => {
  const tokens = createAppSessionTokenPair(
    { targetApp: 'mastermind', userId: user.id, email: user.email },
    { secret, now: new Date(now - 1000) }
  );
  return {
    valid: true,
    userId: user.id,
    appSessionToken: tokens.access.token,
    appSessionExpiresAt: tokens.access.expiresAt,
    appSessionRefreshToken: tokens.refresh.token,
    appSessionRefreshExpiresAt: tokens.refresh.expiresAt,
  };
};

test('a grantee session is issued and rotated only with a live grant', async () => {
  web.mockResolvedValueOnce(Response.json(pair(grantee)));
  expect(await exchangeHandoff('t', VERIFIER, env, now)).toMatchObject({
    userId: grantee.id,
  });
  grantFetch.mockImplementationOnce(async () => live(false));
  web.mockResolvedValueOnce(Response.json(pair(grantee)));
  expect(await exchangeHandoff('t', VERIFIER, env, now)).toBeNull();

  const refreshing = (user: { id: string; email: string }) =>
    new Request(`${host}/fleet-access`, {
      headers: {
        cookie: `__Host-mastermind_refresh=${pair(user).appSessionRefreshToken}`,
      },
    });
  web.mockClear();
  const other = { id: 'other', email: 'other@example.invalid' };
  // Renewing one subject never yields a session for another.
  web.mockResolvedValueOnce(Response.json(pair(grantee)));
  expect(await refreshSession(refreshing(other), env, now)).toBeNull();
  // A revoked grant ends the next refresh.
  grantFetch.mockImplementationOnce(async () => live(false));
  web.mockResolvedValueOnce(Response.json(pair(grantee)));
  expect(await refreshSession(refreshing(grantee), env, now)).toBeNull();
  web.mockResolvedValueOnce(Response.json(pair(grantee)));
  expect(await refreshSession(refreshing(grantee), env, now)).toMatchObject({
    userId: grantee.id,
  });
});
