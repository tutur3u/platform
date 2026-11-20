// Attendance retention through dispatch, the ledger fence and the processor.
// The SQL contract is covered by
// apps/database/scripts/meet-attendance-cloudflare-retention.test.mjs.
import { afterEach, expect, it, vi } from 'vite-plus/test';
import { dispatchScheduledJobs } from './dispatch';
import { LedgerCore, localLedger, memoryLedgerStore } from './ledger';
import {
  MEET_ATTENDANCE_INTENT_LIMIT,
  MEET_ATTENDANCE_INTENT_RPC,
  MEET_ATTENDANCE_PURGE_LIMIT,
  MEET_ATTENDANCE_PURGE_RPC,
} from './processors/meet-attendance-retention';

const ID = 'meet-attendance-retention';
const CRON = '17 18 * * *';
const T0 = Date.parse('2026-11-20T18:17:00Z');
const env = {
  CRON_CONTROL_ENABLED_JOBS: ID,
  SUPABASE_URL: 'https://database.example.test',
  SUPABASE_SECRET_KEY: 'disposable-service-key',
};

function harness(
  replies = [
    () => Response.json(0),
    () => Response.json({ state: 'fenced', advanced: 0, finished: 0 }),
  ]
) {
  const { store } = memoryLedgerStore();
  let core = new LedgerCore(store);
  let call = 0;
  const fetchMock = vi.fn<typeof fetch>(async () => {
    const reply = replies[Math.min(call, replies.length - 1)];
    call += 1;
    return reply();
  });
  const run = (slot = 0, configured = env) =>
    dispatchScheduledJobs(CRON, T0 + slot * 86_400_000, configured, {
      fetch: fetchMock,
      ledger: () => localLedger(core),
      now: () => T0 + slot * 86_400_000,
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

it('calls the bounded purge and then one intent page', async () => {
  const h = harness([
    () => Response.json(2),
    () => Response.json({ state: 'open', advanced: 1, finished: 1 }),
  ]);
  expect(await h.run()).toEqual([
    {
      attempts: 1,
      id: ID,
      outcome: 'ok',
      detail: { purged: 2, advanced: 1, finished: 1 },
    },
  ]);
  expect(h.fetchMock).toHaveBeenCalledTimes(2);
  const [purgeUrl, purgeRequest] = h.fetchMock.mock.calls[0];
  expect(String(purgeUrl)).toBe(
    `https://database.example.test/rest/v1/rpc/${MEET_ATTENDANCE_PURGE_RPC}`
  );
  expect(purgeRequest?.body).toBe(
    JSON.stringify({ p_limit: MEET_ATTENDANCE_PURGE_LIMIT })
  );
  const [intentUrl, intentRequest] = h.fetchMock.mock.calls[1];
  expect(String(intentUrl)).toBe(
    `https://database.example.test/rest/v1/rpc/${MEET_ATTENDANCE_INTENT_RPC}`
  );
  expect(intentRequest?.body).toBe(
    JSON.stringify({ p_limit: MEET_ATTENDANCE_INTENT_LIMIT })
  );
  for (const [, request] of h.fetchMock.mock.calls) {
    const headers = new Headers(request?.headers);
    expect(headers.get('apikey')).toBe(env.SUPABASE_SECRET_KEY);
    expect(headers.get('Content-Profile')).toBe('private');
    expect(headers.has('Authorization')).toBe(false);
    expect(request?.redirect).toBe('manual');
  }
});

it('treats a closed database fence as a successful stop', async () => {
  const h = harness();
  expect(await h.run()).toMatchObject([
    {
      outcome: 'ok',
      detail: { purged: 0, fenced: 1, advanced: 0, finished: 0 },
    },
  ]);
});

it('durably stops across restart and resumes only for a new slot', async () => {
  let step = 0;
  const h = harness([
    () => {
      step += 1;
      return step % 2 === 1
        ? Response.json(0)
        : Response.json({ state: 'open', advanced: 0, finished: 0 });
    },
  ]);
  await h.run();
  h.core().stop(ID, 'operator');
  h.restart();
  expect(await h.run(1)).toMatchObject([
    { outcome: 'skipped', reason: 'stopped' },
  ]);
  expect(h.fetchMock).toHaveBeenCalledTimes(2);
  h.core().resume(ID);
  expect(await h.run(2)).toMatchObject([{ outcome: 'ok' }]);
  expect(h.fetchMock).toHaveBeenCalledTimes(4);
});

it('rejects an unbounded purge count without calling the intent page', async () => {
  const h = harness([() => Response.json(MEET_ATTENDANCE_PURGE_LIMIT + 1)]);
  expect(await h.run()).toMatchObject([{ outcome: 'unknown', attempts: 1 }]);
  expect(h.fetchMock).toHaveBeenCalledTimes(1);
});
