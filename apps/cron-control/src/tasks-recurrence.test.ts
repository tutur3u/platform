import { expect, it, vi } from 'vite-plus/test';
import { handleControlRequest } from './control';
import { dispatchScheduledJobs, type DispatchEnv } from './dispatch';
import { findJob, processorDeadlineMs, scheduleSlot } from './jobs';
import { LedgerCore, localLedger, memoryLedgerStore } from './ledger';

const jobId = 'tasks-recurrence-generation';
const cron = '*/15 * * * *';
const start = Date.parse('2026-11-21T03:00:00Z');
const operatorToken = 'local-test-operator-token-00000000000';
const env = {
  CRON_CONTROL_ENABLED_JOBS: jobId,
  CRON_CONTROL_OPERATOR_TOKEN: operatorToken,
  CRON_CONTROL_WORKER_PROCESSORS: '',
  SUPABASE_URL: 'https://db.example.test',
  SUPABASE_SECRET_KEY: 'disposable-service-key',
  TASKS_ORIGIN: 'https://tasks.example.test',
};
const enabled = { ...env, TASKS_RECURRENCE_MODE: 'generate' };

function fixture(
  respond: (
    path: string,
    args: Record<string, unknown>
  ) => Response | Promise<Response>
) {
  const { store } = memoryLedgerStore();
  const ledger = vi.fn(() => localLedger(new LedgerCore(store)));
  let now = start;
  const send = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const target = new URL(String(url));
    expect(target.origin).toBe(env.SUPABASE_URL);
    expect(init?.method).toBe('POST');
    expect(init?.redirect).toBe('manual');
    expect(new Headers(init?.headers).get('content-profile')).toBe('private');
    return respond(target.pathname, JSON.parse(String(init?.body)));
  });
  const sleep = vi.fn(async () => undefined);
  const run = (tick: number, config: DispatchEnv = enabled) => {
    now = tick;
    return dispatchScheduledJobs(cron, tick, config, {
      fetch: send as typeof fetch,
      ledger,
      now: () => now,
      sleep,
    });
  };
  return { run, send, ledger, sleep, store };
}

