// Observability collectors through the real dispatch, ledger and processor,
// against an in-memory model of the private ingestion RPCs and fake provider
// APIs. The SQL contract is covered by
// apps/database/supabase/tests/observability-ingestion.sql.
import { afterEach, expect, it, vi } from 'vite-plus/test';
import { dispatchScheduledJobs } from './dispatch';
import {
  CRON_TRIGGERS,
  DATABASE_MAINTENANCE_RPCS,
  findJob,
  processorDeadlineMs,
} from './jobs';
import { LedgerCore, localLedger, memoryLedgerStore } from './ledger';
import { HARD_REQUEST_CAP } from './processors/observability/collector';

const CF = 'observability-cloudflare';
const GH = 'observability-github-actions';
const T0 = Date.parse('2026-11-21T03:15:00Z');
const baseEnv = {
  CLOUDFLARE_ACCOUNT_ID: 'e8912e2867beecc673d171907bf09649',
  CLOUDFLARE_ANALYTICS_API_TOKEN: 'disposable-analytics-token-value',
  GITHUB_ACTIONS_READ_TOKEN: 'disposable-actions-token-value',
  SUPABASE_URL: 'https://database.example.test',
  SUPABASE_SECRET_KEY: 'disposable-service-key',
};

type Control = {
  generation: number;
  max_requests: number;
  mode: string;
  watermark: string | null;
};

class FakeDatabase {
  controls = new Map<string, Control>();
  rollups = new Map<string, number>();
  markers = new Map<string, unknown>();
  runs: Record<string, unknown>[] = [];
  // Generation bump while a run is between its read and its write.
  bumpOnWrite = false;
  budgetFull = false;

  set(source: string, control: Partial<Control>) {
    const current = this.controls.get(source) ?? {
      generation: 1,
      max_requests: 4,
      mode: 'off',
      watermark: null,
    };
    this.controls.set(source, { ...current, ...control });
  }

  handle(rpc: string, body: Record<string, unknown>): unknown {
    const source = String(body.p_source);
    const control = this.controls.get(source);
    if (rpc === 'observability_begin_ingest')
      return control
        ? {
            generation: control.generation,
            max_requests: control.max_requests,
            mode: control.mode,
            watermark: control.watermark,
          }
        : { mode: 'off' };
    if (rpc === 'observability_write_rollups') {
      if (this.bumpOnWrite && control) control.generation++;
      if (!control || control.mode !== 'on') return { state: 'off' };
      if (control.generation !== body.p_generation) return { state: 'stale' };
      if (this.budgetFull) return { state: 'budget' };
      const rows = body.p_rollups as Record<string, unknown>[];
      for (const row of rows)
        this.rollups.set(
          `${row.service}|${row.metric}|${row.bucket_start}`,
          row.value as number
        );
      for (const marker of body.p_markers as Record<string, unknown>[])
        this.markers.set(`${marker.service}|${marker.version_id}`, marker);
      control.watermark = String(body.p_watermark);
      return {
        state: 'written',
        rollup_rows: rows.length,
        marker_rows: (body.p_markers as unknown[]).length,
      };
    }
    if (rpc === 'record_observability_ingest_run') {
      this.runs.push(body);
      return { recorded: 1 };
    }
    throw new Error(`unexpected rpc ${rpc}`);
  }
}

// Every fake group falls in the 02:30 bucket, inside both runs' windows.
const BUCKET = '2026-11-21T02:30:00Z';

function graphqlGroups(field: string, since = BUCKET) {
  if (field === 'workersInvocationsAdaptive')
    return [
      {
        dimensions: {
          scriptName: 'tuturuuu-meet',
          datetimeFifteenMinutes: since,
        },
        sum: { requests: 1200, errors: 3, subrequests: 40 },
        quantiles: {
          cpuTimeP50: 1500,
          cpuTimeP99: 12_340,
          wallTimeP50: 20_000,
          wallTimeP99: 250_000,
        },
      },
    ];
  return [
    {
      dimensions: {
        scriptName: 'tuturuuu-meet',
        datetimeFifteenMinutes: since,
      },
      sum: { requests: 10, errors: 1 },
    },
    {
      dimensions: {
        scriptName: 'tuturuuu-meet',
        datetimeFifteenMinutes: since,
      },
      sum: { requests: 5, errors: 0 },
    },
  ];
}

