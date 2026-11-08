import { afterEach, expect, it, vi } from 'vite-plus/test';
import { dispatchScheduledJobs } from './dispatch';
import { LedgerCore, localLedger, memoryLedgerStore } from './ledger';

const ID = 'database-cron-history-retention';
const CRON = '*/10 * * * *';
const T0 = Date.parse('2026-10-26T00:00:00Z');
const env = {
  CRON_CONTROL_ENABLED_JOBS: ID,
  SUPABASE_URL: 'https://database.example.test',
  SUPABASE_SECRET_KEY: 'disposable-service-key',
};

function harness(
  reply = () => Response.json({ pg_cron_deleted: 1000, managed_deleted: 1000 })
) {
  const { store } = memoryLedgerStore();
  let core = new LedgerCore(store);
  const fetchMock = vi.fn<typeof fetch>(async () => reply());
  const run = (slot = 0, configured = env) =>
    dispatchScheduledJobs(CRON, T0 + slot * 600_000, configured, {
      fetch: fetchMock,
      ledger: () => localLedger(core),
      now: () => T0 + slot * 600_000,
      sleep: async () => {
        throw new Error('Retention must not retry within a slot');
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

it('defaults off with no database calls', async () => {
  const h = harness();
  expect(await h.run(0, { ...env, CRON_CONTROL_ENABLED_JOBS: '' })).toEqual([]);
  expect(h.fetchMock).not.toHaveBeenCalled();
});

it('calls one bounded private RPC per slot without web credentials or a processor opt-in', async () => {
  const h = harness();
  expect(await h.run()).toEqual([
    {
      attempts: 1,
      id: ID,
      outcome: 'ok',
      detail: { pg_cron_deleted: 1000, managed_deleted: 1000 },
    },
  ]);
  expect(h.fetchMock).toHaveBeenCalledTimes(1);
  const [url, request] = h.fetchMock.mock.calls[0];
  expect(String(url)).toBe(
    'https://database.example.test/rest/v1/rpc/prune_cron_history'
  );
  expect(request?.body).toBe('{"p_limit":1000}');
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

it('durably stops across restart and resumes only for a new slot', async () => {
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
  expect(h.fetchMock).toHaveBeenCalledTimes(2);
});

it('stops after five failed slots, including across restarts, with no in-slot retry', async () => {
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
  () =>
    new Response(null, {
      status: 302,
      headers: { Location: 'https://other.test' },
    }),
  () => Response.json({ pg_cron_deleted: 1001, managed_deleted: 0 }),
  () => Response.json({ pg_cron_deleted: -1, managed_deleted: 0 }),
  () => Response.json({ pg_cron_deleted: 0.5, managed_deleted: 0 }),
  () => new Response('x'.repeat(1025)),
  () => new Response('not json'),
])(
  'rejects redirects or invalid/oversized summaries without another request',
  async (reply) => {
    const h = harness(reply);
    expect(await h.run()).toMatchObject([{ attempts: 1 }]);
    expect((await h.run(1))[0]).not.toMatchObject({ outcome: 'ok' });
    expect(h.fetchMock).toHaveBeenCalledTimes(2);
  }
);

it('records an unknown network outcome without immediately replaying a delete', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const h = harness();
  h.fetchMock.mockRejectedValueOnce(
    new DOMException('deadline', 'TimeoutError')
  );
  expect(await h.run()).toMatchObject([{ outcome: 'unknown', attempts: 1 }]);
  expect(h.fetchMock).toHaveBeenCalledTimes(1);
});

it('checks the durable stop fence after claim and before any delete request', async () => {
  const h = harness();
  vi.spyOn(h.core(), 'checkFence').mockReturnValue(false);
  expect(await h.run()).toMatchObject([{ outcome: 'stopped', attempts: 1 }]);
  expect(h.fetchMock).not.toHaveBeenCalled();
});
