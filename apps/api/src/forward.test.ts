import { expect, test } from 'bun:test';
import {
  CLOUDFLARE_ORIGIN_AUTH_HEADER,
  resolveClientIp,
} from '@tuturuuu/utils/abuse-protection/client-ip';
import { FORWARD_HOP } from './forward';
import { createApi } from './pipeline';
import { endpoints } from './routes';

const secret = 'synthetic-api-forward-origin-secret-at-least-32';
const execution = { waitUntil: (_promise: Promise<unknown>) => {} };
const request = (path: string, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  if (!headers.has('cf-connecting-ip'))
    headers.set('cf-connecting-ip', '203.0.113.42');
  return new Request(`https://tuturuuu.com${path}`, { ...init, headers });
};
test('retained origin forwards a write exactly once without redirects or body reserialization', async () => {
  let calls = 0;
  const fetcher = async (input: Request) => {
    calls++;
    const outgoing = input instanceof Request ? input : new Request(input);
    expect(outgoing.url).toBe(
      'https://retained-fixture.vercel.app/api/v1/workspaces/A/objects/one'
    );
    expect(outgoing.redirect).toBe('manual');
    expect(outgoing.headers.get(FORWARD_HOP)).toBe('1');
    expect(outgoing.headers.get('cf-connecting-ip')).toBeNull();
    expect(outgoing.headers.get(CLOUDFLARE_ORIGIN_AUTH_HEADER)).toMatch(
      /^hmac-v1;/
    );
    expect(
      resolveClientIp(outgoing.headers, {
        mode: 'cloudflare-origin',
        trustedHops: 1,
        originAuthSecret: secret,
      })
    ).toBe('203.0.113.42');
    expect(outgoing.headers.get('authorization')).toBe('Bearer fixture');
    expect(outgoing.headers.get('x-tuturuuu-actor')).toBeNull();
    expect(outgoing.headers.get('x-tuturuuu-verified-user')).toBeNull();
    expect(outgoing.headers.get('x-tuturuuu-workspace-id')).toBe('A');
    expect(outgoing.headers.get('x-tuturuuu-integrity-proof')).toBe(
      'synthetic-proof'
    );
    expect(outgoing.headers.get('x-tuturuuu-account-action')).toBe('1');
    expect(await outgoing.text()).toBe('{ "signed": true }');
    return new Response('accepted', {
      status: 202,
      headers: [
        ['set-cookie', 'first=1; Path=/'],
        ['set-cookie', 'second=2; Path=/'],
      ],
    });
  };
  const fetch = createApi({
    endpoints: [],
    retained: [{ path: '/api/v1/workspaces/{wsId}/objects/{objectId}' }],
    fetcher,
  });
  const result = await fetch(
    request('/api/v1/workspaces/A/objects/one', {
      method: 'POST',
      headers: {
        authorization: 'Bearer fixture',
        [CLOUDFLARE_ORIGIN_AUTH_HEADER]: 'forged-origin-assertion',
        'x-tuturuuu-actor': 'spoofed',
        'x-tuturuuu-verified-user': 'spoofed',
        'x-tuturuuu-workspace-id': 'A',
        'x-tuturuuu-integrity-proof': 'synthetic-proof',
        'x-tuturuuu-account-action': '1',
      },
      body: '{ "signed": true }',
    }),
    {
      RETAINED_API_ORIGIN: 'https://retained-fixture.vercel.app',
      TRUSTED_PROXY_ORIGIN_SECRET: secret,
    },
    execution
  );
  expect(result.status).toBe(202);
  expect(result.headers.getSetCookie()).toHaveLength(2);
  expect(calls).toBe(1);
  const loop = await fetch(
    request('/api/v1/workspaces/A/objects/one', {
      headers: { [FORWARD_HOP]: '1' },
    }),
    {
      RETAINED_API_ORIGIN: 'https://retained-fixture.vercel.app',
      TRUSTED_PROXY_ORIGIN_SECRET: secret,
    },
    execution
  );
  expect(loop.status).toBe(503);
  for (const origin of [
    'https://tuturuuu.com',
    'https://api.tuturuuu.com',
    'http://retained.example',
    'https://retained.example/path',
  ]) {
    expect(
      (
        await fetch(
          request('/api/v1/workspaces/A/objects/one'),
          { RETAINED_API_ORIGIN: origin },
          execution
        )
      ).status
    ).toBe(503);
  }
  expect(calls).toBe(1);
});

