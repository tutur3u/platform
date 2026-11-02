import { expect, test } from 'vitest';
import { ASSERTION_HEADER, verifyAssertion } from '@tuturuuu/ops-hub/protocol';
import { createDataClients } from './clients';

const secret = 'fixture-only-signing-key-000000000000000000000000';
const owner = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'owner@example.invalid',
  token: 'fixture-session',
  expiresAt: Date.now() + 300_000,
};

test('snapshot signs the exact GET target and sends no bearer', async () => {
  let captured: Request | undefined;
  const env = {
    OPS_HUB_GATEWAY_SECRET: secret,
    OPS_HUB: {
      async fetch(request: Request) {
        captured = request;
        return new Response('{}');
      },
    },
  };
  await createDataClients(env, owner).agentSnapshot();
  expect(captured).toBeDefined();
  if (!captured) throw new Error('Missing request');
  expect(captured.headers.has('Authorization')).toBe(false);
  expect(
    await verifyAssertion(
      secret,
      captured.headers.get(ASSERTION_HEADER) ?? '',
      'GET',
      '/snapshot'
    )
  ).toBe(owner.id);
  expect(
    await verifyAssertion(
      secret,
      captured.headers.get(ASSERTION_HEADER) ?? '',
      'POST',
      '/snapshot'
    )
  ).toBeNull();
  expect(captured.redirect).toBe('error');
});

test('snapshot passes the hub authentication gate that rejects bearer with 404', async () => {
  const hub = {
    async fetch(request: Request) {
      const identity = await verifyAssertion(
        secret,
        request.headers.get(ASSERTION_HEADER) ?? '',
        request.method,
        new URL(request.url).pathname
      );
      return new Response(null, { status: identity === owner.id ? 200 : 404 });
    },
  };
  expect(
    (
      await hub.fetch(
        new Request('https://ops-hub/snapshot', {
          headers: { Authorization: `Bearer ${owner.token}` },
        })
      )
    ).status
  ).toBe(404);
  expect(
    (
      await createDataClients(
        { OPS_HUB: hub, OPS_HUB_GATEWAY_SECRET: secret },
        owner
      ).agentSnapshot()
    ).status
  ).toBe(200);
});

test('missing signing key fails before sending a request', async () => {
  let calls = 0;
  await expect(
    createDataClients(
      {
        OPS_HUB: {
          async fetch() {
            calls++;
            return new Response();
          },
        },
      },
      owner
    ).agentSnapshot()
  ).rejects.toThrow('Ops hub signing key unavailable');
  expect(calls).toBe(0);
});
