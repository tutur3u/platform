// External-app exchange audit retention: bounded private purge pages through
// the dispatch path (processors/external-app-exchange-audit-retention.ts).
import { afterEach, expect, it, vi } from 'vite-plus/test';
import { dispatchScheduledJobs } from './dispatch';
import {
  CRON_JOBS,
  DATABASE_MAINTENANCE_RPCS,
  findJob,
  processorDeadlineMs,
} from './jobs';
import { LedgerCore, localLedger, memoryLedgerStore } from './ledger';
import {
  EXCHANGE_AUDIT_RPC_MISSING,
  PAGE_TIME_RESERVE_MS,
  RPC_MISSING_GRACE_UNTIL,
  runExchangeAuditRetention,
} from './processors/external-app-exchange-audit-retention';

const ID = 'external-app-exchange-audit-retention';
const CRON = '43 19 * * *';
const DAY_MS = 86_400_000;
const T0 = Date.parse('2026-11-23T19:43:00Z');
const env = {
  CRON_CONTROL_ENABLED_JOBS: ID,
  SUPABASE_URL: 'https://database.example.test',
  SUPABASE_SECRET_KEY: 'disposable-service-key',
};

function harness(pages: Array<() => Response>) {
  const { store } = memoryLedgerStore();
  let core = new LedgerCore(store);
  let call = 0;
  let elapsed = 0;
  const fetchMock = vi.fn<typeof fetch>(async () => {
    const reply = pages[Math.min(call, pages.length - 1)]!;
    call++;
    return reply();
  });
  const run = (slot = 0, configured = env) =>
    dispatchScheduledJobs(CRON, T0 + slot * DAY_MS, configured, {
      fetch: fetchMock,
      ledger: () => localLedger(core),
      now: () => T0 + slot * DAY_MS + elapsed,
      sleep: async () => {
        throw new Error('Retention must not retry within a slot');
      },
    });
  return {
    advance: (ms: number) => {
      elapsed += ms;
    },
    core: () => core,
    fetchMock,
    restart: () => {
      core = new LedgerCore(store);
    },
    run,
  };
}

const deleted = (count: number) => () => Response.json(count);
const full = deleted(1000);
const missing = () => Response.json({ code: 'PGRST202' }, { status: 404 });
// Daily slots from T0 (2026-11-24 02:43 GMT+7); slot 13 is the last one
// before the grace time and slot 14 the first one after it.
const LAST_GRACE_SLOT = 13;

afterEach(() => vi.restoreAllMocks());

it('registers a daily idempotent job for the private purge function', () => {
  expect(CRON_JOBS.find((job) => job.id === ID)).toMatchObject({
    cron: CRON,
    overlap: 'idempotent',
    workerProcessor: ID,
  });
  expect(DATABASE_MAINTENANCE_RPCS[ID]).toBe(
    'purge_external_app_exchange_events'
  );
});

it('defaults off with no database calls', async () => {
  const h = harness([full]);
  expect(await h.run(0, { ...env, CRON_CONTROL_ENABLED_JOBS: '' })).toEqual([]);
  expect(h.fetchMock).not.toHaveBeenCalled();
});

it('makes one call for an empty table', async () => {
  const h = harness([deleted(0)]);
  expect(await h.run()).toEqual([
    { attempts: 1, detail: { deleted: 0 }, id: ID, outcome: 'ok' },
  ]);
  expect(h.fetchMock).toHaveBeenCalledTimes(1);
  const [url, request] = h.fetchMock.mock.calls[0]!;
  expect(String(url)).toBe(
    'https://database.example.test/rest/v1/rpc/purge_external_app_exchange_events'
  );
  expect(request?.body).toBe('{"p_limit":1000}');
  expect(request?.redirect).toBe('manual');
  const headers = new Headers(request?.headers);
  expect(headers.get('apikey')).toBe(env.SUPABASE_SECRET_KEY);
  expect(headers.get('Content-Profile')).toBe('private');
  expect(headers.has('Authorization')).toBe(false);
});

it('stops after a full page followed by a short page: two calls', async () => {
  const h = harness([full, deleted(7)]);
  expect(await h.run()).toMatchObject([
    { detail: { deleted: 1007 }, outcome: 'ok' },
  ]);
  expect(h.fetchMock).toHaveBeenCalledTimes(2);
});

it('stops at eight full pages and reports the capped backlog', async () => {
  const h = harness([full]);
  expect(await h.run()).toMatchObject([
    { detail: { capped: 1, deleted: 8000 }, outcome: 'degraded' },
  ]);
  expect(h.fetchMock).toHaveBeenCalledTimes(8);
  h.restart();
  expect(await h.run()).toMatchObject([
    { outcome: 'skipped', reason: 'duplicate' },
  ]);
  expect(h.fetchMock).toHaveBeenCalledTimes(8);
});

it('checks the durable fence before every call and stops between calls', async () => {
  const h = harness([full]);
  // The fence closes once two pages have been deleted.
  const fence = vi
    .spyOn(h.core(), 'checkFence')
    .mockImplementation(() => h.fetchMock.mock.calls.length < 2);
  expect(await h.run()).toMatchObject([
    { detail: { deleted: 2000 }, outcome: 'stopped' },
  ]);
  expect(h.fetchMock).toHaveBeenCalledTimes(2);
  // One check before each of the three pages it reached; the third is closed.
  expect(fence).toHaveBeenCalledTimes(3);
});

