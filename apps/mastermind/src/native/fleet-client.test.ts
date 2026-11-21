import { readFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';
import { fleetResponseFixture } from '../fleet/fleet-fixture';
import type { Owner } from './auth';
import { createFleetClient } from './clients';
import { contentSecurityPolicy } from './request';

const owner: Owner = {
  id: 'owner',
  email: 'o@example.invalid',
  token: 'session-token',
  expiresAt: Date.now() + 60_000,
  mfa: true,
};

test('fleet reads send only the owner bearer and the login and review features, and validate the body', async () => {
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json(fleetResponseFixture(Date.now()))
  );
  const read = await createFleetClient(owner, fetcher).state();
  expect(read.kind).toBe('ready');
  const request = fetcher.mock.calls[0]?.[0] as Request;
  expect(request.url).toBe(
    'https://tuturuuu.com/api/v1/mastermind/fleet/state'
  );
  expect(request.headers.get('Authorization')).toBe('Bearer session-token');
  expect(request.headers.get('x-mastermind-fleet-features')).toBe(
    'login,review'
  );
  expect(request.redirect).toBe('manual');
  expect([...request.headers.keys()].sort()).toEqual([
    'authorization',
    'x-mastermind-fleet-features',
  ]);
});

test('fleet reads map 404, refusals, redirects and invalid bodies to typed states', async () => {
  const cases: [Response, unknown][] = [
    [new Response(null, { status: 404 }), { kind: 'unpublished' }],
    [new Response(null, { status: 403 }), { kind: 'error', reason: 'denied' }],
    [
      new Response(null, {
        status: 302,
        headers: { Location: 'https://evil.invalid' },
      }),
      { kind: 'error', reason: 'unavailable' },
    ],
    [
      Response.json({ state: { version: 2 } }),
      { kind: 'error', reason: 'invalid' },
    ],
  ];
  for (const [response, expected] of cases) {
    const read = await createFleetClient(owner, async () => response).state();
    expect(read).toEqual(expected);
  }
});

test('answers post with the idempotency key header and never echo the reply', async () => {
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json(
      {
        action: 'reply',
        revision: 1,
        answeredAt: new Date().toISOString(),
        pickedUp: false,
      },
      { status: 202 }
    )
  );
  const idempotencyKey = crypto.randomUUID();
  const write = await createFleetClient(owner, fetcher).answer({
    decisionId: 'roll-back',
    action: 'reply',
    text: 'Wait for the fix',
    idempotencyKey,
  });
  expect(write).toMatchObject({ kind: 'sent', receipt: { revision: 1 } });
  const request = fetcher.mock.calls[0]?.[0] as Request;
  expect(request.method).toBe('POST');
  expect(request.url).toBe(
    'https://tuturuuu.com/api/v1/mastermind/fleet/decisions/roll-back/answer'
  );
  expect(request.headers.get('Idempotency-Key')).toBe(idempotencyKey);
  expect(await request.json()).toEqual({
    action: 'reply',
    text: 'Wait for the fix',
  });
  const closed = await createFleetClient(
    owner,
    async () => new Response(null, { status: 409 })
  ).answer({
    decisionId: 'roll-back',
    action: 'hold',
    idempotencyKey,
  });
  expect(closed).toEqual({ kind: 'closed' });
});

test('CSP: nonce scripts only, no inline styles or scripts, never framed', () => {
  const policy = contentSecurityPolicy('bm9uY2U=');
  expect(policy).toContain("script-src 'nonce-bm9uY2U=' 'strict-dynamic'");
  expect(policy).toContain("style-src 'self'");
  expect(policy).toContain(
    "connect-src 'self' wss://mastermind-store.tuturuuu.com"
  );
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).not.toContain('unsafe');
  expect(contentSecurityPolicy()).toContain("script-src 'none'");
});

test('owner live tickets use an uncached authenticated request', async () => {
  const ticket = {
    url: 'wss://mastermind-store.tuturuuu.com/v1/bridge/connect',
    ticket: 'x'.repeat(32),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(ticket));
  expect(await createFleetClient(owner, fetcher).liveTicket()).toEqual(ticket);
  const request = fetcher.mock.calls[0]?.[0];
  if (!(request instanceof Request)) throw new TypeError('request not built');
  expect(request.url).toBe(
    'https://tuturuuu.com/api/v1/mastermind/fleet/live/ticket'
  );
  expect(request.method).toBe('POST');
  expect(request.cache).toBe('no-store');
  expect(request.redirect).toBe('manual');
  expect(request.headers.get('authorization')).toBe(`Bearer ${owner.token}`);
});

test('usage reads are owner-scoped and preserve missing accounting data', async () => {
  const now = new Date().toISOString();
  const usage = {
    snapshot: { v: 1, generatedAt: now, machines: [] },
    receivedAt: now,
  };
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(usage));
  expect(await createFleetClient(owner, fetcher).usage()).toEqual({
    kind: 'ready',
    usage,
  });
  const request = fetcher.mock.calls[0]?.[0];
  expect(request).toBeInstanceOf(Request);
  if (!(request instanceof Request))
    throw new TypeError('usage request not built');
  expect(request.url).toBe(
    'https://tuturuuu.com/api/v1/mastermind/fleet/usage'
  );
  expect(request.headers.get('Authorization')).toBe('Bearer session-token');
  expect(request.cache).toBe('no-store');
  expect(request.redirect).toBe('manual');
  expect(
    await createFleetClient(
      owner,
      async () => new Response(null, { status: 403 })
    ).usage()
  ).toEqual({ kind: 'error', reason: 'denied' });
});

// The emitted-Worker smoke runs only in CI; its Web stub rejects any other
// feature list, which leaves the page without a snapshot to render.
test('the emitted-Worker smoke stubs the features the fleet client declares', async () => {
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json(fleetResponseFixture(Date.now()))
  );
  await createFleetClient(owner, fetcher).state();
  const request = fetcher.mock.calls[0]?.[0] as Request;
  const declared = request.headers.get('x-mastermind-fleet-features');
  const smoke = readFileSync(
    new URL(
      '../../cloudflare/native-built-worker.acceptance.mjs',
      import.meta.url
    ),
    'utf8'
  );
  const expected =
    /headers\.get\('x-mastermind-fleet-features'\),\s*'([^']*)'/.exec(
      smoke
    )?.[1];
  expect(declared).toBeTruthy();
  expect(expected).toBe(declared);
});
