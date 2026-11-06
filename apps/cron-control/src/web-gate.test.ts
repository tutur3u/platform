import { expect, it, vi } from 'vite-plus/test';
import {
  WEB_LEASE_MS,
  type WebGateAction,
  type WebGateState,
  type WebJobId,
  webGateAction,
} from './web-gate';
import { handleWebGate } from './web-gate-http';

const T0 = Date.parse('2026-10-28T00:00:00Z');
const job = 'web-deadline-reminders';
const ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'disposable-test-gate-token-long-enough';
function harness() {
  // Serialize on every read/write like the SQLite adapter; reconstruct the core
  // on every action to exercise eviction/restart rather than object identity.
  const rows = new Map<string, string>();
  let writes = 0;
  const store = {
    read: (key: WebJobId): WebGateState | null => {
      const row = rows.get(key);
      return row ? JSON.parse(row) : null;
    },
    write: (key: WebJobId, state: WebGateState) => {
      writes++;
      rows.set(key, JSON.stringify(state));
    },
  };
  const run = (action: WebGateAction, now = T0) =>
    webGateAction(store, job, action, now);
  return { run, writes: () => writes };
}
const acquire = (
  owner: 'vercel' | 'cloudflare' = 'vercel',
  slot = T0,
  id = ID
): WebGateAction => ({ kind: 'acquire', owner, slot, id });

it('defaults to Vercel and rejects Cloudflare with zero durable writes', () => {
  const h = harness();
  expect(h.run(acquire('cloudflare'))).toMatchObject({
    ok: false,
    reason: 'owner',
  });
  expect(h.writes()).toBe(0);
});
it('serializes both owners and keeps duplicate slots across restarts and owner changes', () => {
  const h = harness();
  expect(h.run(acquire())).toMatchObject({ ok: true });
  expect(h.run({ kind: 'owner', owner: 'cloudflare' }).ok).toBe(false);
  expect(h.run(acquire('vercel', T0 + 300_000), T0 + 300_000).ok).toBe(false);
  expect(h.run({ kind: 'complete', id: ID }).ok).toBe(true);
  expect(h.run({ kind: 'owner', owner: 'cloudflare' }).ok).toBe(true);
  expect(h.run(acquire('cloudflare')).reason).toBe('duplicate');
  expect(h.run(acquire('vercel', T0 + 300_000), T0 + 300_000).reason).toBe(
    'owner'
  );
  expect(h.run(acquire('cloudflare', T0 + 300_000), T0 + 300_000).ok).toBe(
    true
  );
  expect(h.writes()).toBe(4);
});
it('an abandoned write never expires into replay permission', () => {
  const h = harness();
  h.run(acquire());
  expect(
    h.run(acquire('vercel', T0 + WEB_LEASE_MS), T0 + WEB_LEASE_MS).reason
  ).toBe('unresolved-run');
  expect(h.run({ kind: 'resume' }).ok).toBe(false);
  expect(h.run({ kind: 'resolve', id: ID }, T0 + WEB_LEASE_MS).ok).toBe(false);
  h.run({ kind: 'stop' });
  expect(h.run({ kind: 'resolve', id: ID }, T0 + WEB_LEASE_MS - 1).ok).toBe(
    false
  );
  expect(h.run({ kind: 'resolve', id: `${ID}x` }, T0 + WEB_LEASE_MS).ok).toBe(
    false
  );
  expect(h.run({ kind: 'resolve', id: ID }, T0 + WEB_LEASE_MS).ok).toBe(true);
  expect(h.run(acquire()).reason).toBe('stopped');
  h.run({ kind: 'resume' });
  expect(h.run(acquire()).reason).toBe('duplicate');
});
it('durable stop survives later ticks and completion; stale completion cannot unlock a run', () => {
  const h = harness();
  h.run(acquire());
  h.run({ kind: 'stop' });
  expect(h.run({ kind: 'complete', id: `${ID}x` }).ok).toBe(false);
  expect(h.run({ kind: 'complete', id: ID }).ok).toBe(true);
  for (let i = 1; i <= 100; i++)
    expect(
      h.run(acquire('vercel', T0 + i * 300_000), T0 + i * 300_000).reason
    ).toBe('stopped');
  expect(h.writes()).toBe(3);
});
it('rejects off-cadence, stale, future and invalid slots without spending writes', () => {
  const h = harness();
  for (const slot of [NaN, Infinity, T0 + 1, T0 + 300_000, T0 - 600_000])
    expect(h.run(acquire('vercel', slot)).ok).toBe(false);
  expect(h.writes()).toBe(0);
});
it('authenticates and separates processor and operator actions; limits streamed bodies', async () => {
  const h = harness();
  const env = {
    CRON_CONTROL_WEB_GATE_TOKEN: TOKEN,
    CRON_CONTROL_OPERATOR_TOKEN: `${TOKEN}-operator`,
  };
  const call = (action: object, token = TOKEN, prefix = '', raw?: string) =>
    handleWebGate(
      new Request(`https://cron.test/${prefix}web-crons/${job}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: raw ?? JSON.stringify(action),
      }),
      env,
      async (_job, action) => h.run(action)
    );
  expect((await call(acquire(), 'bad'))?.status).toBe(404);
  expect((await call({ kind: 'owner', owner: 'cloudflare' }))?.status).toBe(
    400
  );
  expect((await call(acquire(), TOKEN, '', 'x'.repeat(2049)))?.status).toBe(
    413
  );
  expect(h.writes()).toBe(0);
  expect((await call(acquire()))?.status).toBe(200);
  expect(
    (await call({ kind: 'stop' }, `${TOKEN}-operator`, 'control/'))?.status
  ).toBe(200);
  expect((await call(acquire()))?.status).toBe(409);
});

it('bounds an unconfirmed durable RPC without replaying its action', async () => {
  vi.useFakeTimers();
  try {
    const rpc = vi.fn(() => new Promise<never>(() => {}));
    const result = handleWebGate(
      new Request(`https://cron.test/web-crons/${job}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify(acquire()),
      }),
      { CRON_CONTROL_WEB_GATE_TOKEN: TOKEN },
      rpc
    );
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await result)?.status).toBe(503);
    expect(rpc).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});