function harness(cron = '*/15 * * * *', enabled = CF) {
  const { store } = memoryLedgerStore();
  const core = new LedgerCore(store);
  const db = new FakeDatabase();
  const provider: { url: string; auth: string | null }[] = [];
  const fail: { status?: number; graphqlErrors?: boolean } = {};
  const githubTotal = { value: 2 };
  let clock = T0;
  const env = { ...baseEnv, CRON_CONTROL_ENABLED_JOBS: enabled };
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === 'database.example.test') {
      const rpc = url.pathname.replace('/rest/v1/rpc/', '');
      return Response.json(
        db.handle(
          rpc,
          JSON.parse(String(init?.body)) as Record<string, unknown>
        )
      );
    }
    const headers = new Headers(init?.headers);
    provider.push({ url: url.toString(), auth: headers.get('Authorization') });
    if (fail.status) return new Response('nope', { status: fail.status });
    if (url.hostname === 'api.cloudflare.com') {
      if (fail.graphqlErrors)
        return Response.json({
          data: null,
          errors: [{ message: 'bad field' }],
        });
      const body = JSON.parse(String(init?.body)) as { query: string };
      const field = body.query.includes('durableObjects')
        ? 'durableObjectsInvocationsAdaptiveGroups'
        : 'workersInvocationsAdaptive';
      return Response.json({
        data: {
          viewer: {
            accounts: [{ [field]: graphqlGroups(field) }],
          },
        },
      });
    }
    if (url.hostname === 'api.github.com') {
      const created = url.searchParams.get('created')!.split('..')[0]!;
      return Response.json({
        total_count: githubTotal.value,
        workflow_runs: [
          {
            id: 101,
            path: '.github/workflows/meet-cloudflare.yaml',
            conclusion: 'success',
            status: 'completed',
            event: 'push',
            head_branch: 'main',
            head_sha: 'a'.repeat(40),
            created_at: created,
            run_started_at: new Date(
              Date.parse(created) + 30_000
            ).toISOString(),
            updated_at: new Date(Date.parse(created) + 330_000).toISOString(),
          },
          {
            id: 102,
            path: '.github/workflows/ci.yaml',
            conclusion: 'failure',
            status: 'completed',
            event: 'pull_request',
            head_branch: 'feature/x',
            head_sha: 'b'.repeat(40),
            created_at: created,
            run_started_at: new Date(
              Date.parse(created) + 90_000
            ).toISOString(),
            updated_at: new Date(Date.parse(created) + 690_000).toISOString(),
          },
        ],
      });
    }
    throw new Error(`unexpected host ${url.hostname}`);
  });
  const run = () =>
    dispatchScheduledJobs(cron, clock, env, {
      fetch: fetchMock,
      ledger: () => localLedger(core),
      now: () => clock,
      sleep: async () => undefined,
    });
  return {
    advance: (ms: number) => {
      clock += ms;
    },
    core,
    db,
    env,
    fail,
    provider,
    run,
    set githubTotal(value: number) {
      githubTotal.value = value;
    },
  };
}

afterEach(() => vi.restoreAllMocks());

it('registers the collectors as native jobs on existing triggers', () => {
  for (const [id, cron] of [
    [CF, '*/15 * * * *'],
    [GH, '*/30 * * * *'],
    ['observability-product-analytics', '*/30 * * * *'],
    ['observability-retention', '*/10 * * * *'],
    ['observability-slo-burn', '*/15 * * * *'],
  ] as const) {
    const job = findJob(id);
    expect(job).toMatchObject({
      cron,
      overlap: 'idempotent',
      workerProcessor: id,
    });
    expect(CRON_TRIGGERS).toContain(cron);
    expect(job?.path).toBe(`/rest/v1/rpc/${DATABASE_MAINTENANCE_RPCS[id]}`);
    expect(job && processorDeadlineMs(job)).toBeGreaterThan(0);
  }
});

