import { afterEach, expect, it, vi } from 'vite-plus/test';
import { dispatchScheduledJobs, USER_AGENT } from './dispatch';
import { CRON_JOBS, leaseMs, MAX_CONSECUTIVE_FAILURES } from './jobs';
import { LedgerCore, localLedger, memoryLedgerStore } from './ledger';

const SECRET = 'test-cron-secret-value';
const env = {
  CRON_SECRET_INFRASTRUCTURE: SECRET,
  CRON_SECRET_INVENTORY: SECRET,
  CRON_SECRET_PAY: SECRET,
  CRON_SECRET_TASKS: SECRET,
  CRON_SECRET_WEB: SECRET,
  INFRASTRUCTURE_ORIGIN: 'https://infrastructure.example.test',
  INVENTORY_ORIGIN: 'https://inventory.example.test',
  PAY_ORIGIN: 'https://pay.example.test',
  TASKS_ORIGIN: 'https://tasks.example.test',
  WEB_ORIGIN: 'https://web.example.test',
};
const DAILY = '17 3 * * *';
const T0 = Date.parse('2026-10-23T03:17:00.000Z');
const DAY = 86_400_000;

function harness(respond: (url: URL) => Response | Promise<Response>) {
  const { counts, store } = memoryLedgerStore();
  const core = new LedgerCore(store);
  const ledger = localLedger(core);
  const ledgerSpy = vi.fn(() => ledger);
  const calls: { headers: Headers; init?: RequestInit; url: URL }[] = [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({ headers: new Headers(init?.headers), init, url });
      return respond(url);
    }
  );
  const sleep = vi.fn(async () => undefined);
  const deps = {
    fetch: fetchMock as typeof fetch,
    ledger: ledgerSpy,
    now: () => T0,
    sleep,
  };
  return { calls, core, counts, deps, ledgerSpy, sleep };
}

afterEach(() => {
  vi.restoreAllMocks();
});

it('performs no storage or network work while every job is disabled', async () => {
  const h = harness(() => Response.json({}));
  for (const cron of new Set(CRON_JOBS.map((job) => job.cron)))
    for (let tick = 0; tick < 10; tick++)
      expect(
        await dispatchScheduledJobs(cron, T0 + tick * 60_000, env, h.deps)
      ).toEqual([]);
  expect(h.calls).toHaveLength(0);
  expect(h.ledgerSpy).not.toHaveBeenCalled();
});

it('ignores unknown ids and jobs scheduled on another trigger', async () => {
  const h = harness(() => Response.json({}));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const enabled = { ...env, CRON_CONTROL_ENABLED_JOBS: 'nope, pay-products' };
  expect(await dispatchScheduledJobs(DAILY, T0, enabled, h.deps)).toEqual([]);
  expect(h.calls).toHaveLength(0);
  expect(console.error).toHaveBeenCalledWith(
    'Cron Control ignored unknown enabled jobs',
    { unknown: ['nope'] }
  );
});

it('calls the existing processor once per slot over the current auth contract', async () => {
  const h = harness(() => Response.json({ deleted: 0 }));
  const enabled = { ...env, CRON_CONTROL_ENABLED_JOBS: 'tasks-cleanup-media' };
  expect(await dispatchScheduledJobs(DAILY, T0, enabled, h.deps)).toEqual([
    { attempts: 1, id: 'tasks-cleanup-media', outcome: 'ok', status: 200 },
  ]);
  // Duplicate delivery of the same slot, even seconds later, is a no-op.
  expect(
    await dispatchScheduledJobs(DAILY, T0 + 30_000, enabled, h.deps)
  ).toEqual([
    { id: 'tasks-cleanup-media', outcome: 'skipped', reason: 'duplicate' },
  ]);
  expect(h.calls).toHaveLength(1);
  const [call] = h.calls;
  expect(call.url.href).toBe(
    'https://tasks.example.test/api/cron/tasks/cleanup-media'
  );
  expect(call.init?.method).toBe('GET');
  expect(call.init?.redirect).toBe('manual');
  expect(call.init?.body).toBeUndefined();
  expect(call.headers.get('authorization')).toBe(`Bearer ${SECRET}`);
  expect(call.headers.get('user-agent')).toBe(USER_AGENT);
  expect(h.counts.writes).toBe(2);
});