test('registration stays held until its operation ID is explicitly selected, and removing it rolls back', async () => {
  let forwards = 0;
  const run = createApi({
    endpoints,
    retained: [{ path: '/api/health' }],
    fetcher: async () => {
      forwards++;
      return new Response('retained', { status: 202 });
    },
  });
  const retainedEnv = {
    RETAINED_API_ORIGIN: 'https://retained-fixture.vercel.app',
    TRUSTED_PROXY_ORIGIN_SECRET: secret,
  };
  expect(
    (await run(request('/api/health'), retainedEnv, execution)).status
  ).toBe(202);
  expect(
    (
      await run(
        request('/api/health'),
        { ...retainedEnv, API_WORKER_OPERATIONS: 'getHealth' },
        execution
      )
    ).status
  ).toBe(200);
  expect(
    (
      await run(
        request('/api/health'),
        { ...retainedEnv, API_WORKER_OPERATIONS: '' },
        execution
      )
    ).status
  ).toBe(202);
  expect(forwards).toBe(2);
  expect(
    (
      await run(
        request('/api/health'),
        { ...retainedEnv, API_WORKER_OPERATIONS: 'typo' },
        execution
      )
    ).status
  ).toBe(503);
  expect(forwards).toBe(2);
});

test('retained method and preflight mismatches forward without invoking a native operation', async () => {
  let forwarded = 0;
  const run = createApi({
    endpoints,
    retained: [{ path: '/api/health' }],
    fetcher: async (outgoing) => {
      forwarded++;
      expect(
        resolveClientIp(outgoing.headers, {
          mode: 'cloudflare-origin',
          trustedHops: 1,
          originAuthSecret: secret,
        })
      ).toBe('203.0.113.42');
      return new Response('retained', { status: 202 });
    },
  });
  const env = {
    RETAINED_API_ORIGIN: 'https://retained-fixture.vercel.app',
    TRUSTED_PROXY_ORIGIN_SECRET: secret,
    API_WORKER_OPERATIONS: 'getHealth,getMobileVersion',
  };
  expect(
    (await run(request('/api/health', { method: 'POST' }), env, execution))
      .status
  ).toBe(202);
  expect(
    (
      await run(
        request('/api/health', {
          method: 'OPTIONS',
          headers: { 'access-control-request-method': 'POST' },
        }),
        env,
        execution
      )
    ).status
  ).toBe(202);
  expect((await run(request('/api/health'), env, execution)).status).toBe(200);
  expect(
    (
      await run(
        request('/api/v1/mobile/version', { method: 'POST' }),
        env,
        execution
      )
    ).status
  ).toBe(405);
  expect(forwarded).toBe(2);
});

test('forwarding refuses a missing/weak key or invalid Cloudflare client IP', async () => {
  let forwarded = 0;
  const run = createApi({
    endpoints: [],
    retained: [{ path: '/api/health' }],
    fetcher: async () => {
      forwarded++;
      return new Response('unexpected');
    },
  });
  const origin = { RETAINED_API_ORIGIN: 'https://retained-fixture.vercel.app' };
  for (const env of [
    origin,
    { ...origin, TRUSTED_PROXY_ORIGIN_SECRET: 'weak' },
  ]) {
    expect(
      (
        await run(
          request('/api/health', {
            headers: { [CLOUDFLARE_ORIGIN_AUTH_HEADER]: secret },
          }),
          env,
          execution
        )
      ).status
    ).toBe(503);
  }
  expect(
    (
      await run(
        request('/api/health', {
          headers: { 'cf-connecting-ip': 'not-an-ip' },
        }),
        { ...origin, TRUSTED_PROXY_ORIGIN_SECRET: secret },
        execution
      )
    ).status
  ).toBe(503);
  expect(forwarded).toBe(0);
});
