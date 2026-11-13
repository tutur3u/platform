// The devbox unauthorized-run sweep shares the bounded maintenance RPC path
// with the retention jobs (processors/maintenance-rpc.ts).
import { afterEach, expect, it, vi } from 'vite-plus/test';
import { dispatchScheduledJobs } from './dispatch';
import { LedgerCore, localLedger, memoryLedgerStore } from './ledger';

const ID = 'database-devbox-unauthorized-run-sweep';
const CRON = '*/10 * * * *';
const T0 = Date.parse('2026-11-04T00:00:00Z');
const env = {
  CRON_CONTROL_ENABLED_JOBS: ID,
  SUPABASE_URL: 'https://database.example.test',
  SUPABASE_SECRET_KEY: 'disposable-service-key',
};

function harness(reply = () => Response.json({ scanned: 1000, cancelled: 3 })) {
  const { store } = memoryLedgerStore();
  const core = new LedgerCore(store);
  const fetchMock = vi.fn<typeof fetch>(async () => reply());
  const run = (slot = 0, configured = env) =>
    dispatchScheduledJobs(CRON, T0 + slot * 600_000, configured, {
      fetch: fetchMock,
      ledger: () => localLedger(core),
      now: () => T0 + slot * 600_000,
      sleep: async () => {
        throw new Error('The sweep must not retry within a slot');
      },
    });
  return { fetchMock, run };
}

afterEach(() => vi.restoreAllMocks());

it('defaults off with no database calls', async () => {
  const h = harness();
  expect(await h.run(0, { ...env, CRON_CONTROL_ENABLED_JOBS: '' })).toEqual([]);
  expect(h.fetchMock).not.toHaveBeenCalled();
});

it('calls the capped private sweep RPC once per slot with the service key', async () => {
  const h = harness();
  expect(await h.run()).toEqual([
    {
      attempts: 1,
      id: ID,
      outcome: 'ok',
      detail: { scanned: 1000, cancelled: 3 },
    },
  ]);
  expect(h.fetchMock).toHaveBeenCalledTimes(1);
  const [url, request] = h.fetchMock.mock.calls[0];
  expect(String(url)).toBe(
    'https://database.example.test/rest/v1/rpc/cancel_unauthorized_devbox_runs'
  );
  expect(request?.body).toBe('{"p_limit":1000}');
  const headers = new Headers(request?.headers);
  expect(headers.get('apikey')).toBe(env.SUPABASE_SECRET_KEY);
  expect(headers.get('Content-Profile')).toBe('private');
  expect(headers.has('Authorization')).toBe(false);
});

it.each([
  () => Response.json({ scanned: 1001, cancelled: 0 }),
  () => Response.json({ scanned: 10, cancelled: -1 }),
  () => Response.json({ cancelled: 1 }),
  () => new Response('not json'),
])('rejects invalid summaries as an unknown outcome', async (reply) => {
  const h = harness(reply);
  expect(await h.run()).toMatchObject([{ attempts: 1, outcome: 'unknown' }]);
  expect(h.fetchMock).toHaveBeenCalledTimes(1);
});
