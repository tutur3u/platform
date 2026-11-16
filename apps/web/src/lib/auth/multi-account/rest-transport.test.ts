import { type CookieOptions, stringToBase64URL } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { createClient, type Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAccountSwitchAuth } from '../../../../../../packages/supabase/src/next/account-switch-auth';
import {
  createDeviceCookieValue,
  encryptSession,
  hashDeviceSecret,
} from './crypto';
import { switchStoredAccount } from './switch-stored-account';

const state = vi.hoisted(() => ({
  cookies: new Array<{ name: string; value: string }>(),
  headers: new Headers(),
  transport: vi.fn<typeof fetch>(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => state.cookies,
    get: (name: string) => state.cookies.find((c) => c.name === name),
    set: (name: string, value: string, options: CookieOptions) => {
      const response = new NextResponse(null, { headers: state.headers });
      response.cookies.set(name, value, options);
      state.headers = response.headers;
    },
  }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () =>
    createClient('https://test.supabase.co', 'service-role-fixture', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (...args) => state.transport(...args) },
    }),
  createAccountSwitchAuth: (request: Request) =>
    createAccountSwitchAuth(request, (...args) => state.transport(...args)),
}));
const user = {
  id: '20000000-0000-0000-0000-000000000002',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'synthetic@example.com',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};
const device = {
  deviceId: '10000000-0000-0000-0000-000000000001',
  secret: 'synthetic-device-secret',
  activeUserId: null,
};
function jwt(exp: number) {
  return `${stringToBase64URL(JSON.stringify({ alg: 'HS256' }))}.${stringToBase64URL(JSON.stringify({ sub: user.id, exp }))}.c3ludGhldGlj`;
}
function session(exp: number): Session {
  return {
    access_token: jwt(exp),
    refresh_token: 'synthetic-refresh',
    expires_at: exp,
    expires_in: 3600,
    token_type: 'bearer',
    user,
  };
}
const observed = '2026-11-16T16:00:00.123456+00:00';
let deviceRow: Record<string, unknown>;
let targetRow: Record<string, unknown>;
let rejectTable = '';
let refreshes = 0;
let beforePatch = (_table: string) => {};
const patches: {
  table: string;
  params: URLSearchParams;
  body: Record<string, unknown>;
}[] = [];

