import { afterEach, expect, it, vi } from 'vite-plus/test';
import { dispatchScheduledJobs } from './dispatch';
import { CRON_JOBS, DATABASE_MAINTENANCE_RPCS } from './jobs';
import { LedgerCore, localLedger, memoryLedgerStore } from './ledger';

const ID = 'ai-credit-unbilled-settlement';
const CRON = '*/15 * * * *';
const SLOT_MS = 900_000;
const T0 = Date.parse('2026-11-21T00:00:00Z');
const env = {
  CRON_CONTROL_ENABLED_JOBS: ID,
  SUPABASE_URL: 'https://database.example.test',
  SUPABASE_SECRET_KEY: 'disposable-service-key',
};

function harness(
  reply = () => Response.json({ settled: 3, failed: 1, abandoned: 0 })
) {
  const { store } = memoryLedgerStore();
  let core = new LedgerCore(store);
  const fetchMock = vi.fn<typeof fetch>(async () => reply());
  const run = (slot = 0, configured = env) =>
    dispatchScheduledJobs(CRON, T0 + slot * SLOT_MS, configured, {
      fetch: fetchMock,
      ledger: () => localLedger(core),
      now: () => T0 + slot * SLOT_MS,
      sleep: async () => {
        throw new Error('Settlement must not retry within a slot');
      },
    });
  return {
    fetchMock,
    run,
    restart: () => {
      core = new LedgerCore(store);
    },
    core: () => core,
  };
}

afterEach(() => vi.restoreAllMocks());

it('is a claim-fenced private RPC job every 15 minutes', () => {
  expect(DATABASE_MAINTENANCE_RPCS[ID]).toBe('settle_unbilled_ai_charges');
  expect(CRON_JOBS.find((job) => job.id === ID)).toMatchObject({
    cron: CRON,
    overlap: 'claim-fenced',
    path: '/rest/v1/rpc/settle_unbilled_ai_charges',
    workerProcessor: ID,
  });
});

it('makes no database call unless enabled', async () => {
  const h = harness();
  expect(await h.run(0, { ...env, CRON_CONTROL_ENABLED_JOBS: '' })).toEqual([]);
  expect(h.fetchMock).not.toHaveBeenCalled();
});

it('calls one bounded settlement RPC per slot with the service key only', async () => {
  const h = harness();
  expect(await h.run()).toEqual([
    {
      attempts: 1,
      id: ID,
      outcome: 'ok',
      detail: { settled: 3, failed: 1, abandoned: 0 },
    },
  ]);
  expect(h.fetchMock).toHaveBeenCalledTimes(1);
  const [url, request] = h.fetchMock.mock.calls[0];
  expect(String(url)).toBe(
    'https://database.example.test/rest/v1/rpc/settle_unbilled_ai_charges'
  );
  expect(request?.redirect).toBe('manual');
  const headers = new Headers(request?.headers);
  expect(headers.get('apikey')).toBe(env.SUPABASE_SECRET_KEY);
  expect(headers.get('Content-Profile')).toBe('private');
  expect(headers.has('Authorization')).toBe(false);
  h.restart();
  expect(await h.run()).toMatchObject([
    { outcome: 'skipped', reason: 'duplicate' },
  ]);
  expect(h.fetchMock).toHaveBeenCalledTimes(1);
});

it('honours the durable operator stop across restarts', async () => {
  const h = harness();
  await h.run();
  h.core().stop(ID, 'operator');
  h.restart();
  expect(await h.run(1)).toMatchObject([
    { outcome: 'skipped', reason: 'stopped' },
  ]);
  expect(h.fetchMock).toHaveBeenCalledTimes(1);
  h.core().resume(ID);
  expect(await h.run(2)).toMatchObject([{ outcome: 'ok' }]);
});

it('stops durably after five failed slots with no in-slot retry', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const h = harness(() => new Response(null, { status: 503 }));
  for (let slot = 0; slot < 5; slot++) {
    expect(await h.run(slot)).toMatchObject([
      { outcome: 'failed', attempts: 1 },
    ]);
    h.restart();
  }
  expect(await h.run(5)).toMatchObject([
    { outcome: 'skipped', reason: 'stopped' },
  ]);
  expect(h.fetchMock).toHaveBeenCalledTimes(5);
});

it.each([
  () => Response.json({ settled: 1001, failed: 0, abandoned: 0 }),
  () => Response.json({ settled: -1, failed: 0, abandoned: 0 }),
  () => Response.json({ settled: 1, failed: 0 }),
  () => new Response('not json'),
])('treats an invalid summary as an unknown outcome', async (reply) => {
  const h = harness(reply);
  expect(await h.run()).toMatchObject([{ attempts: 1, outcome: 'unknown' }]);
  expect(h.fetchMock).toHaveBeenCalledTimes(1);
});

it('checks the stop fence before calling the database', async () => {
  const h = harness();
  vi.spyOn(h.core(), 'checkFence').mockReturnValue(false);
  expect(await h.run()).toMatchObject([{ outcome: 'stopped', attempts: 1 }]);
  expect(h.fetchMock).not.toHaveBeenCalled();
});
