import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createAppSessionToken,
  createAppSessionTokenPair,
} from '@tuturuuu/auth/app-session-core';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
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
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let env: MastermindEnvironment;
let team = 0;
const rootFetch = vi.fn<typeof fetch>();
const grantFetch = vi.fn<typeof fetch>();
const web = vi.fn<typeof fetch>();

beforeAll(async () => {
  keys = await generateKeyPair('RS256', { extractable: true });
});
beforeEach(() => {
  env = {
    CF_ACCESS_TEAM_DOMAIN: `fleet-${++team}.cloudflareaccess.com`,
    CF_ACCESS_AUD: 'fixture',
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
      if (url.endsWith('/cdn-cgi/access/certs'))
        return Response.json({
          keys: [{ ...(await exportJWK(keys.publicKey)), kid: 'k' }],
        });
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

const access = (email: string) =>
  new SignJWT({ email })
    .setProtectedHeader({ alg: 'RS256', kid: 'k' })
    .setIssuer(`https://${env.CF_ACCESS_TEAM_DOMAIN}`)
    .setAudience('fixture')
    .setIssuedAt(Math.floor(now / 1000) - 1)
    .setExpirationTime(Math.floor(now / 1000) + 120)
    .sign(keys.privateKey);

const session = (user: { id: string; email: string }) =>
  createAppSessionToken(
    {
      targetApp: 'mastermind',
      userId: user.id,
      email: user.email,
      expiresInSeconds: 300,
    },
    { secret, now: new Date(now - 1000) }
  ).token;

async function call(
  path: string,
  {
    method = 'GET',
    as = grantee,
    accessEmail = as.email,
    headers = {},
  }: {
    method?: string;
    as?: { id: string; email: string };
    accessEmail?: string;
    headers?: Record<string, string>;
  } = {}
) {
  const roles: Admitted['role'][] = [];
  const response = await mastermindRequest(
    new Request(`${host}${path}`, {
      method,
      headers: {
        'Cf-Access-Jwt-Assertion': await access(accessEmail),
        cookie: `tuturuuu_app_session=${session(as)}`,
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
    '/en/fleet-access',
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
  ['/en', 'GET'],
  ['/vi', 'GET'],
  ['/en/fleet-access/extra', 'GET'],
  ['/fr/fleet-access', 'GET'],
  ['/en/settings', 'GET'],
  ['/login-ish', 'GET'],
  ['/_serverFn/answer', 'POST'],
  ['/_serverFn/0f3a9c', 'GET'],
  ['/_serverFn/fleet-access.loadFleet', 'GET'],
  ['/_serverFn/fleet-access.fleetDigestFn/extra', 'GET'],
  ['/en/fleet-access', 'POST'],
  ['/assets/../en', 'GET'],
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
  expect((await call('/en/fleet-access')).status).toBe(200);
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

test('the session must belong to the verified Access identity', async () => {
  const other = { id: 'other', email: 'other@example.invalid' };
  for (const attempt of [
    { as: other, accessEmail: grantee.email },
    { as: grantee, accessEmail: other.email },
    { as: owner, accessEmail: grantee.email },
    { as: grantee, accessEmail: owner.email },
  ]) {
    expect(await call('/en/fleet-access', attempt)).toMatchObject({
      status: 403,
      roles: [],
    });
  }
  expect(grantFetch).not.toHaveBeenCalled();
});

test('an owner id under another email stays Fleet-only', async () => {
  env.OWNER_IDS = `${owner.id},${grantee.id}`;
  expect((await call('/en')).status).toBe(403);
  expect(await call('/en/fleet-access')).toMatchObject({
    status: 200,
    roles: ['fleet'],
  });
  expect(rootFetch).not.toHaveBeenCalled();
});

test('the owner is unchanged and never falls back to a Fleet grant', async () => {
  for (const path of ['/en', '/en/fleet-access', '/_serverFn/answer']) {
    expect(await call(path, { as: owner })).toMatchObject({
      status: 200,
      roles: ['owner'],
    });
  }
  expect(grantFetch).not.toHaveBeenCalled();
  rootFetch.mockImplementation(async () => Response.json({ enabled: false }));
  expect(await call('/en/fleet-access', { as: owner })).toMatchObject({
    status: 403,
    roles: [],
  });
  expect(grantFetch).not.toHaveBeenCalled();
});

test('a grantee context has a Fleet actor and no owner identity', () => {
  const user = { ...grantee, token: 't', expiresAt: now + 1000 };
  const request = new Request(`${host}/en/fleet-access`);
  withOwner(request, { ...user, role: 'fleet' }, () => {
    expect(currentFleetActor().id).toBe(grantee.id);
    expect(() => currentOwner()).toThrow('Missing authenticated owner');
  });
  withOwner(request, { ...user, id: owner.id, role: 'owner' }, () => {
    expect(currentOwner().id).toBe(owner.id);
    expect(currentFleetActor().id).toBe(owner.id);
  });
});

test('only the Fleet API module gets readable server-function IDs', () => {
  const file = '/build/apps/mastermind/src/fleet-access/api.ts';
  expect(
    fleetServerFunctionId({ filename: file, functionName: 'fleetDigestFn' })
  ).toBe('fleet-access.fleetDigestFn');
  for (const [filename, functionName] of [
    [file, 'loadFleet'],
    ['/build/apps/mastermind/src/fleet/server.ts', 'fleetDigestFn'],
    ['/build/apps/mastermind/src/fleet-access/api.ts.bak', 'fleetDigestFn'],
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
  expect(await exchangeHandoff('t', env, grantee.email, now)).toMatchObject({
    userId: grantee.id,
  });
  grantFetch.mockImplementationOnce(async () => live(false));
  web.mockResolvedValueOnce(Response.json(pair(grantee)));
  expect(await exchangeHandoff('t', env, grantee.email, now)).toBeNull();

  const refreshing = (user: { id: string; email: string }) =>
    new Request(`${host}/en/fleet-access`, {
      headers: {
        cookie: `tuturuuu_app_session_refresh=${pair(user).appSessionRefreshToken}`,
      },
    });
  web.mockClear();
  const other = { id: 'other', email: 'other@example.invalid' };
  expect(
    await refreshSession(refreshing(other), env, grantee.email, now)
  ).toBeNull();
  expect(web).not.toHaveBeenCalled();
  web.mockResolvedValueOnce(Response.json(pair(grantee)));
  expect(
    await refreshSession(refreshing(grantee), env, grantee.email, now)
  ).toMatchObject({ userId: grantee.id });
});
