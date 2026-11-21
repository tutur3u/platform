import { createHmac, randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createAppSessionToken } from '@tuturuuu/auth/app-session-core';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { MastermindEnvironment, Owner } from './auth';
import { createDataClients, createOwnerMemo } from './clients';
import { mastermindRequest } from './request';

const now = Date.now();
const email = 'owner@example.invalid';
const secret = randomBytes(48).toString('hex');
let env: MastermindEnvironment;
const permissionFetch = vi.fn<typeof fetch>();
const otherFetch = vi.fn<typeof fetch>();
beforeEach(() => {
  env = {
    MASTERMIND_OWNER_EMAIL: email,
    OWNER_IDS: 'owner',
    TUTURUUU_APP_COORDINATION_SECRET: secret,
  };
  permissionFetch.mockReset();
  permissionFetch.mockImplementation(async () =>
    Response.json({ enabled: true })
  );
  otherFetch.mockReset();
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
    String(input) === 'https://tuturuuu.com/api/v1/mastermind/access'
      ? permissionFetch(input, init)
      : otherFetch(input, init)
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const seconds = (at: number) => Math.floor(at / 1000);
/** An MFA (aal2) proof as Web carries it into the app session. */
const mfaProof = (at = now, expiresAt?: number) => ({
  sessionId: 'web-session',
  verifiedAt: seconds(at) - 60,
  ...(expiresAt === undefined ? {} : { expiresAt }),
});
function session(
  options: {
    app?: string;
    ttl?: number;
    userId?: string;
    at?: number;
    mail?: string;
    mfa?: ReturnType<typeof mfaProof> | null;
  } = {}
) {
  const at = options.at ?? now;
  return createAppSessionToken(
    {
      targetApp: options.app ?? 'mastermind',
      userId: options.userId ?? 'owner',
      email: options.mail ?? email,
      expiresInSeconds: options.ttl ?? 300,
      ...(options.mfa === null ? {} : { mfa: options.mfa ?? mfaProof(at) }),
    },
    { secret, now: new Date(at - 1000) }
  ).token;
}
const owner = (extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${session()}`,
  ...extra,
});
const denied = [
  'no session',
  'forged Access headers only',
  'wrong email',
  'no MFA',
  'expired MFA',
  'MFA over a day old',
  'expired session',
  'preview host',
  'plaintext HTTP',
  'apex path',
  'workers.dev host',
  'no permission',
  'wrong app',
  'long session',
  'invalid signature',
  'missing config',
] as const;
test.each(denied)('auth matrix: %s -> 403 and zero reads', async (kind) => {
  let token = session({
    app: kind === 'wrong app' ? 'mail' : 'mastermind',
    ttl: kind === 'long session' ? 3600 : 300,
    mail: kind === 'wrong email' ? 'other@example.invalid' : email,
    mfa:
      kind === 'no MFA'
        ? null
        : kind === 'expired MFA'
          ? mfaProof(now, seconds(now) - 1)
          : kind === 'MFA over a day old'
            ? mfaProof(now - 24 * 60 * 60 * 1000)
            : undefined,
    at: kind === 'expired session' ? now - 600_000 : now,
  });
  if (kind === 'invalid signature')
    token = `${token.slice(0, -12)}AAAAAAAAAAAA`;
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  if (kind === 'no session' || kind === 'forged Access headers only')
    headers.delete('Authorization');
  if (kind === 'forged Access headers only') {
    // Access headers are never authority, valid-looking or not.
    headers.set('Cf-Access-Jwt-Assertion', 'eyJhbGciOiJSUzI1NiJ9.e30.sig');
    headers.set('Cf-Access-Authenticated-User-Email', email);
  }
  const host =
    kind === 'preview host'
      ? 'preview.mastermind.tuturuuu.com'
      : kind === 'workers.dev host'
        ? 'mastermind.account.workers.dev'
        : 'mastermind.tuturuuu.com';
  const protocol = kind === 'plaintext HTTP' ? 'http:' : 'https:';
  let reads = 0;
  const response = await mastermindRequest(
    new Request(
      kind === 'apex path'
        ? 'https://tuturuuu.com/mastermind'
        : `${protocol}//${host}/en`,
      { headers }
    ),
    {
      ...env,
      OWNER_IDS: kind === 'no permission' ? '' : env.OWNER_IDS,
      TUTURUUU_APP_COORDINATION_SECRET:
        kind === 'missing config' ? undefined : secret,
    },
    async () => {
      reads++;
      return new Response('private data');
    },
    now
  );
  expect(response.status).toBe(403);
  expect(reads).toBe(0);
  expect(permissionFetch).not.toHaveBeenCalled();
  expect(otherFetch).not.toHaveBeenCalled();
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
});
test('an owner session without MFA gets the MFA notice, not a login loop', async () => {
  const response = await mastermindRequest(
    new Request('https://mastermind.tuturuuu.com/en', {
      headers: {
        Authorization: `Bearer ${session({ mfa: null })}`,
        'Sec-Fetch-Mode': 'navigate',
      },
    }),
    env,
    () => new Response('private'),
    now
  );
  expect(response.status).toBe(403);
  expect(response.headers.get('Location')).toBeNull();
  expect(response.headers.getSetCookie()).toEqual([
    '__Host-mastermind_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
    '__Host-mastermind_refresh=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
  ]);
  expect(await response.text()).toMatch(/multi-factor authentication/);
});
test('an MFA proof without verifiedAt never admits the owner', async () => {
  // Web's signer refuses such a proof, so hand-sign a session that carries one.
  const [header, payload] = session().slice('ttr_app_'.length).split('.');
  const claims = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString());
  delete claims.mfa.verifiedAt;
  const content = `${header}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}`;
  const token = `ttr_app_${content}.${createHmac('sha256', secret).update(content).digest('base64url')}`;
  let reads = 0;
  const response = await mastermindRequest(
    new Request('https://mastermind.tuturuuu.com/en', {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
    () => {
      reads++;
      return new Response('private');
    },
    now
  );
  // Shared verification rejects the malformed proof, so no session exists.
  expect(response.status).toBe(403);
  expect(reads).toBe(0);
  expect(permissionFetch).not.toHaveBeenCalled();
});
test('valid owner -> 200; permission revocation is immediate even with warm memo', async () => {
  const request = new Request('https://mastermind.tuturuuu.com/vi', {
    headers: owner(),
  });
  let reads = 0;
  const memo = createOwnerMemo<string>(() => now);
  const render = async (_input: Request, owner: Owner) => {
    reads++;
    memo.set(owner, 'owner');
    return new Response(memo.get(owner));
  };
  const response = await mastermindRequest(request, env, render, now);
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Security-Policy')).toContain(
    "frame-ancestors 'none'"
  );
  expect(response.headers.get('Content-Security-Policy')).not.toContain(
    'unsafe-inline'
  );
  expect(response.headers.get('Strict-Transport-Security')).toContain(
    '31536000'
  );
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(
    (
      await mastermindRequest(
        request,
        { ...env, OWNER_IDS: '' },
        render,
        now + 59_999
      )
    ).status
  ).toBe(403);
  expect(reads).toBe(1);
});
test('memo expires at 60s, is per owner and per instance, and respects session expiry', () => {
  let clock = now;
  const memo = createOwnerMemo<string>(() => clock);
  const user: Owner = {
    id: 'owner',
    email,
    token: '',
    expiresAt: now + 300_000,
    mfa: true,
  };
  memo.set(user, 'data');
  expect(memo.get({ ...user, id: 'other' })).toBeUndefined();
  expect(createOwnerMemo().get(user)).toBeUndefined();
  clock = now + 59_999;
  expect(memo.get(user)).toBe('data');
  clock++;
  expect(memo.get(user)).toBeUndefined();
  memo.set({ ...user, expiresAt: clock + 1 }, 'short');
  clock++;
  expect(memo.get(user)).toBeUndefined();
});
test('org API client forwards only the user session and never follows redirects', async () => {
  const original = globalThis.fetch;
  let captured: Request | undefined;
  globalThis.fetch = async (input) => {
    captured = new Request(input);
    return new Response('{}');
  };
  try {
    await createDataClients(
      {},
      {
        id: 'owner',
        email,
        token: 'user-fixture',
        expiresAt: now + 1000,
        mfa: true,
      }
    ).orgLinks('root');
    expect(captured?.headers.get('Authorization')).toBe('Bearer user-fixture');
    expect(captured?.redirect).toBe('manual');
  } finally {
    globalThis.fetch = original;
  }
});
test('data clients refuse redirect responses without reading the target', async () => {
  const original = globalThis.fetch;
  const owner = {
    id: 'owner',
    email,
    token: 'user-fixture',
    expiresAt: now + 1000,
    mfa: true,
  };
  const redirected = () =>
    new Response(null, {
      status: 307,
      headers: { Location: 'https://attacker.invalid/' },
    });
  let captured: Request | undefined;
  globalThis.fetch = async (input) => {
    captured = new Request(input);
    return redirected();
  };
  try {
    await expect(createDataClients({}, owner).orgLinks('root')).rejects.toThrow(
      'Upstream redirect refused'
    );
    expect(captured?.redirect).toBe('manual');
    let hubRequest: Request | undefined;
    const hub = {
      fetch: async (input: Request) => {
        hubRequest = input;
        return redirected();
      },
    };
    await expect(
      createDataClients(
        { OPS_HUB: hub } as unknown as MastermindEnvironment,
        owner
      ).agentSnapshot()
    ).rejects.toThrow('Upstream redirect refused');
    expect(hubRequest?.redirect).toBe('manual');
  } finally {
    globalThis.fetch = original;
  }
});
test('app tree contains no privileged database key names', () => {
  const root = resolve(import.meta.dirname, '../..');
  const forbidden = new RegExp(
    ['SUPABASE', '(?:SERVICE[_-]?(?:ROLE|KEY)|SECRET[_-]?KEY)'].join('[_-]?'),
    'i'
  );
  function scan(path: string) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (['node_modules', 'dist', '.void', '.wrangler'].includes(entry.name))
        continue;
      const child = resolve(path, entry.name);
      if (entry.isDirectory()) scan(child);
      else expect(readFileSync(child, 'utf8')).not.toMatch(forbidden);
    }
  }
  scan(root);
});

