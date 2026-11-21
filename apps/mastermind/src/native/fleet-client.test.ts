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
};

test('fleet reads send only the owner bearer and the login feature, and validate the body', async () => {
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
  expect(request.headers.get('x-mastermind-fleet-features')).toBe('login');
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
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).not.toContain('unsafe');
  expect(contentSecurityPolicy()).toContain("script-src 'none'");
});