it('posts an empty JSON body to POST processors', async () => {
  const h = harness(() => Response.json({}));
  const enabled = {
    ...env,
    CRON_CONTROL_ENABLED_JOBS: 'finance-exchange-rates',
  };
  await dispatchScheduledJobs('0 6 * * *', T0, enabled, h.deps);
  expect(h.calls[0].init).toMatchObject({ body: '{}', method: 'POST' });
  expect(h.calls[0].headers.get('content-type')).toBe('application/json');
});

it('reports a missing secret or insecure origin without claiming', async () => {
  const h = harness(() => Response.json({}));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  for (const broken of [
    { CRON_SECRET_TASKS: '' },
    { TASKS_ORIGIN: 'http://tasks.example.test' },
    { TASKS_ORIGIN: 'not a url' },
  ]) {
    const [report] = await dispatchScheduledJobs(
      DAILY,
      T0,
      { ...env, ...broken, CRON_CONTROL_ENABLED_JOBS: 'tasks-cleanup-media' },
      h.deps
    );
    expect(report.outcome).toBe('misconfigured');
  }
  expect(h.calls).toHaveLength(0);
  expect(h.ledgerSpy).not.toHaveBeenCalled();
});

it('retries one transient gateway failure for retry-safe jobs only', async () => {
  const h = harness(() => new Response(null, { status: 503 }));
  const both = {
    ...env,
    CRON_CONTROL_ENABLED_JOBS:
      'inventory-checkout-expiry,web-deadline-reminders',
  };
  const reports = await dispatchScheduledJobs('*/5 * * * *', T0, both, h.deps);
  expect(reports).toEqual(
    expect.arrayContaining([
      {
        attempts: 2,
        id: 'inventory-checkout-expiry',
        outcome: 'failed',
        status: 503,
      },
      {
        attempts: 1,
        id: 'web-deadline-reminders',
        outcome: 'failed',
        status: 503,
      },
    ])
  );
  expect(h.calls).toHaveLength(3);
  expect(h.sleep).toHaveBeenCalledTimes(1);
});

it('never retries a processor error, redirect or deadline', async () => {
  for (const respond of [
    () => new Response(null, { status: 500 }),
    () => new Response(null, { status: 302, headers: { Location: '/x' } }),
    () => {
      throw new DOMException('Deadline', 'TimeoutError');
    },
  ]) {
    const h = harness(respond);
    const [report] = await dispatchScheduledJobs(
      '*/5 * * * *',
      T0,
      { ...env, CRON_CONTROL_ENABLED_JOBS: 'inventory-checkout-expiry' },
      h.deps
    );
    expect(report).toMatchObject({ attempts: 1 });
    expect(['failed', 'unknown']).toContain(report.outcome);
    expect(h.calls).toHaveLength(1);
  }
});

it('a stop racing a retry wins and no further attempt starts', async () => {
  const h = harness(() => new Response(null, { status: 502 }));
  h.sleep.mockImplementation(async () => {
    h.core.stop('inventory-checkout-expiry', 'operator');
  });
  const [report] = await dispatchScheduledJobs(
    '*/5 * * * *',
    T0,
    { ...env, CRON_CONTROL_ENABLED_JOBS: 'inventory-checkout-expiry' },
    h.deps
  );
  expect(report).toMatchObject({ attempts: 1, outcome: 'stopped' });
  expect(h.calls).toHaveLength(1);
});

it('persistent failure stops the job after a bounded number of slots', async () => {
  const h = harness(() => new Response(null, { status: 500 }));
  const enabled = { ...env, CRON_CONTROL_ENABLED_JOBS: 'tasks-cleanup-media' };
  for (let day = 0; day < MAX_CONSECUTIVE_FAILURES + 5; day++)
    await dispatchScheduledJobs(DAILY, T0 + day * DAY, enabled, h.deps);
  expect(h.calls).toHaveLength(MAX_CONSECUTIVE_FAILURES);
  expect(h.core.status()['tasks-cleanup-media']).toMatchObject({
    stopReason: 'failure-budget-exhausted',
    stopped: true,
  });
});

it('a 200 reporting ok:false is a failed run that exhausts the budget', async () => {
  const h = harness(() =>
    Response.json({ ok: false, failed: 2, processed: 2 }, { status: 200 })
  );
  const enabled = {
    ...env,
    CRON_CONTROL_ENABLED_JOBS: 'calendar-provider-sync',
  };
  const QUARTER_HOUR = 15 * 60_000;
  const reports = [];
  for (let tick = 0; tick < MAX_CONSECUTIVE_FAILURES + 3; tick++)
    reports.push(
      ...(await dispatchScheduledJobs(
        '*/15 * * * *',
        T0 + tick * QUARTER_HOUR,
        enabled,
        h.deps
      ))
    );
  expect(reports[0]).toMatchObject({ outcome: 'failed', status: 200 });
  expect(h.calls).toHaveLength(MAX_CONSECUTIVE_FAILURES);
  expect(h.core.status()['calendar-provider-sync']).toMatchObject({
    stopReason: 'failure-budget-exhausted',
    stopped: true,
  });
});