it('makes no provider request while the source row is off or missing', async () => {
  const h = harness();
  expect(await h.run()).toMatchObject([
    { id: CF, outcome: 'ok', detail: { off: 1 } },
  ]);
  h.db.set('cloudflare-workers', { mode: 'off' });
  h.advance(15 * 60_000);
  expect(await h.run()).toMatchObject([{ id: CF, outcome: 'ok' }]);
  expect(h.provider).toHaveLength(0);
  expect(h.db.runs).toHaveLength(0);
});

it('reads but never writes in dry run, and logs counts only', async () => {
  const h = harness();
  h.db.set('cloudflare-workers', { mode: 'dry_run' });
  expect(await h.run()).toMatchObject([
    { id: CF, outcome: 'ok', detail: { dryRun: 1, requests: 2 } },
  ]);
  expect(h.provider).toHaveLength(2);
  expect(
    h.provider.every(
      (p) => p.auth === `Bearer ${baseEnv.CLOUDFLARE_ANALYTICS_API_TOKEN}`
    )
  ).toBe(true);
  expect(h.db.rollups.size).toBe(0);
  expect(h.db.runs).toEqual([
    expect.objectContaining({
      p_mode: 'dry_run',
      p_status: 'done',
      p_requests: 2,
    }),
  ]);
  expect(JSON.stringify(h.db.runs)).not.toContain('disposable');
});

it('writes converted rollups and converges when a slot repeats', async () => {
  const h = harness();
  h.db.set('cloudflare-workers', { mode: 'on' });
  await h.run();
  const first = new Map(h.db.rollups);
  const start = h.db.controls.get('cloudflare-workers')!.watermark!;
  expect(start).toBe('2026-11-21T03:00:00.000Z');
  const at = '2026-11-21T02:30:00.000Z';
  expect(first.get(`tuturuuu-meet|requests|${at}`)).toBe(1200);
  expect(first.get(`tuturuuu-meet|cpu_p99_ms|${at}`)).toBe(12.34);
  expect(first.get(`tuturuuu-meet|wall_p99_ms|${at}`)).toBe(250);
  expect(first.get(`tuturuuu-meet|do_requests|${at}`)).toBe(15);
  expect(first.get(`tuturuuu-meet|do_errors|${at}`)).toBe(1);
  h.advance(60_000);
  await h.run();
  expect(h.db.rollups).toEqual(first);
});

it('stops at the request budget without writing a partial read', async () => {
  const h = harness();
  h.db.set('cloudflare-workers', { mode: 'on', max_requests: 1 });
  expect(await h.run()).toMatchObject([
    { id: CF, outcome: 'ok', detail: { budgetExhausted: 1, requests: 1 } },
  ]);
  expect(h.provider).toHaveLength(1);
  expect(h.db.rollups.size).toBe(0);
  expect(h.db.runs.at(-1)).toMatchObject({ p_status: 'budget_exhausted' });
  expect(HARD_REQUEST_CAP).toBe(10);
});

it('refuses a write from a stale generation', async () => {
  const h = harness();
  h.db.set('cloudflare-workers', { mode: 'on' });
  h.db.bumpOnWrite = true;
  expect(await h.run()).toMatchObject([{ id: CF, outcome: 'stopped' }]);
  expect(h.db.rollups.size).toBe(0);
  expect(h.db.runs.at(-1)).toMatchObject({ p_status: 'stale' });
});

it('makes no request once Cron Control stops the job', async () => {
  const h = harness();
  h.db.set('cloudflare-workers', { mode: 'on' });
  h.core.stop(CF, 'operator');
  expect(await h.run()).toMatchObject([{ id: CF, outcome: 'skipped' }]);
  expect(h.provider).toHaveLength(0);
});

