// AI Studio retention through the real dispatch, ledger and processor,
// against an in-memory model of the private retention RPCs. The SQL contract
// itself is covered by apps/database/supabase/tests/ai-studio-retention-schedule.sql.
import { afterEach, expect, it, vi } from 'vite-plus/test';
import { dispatchScheduledJobs } from './dispatch';
import {
  CRON_TRIGGERS,
  DATABASE_MAINTENANCE_RPCS,
  findJob,
  processorDeadlineMs,
} from './jobs';
import { LedgerCore, localLedger, memoryLedgerStore } from './ledger';
import {
  AI_RETENTION_BATCH_LIMIT,
  AI_RETENTION_MAX_BATCHES,
  aiRetentionMode,
} from './processors/ai-studio-retention';

const ID = 'ai-studio-retention';
// 19:43 UTC is 02:43 GMT+7, the low-traffic window for Vietnamese users.
const CRON = '43 19 * * *';
const DAY = 86_400_000;
const T0 = Date.parse('2026-11-03T19:43:00Z');
const baseEnv = {
  CRON_CONTROL_ENABLED_JOBS: ID,
  SUPABASE_URL: 'https://database.example.test',
  SUPABASE_SECRET_KEY: 'disposable-service-key',
};

const COUNT_KEYS = [
  'content_rows',
  'run_rows',
  'cascade_content_rows',
  'step_rows',
  'usage_rows',
  'evaluation_links',
  'held_in_flight_runs',
  'held_current_month_runs',
] as const;

// Mirrors the SQL semantics: counts are read-only, each batch deletes at most
// `p_limit` expired content rows and at most `p_limit` due runs, and progress
// is the remaining data.
class FakeDatabase {
  content = 0;
  runs = 0;
  records: Record<string, unknown>[] = [];

  handle(rpc: string, body: Record<string, unknown>): unknown {
    if (rpc === 'count_ai_studio_retention') {
      if (Object.keys(body).length !== 0)
        throw new Error('count takes no args');
      return {
        content_rows: this.content,
        content_oldest: this.content ? '2026-09-01T00:00:00+00:00' : null,
        content_newest: this.content ? '2026-10-01T00:00:00+00:00' : null,
        run_rows: this.runs,
        run_oldest: this.runs ? '2025-09-01T00:00:00+00:00' : null,
        run_newest: this.runs ? '2025-10-01T00:00:00+00:00' : null,
        cascade_content_rows: 0,
        step_rows: this.runs * 2,
        usage_rows: this.runs,
        evaluation_links: 0,
        held_in_flight_runs: 1,
        held_current_month_runs: 0,
        global_retention_days: 365,
        workspace_overrides: 0,
        cutoff_oldest: '2025-11-03T19:43:00+00:00',
        cutoff_newest: '2025-11-03T19:43:00+00:00',
      };
    }
    if (rpc === 'cleanup_ai_studio_retention_batch') {
      const limit = Number(body.p_limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 1_000)
        throw new Error('invalid batch');
      const content = Math.min(limit, this.content);
      const runs = Math.min(limit, this.runs);
      this.content -= content;
      this.runs -= runs;
      return {
        state: content === limit || runs === limit ? 'more' : 'done',
        content_rows: content,
        run_rows: runs,
        cascade_content_rows: 0,
        step_rows: runs * 2,
        usage_rows: runs,
        evaluation_links: 0,
      };
    }
    if (rpc === 'record_ai_studio_retention_run') {
      this.records.push(body);
      return { recorded: 1 };
    }
    throw new Error(`Unexpected RPC ${rpc}`);
  }
}

type Interceptor = (
  rpc: string,
  body: Record<string, unknown>,
  call: number
) => Response | Promise<Response> | undefined;