it('ends the slot early when the deadline leaves no room for another page', async () => {
  const h = harness([
    () => {
      h.advance(
        processorDeadlineMs(findJob(ID)!) - PAGE_TIME_RESERVE_MS + 1_000
      );
      return full();
    },
  ]);
  expect(await h.run()).toMatchObject([
    { detail: { capped: 1, deleted: 1000 }, outcome: 'degraded' },
  ]);
  expect(h.fetchMock).toHaveBeenCalledTimes(1);
});

it('starts another page while the call and the outcome write still fit', async () => {
  const h = harness([
    () => {
      h.advance(
        processorDeadlineMs(findJob(ID)!) - PAGE_TIME_RESERVE_MS - 1_000
      );
      return full();
    },
    deleted(10),
  ]);
  expect(await h.run()).toMatchObject([
    { detail: { deleted: 1010 }, outcome: 'ok' },
  ]);
  expect(h.fetchMock).toHaveBeenCalledTimes(2);
});

it('logs a fixed code and stops without retrying while the function is missing', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const h = harness([missing]);
  expect(T0 + LAST_GRACE_SLOT * DAY_MS).toBeLessThan(RPC_MISSING_GRACE_UNTIL);
  for (let slot = 0; slot <= LAST_GRACE_SLOT; slot++) {
    expect(await h.run(slot)).toMatchObject([
      { attempts: 1, detail: { rpcMissing: 1 }, outcome: 'stopped' },
    ]);
    h.restart();
  }
  // One call per daily slot, never charged to the failure budget.
  expect(h.fetchMock).toHaveBeenCalledTimes(LAST_GRACE_SLOT + 1);
  expect(warn).toHaveBeenCalledWith(EXCHANGE_AUDIT_RPC_MISSING);
  expect(warn.mock.calls.every((args) => args.length === 1)).toBe(true);
});

it('charges a missing function to the failure budget after the grace time', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const h = harness([missing]);
  const first = LAST_GRACE_SLOT + 1;
  expect(T0 + first * DAY_MS).toBeGreaterThan(RPC_MISSING_GRACE_UNTIL);
  for (let slot = first; slot < first + 5; slot++) {
    expect(await h.run(slot)).toMatchObject([
      { attempts: 1, detail: { deleted: 0 }, outcome: 'failed' },
    ]);
    h.restart();
  }
  expect(await h.run(first + 5)).toMatchObject([
    { outcome: 'skipped', reason: 'stopped' },
  ]);
  expect(h.fetchMock).toHaveBeenCalledTimes(5);
  expect(warn).not.toHaveBeenCalled();
});

it.each([
  [
    'another PostgREST code',
    () => Response.json({ code: 'PGRST106' }, { status: 404 }),
  ],
  ['an empty body', () => new Response(null, { status: 404 })],
  ['a non-JSON body', () => new Response('Not Found', { status: 404 })],
  [
    'an oversized body',
    () =>
      Response.json(
        { code: 'PGRST202', hint: 'x'.repeat(1100) },
        { status: 404 }
      ),
  ],
])('fails a 404 with %s even before the grace time', async (_, reply) => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const h = harness([reply]);
  expect(await h.run()).toMatchObject([{ attempts: 1, outcome: 'failed' }]);
  expect(h.fetchMock).toHaveBeenCalledTimes(1);
  expect(warn).not.toHaveBeenCalled();
});

it('maps a 5xx to unknown and stops after five charged slots with no in-slot retry', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const h = harness([() => new Response(null, { status: 503 })]);
  for (let slot = 0; slot < 5; slot++) {
    expect(await h.run(slot)).toMatchObject([
      { attempts: 1, outcome: 'unknown' },
    ]);
    h.restart();
  }
  expect(await h.run(5)).toMatchObject([
    { outcome: 'skipped', reason: 'stopped' },
  ]);
  expect(h.fetchMock).toHaveBeenCalledTimes(5);
});

it.each([
  () => Response.json(1001),
  () => Response.json(-1),
  () => Response.json(0.5),
  () => Response.json({ deleted: 1 }),
  () => new Response('not json'),
])('treats an invalid count as unknown without another call', async (reply) => {
  const h = harness([reply]);
  expect(await h.run()).toMatchObject([{ attempts: 1, outcome: 'unknown' }]);
  expect(h.fetchMock).toHaveBeenCalledTimes(1);
});

it('checks the fence exactly once before each call', async () => {
  const order: string[] = [];
  const counts = [1000, 1000, 1000, 3];
  const result = await runExchangeAuditRetention({
    call: async () => {
      order.push('call');
      return { kind: 'ok', value: counts.shift() };
    },
    canStartAnotherPage: () => true,
    fence: async () => {
      order.push('fence');
      return true;
    },
    now: () => T0,
  });
  expect(result).toEqual({ detail: { deleted: 3003 }, outcome: 'ok' });
  expect(order).toEqual([
    'fence',
    'call',
    'fence',
    'call',
    'fence',
    'call',
    'fence',
    'call',
  ]);
});
