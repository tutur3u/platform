// Meet transcript retention through the real dispatch, ledger and processor,
// against an in-memory model of the private purge RPCs. The SQL contract
// itself is covered by apps/database/supabase/tests/meet-transcript-retention-purge.sql.
import { afterEach, expect, it, vi } from 'vite-plus/test';
import { dispatchScheduledJobs } from './dispatch';
import { LedgerCore, localLedger, memoryLedgerStore } from './ledger';
import {
  MEET_RETENTION_BATCH_LIMIT,
  MEET_RETENTION_MAX_BATCHES,
} from './processors/meet-transcript-retention';

const ID = 'meet-transcript-retention';
const CRON = '17 3 * * *';
const DAY = 86_400_000;
const T0 = Date.parse('2026-10-30T03:17:00Z');
const env = {
  CRON_CONTROL_ENABLED_JOBS: ID,
  SUPABASE_URL: 'https://database.example.test',
  SUPABASE_SECRET_KEY: 'disposable-service-key',
};

interface Run {
  batches: number;
  id: string;
  mode: 'delete' | 'dry_run';
  startedAt: number;
  status: string;
}

// Mirrors the SQL semantics: fence/mode on a control row, progress as the
// remaining rows, one running run, 15-minute abandonment, 20-batch budget.
class FakeDatabase {
  deleteEnabled = false;
  due = 0;
  fenceOpen = false;
  runs: Run[] = [];
  constructor(private readonly clock: () => number) {}

  handle(rpc: string, body: Record<string, unknown>): unknown {
    if (rpc === 'start_meet_transcript_purge_run') return this.start();
    if (rpc === 'purge_meet_transcripts_batch')
      return this.batch(String(body.p_run_id), Number(body.p_limit));
    if (rpc === 'finish_meet_transcript_purge_run') {
      const run = this.runs.find((r) => r.id === body.p_run_id);
      if (run?.status !== 'running') return { finished: 0 };
      run.status = String(body.p_status);
      return { finished: 1 };
    }
    throw new Error(`Unexpected RPC ${rpc}`);
  }

  start() {
    for (const run of this.runs)
      if (run.status === 'running' && run.startedAt < this.clock() - 900_000)
        run.status = 'abandoned';
    if (!this.fenceOpen) return { run_id: crypto.randomUUID(), mode: 'fenced' };
    if (this.runs.some((run) => run.status === 'running'))
      return { run_id: null, mode: 'busy' };
    if (
      this.runs.filter((run) => run.startedAt > this.clock() - DAY).length >= 2
    )
      return { run_id: null, mode: 'daily_cap' };
    const run: Run = {
      batches: 0,
      id: crypto.randomUUID(),
      mode: this.deleteEnabled ? 'delete' : 'dry_run',
      startedAt: this.clock(),
      status: 'running',
    };
    this.runs.push(run);
    return { run_id: run.id, mode: run.mode };
  }

  batch(runId: string, limit: number) {
    const run = this.runs.find((r) => r.id === runId);
    if (!run || limit < 1 || limit > 500) throw new Error('invalid batch');
    if (run.status !== 'running') return { state: 'terminal' };
    if (!this.fenceOpen || (run.mode === 'delete' && !this.deleteEnabled)) {
      run.status = 'stopped';
      return { state: 'fenced' };
    }
    if (run.batches >= 20) {
      run.status = 'budget_exhausted';
      return { state: 'budget_exhausted' };
    }
    run.batches++;
    if (run.mode === 'dry_run') {
      run.status = 'completed';
      return {
        state: 'done',
        chunks: this.due,
        sessions: 2,
        notes: 2,
        recording_transcripts: 0,
        workspaces: 1,
      };
    }
    const deleted = Math.min(limit, this.due);
    this.due -= deleted;
    run.status =
      deleted < limit
        ? 'completed'
        : run.batches >= 20
          ? 'budget_exhausted'
          : 'running';
    return {
      state:
        run.status === 'running'
          ? 'more'
          : run.status === 'completed'
            ? 'done'
            : run.status,
      chunks: deleted,
      notes: 0,
      recording_transcripts: 0,
    };
  }
}

type Interceptor = (
  rpc: string,
  body: Record<string, unknown>,
  call: number
) => Response | Promise<Response> | undefined;