function harness(mode?: string) {
  const { store } = memoryLedgerStore();
  let core = new LedgerCore(store);
  let clock = T0;
  const db = new FakeDatabase();
  const intercept: { fn?: Interceptor } = {};
  const calls: { body: Record<string, unknown>; rpc: string }[] = [];
  const env =
    mode === undefined
      ? { ...baseEnv }
      : { ...baseEnv, AI_STUDIO_RETENTION_MODE: mode };
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    const rpc = url.pathname.replace('/rest/v1/rpc/', '');
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ body, rpc });
    const override = await intercept.fn?.(rpc, body, calls.length);
    return override ?? Response.json(db.handle(rpc, body));
  });
  const run = (day = 0) => {
    clock = T0 + day * DAY;
    return dispatchScheduledJobs(CRON, clock, env, {
      fetch: fetchMock,
      ledger: () => localLedger(core),
      now: () => clock,
      sleep: async () => undefined,
    });
  };
  return {
    advance: (milliseconds: number) => {
      clock += milliseconds;
    },
    calls,
    core: () => core,
    db,
    fetchMock,
    intercept,
    restart: () => {
      core = new LedgerCore(store);
    },
    rpcs: () =>
      calls.map((call) =>
        call.rpc
          .replace('count_ai_studio_retention', 'count')
          .replace('cleanup_ai_studio_retention_batch', 'batch')
          .replace('record_ai_studio_retention_run', 'record')
      ),
    run,
  };
}

afterEach(() => vi.restoreAllMocks());

it('is registered like the other native retention jobs, daily at 02:43 GMT+7', () => {
  const job = findJob(ID);
  expect(job).toMatchObject({
    cron: CRON,
    method: 'GET',
    overlap: 'idempotent',
    path: '/rest/v1/rpc/cleanup_ai_studio_retention_batch',
    target: 'web',
    workerProcessor: 'ai-studio-retention',
  });
  expect(CRON_TRIGGERS).toContain(CRON);
  expect(DATABASE_MAINTENANCE_RPCS['ai-studio-retention']).toBe(
    'cleanup_ai_studio_retention_batch'
  );
  // Five minutes of processor time, inside the lease.
  expect(job && processorDeadlineMs(job)).toBe(300_000);
});

it('fails safe: only an exact delete or off value leaves dry-run', () => {
  expect(aiRetentionMode(undefined)).toBe('dry-run');
  expect(aiRetentionMode('')).toBe('dry-run');
  expect(aiRetentionMode('dry-run')).toBe('dry-run');
  expect(aiRetentionMode('DELETE')).toBe('dry-run');
  expect(aiRetentionMode('delete-now')).toBe('dry-run');
  expect(aiRetentionMode(' delete ')).toBe('delete');
  expect(aiRetentionMode('delete')).toBe('delete');
  expect(aiRetentionMode('off')).toBe('off');
});

it('defaults off with no database calls until the job is enabled', async () => {
  const h = harness();
  expect(
    await dispatchScheduledJobs(
      CRON,
      T0,
      { ...baseEnv, CRON_CONTROL_ENABLED_JOBS: '' },
      {
        fetch: h.fetchMock,
        ledger: () => localLedger(h.core()),
        now: () => T0,
        sleep: async () => undefined,
      }
    )
  ).toEqual([]);
  expect(h.fetchMock).not.toHaveBeenCalled();
});

it('dry-runs by default: counts only, deletes nothing, records counts', async () => {
  const h = harness();
  Object.assign(h.db, { content: 1_200, runs: 700 });
  expect(await h.run()).toMatchObject([
    {
      id: ID,
      outcome: 'ok',
      detail: {
        dryRun: 1,
        batches: 0,
        contentRows: 1_200,
        runRows: 700,
        stepRows: 1_400,
        usageRows: 700,
        heldInFlightRuns: 1,
      },
    },
  ]);
  expect(h.rpcs()).toEqual(['count', 'record']);
  expect(h.db.content).toBe(1_200);
  expect(h.db.runs).toBe(700);
  expect(h.db.records).toEqual([
    {
      p_mode: 'dry_run',
      p_status: 'done',
      p_batches: 0,
      p_content_rows: 1_200,
      p_run_rows: 700,
      p_cascade_content_rows: 0,
      p_step_rows: 1_400,
      p_usage_rows: 700,
      p_evaluation_links: 0,
      p_held_in_flight_runs: 1,
      p_held_current_month_runs: 0,
    },
  ]);
});