it('accepts complete JSON summaries for existing processor contracts', async () => {
  for (const body of [{ ok: true }, { deleted: 0 }]) {
    const h = harness(() => Response.json(body));
    const [report] = await dispatchScheduledJobs(
      DAILY,
      T0,
      { ...env, CRON_CONTROL_ENABLED_JOBS: 'tasks-cleanup-media' },
      h.deps
    );
    expect(report).toMatchObject({ outcome: 'ok', status: 200 });
  }
});

it.each([
  ['non-JSON', 'done'],
  ['truncated', '{"ok":true'],
  ['null', 'null'],
  ['array', '[]'],
  ['empty', ''],
  ['oversized', JSON.stringify({ ok: false, padding: 'x'.repeat(70 * 1024) })],
])(
  'charges inconclusive 200 summaries against the failure budget: %s',
  async (_label, body) => {
    const h = harness(() => new Response(body));
    const enabled = {
      ...env,
      CRON_CONTROL_ENABLED_JOBS: 'tasks-cleanup-media',
    };
    for (let day = 0; day < MAX_CONSECUTIVE_FAILURES + 1; day++) {
      const [report] = await dispatchScheduledJobs(
        DAILY,
        T0 + day * DAY,
        enabled,
        h.deps
      );
      expect(report.outcome).toBe(
        day < MAX_CONSECUTIVE_FAILURES ? 'unknown' : 'skipped'
      );
    }
    expect(h.calls).toHaveLength(MAX_CONSECUTIVE_FAILURES);
    expect(h.core.status()['tasks-cleanup-media']).toMatchObject({
      consecutiveFailures: MAX_CONSECUTIVE_FAILURES,
      lastOutcome: 'unknown',
      stopped: true,
    });
  }
);

it.each(['TimeoutError', 'AbortError', 'Error'])(
  'does not accept a body read %s after 200 headers',
  async (name) => {
    const h = harness(
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new DOMException('body read failed', name));
            },
          })
        )
    );
    const [report] = await dispatchScheduledJobs(
      DAILY,
      T0,
      { ...env, CRON_CONTROL_ENABLED_JOBS: 'tasks-cleanup-media' },
      h.deps
    );
    expect(report).toMatchObject({
      attempts: 1,
      outcome: 'unknown',
      status: 200,
    });
    expect(h.core.status()['tasks-cleanup-media'].consecutiveFailures).toBe(1);
  }
);

it('accepts the exact byte cap and cancels a chunk exceeding the remaining budget', async () => {
  const limit = 64 * 1024;
  for (const bytes of [limit, limit + 1]) {
    const body = JSON.stringify({ ok: true, padding: '' });
    const text = body.replace(
      '"padding":""',
      `"padding":"${'x'.repeat(bytes - body.length)}"`
    );
    const cancel = vi.fn();
    const h = harness(
      () =>
        new Response(
          new ReadableStream(
            {
              start(controller) {
                controller.enqueue(new TextEncoder().encode(text));
              },
              pull(controller) {
                controller.close();
              },
              cancel,
            },
            { highWaterMark: 0 }
          )
        )
    );
    const [report] = await dispatchScheduledJobs(
      DAILY,
      T0,
      { ...env, CRON_CONTROL_ENABLED_JOBS: 'tasks-cleanup-media' },
      h.deps
    );
    expect(report.outcome).toBe(bytes === limit ? 'ok' : 'unknown');
    if (bytes > limit) expect(cancel).toHaveBeenCalledOnce();
  }
});

it('bounds concurrent processor calls within one tick', async () => {
  let active = 0;
  let peak = 0;
  const h = harness(async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return Response.json({});
  });
  const quarterHour = CRON_JOBS.filter((job) => job.cron === '*/15 * * * *');
  const reports = await dispatchScheduledJobs(
    '*/15 * * * *',
    T0,
    {
      ...env,
      CRON_CONTROL_ENABLED_JOBS: quarterHour.map((job) => job.id).join(','),
    },
    h.deps
  );
  expect(reports).toHaveLength(quarterHour.length);
  expect(peak).toBeLessThanOrEqual(4);
});