function harness() {
  const { store } = memoryLedgerStore();
  let core = new LedgerCore(store);
  let clock = T0;
  const db = new FakeDatabase(() => clock);
  const intercept: { fn?: Interceptor } = {};
  const sleeps: number[] = [];
  const calls: { body: Record<string, unknown>; rpc: string }[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const rpc = new URL(String(input)).pathname.replace('/rest/v1/rpc/', '');
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
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
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
    rpcs: () => calls.map((call) => call.rpc.replace(/_meet_transcript.*/, '')),
    run,
    sleeps,
  };
}

afterEach(() => vi.restoreAllMocks());

it('defaults off with no database calls', async () => {
  const h = harness();
  expect(
    await dispatchScheduledJobs(
      CRON,
      T0,
      { ...env, CRON_CONTROL_ENABLED_JOBS: '' },
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

it('does no purge work while the database fence is closed', async () => {
  const h = harness();
  h.db.due = 900;
  expect(await h.run()).toMatchObject([
    { id: ID, outcome: 'ok', detail: { fenced: 1, batches: 0 } },
  ]);
  expect(h.rpcs()).toEqual(['start']);
  expect(h.db.due).toBe(900);
});

it('dry-runs counts without deleting once the fence opens', async () => {
  const h = harness();
  h.db.due = 900;
  h.db.fenceOpen = true;
  expect(await h.run()).toMatchObject([
    {
      outcome: 'ok',
      detail: {
        dryRun: 1,
        batches: 1,
        chunks: 900,
        sessions: 2,
        workspaces: 1,
      },
    },
  ]);
  expect(h.rpcs()).toEqual(['start', 'purge']);
  expect(h.db.due).toBe(900);
  expect(h.db.runs[0].status).toBe('completed');
});

it('deletes in bounded batches and reaches a terminal state', async () => {
  const h = harness();
  Object.assign(h.db, { due: 1_250, fenceOpen: true, deleteEnabled: true });
  expect(await h.run()).toMatchObject([
    {
      attempts: 1,
      outcome: 'ok',
      detail: { batches: 3, chunks: 1_250, retries: 0 },
    },
  ]);
  expect(h.rpcs()).toEqual(['start', 'purge', 'purge', 'purge']);
  for (const call of h.calls.slice(1))
    expect(call.body.p_limit).toBe(MEET_RETENTION_BATCH_LIMIT);
  expect(h.db.runs[0].status).toBe('completed');
  // The completed slot is not replayed.
  h.restart();
  expect(await h.run()).toMatchObject([
    { outcome: 'skipped', reason: 'duplicate' },
  ]);
  expect(h.calls).toHaveLength(4);
});

it('caps a run at 20 batches and leaves the rest for the next day', async () => {
  const h = harness();
  Object.assign(h.db, { due: 50_000, fenceOpen: true, deleteEnabled: true });
  expect(await h.run()).toMatchObject([
    {
      outcome: 'ok',
      detail: { batches: MEET_RETENTION_MAX_BATCHES, budgetExhausted: 1 },
    },
  ]);
  expect(h.calls).toHaveLength(1 + MEET_RETENTION_MAX_BATCHES);
  expect(h.db.due).toBe(50_000 - MEET_RETENTION_MAX_BATCHES * 500);
  expect(h.db.runs[0].status).toBe('budget_exhausted');
});

it('honours an operator stop between batches and stays stopped across restart', async () => {
  const h = harness();
  Object.assign(h.db, { due: 5_000, fenceOpen: true, deleteEnabled: true });
  h.intercept.fn = (rpc, _body, call) => {
    if (rpc === 'purge_meet_transcripts_batch' && call === 3)
      h.core().stop(ID, 'operator');
    return undefined;
  };
  expect(await h.run()).toMatchObject([
    { outcome: 'stopped', detail: { batches: 2 } },
  ]);
  expect(h.rpcs()).toEqual(['start', 'purge', 'purge', 'finish']);
  expect(h.calls.at(-1)?.body.p_status).toBe('stopped');
  expect(h.db.runs[0].status).toBe('stopped');
  expect(h.db.due).toBe(4_000);
  h.restart();
  expect(await h.run(1)).toMatchObject([
    { outcome: 'skipped', reason: 'stopped' },
  ]);
  expect(h.db.due).toBe(4_000);
});

it('honours the database fence closing mid-run', async () => {
  const h = harness();
  Object.assign(h.db, { due: 5_000, fenceOpen: true, deleteEnabled: true });
  h.intercept.fn = (rpc, _body, call) => {
    if (rpc === 'purge_meet_transcripts_batch' && call === 3)
      Object.assign(h.db, { fenceOpen: false, deleteEnabled: false });
    return undefined;
  };
  expect(await h.run()).toMatchObject([
    { outcome: 'stopped', detail: { batches: 1 } },
  ]);
  expect(h.db.due).toBe(4_500);
  expect(h.db.runs[0].status).toBe('stopped');
});

it('resumes idempotently after a lost Worker without double counting', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const h = harness();
  Object.assign(h.db, { due: 1_200, fenceOpen: true, deleteEnabled: true });
  // The second batch commits, then its response and the finish call are lost.
  h.intercept.fn = (rpc, body, call) => {
    if (rpc === 'purge_meet_transcripts_batch' && call === 3) {
      h.db.handle(rpc, body);
      throw new DOMException('deadline', 'TimeoutError');
    }
    if (rpc === 'finish_meet_transcript_purge_run')
      throw new DOMException('deadline', 'TimeoutError');
    return undefined;
  };
  expect(await h.run()).toMatchObject([{ outcome: 'unknown' }]);
  expect(h.db.due).toBe(200);
  expect(h.db.runs[0].status).toBe('running');
  h.intercept.fn = undefined;
  h.restart();
  expect(await h.run(1)).toMatchObject([
    { outcome: 'ok', detail: { chunks: 200 } },
  ]);
  expect(h.db.due).toBe(0);
  expect(h.db.runs.map((run) => run.status)).toEqual([
    'abandoned',
    'completed',
  ]);
});

it('retries transient failures a bounded number of times', async () => {
  const h = harness();
  Object.assign(h.db, { due: 700, fenceOpen: true, deleteEnabled: true });
  h.intercept.fn = (rpc, _body, call) =>
    rpc === 'purge_meet_transcripts_batch' && call === 2
      ? new Response(null, { status: 503 })
      : undefined;
  expect(await h.run()).toMatchObject([
    { outcome: 'ok', detail: { chunks: 700, retries: 1 } },
  ]);
  expect(h.sleeps).toEqual([1_000]);
});

it('fails after three retries and durably stops after five failed days', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const h = harness();
  Object.assign(h.db, { due: 700, fenceOpen: true, deleteEnabled: true });
  h.intercept.fn = () => new Response(null, { status: 503 });
  expect(await h.run()).toMatchObject([
    { outcome: 'failed', detail: { retries: 3 } },
  ]);
  expect(h.calls).toHaveLength(4);
  expect(h.sleeps).toEqual([1_000, 2_000, 4_000]);
  for (let day = 1; day < 5; day++) await h.run(day);
  expect(await h.run(5)).toMatchObject([
    { outcome: 'skipped', reason: 'stopped' },
  ]);
  expect(h.calls).toHaveLength(20);
  expect(h.db.due).toBe(700);
});

it('does not retry client errors', async () => {
  const h = harness();
  h.intercept.fn = () => new Response(null, { status: 401 });
  expect(await h.run()).toMatchObject([
    { outcome: 'failed', detail: { retries: 0 } },
  ]);
  expect(h.calls).toHaveLength(1);
});

it('records an unknown outcome for an out-of-bounds summary', async () => {
  const h = harness();
  Object.assign(h.db, { due: 700, fenceOpen: true, deleteEnabled: true });
  h.intercept.fn = (rpc) =>
    rpc === 'purge_meet_transcripts_batch'
      ? Response.json({
          state: 'more',
          chunks: 501,
          notes: 0,
          recording_transcripts: 0,
        })
      : undefined;
  expect(await h.run()).toMatchObject([{ outcome: 'unknown' }]);
  expect(h.rpcs()).toEqual(['start', 'purge', 'finish']);
  expect(h.calls.at(-1)?.body.p_status).toBe('unknown');
  expect(h.db.runs[0].status).toBe('unknown');
});

it('stops before a batch that cannot finish inside the time budget', async () => {
  const h = harness();
  Object.assign(h.db, { due: 50_000, fenceOpen: true, deleteEnabled: true });
  h.intercept.fn = (rpc) => {
    if (rpc === 'purge_meet_transcripts_batch') h.advance(70_000);
    return undefined;
  };
  const [report] = await h.run();
  expect(report).toMatchObject({ outcome: 'ok' });
  expect(h.calls.at(-1)?.body.p_status).toBe('budget_exhausted');
  expect(h.db.runs[0].status).toBe('budget_exhausted');
  // Four batches fit in the 300-second deadline before the 25-second reserve.
  expect(h.rpcs()).toEqual([
    'start',
    'purge',
    'purge',
    'purge',
    'purge',
    'finish',
  ]);
});