it('treats an unrecognised mode as dry-run', async () => {
  const h = harness('Delete');
  Object.assign(h.db, { content: 10, runs: 10 });
  expect(await h.run()).toMatchObject([
    { outcome: 'ok', detail: { dryRun: 1 } },
  ]);
  expect(h.rpcs()).toEqual(['count', 'record']);
  expect(h.db.content).toBe(10);
});

it('kill switch off makes no database call at all', async () => {
  const h = harness('off');
  Object.assign(h.db, { content: 1_200, runs: 700 });
  expect(await h.run()).toMatchObject([
    { id: ID, outcome: 'ok', detail: { off: 1, batches: 0 } },
  ]);
  expect(h.fetchMock).not.toHaveBeenCalled();
  expect(h.db.content).toBe(1_200);
});

it('live mode loops bounded batches until done and records the totals', async () => {
  const h = harness('delete');
  Object.assign(h.db, { content: 1_200, runs: 700 });
  expect(await h.run()).toMatchObject([
    {
      attempts: 1,
      outcome: 'ok',
      detail: { batches: 3, contentRows: 1_200, runRows: 700 },
    },
  ]);
  expect(h.rpcs()).toEqual(['batch', 'batch', 'batch', 'record']);
  for (const call of h.calls.slice(0, 3))
    expect(call.body).toEqual({ p_limit: AI_RETENTION_BATCH_LIMIT });
  expect(h.db.content).toBe(0);
  expect(h.db.runs).toBe(0);
  expect(h.db.records.at(-1)).toMatchObject({
    p_mode: 'delete',
    p_status: 'done',
    p_batches: 3,
    p_content_rows: 1_200,
    p_run_rows: 700,
    p_step_rows: 1_400,
    p_usage_rows: 700,
    p_held_in_flight_runs: null,
    p_held_current_month_runs: null,
  });
  // The completed slot is not replayed.
  h.restart();
  expect(await h.run()).toMatchObject([
    { outcome: 'skipped', reason: 'duplicate' },
  ]);
  expect(h.calls).toHaveLength(4);
});

it('caps one run at the batch budget and continues the next day', async () => {
  const h = harness('delete');
  h.db.content = 100_000;
  expect(await h.run()).toMatchObject([
    {
      outcome: 'ok',
      detail: { batches: AI_RETENTION_MAX_BATCHES, budgetExhausted: 1 },
    },
  ]);
  expect(h.calls).toHaveLength(AI_RETENTION_MAX_BATCHES + 1);
  expect(h.db.content).toBe(
    100_000 - AI_RETENTION_MAX_BATCHES * AI_RETENTION_BATCH_LIMIT
  );
  expect(h.db.records.at(-1)).toMatchObject({ p_status: 'budget_exhausted' });
  expect(await h.run(1)).toMatchObject([{ outcome: 'ok' }]);
  expect(h.db.content).toBe(
    100_000 - 2 * AI_RETENTION_MAX_BATCHES * AI_RETENTION_BATCH_LIMIT
  );
});

it('operator stop halts between batches and stays stopped across restart', async () => {
  const h = harness('delete');
  h.db.content = 5_000;
  h.intercept.fn = (rpc, _body, call) => {
    if (rpc === 'cleanup_ai_studio_retention_batch' && call === 2)
      h.core().stop(ID, 'operator');
    return undefined;
  };
  expect(await h.run()).toMatchObject([
    { outcome: 'stopped', detail: { batches: 2, contentRows: 1_000 } },
  ]);
  expect(h.rpcs()).toEqual(['batch', 'batch', 'record']);
  expect(h.db.records.at(-1)).toMatchObject({ p_status: 'stopped' });
  expect(h.db.content).toBe(4_000);
  h.restart();
  expect(await h.run(1)).toMatchObject([
    { outcome: 'skipped', reason: 'stopped' },
  ]);
  expect(h.db.content).toBe(4_000);
});