function token(i: number) {
  return `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
}

it('budgets 120 seconds and does no database or ledger work while absent, off or unknown', async () => {
  expect(processorDeadlineMs(findJob(jobId)!)).toBe(120_000);
  const h = fixture(() => {
    throw new Error('unexpected call');
  });
  const absent = await h.run(start, {
    ...enabled,
    CRON_CONTROL_ENABLED_JOBS: '',
  });
  expect(absent).toEqual([]);
  for (const mode of ['off', undefined, 'generate ']) {
    expect(
      await h.run(start, { ...enabled, TASKS_RECURRENCE_MODE: mode })
    ).toEqual([{ id: jobId, outcome: 'skipped', reason: 'recurrence-off' }]);
  }
  expect(h.send).not.toHaveBeenCalled();
  expect(h.ledger).not.toHaveBeenCalled();
});

it('dry-run only probes and a redelivered tick does not call the database', async () => {
  const h = fixture((path, body) => {
    expect(path).toBe('/rest/v1/rpc/task_recurrence_probe');
    expect(body).toEqual({ p_slot: start / 1000 });
    return Response.json({
      workspaces_sampled: 4,
      workspaces_with_due_series: 2,
    });
  });
  const config = { ...enabled, TASKS_RECURRENCE_MODE: 'dry-run' };
  expect(await h.run(start, config)).toMatchObject([
    { detail: { calls: 1, examined: 4 }, outcome: 'ok' },
  ]);
  expect(await h.run(start + 10_000, config)).toMatchObject([
    { outcome: 'skipped', reason: 'duplicate' },
  ]);
  expect(h.send).toHaveBeenCalledTimes(1);
});

it('uses native private RPCs and stops after five batches at 32 per batch', async () => {
  const h = fixture((path, body) => {
    const batch = Number(body.p_batch);
    const tokens = Array.from({ length: 32 }, (_, index) =>
      token(batch * 32 + index)
    );
    expect(body.p_slot).toBe(start / 1000);
    if (path.endsWith('/task_recurrence_claim')) {
      return Response.json({
        status: 'claimed',
        exhausted: false,
        examined: 64,
        tokens,
      });
    }
    expect(path).toBe('/rest/v1/rpc/task_recurrence_commit');
    expect(body.p_items).toEqual(tokens.map((value) => ({ token: value })));
    return Response.json({
      status: 'committed',
      created: 32,
      held: 0,
      skipped: 0,
      failed: 0,
      stale: 0,
      expired: 0,
      downtime_skipped: 0,
    });
  });
  expect(await h.run(start)).toMatchObject([
    {
      detail: {
        calls: 10,
        claimed: 160,
        created: 160,
        examined: 320,
      },
      outcome: 'ok',
    },
  ]);
  expect(h.send).toHaveBeenCalledTimes(10);
  expect(h.sleep).not.toHaveBeenCalled();
});

it('checks the durable fence between a claim and commit', async () => {
  const h = fixture((path) => {
    expect(path).toBe('/rest/v1/rpc/task_recurrence_claim');
    new LedgerCore(h.store).stop(jobId, 'operator');
    return Response.json({
      status: 'claimed',
      exhausted: false,
      examined: 1,
      tokens: [token(1)],
    });
  });
  expect(await h.run(start)).toMatchObject([{ outcome: 'stopped' }]);
  expect(h.send).toHaveBeenCalledTimes(1);
  expect(new LedgerCore(h.store).status()[jobId]?.stopped).toBe(true);
});

it('charges lost responses once per slot and stops across restarts after five runs', async () => {
  let unavailable = true;
  const h = fixture(() => {
    if (unavailable) throw new Error('lost response');
    return Response.json({
      status: 'claimed',
      exhausted: true,
      examined: 0,
      tokens: [],
    });
  });
  for (let slot = 0; slot < 5; slot++) {
    expect(await h.run(start + slot * 900_000)).toMatchObject([
      { outcome: 'unknown' },
    ]);
  }
  expect(new LedgerCore(h.store).status()[jobId]).toMatchObject({
    stopped: true,
    stopReason: 'failure-budget-exhausted',
    consecutiveFailures: 5,
    lastSlot: scheduleSlot(start + 4 * 900_000),
  });
  expect(await h.run(start + 5 * 900_000)).toMatchObject([
    { outcome: 'skipped', reason: 'stopped' },
  ]);
  expect(h.send).toHaveBeenCalledTimes(5);
  expect(h.sleep).not.toHaveBeenCalled();

  unavailable = false;
  const state = new LedgerCore(h.store).resume(jobId);
  expect(state).toMatchObject({
    generation: 2,
    consecutiveFailures: 0,
    stopped: false,
  });
  expect(await h.run(start + 4 * 900_000)).toMatchObject([
    { outcome: 'skipped', reason: 'duplicate' },
  ]);
  expect(await h.run(start + 5 * 900_000)).toMatchObject([{ outcome: 'ok' }]);
  expect(h.send).toHaveBeenCalledTimes(6);
});

it('keeps the ledger stopped until the database disable is confirmed', async () => {
  let databaseEnabled = true;
  const h = fixture((path, body) => {
    expect(new LedgerCore(h.store).status()[jobId]?.stopped).toBe(true);
    if (path.endsWith('/task_recurrence_probe'))
      return Response.json({
        epoch: databaseEnabled ? 4 : 5,
        request_enabled: databaseEnabled,
        scheduler_enabled: databaseEnabled,
      });
    expect(path).toBe('/rest/v1/rpc/task_recurrence_disable_control');
    expect(body).toEqual({ p_expected_epoch: 4 });
    databaseEnabled = false;
    return new Response(null, { status: 503 });
  });
  const call = () =>
    handleControlRequest(
      new Request(`https://cron.example.test/control/jobs/${jobId}/stop`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${operatorToken}` },
      }),
      enabled,
      h.ledger,
      h.send as typeof fetch
    );
  const first = await call();
  expect(first?.status).toBe(503);
  await expect(first?.json()).resolves.toMatchObject({
    databaseStop: 'pending',
    state: { stopped: true },
  });
  await expect((await call())?.json()).resolves.toMatchObject({
    databaseStop: 'confirmed',
    epoch: 5,
  });
  expect(h.send).toHaveBeenCalledTimes(3);
});
