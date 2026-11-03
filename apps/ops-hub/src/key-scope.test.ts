import { expect, test, vi } from 'vitest';
import { ASSERTION_HEADER, signAssertion, verifyAssertion } from './protocol';
import worker from './worker';

vi.mock('./hub', () => ({ OpsHub: class {} }));
const user = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const current = 'fixture-only-current-key-0000000000000000000000000';
const next = 'fixture-only-next-key-0000000000000000000000000000';
const now = 1793000000000;
function environment() {
  return {
    OPS_HUB_GATEWAY_SECRET: `${current}-gateway`,
    OPS_HUB_MASTERMIND_SNAPSHOT_SECRET: current,
    OPS_HUB_ALLOWED_USER_IDS: `${user},${other}`,
    HUB: {
      getByName: vi.fn(() => ({ fetch: async () => new Response('{}') })),
    },
  };
}
async function request(
  env: ReturnType<typeof environment>,
  method: string,
  target: string,
  identity = user,
  key = current
) {
  return worker.fetch(
    new Request(`https://hub.invalid${target}`, {
      method,
      headers: {
        [ASSERTION_HEADER]: await signAssertion(
          key,
          identity,
          method,
          target,
          Date.now(),
          'mastermind'
        ),
      },
    }),
    env
  );
}
test.each(['/snapshot', '/status'])(
  'Mastermind allows GET %s',
  async (target) => {
    expect((await request(environment(), 'GET', target)).status).toBe(200);
  }
);
test.each([
  ['DELETE', '/hub'],
  ['GET', '/hub/export'],
  ['POST', '/ingest'],
  ['GET', '/events'],
  ['GET', '/needs-you'],
  ['GET', '/environments'],
  ['GET', '/decisions'],
  ['GET', '/observability'],
  ['GET', '/hub'],
  ['POST', '/snapshot'],
  ['GET', '/snapshot?x=1'],
  ['GET', '/unknown'],
])('Mastermind refuses %s %s uniformly', async (method, target) => {
  const env = environment();
  const response = await request(env, method, target);
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: 'Not found' });
  expect(env.HUB.getByName).not.toHaveBeenCalled();
});
test('Mastermind cannot export another allowlisted user', async () => {
  expect(
    (await request(environment(), 'GET', '/hub/export', other)).status
  ).toBe(404);
});
test('key ID is authenticated even if caller keys accidentally coincide', async () => {
  const env = environment();
  env.OPS_HUB_GATEWAY_SECRET = current;
  const signed = await signAssertion(
    current,
    user,
    'DELETE',
    '/hub',
    Date.now(),
    'mastermind'
  );
  const forged = signed.replace(/^mastermind\./, 'gateway.');
  const response = await worker.fetch(
    new Request('https://hub.invalid/hub', {
      method: 'DELETE',
      headers: { [ASSERTION_HEADER]: forged },
    }),
    env
  );
  expect(response.status).toBe(404);
});
test.each([-4999, -5000, -5001, 59999, 60000])(
  'skew and TTL boundary %s',
  async (offset) => {
    const signed = await signAssertion(current, user, 'GET', '/snapshot', now);
    expect(
      await verifyAssertion(current, signed, 'GET', '/snapshot', now + offset)
    ).toBe(offset >= -5000 && offset < 60000 ? user : null);
  }
);
test.each(['mastermind', 'gateway'])(
  'bounded current plus next rotation for %s',
  async (keyId) => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const prefix =
        keyId === 'mastermind'
          ? 'OPS_HUB_MASTERMIND_SNAPSHOT'
          : 'OPS_HUB_GATEWAY';
      const env: ReturnType<typeof environment> &
        Parameters<typeof worker.fetch>[1] = {
        ...environment(),
        [`${prefix}_SECRET`]: current,
        [`${prefix}_SECRET_NEXT`]: next,
        [`${prefix}_NEXT_NOT_BEFORE`]: String(now / 1000),
        [`${prefix}_NEXT_EXPIRES_AT`]: String(now / 1000 + 3600),
      };
      async function status(key: string) {
        const signed = await signAssertion(
          key,
          user,
          'GET',
          '/snapshot',
          Date.now(),
          keyId
        );
        return (
          await worker.fetch(
            new Request('https://hub.invalid/snapshot', {
              headers: { [ASSERTION_HEADER]: signed },
            }),
            env
          )
        ).status;
      }
      expect(await status(current)).toBe(200);
      expect(await status(next)).toBe(200);
      expect(await status(`${next}-third`)).toBe(404);
      vi.setSystemTime(now - 1000);
      expect(await status(next)).toBe(404);
      vi.setSystemTime(now + 3599000);
      expect(await status(next)).toBe(200);
      vi.setSystemTime(now + 3600000);
      expect(await status(next)).toBe(404);
      expect(await status(current)).toBe(200);
      vi.setSystemTime(now);
      env[`${prefix}_NEXT_EXPIRES_AT`] = String(now / 1000 + 3601);
      expect(await status(next)).toBe(404);
      delete env[`${prefix}_NEXT_EXPIRES_AT`];
      expect(await status(next)).toBe(404);
    } finally {
      vi.useRealTimers();
    }
  }
);

test.each([
  ['DELETE', '/hub'],
  ['GET', '/hub/export'],
])('gateway retains %s %s', async (method, target) => {
  const env = environment();
  const signed = await signAssertion(
    env.OPS_HUB_GATEWAY_SECRET,
    other,
    method,
    target
  );
  const response = await worker.fetch(
    new Request(`https://hub.invalid${target}`, {
      method,
      headers: { [ASSERTION_HEADER]: signed },
    }),
    env
  );
  expect(response.status).toBe(200);
  expect(env.HUB.getByName).toHaveBeenCalledWith(`hub:${other}`);
});
