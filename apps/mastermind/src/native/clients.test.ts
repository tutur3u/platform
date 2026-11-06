import { expect, test, vi } from 'vitest';
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
    OPS_HUB_MASTERMIND_SNAPSHOT_SECRET: secret,
    OPS_HUB: {
      async fetch(request: Request) {
        captured = request;
        return new Response('{}');
      },
    },
  };
  expect((await createDataClients(env, owner).agentSnapshot()).status).toBe(200);
  expect(captured).toBeDefined();
  if (!captured) throw new Error('Missing request');
  expect(captured.headers.has('Authorization')).toBe(false);
  expect(
    await verifyAssertion(
      secret,
      captured.headers.get(ASSERTION_HEADER) ?? '',
      'GET',
      '/snapshot',
      Date.now(),
      'mastermind'
    )
  ).toBe(owner.id);
  expect(
    await verifyAssertion(
      secret,
      captured.headers.get(ASSERTION_HEADER) ?? '',
      'POST',
      '/snapshot',
      Date.now(),
      'mastermind'
    )
  ).toBeNull();
  expect(captured.redirect).toBe('error');
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

for (const key of [
  '',
  '   ',
  'short',
  ' '.repeat(50),
  ` ${secret}`,
  `${secret} `,
  'x'.repeat(257),
]) {
  test(`invalid key fails before fetch (${key.length} characters)`, async () => {
    const fetch = vi.fn();
    await expect(
      createDataClients(
        { OPS_HUB_MASTERMIND_SNAPSHOT_SECRET: key, OPS_HUB: { fetch } },
        owner
      ).agentSnapshot()
    ).rejects.toThrow('Ops hub signing key unavailable');
    expect(fetch).not.toHaveBeenCalled();
  });
}