it('a stopped job does not even dry-run', async () => {
  const h = harness();
  h.core().stop(ID, 'operator');
  expect(await h.run()).toMatchObject([
    { outcome: 'skipped', reason: 'stopped' },
  ]);
  expect(h.fetchMock).not.toHaveBeenCalled();
});

it('stops before a batch that cannot finish inside the time budget', async () => {
  const h = harness('delete');
  h.db.content = 100_000;
  h.intercept.fn = (rpc) => {
    if (rpc === 'cleanup_ai_studio_retention_batch') h.advance(70_000);
    return undefined;
  };
  expect(await h.run()).toMatchObject([
    { outcome: 'ok', detail: { batches: 4, budgetExhausted: 1 } },
  ]);
  // Four batches fit in the 300-second deadline before the 25-second reserve.
  expect(h.rpcs()).toEqual(['batch', 'batch', 'batch', 'batch', 'record']);
  expect(h.db.records.at(-1)).toMatchObject({ p_status: 'budget_exhausted' });
});

it('records an unknown outcome for an out-of-bounds batch summary', async () => {
  const h = harness('delete');
  h.db.content = 700;
  h.intercept.fn = (rpc) =>
    rpc === 'cleanup_ai_studio_retention_batch'
      ? Response.json({
          state: 'more',
          content_rows: AI_RETENTION_BATCH_LIMIT + 1,
          run_rows: 0,
          cascade_content_rows: 0,
          step_rows: 0,
          usage_rows: 0,
          evaluation_links: 0,
        })
      : undefined;
  expect(await h.run()).toMatchObject([{ outcome: 'unknown' }]);
  expect(h.rpcs()).toEqual(['batch', 'record']);
  expect(h.db.records.at(-1)).toMatchObject({ p_status: 'unknown' });
});

it('rejects a dry-run summary that is not counts', async () => {
  const h = harness();
  h.intercept.fn = (rpc) =>
    rpc === 'count_ai_studio_retention'
      ? Response.json({ content_rows: 'many', run_rows: 1 })
      : undefined;
  expect(await h.run()).toMatchObject([{ outcome: 'unknown' }]);
  expect(h.db.records.at(-1)).toMatchObject({
    p_mode: 'dry_run',
    p_status: 'unknown',
  });
});

it('fails without retrying a rejected batch and records the failure', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const h = harness('delete');
  h.db.content = 700;
  h.intercept.fn = (rpc) =>
    rpc === 'cleanup_ai_studio_retention_batch'
      ? new Response(null, { status: 403 })
      : undefined;
  expect(await h.run()).toMatchObject([{ outcome: 'failed' }]);
  expect(h.rpcs()).toEqual(['batch', 'record']);
  expect(h.db.records.at(-1)).toMatchObject({ p_status: 'failed' });
  expect(h.db.content).toBe(700);
});

it('a run whose log cannot be written fails, so five such days stop the job', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const h = harness();
  h.intercept.fn = (rpc) =>
    rpc === 'record_ai_studio_retention_run'
      ? new Response(null, { status: 500 })
      : undefined;
  expect(await h.run()).toMatchObject([
    { outcome: 'failed', detail: { recordFailed: 1 } },
  ]);
  for (let day = 1; day < 5; day++) await h.run(day);
  expect(await h.run(5)).toMatchObject([
    { outcome: 'skipped', reason: 'stopped' },
  ]);
});

it('logs and records counts only, never row content', async () => {
  const h = harness('delete');
  Object.assign(h.db, { content: 3, runs: 2 });
  const [report] = await h.run();
  expect(report).toMatchObject({ outcome: 'ok' });
  const detail = 'detail' in report ? (report.detail ?? {}) : {};
  for (const value of Object.values(detail))
    expect(Number.isInteger(value)).toBe(true);
  const record = h.db.records.at(-1) ?? {};
  for (const [key, value] of Object.entries(record)) {
    if (key === 'p_mode') expect(value).toBe('delete');
    else if (key === 'p_status') expect(value).toBe('done');
    else expect(value === null || Number.isInteger(value)).toBe(true);
  }
  for (const key of COUNT_KEYS)
    expect(Object.keys(record)).toContain(`p_${key}`);
});
