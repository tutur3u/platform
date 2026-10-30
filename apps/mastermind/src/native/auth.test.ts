import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createAppSessionToken } from '@tuturuuu/auth/app-session-core';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, expect, test } from 'vitest';
import type { MastermindEnvironment, Owner } from './auth';
import { createDataClients, createOwnerMemo } from './clients';
import { mastermindRequest } from './request';

const now = Date.now();
const email = 'owner@example.invalid';
const secret = randomBytes(48).toString('hex');
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let env: MastermindEnvironment;
beforeAll(async () => {
  keys = await generateKeyPair('RS256', { extractable: true });
  env = {
    CF_ACCESS_TEAM_DOMAIN: 'fixture.cloudflareaccess.com',
    CF_ACCESS_AUD: 'fixture',
    CF_ACCESS_CERTS: JSON.stringify({
      keys: [{ ...(await exportJWK(keys.publicKey)), kid: 'fixture' }],
    }),
    MASTERMIND_OWNER_EMAIL: email,
    OWNER_IDS: 'owner',
    TUTURUUU_APP_COORDINATION_SECRET: secret,
  };
});
async function access(
  options: { email?: string; exp?: number; aud?: string; iss?: string } = {}
) {
  return new SignJWT({ email: options.email ?? email })
    .setProtectedHeader({ alg: 'RS256', kid: 'fixture' })
    .setIssuer(options.iss ?? 'https://fixture.cloudflareaccess.com')
    .setAudience(options.aud ?? 'fixture')
    .setIssuedAt(Math.floor(now / 1000) - 1)
    .setExpirationTime(options.exp ?? Math.floor(now / 1000) + 120)
    .sign(keys.privateKey);
}
function session(app = 'mastermind', ttl = 300, userId = 'owner') {
  return createAppSessionToken(
    { targetApp: app, userId, email, expiresInSeconds: ttl },
    { secret, now: new Date(now - 1000) }
  ).token;
}
const denied = [
  'no Access header',
  'wrong email',
  'forged email header',
  'expired JWT',
  'preview host',
  'workers.dev host',
  'no session',
  'no permission',
  'wrong app',
  'long session',
  'wrong audience',
  'wrong issuer',
  'invalid signature',
  'missing config',
] as const;
test.each(denied)('auth matrix: %s -> 403 and zero reads', async (kind) => {
  let jwt = await access({
    email: kind === 'wrong email' ? 'other@example.invalid' : email,
    exp: kind === 'expired JWT' ? Math.floor(now / 1000) - 1 : undefined,
    aud: kind === 'wrong audience' ? 'other' : undefined,
    iss:
      kind === 'wrong issuer'
        ? 'https://other.cloudflareaccess.com'
        : undefined,
  });
  if (kind === 'invalid signature') jwt = jwt.slice(0, -12) + 'AAAAAAAAAAAA';
  const headers = new Headers({
    'Cf-Access-Jwt-Assertion': jwt,
    cookie: `tuturuuu_app_session=${session(kind === 'wrong app' ? 'mail' : 'mastermind', kind === 'long session' ? 3600 : 300)}`,
  });
  if (kind === 'no Access header' || kind === 'forged email header')
    headers.delete('Cf-Access-Jwt-Assertion');
  if (kind === 'forged email header')
    headers.set('Cf-Access-Authenticated-User-Email', email);
  if (kind === 'no session') headers.delete('cookie');
  const host =
    kind === 'preview host'
      ? 'preview.mastermind.tuturuuu.com'
      : kind === 'workers.dev host'
        ? 'mastermind.account.workers.dev'
        : 'mastermind.tuturuuu.com';
  let reads = 0;
  const response = await mastermindRequest(
    new Request(`https://${host}/en`, { headers }),
    {
      ...env,
      OWNER_IDS: kind === 'no permission' ? '' : env.OWNER_IDS,
      CF_ACCESS_CERTS:
        kind === 'missing config' ? undefined : env.CF_ACCESS_CERTS,
    },
    async () => {
      reads++;
      return new Response('private data');
    },
    now
  );
  expect(response.status).toBe(403);
  expect(reads).toBe(0);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
});
test('valid owner -> 200; permission revocation is immediate even with warm memo', async () => {
  const headers = {
    'Cf-Access-Jwt-Assertion': await access(),
    Authorization: `Bearer ${session()}`,
  };
  const request = new Request('https://mastermind.tuturuuu.com/vi', {
    headers,
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
  const owner: Owner = {
    id: 'owner',
    email,
    token: '',
    expiresAt: now + 300_000,
  };
  memo.set(owner, 'data');
  expect(memo.get({ ...owner, id: 'other' })).toBeUndefined();
  expect(createOwnerMemo().get(owner)).toBeUndefined();
  clock = now + 59_999;
  expect(memo.get(owner)).toBe('data');
  clock++;
  expect(memo.get(owner)).toBeUndefined();
  memo.set({ ...owner, expiresAt: clock + 1 }, 'short');
  clock++;
  expect(memo.get(owner)).toBeUndefined();
});
test('org API client forwards only the user session and refuses redirects', async () => {
  const original = globalThis.fetch;
  let captured: Request | undefined;
  globalThis.fetch = async (input) => {
    captured = new Request(input);
    return new Response('{}');
  };
  try {
    await createDataClients(
      {},
      { id: 'owner', email, token: 'user-fixture', expiresAt: now + 1000 }
    ).orgLinks('root');
    expect(captured?.headers.get('Authorization')).toBe('Bearer user-fixture');
    expect(captured?.redirect).toBe('error');
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