test('live permission revocation denies the next request with unchanged env and warm memo', async () => {
  const request = new Request('https://mastermind.tuturuuu.com/en', {
    headers: owner(),
  });
  const memo = createOwnerMemo<string>(() => now);
  let reads = 0;
  const render = async (_request: Request, owner: Owner) => {
    reads++;
    memo.set(owner, 'private');
    return new Response(memo.get(owner));
  };
  expect((await mastermindRequest(request, env, render, now)).status).toBe(200);
  permissionFetch.mockImplementation(async () =>
    Response.json({ enabled: false })
  );
  expect((await mastermindRequest(request, env, render, now)).status).toBe(403);
  expect(reads).toBe(1);
  expect(permissionFetch).toHaveBeenCalledTimes(2);
  expect(permissionFetch).toHaveBeenLastCalledWith(
    'https://tuturuuu.com/api/v1/mastermind/access',
    expect.objectContaining({
      headers: { Authorization: expect.stringContaining('Bearer ttr_app_') },
      cache: 'no-store',
      redirect: 'manual',
      signal: expect.any(AbortSignal),
    })
  );
});

test.each(['error', 'timeout', 'unauthorized', 'malformed', 'wrong type'])(
  'live permission failure denies without rendering: %s',
  async (kind) => {
    permissionFetch.mockImplementation(async () => {
      if (kind === 'error') throw new Error('Offline');
      if (kind === 'timeout')
        throw new DOMException('Timed out', 'TimeoutError');
      if (kind === 'unauthorized') return new Response(null, { status: 401 });
      return Response.json(kind === 'malformed' ? {} : { enabled: 'true' });
    });
    const render = vi.fn(async () => new Response('private'));
    const request = new Request('https://mastermind.tuturuuu.com/en', {
      headers: owner(),
    });
    expect((await mastermindRequest(request, env, render, now)).status).toBe(
      403
    );
    expect(render).not.toHaveBeenCalled();
  }
);
test('only same-origin server-function POSTs pass the method gate', async () => {
  const base = owner();
  const attempt = async (
    path: string,
    method: string,
    extra: Record<string, string> = {}
  ) => {
    let reads = 0;
    const response = await mastermindRequest(
      new Request(`https://mastermind.tuturuuu.com${path}`, {
        method,
        headers: { ...base, ...extra },
      }),
      env,
      () => {
        reads++;
        return new Response('ok');
      },
      now,
      'bm9uY2U='
    );
    return {
      status: response.status,
      reads,
      csp: response.headers.get('Content-Security-Policy'),
    };
  };
  const same = {
    Origin: 'https://mastermind.tuturuuu.com',
    'Sec-Fetch-Site': 'same-origin',
  };
  const admitted = await attempt('/_serverFn/answer', 'POST', same);
  expect(admitted).toMatchObject({ status: 200, reads: 1 });
  expect(admitted.csp).toContain("'nonce-bm9uY2U='");
  for (const [path, method, headers] of [
    ['/en', 'POST', same],
    ['/_serverFn/answer', 'POST', {}],
    ['/_serverFn/answer', 'POST', { Origin: 'https://tuturuuu.com' }],
    ['/_serverFn/answer', 'POST', { ...same, 'Sec-Fetch-Site': 'same-site' }],
    ['/_serverFn/answer', 'PUT', same],
  ] as const) {
    expect(await attempt(path, method, headers)).toMatchObject({
      status: 405,
      reads: 0,
    });
  }
});