it('fails without credentials before any provider request', async () => {
  const h = harness();
  h.db.set('cloudflare-workers', { mode: 'on' });
  delete (h.env as Partial<typeof baseEnv>).CLOUDFLARE_ANALYTICS_API_TOKEN;
  expect(await h.run()).toMatchObject([
    { id: CF, outcome: 'failed', detail: { unconfigured: 1 } },
  ]);
  expect(h.provider).toHaveLength(0);
});

it('fails closed on provider errors and GraphQL errors', async () => {
  const h = harness();
  h.db.set('cloudflare-workers', { mode: 'on' });
  h.fail.status = 500;
  expect(await h.run()).toMatchObject([{ id: CF, outcome: 'failed' }]);
  h.fail.status = undefined;
  h.fail.graphqlErrors = true;
  h.advance(15 * 60_000);
  expect(await h.run()).toMatchObject([{ id: CF, outcome: 'failed' }]);
  expect(h.db.rollups.size).toBe(0);
});

it('stops itself after repeated failures until an operator resumes it', async () => {
  const h = harness();
  h.db.set('cloudflare-workers', { mode: 'on' });
  h.fail.status = 503;
  for (let slot = 0; slot < 5; slot++) {
    await h.run();
    h.advance(15 * 60_000);
  }
  const calls = h.provider.length;
  expect(await h.run()).toMatchObject([{ id: CF, outcome: 'skipped' }]);
  expect(h.provider).toHaveLength(calls);
});

it('collects GitHub Actions hours with deploy markers from main only', async () => {
  const h = harness('*/30 * * * *', GH);
  h.db.set('github-actions', { mode: 'on' });
  expect(await h.run()).toMatchObject([
    { id: GH, outcome: 'ok', detail: { budgetExhausted: 1, requests: 4 } },
  ]);
  // One page per bucket; the default budget of four ends the run, and the
  // watermark stops at the first unread bucket.
  expect(h.provider).toHaveLength(4);
  expect(h.db.controls.get('github-actions')?.watermark).toBe(
    '2026-11-20T20:15:00.000Z'
  );
  expect(h.db.markers.size).toBe(1);
  expect([...h.db.markers.values()][0]).toMatchObject({
    service: 'meet',
    sha: 'a'.repeat(40),
    version_id: 'gha-101',
  });
  const hour = '2026-11-20T19:15:00.000Z';
  expect(h.db.rollups.get(`all|runs|${hour}`)).toBe(2);
  expect(h.db.rollups.get(`all|failed_runs|${hour}`)).toBe(1);
  expect(h.db.rollups.get(`ci|queue_p50_s|${hour}`)).toBe(90);
  expect(h.db.rollups.get(`meet-cloudflare|duration_p50_s|${hour}`)).toBe(300);
});

it('treats a full daily row budget as a bounded stop, not a failure', async () => {
  const h = harness();
  h.db.set('cloudflare-workers', { mode: 'on' });
  h.db.budgetFull = true;
  expect(await h.run()).toMatchObject([
    { id: CF, outcome: 'ok', detail: { dailyBudget: 1 } },
  ]);
  expect(h.db.controls.get('cloudflare-workers')?.watermark).toBeNull();
  expect(h.db.runs.at(-1)).toMatchObject({ p_status: 'budget_exhausted' });
});

it('keeps an oversized first GitHub bucket as a sample and moves on', async () => {
  const h = harness('*/30 * * * *', GH);
  h.db.set('github-actions', { mode: 'on', max_requests: 1 });
  h.githubTotal = 5_000;
  expect(await h.run()).toMatchObject([{ id: GH, outcome: 'ok' }]);
  expect(h.provider).toHaveLength(1);
  const hour = '2026-11-20T19:15:00.000Z';
  expect(h.db.rollups.get(`all|runs|${hour}`)).toBe(5_000);
  expect(h.db.rollups.get(`all|sampled_runs|${hour}`)).toBe(2);
  expect(h.db.controls.get('github-actions')?.watermark).toBe(
    '2026-11-20T19:30:00.000Z'
  );
});