it('fails closed without calling the processor when the ledger is down', async () => {
  const h = harness(() => Response.json({}));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  h.ledgerSpy.mockImplementation(() => {
    throw new Error('Durable Object unavailable');
  });
  const [report] = await dispatchScheduledJobs(
    DAILY,
    T0,
    { ...env, CRON_CONTROL_ENABLED_JOBS: 'tasks-cleanup-media' },
    h.deps
  );
  expect(report).toEqual({
    id: 'tasks-cleanup-media',
    outcome: 'skipped',
    reason: 'error',
  });
  expect(h.calls).toHaveLength(0);
});

it('runs the checkout-expiry Worker port only when separately selected', async () => {
  const h = harness((url) =>
    url.hostname === 'db.example.test'
      ? Response.json([])
      : Response.json({ ok: true })
  );
  const workerEnv = {
    ...env,
    CRON_CONTROL_ENABLED_JOBS: 'inventory-checkout-expiry',
    SUPABASE_SECRET_KEY: 'service-key',
    SUPABASE_URL: 'https://db.example.test',
  };
  await dispatchScheduledJobs('*/5 * * * *', T0, workerEnv, h.deps);
  expect(h.calls.map((call) => call.url.pathname)).toEqual([
    '/api/cron/inventory/checkout-expiry',
  ]);

  const [report] = await dispatchScheduledJobs(
    '*/5 * * * *',
    T0 + 300_000,
    {
      ...workerEnv,
      CRON_CONTROL_WORKER_PROCESSORS: 'inventory-checkout-expiry',
    },
    h.deps
  );
  expect(report).toEqual({
    attempts: 1,
    detail: { batches: 1, expired: 0, pending: 0, revalidated: 0 },
    id: 'inventory-checkout-expiry',
    outcome: 'ok',
  });
  // The idle Worker slot replaces the Vercel invocation with one RPC.
  expect(h.calls.slice(1).map((call) => call.url.pathname)).toEqual([
    '/rest/v1/rpc/expire_inventory_checkout_sessions',
  ]);
});

it('a slow Worker processor records its outcome inside the lease before the next slot', async () => {
  // Worst case: every request hangs until its own timeout.
  const clock = { now: T0 };
  const timeouts: number[] = [];
  const realTimeout = AbortSignal.timeout.bind(AbortSignal);
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
    timeouts.push(ms);
    return realTimeout(ms);
  });
  const workspaces = Array.from(
    { length: 600 },
    (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
  );
  let expiredOnce = false;
  const h = harness((url) => {
    clock.now += timeouts.at(-1) ?? 0;
    if (url.hostname !== 'db.example.test') return Response.json({ ok: true });
    const rows = expiredOnce ? [] : workspaces.map((ws_id) => ({ ws_id }));
    expiredOnce = true;
    return Response.json(rows);
  });
  h.deps.now = () => clock.now;
  const workerEnv = {
    ...env,
    CRON_CONTROL_ENABLED_JOBS: 'inventory-checkout-expiry',
    CRON_CONTROL_WORKER_PROCESSORS: 'inventory-checkout-expiry',
    SUPABASE_SECRET_KEY: 'service-key',
    SUPABASE_URL: 'https://db.example.test',
  };
  const job = CRON_JOBS.find(
    (entry) => entry.id === 'inventory-checkout-expiry'
  );
  const lease = leaseMs(job!);
  const [first] = await dispatchScheduledJobs(
    '*/5 * * * *',
    T0,
    workerEnv,
    h.deps
  );
  // The run stopped at its deadline and recorded the outcome inside the lease.
  expect(clock.now).toBeLessThanOrEqual(T0 + lease - 30_000);
  expect(first).toMatchObject({
    detail: { expired: 600, pending: 200, revalidated: 400 },
    outcome: 'ok',
  });
  expect(h.core.status()['inventory-checkout-expiry']).toMatchObject({
    lastOutcome: 'ok',
    leaseUntil: 0,
  });
  expect(h.core.pendingWork('inventory-checkout-expiry')).toHaveLength(200);

  // The next slot claims normally and retries the outstanding revalidation.
  clock.now = T0 + 300_000;
  const [second] = await dispatchScheduledJobs(
    '*/5 * * * *',
    T0 + 300_000,
    workerEnv,
    h.deps
  );
  expect(second).toMatchObject({
    detail: { expired: 0, pending: 0, revalidated: 200 },
    outcome: 'ok',
  });
  expect(h.core.pendingWork('inventory-checkout-expiry')).toEqual([]);
});
