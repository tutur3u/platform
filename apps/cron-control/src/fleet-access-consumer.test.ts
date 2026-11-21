import { expect, it } from 'vite-plus/test';
import { handleControlRequest } from './control';
import { dispatchScheduledJobs } from './dispatch';
import { LedgerCore, localLedger, memoryLedgerStore } from './ledger';

const id = 'fleet-access-consumer';
const cron = '*/15 * * * *';
const slotMs = 15 * 60_000;
const start = Date.parse('2026-11-21T06:00:00Z');
const token = `ttr_fleet_consumer_${'c'.repeat(43)}`;

function claims(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const suffix = String(index).padStart(12, '0');
    return {
      id: `bb000000-0000-4000-8000-${suffix}`,
      leaseId: `cc000000-0000-4000-8000-${suffix}`,
      idempotencyKey: `dd000000-0000-4000-8000-${suffix}`,
    };
  });
}

function setup(
  handler: (path: string, body: Record<string, unknown>) => unknown
) {
  const { store, counts } = memoryLedgerStore();
  const openLedger = () => localLedger(new LedgerCore(store));
  const calls: string[] = [];
  const env = {
    CRON_CONTROL_ENABLED_JOBS: id,
    FLEET_CONSUMER_MODE: 'dry-run',
    FLEET_CONSUMER_TOKEN: token,
    WEB_ORIGIN: 'https://web.example.test',
  };
  return {
    calls,
    counts,
    env,
    get ledger() {
      return openLedger();
    },
    run(time = start, ledger = openLedger()) {
      return dispatchScheduledJobs(cron, time, env, {
        ledger: () => ledger,
        now: () => time,
        sleep: async () => {
          throw new Error('Unexpected retry');
        },
        fetch: async (input, init) => {
          const url = new URL(String(input));
          expect(url.origin).toBe(env.WEB_ORIGIN);
          expect(init?.redirect).toBe('manual');
          expect(new Headers(init?.headers).get('authorization')).toBe(
            `Bearer ${token}`
          );
          const path = url.pathname.replace('/api/v1/fleet/consumer/', '');
          calls.push(path);
          const output = await handler(path, JSON.parse(String(init?.body)));
          return output instanceof Response ? output : Response.json(output);
        },
      });
    },
  };
}

const active = { state: 'active', generation: '1' };
const purged = {
  state: 'purged',
  counts: { quotes: 334, events: 333, linkCodes: 333 },
};

it('admits one slot with at most 23 Fleet calls and no repeat work', async () => {
  const batch = claims(20);
  const fixture = setup((path, body) => {
    switch (path) {
      case 'status':
        return active;
      case 'claim':
        return { state: 'claimed', claims: batch };
      case 'receipt':
        expect(body.state).toBe('dry_run');
        expect(body.generation).toBe('1');
        expect(batch).toContainEqual({
          id: body.id,
          leaseId: body.leaseId,
          idempotencyKey: body.idempotencyKey,
        });
        return { state: 'dry_run' };
      case 'purge':
        return purged;
      default:
        throw new Error('Unknown endpoint');
    }
  });
  expect(await fixture.run()).toMatchObject([
    {
      attempts: 1,
      outcome: 'ok',
      detail: { claims: 20, receipts: 20, purged: 1000 },
    },
  ]);
  expect(fixture.calls).toHaveLength(23);
  expect(fixture.counts).toEqual({ reads: 25, writes: 2 });
  expect(await fixture.run()).toEqual([
    { id, outcome: 'skipped', reason: 'duplicate' },
  ]);
  expect(fixture.calls).toHaveLength(23);
});

it('does no ledger or Web work with the Worker kill switch off', async () => {
  const fixture = setup(() => {
    throw new Error('Unexpected fetch');
  });
  fixture.env.FLEET_CONSUMER_MODE = 'off';
  expect(await fixture.run()).toEqual([
    { id, outcome: 'skipped', reason: 'fleet-consumer-off' },
  ]);
  expect(fixture.calls).toEqual([]);
  expect(fixture.counts).toEqual({ reads: 0, writes: 0 });
});

it('does no mutations when Fleet is stopped or status could not be confirmed', async () => {
  for (const state of [{ state: 'stopped' }, { state: 'active' }]) {
    const fixture = setup(() => state);
    expect(await fixture.run()).toMatchObject([
      {
        outcome: state.state === 'stopped' ? 'stopped' : 'unknown',
      },
    ]);
    expect(fixture.calls).toEqual(['status']);
  }
});