beforeEach(() => {
  for (const key of [
    'PLATFORM_DATABASE_URL',
    'POSTGRES_URL',
    'DATABASE_URL',
    'DIRECT_URL',
  ])
    vi.stubEnv(key, undefined);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-key');
  vi.stubEnv('WEB_MULTI_ACCOUNT_SESSION_SECRET', 'synthetic-test-secret');
  state.headers = new Headers();
  state.cookies = [
    {
      name: '__Host-tuturuuu_web_account_device',
      value: createDeviceCookieValue(device.deviceId, device.secret),
    },
  ];
  deviceRow = {
    id: device.deviceId,
    active_user_id: null,
    last_seen_at: observed,
    revoked_at: null,
    secret_hash: hashDeviceSecret(device.secret),
  };
  targetRow = {
    device_id: device.deviceId,
    user_id: user.id,
    updated_at: observed,
    session_ciphertext: encryptSession(session(1)),
    last_route: '/personal',
    avatar_url: null,
    display_name: null,
  };
  rejectTable = '';
  refreshes = 0;
  patches.length = 0;
  beforePatch = () => {};
  state.transport.mockReset();
  state.transport.mockImplementation(async (input, init) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    );
    if (url.pathname.endsWith('/token')) {
      refreshes++;
      return Response.json(session(Math.floor(Date.now() / 1000) + 3600));
    }
    if (url.pathname.endsWith('/user')) return Response.json(user);
    const table = url.pathname.split('/').at(-1) ?? '';
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer service-role-fixture'
    );
    expect(
      new Headers(init?.headers).get(
        init?.method === 'PATCH' ? 'content-profile' : 'accept-profile'
      )
    ).toBe('private');
    const row = table === 'web_account_devices' ? deviceRow : targetRow;
    if (init?.method === 'PATCH') {
      beforePatch(table);
      const body: unknown = JSON.parse(String(init.body));
      if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new Error('Invalid fixture update');
      patches.push({ table, params: url.searchParams, body: { ...body } });
      const matches = Array.from(url.searchParams).every(
        ([key, value]) =>
          key === 'select' ||
          (value === 'is.null'
            ? row[key] === null
            : value === `eq.${String(row[key])}`)
      );
      if (table === rejectTable || !matches) return Response.json([]);
      Object.assign(row, body);
      return Response.json([row]);
    }
    return Response.json(row);
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function run() {
  const request = new Request(
    'https://tuturuuu.com/api/v1/auth/accounts/switch',
    {
      headers: {
        cookie: state.cookies.map((c) => `${c.name}=${c.value}`).join('; '),
      },
    }
  );
  return switchStoredAccount({
    request,
    device,
    accountId: user.id,
    payload: {},
    listAccounts: async () => ({ accounts: [], activeAccountId: user.id }),
    resolveIdentity: () => ({ avatar_url: null, display_name: null }),
    revokeTempAuth: async () => {},
  });
}
it.each(['web_account_sessions', 'web_account_devices'])(
  'failed %s CAS yields conflict and zero actual Set-Cookie headers',
  async (table) => {
    rejectTable = table;
    expect(await run()).toMatchObject({
      success: false,
      errorCode: 'switch_conflict',
    });
    expect(state.headers.getSetCookie()).toEqual([]);
    expect(refreshes).toBe(1);
    expect(
      state.transport.mock.calls.filter(
        ([, init]) =>
          init?.method === 'POST' &&
          !String(init?.body).includes('refresh_token')
      )
    ).toHaveLength(0);
  }
);
it('successful REST CAS matches the real schema, advances microsecond versions under a frozen clock, then installs cookies', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-16T16:00:00.123Z'));
  expect(await run()).toMatchObject({ success: true, accountId: user.id });
  expect(patches.map((p) => p.table)).toEqual([
    'web_account_sessions',
    'web_account_devices',
  ]);
  expect(patches[0]?.params.get('updated_at')).toBe(`eq.${observed}`);
  expect(patches[0]?.params.get('device_id')).toBe(`eq.${device.deviceId}`);
  expect(patches[0]?.params.get('user_id')).toBe(`eq.${user.id}`);
  expect(patches[1]?.params.get('last_seen_at')).toBe(`eq.${observed}`);
  expect(patches[1]?.params.get('active_user_id')).toBe('is.null');
  expect(patches[1]?.params.get('revoked_at')).toBe('is.null');
  expect(patches[1]?.params.get('secret_hash')).toBe(
    `eq.${hashDeviceSecret(device.secret)}`
  );
  expect(targetRow.updated_at).toBe('2026-11-16T16:00:00.124Z');
  expect(deviceRow.last_seen_at).toBe('2026-11-16T16:00:00.124Z');
  expect(state.headers.getSetCookie().length).toBeGreaterThan(0);
  const prior = deviceRow.last_seen_at;
  expect((await run()).success).toBe(true);
  expect(Date.parse(String(deviceRow.last_seen_at))).toBeGreaterThan(
    Date.parse(String(prior))
  );
});
it('revocation between REST updates leaves refreshed target stored and the browser untouched', async () => {
  beforePatch = (table) => {
    if (table === 'web_account_devices') deviceRow.revoked_at = observed;
  };
  expect(await run()).toMatchObject({
    success: false,
    errorCode: 'switch_conflict',
  });
  expect(targetRow.updated_at).not.toBe(observed);
  expect(state.headers.getSetCookie()).toEqual([]);
});
it('a tampered signed device cookie denies before REST or provider calls', async () => {
  state.cookies[0]!.value += 'tampered';
  expect((await run()).success).toBe(false);
  expect(state.transport).not.toHaveBeenCalled();
  expect(state.headers.getSetCookie()).toEqual([]);
});

it('same-clock concurrent switches to the already-active account admit only one', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-16T16:00:00.123Z'));
  deviceRow.active_user_id = user.id;
  let release = () => {};
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered = 0;
  const base = state.transport.getMockImplementation();
  if (!base) throw new Error('No fixture transport');
  state.transport.mockImplementation(async (input, init) => {
    if (
      String(input).includes('/web_account_sessions') &&
      init?.method !== 'PATCH'
    ) {
      const response = await base(input, init);
      if (++entered === 2) release();
      await barrier;
      return response;
    }
    return base(input, init);
  });
  const results = await Promise.all([run(), run()]);
  expect(results.filter((r) => r.success)).toHaveLength(1);
  expect(results.find((r) => !r.success)).toMatchObject({
    errorCode: 'switch_conflict',
  });
  expect(patches.filter((p) => p.table === 'web_account_devices')).toHaveLength(
    1
  );
  expect(deviceRow.last_seen_at).toBe('2026-11-16T16:00:00.124Z');
});
it.each(['active_user_id', 'secret_hash'])(
  'device CAS rejects changed %s with no cookies',
  async (field) => {
    beforePatch = (table) => {
      if (table === 'web_account_devices') deviceRow[field] = 'different';
    };
    expect(await run()).toMatchObject({
      success: false,
      errorCode: 'switch_conflict',
    });
    expect(state.headers.getSetCookie()).toEqual([]);
  }
);

it('denies target identity from another device before provider refresh', async () => {
  targetRow.device_id = '10000000-0000-0000-0000-000000000099';
  expect((await run()).success).toBe(false);
  expect(refreshes).toBe(0);
  expect(state.headers.getSetCookie()).toEqual([]);
});