it('ends the run when a persisted stop takes effect after claim', async () => {
  const fixture = setup((path) => {
    if (path === 'status') return active;
    if (path === 'claim') return { state: 'claimed', claims: claims(2) };
    return { state: 'stopped' };
  });
  expect(await fixture.run()).toMatchObject([{ outcome: 'stopped' }]);
  expect(fixture.calls).toEqual(['status', 'claim', 'receipt']);

  await fixture.ledger.stop(id, 'operator stop');
  expect(await fixture.run(start + slotMs)).toMatchObject([
    { reason: 'stopped' },
  ]);
  expect(fixture.calls).toEqual(['status', 'claim', 'receipt']);
});

it.each(['claim', 'receipt'])(
  'reconciles a lost %s response on the next slot before new work',
  async (failure) => {
    const batch = claims(2);
    const completed = new Set<unknown>();
    let lost = false;
    const fixture = setup((path, body) => {
      if (path === 'status') return active;
      if (path === 'claim') {
        if (failure === path && !lost) {
          lost = true;
          return new Response(null, { status: 503 });
        }
        return {
          state: 'claimed',
          claims: batch.filter((item) => !completed.has(item.id)),
        };
      }
      if (path === 'receipt') {
        completed.add(body.id);
        if (failure === path && !lost) {
          lost = true;
          return new Response(null, { status: 503 });
        }
        return { state: 'dry_run' };
      }
      return purged;
    });
    expect(await fixture.run()).toMatchObject([{ outcome: 'unknown' }]);
    expect(fixture.calls).toEqual(
      failure === 'claim' ? ['status', 'claim'] : ['status', 'claim', 'receipt']
    );
    fixture.calls.length = 0;
    expect(await fixture.run(start + slotMs)).toMatchObject([
      { outcome: 'ok' },
    ]);
    expect(fixture.calls).toEqual(
      failure === 'claim'
        ? ['status', 'claim', 'receipt', 'receipt', 'purge']
        : ['status', 'claim', 'receipt', 'purge']
    );
    expect(completed.size).toBe(2);
  }
);

it('never writes a receipt for an invalid or oversized claim batch', async () => {
  const fixture = setup((path) =>
    path === 'status' ? active : { state: 'claimed', claims: claims(21) }
  );
  expect(await fixture.run()).toMatchObject([{ outcome: 'unknown' }]);
  expect(fixture.calls).toEqual(['status', 'claim']);
});

it('an authenticated Cron Control stop after claim prevents receipt and purge', async () => {
  const operator = 'test-operator-credential-for-fleet-control';
  const fixture = setup(async (path) => {
    if (path === 'status') return active;
    if (path !== 'claim') throw new Error('Unexpected mutation');
    const stop =
      'https://cron.example.test/control/jobs/fleet-access-consumer/stop';
    const env = { CRON_CONTROL_OPERATOR_TOKEN: operator };
    const unauthorized = await handleControlRequest(
      new Request(stop, { method: 'POST' }),
      env,
      () => fixture.ledger
    );
    expect(unauthorized?.status).toBe(404);
    const authorized = await handleControlRequest(
      new Request(stop, {
        method: 'POST',
        headers: { authorization: `Bearer ${operator}` },
      }),
      env,
      () => fixture.ledger
    );
    expect(authorized?.status).toBe(200);
    return { state: 'claimed', claims: claims(1) };
  });
  expect(await fixture.run()).toMatchObject([{ outcome: 'stopped' }]);
  expect(fixture.calls).toEqual(['status', 'claim']);
  expect(await fixture.run(start + slotMs)).toMatchObject([
    { reason: 'stopped' },
  ]);
  expect(fixture.calls).toHaveLength(2);
});

it('persistent unknown Web outcomes exhaust the durable failure budget', async () => {
  const fixture = setup(() => new Response(null, { status: 503 }));
  for (let index = 0; index < 5; index++)
    expect(await fixture.run(start + index * slotMs)).toMatchObject([
      { outcome: 'unknown' },
    ]);
  expect(await fixture.run(start + 5 * slotMs)).toMatchObject([
    { reason: 'stopped' },
  ]);
  expect(fixture.calls).toEqual(Array(5).fill('status'));
});

it('an empty claim runs retention once without writing receipts', async () => {
  const fixture = setup((path) =>
    path === 'status'
      ? active
      : path === 'claim'
        ? { state: 'claimed', claims: [] }
        : purged
  );
  expect(await fixture.run()).toMatchObject([{ outcome: 'ok' }]);
  expect(fixture.calls).toEqual(['status', 'claim', 'purge']);
});
