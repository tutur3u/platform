// The production auto-publish reconciler through the real dispatch, ledger
// and processor, against fake GitHub, Cloudflare, build-info and alert RPC
// endpoints. No network and no real credentials.
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vite-plus/test';
import { dispatchScheduledJobs } from './dispatch';
import {
  CRON_JOBS,
  CRON_TRIGGERS,
  DATABASE_MAINTENANCE_RPCS,
  findJob,
  parseEnabledJobs,
  processorDeadlineMs,
} from './jobs';
import { LedgerCore, localLedger, memoryLedgerStore } from './ledger';
import {
  ALERT_KIND,
  ALERT_RPC,
  RECONCILE_JOB,
  reconcileAutoPublish,
} from './processors/auto-publish-reconcile';
import {
  MAX_VARIABLE_PAGES,
  MAX_WORKERS,
  PROVIDER_REQUEST_BUDGET,
  RECONCILE_WORKERS,
  RUN_WALL_MS,
} from './processors/auto-publish-reconcile/catalog';
import {
  parseFenceValue,
  readFenceVariables,
} from './processors/auto-publish-reconcile/sources';
import { RequestBudget } from './processors/mastermind-ship/http';

const CRON = '*/30 * * * *';
const HOUR = 3_600_000;
const T0 = Date.parse('2026-11-28T10:00:00Z');
const PROD = 'a'.repeat(40);
const OLD = 'b'.repeat(40);
const GH_TOKEN = 'disposable-github-read-token';
const CF_TOKEN = 'disposable-cloudflare-read-token';
const without = (...keys: string[]) =>
  Object.fromEntries(
    Object.entries(baseEnv).filter(([key]) => !keys.includes(key))
  );
const baseEnv: Record<string, string> = {
  AUTO_PUBLISH_RECONCILE_CLOUDFLARE_TOKEN: CF_TOKEN,
  AUTO_PUBLISH_RECONCILE_GITHUB_TOKEN: GH_TOKEN,
  CLOUDFLARE_ACCOUNT_ID: 'e8912e2867beecc673d171907bf09649',
  CRON_CONTROL_ENABLED_JOBS: RECONCILE_JOB,
  SUPABASE_SECRET_KEY: 'disposable-service-key',
  SUPABASE_URL: 'https://database.example.test',
};

type Deployment = {
  created_on: string;
  id: string;
  versions: { percentage: number; version_id: string }[];
};

function world() {
  const iso = (time: number) => new Date(time).toISOString();
  const state = {
    clock: T0,
    /** Advance the clock by this much on every provider request. */
    perRequestMs: 0,
    variables: [
      {
        name: 'SERVING_WORKERS_PUBLICATION',
        value: 'enabled',
        updated_at: iso(T0 - 100 * HOUR),
      },
      {
        name: 'PRODUCTION_AUTO_PUBLISH',
        value: 'enabled',
        updated_at: iso(T0 - 100 * HOUR),
      },
    ] as { name: string; value: string; updated_at: string }[],
    variablesTotal: null as number | null,
    productionSha: PROD,
    deployments: new Map<string, Deployment | null>(),
    buildInfo: new Map<string, string>(),
    failCloudflare: null as number | null,
    failGithub: null as number | null,
    recipients: 2,
    invalidAlertResponse: false,
    alerts: new Map<string, Record<string, unknown>>(),
    notifications: 0,
    stopAfterGithub: null as null | (() => Promise<void>),
  };
  for (const worker of RECONCILE_WORKERS) {
    state.deployments.set(worker.script, {
      created_on: iso(T0 - 10 * HOUR),
      id: `dep-${worker.script}`,
      versions: [{ percentage: 100, version_id: `ver-${worker.script}` }],
    });
    state.buildInfo.set(worker.buildInfo, PROD);
  }
  const calls: { method: string; url: string; auth: string | null }[] = [];
  const rpc: Record<string, unknown>[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (url.hostname === 'database.example.test') {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      rpc.push({ path: url.pathname, ...body });
      const key = String(body.p_dedupe_key);
      if (state.alerts.has(key)) return Response.json(null);
      if (state.recipients === 0) return Response.json(0);
      state.alerts.set(key, body);
      state.notifications += state.recipients;
      if (state.invalidAlertResponse) return new Response('not JSON');
      return Response.json(state.recipients);
    }
    calls.push({
      method,
      url: url.toString(),
      auth: new Headers(init?.headers).get('Authorization'),
    });
    state.clock += state.perRequestMs;
    if (url.hostname === 'api.github.com') {
      if (state.failGithub)
        return new Response('nope', { status: state.failGithub });
      if (url.pathname.endsWith('/actions/variables')) {
        const page = Number(url.searchParams.get('page'));
        const per = Number(url.searchParams.get('per_page'));
        const slice = state.variables.slice((page - 1) * per, page * per);
        return Response.json({
          total_count: state.variablesTotal ?? state.variables.length,
          variables: slice,
        });
      }
      if (url.pathname.endsWith('/git/ref/heads/production')) {
        await state.stopAfterGithub?.();
        return Response.json({ object: { sha: state.productionSha } });
      }
    }
    if (url.hostname === 'api.cloudflare.com') {
      if (state.failCloudflare)
        return new Response('nope', { status: state.failCloudflare });
      const script = url.pathname.split('/scripts/')[1]!.split('/')[0]!;
      const deployment = state.deployments.get(script);
      if (deployment === undefined)
        return new Response('missing', { status: 404 });
      return Response.json({
        success: true,
        result: { deployments: deployment ? [deployment] : [] },
      });
    }
    const sha = state.buildInfo.get(url.toString());
    if (sha)
      return Response.json({ commitHash: sha, environment: 'production' });
    return new Response('not found', { status: 404 });
  });
  const { store } = memoryLedgerStore();
  const core = new LedgerCore(store);
  const run = (env: Record<string, string> = baseEnv, at = state.clock) =>
    dispatchScheduledJobs(CRON, at, env, {
      fetch: fetchMock,
      ledger: () => localLedger(core),
      now: () => state.clock,
      sleep: async () => undefined,
    });
  return { state, calls, rpc, core, run };
}

function report(reports: Awaited<ReturnType<ReturnType<typeof world>['run']>>) {
  const found = reports.find((entry) => entry.id === RECONCILE_JOB);
  if (!found || !('attempts' in found)) throw new Error(JSON.stringify(found));
  return found;
}

const flag = (w: ReturnType<typeof world>) => {
  // A stale stop, a leftover 0% candidate past its TTL and a lagging Worker.
  w.state.variables.push({
    name: 'PRODUCTION_AUTO_PUBLISH_SERVING',
    value: 'stopped',
    updated_at: new Date(T0 - 30 * HOUR).toISOString(),
  });
  w.state.deployments.set('tuturuuu-learn', {
    created_on: new Date(T0 - 5 * HOUR).toISOString(),
    id: 'dep-split',
    versions: [
      { percentage: 100, version_id: 'ver-old' },
      { percentage: 0, version_id: 'ver-candidate' },
    ],
  });
  w.state.buildInfo.set(RECONCILE_WORKERS[0]!.buildInfo, OLD);
};

it('registers a default-off hourly job with a bounded deadline', () => {
  const job = findJob(RECONCILE_JOB)!;
  expect(job).toMatchObject({
    cron: CRON,
    everyMinutes: 60,
    overlap: 'idempotent',
    workerProcessor: RECONCILE_JOB,
  });
  expect(CRON_TRIGGERS).toContain(CRON);
  expect(DATABASE_MAINTENANCE_RPCS[RECONCILE_JOB]).toBe(ALERT_RPC);
  expect(CRON_JOBS.filter((entry) => entry.id === RECONCILE_JOB)).toHaveLength(
    1
  );
  // The run's own wall cap ends it before the lease deadline.
  expect(RUN_WALL_MS).toBeLessThan(processorDeadlineMs(job));
  // Staged transition: admitting the job is a reviewed identity change.
  const config = readFileSync(
    new URL('../cloudflare.config.ts', import.meta.url),
    'utf8'
  );
  const enabled =
    /CRON_CONTROL_ENABLED_JOBS: bindings\.text\(\s*'([^']*)'/u.exec(
      config
    )![1]!;
  expect(parseEnabledJobs(enabled).enabled.has(RECONCILE_JOB)).toBe(false);
  expect(config).not.toContain('AUTO_PUBLISH_RECONCILE');
});

it('matches the automatic serving Workers and their build-info origins', async () => {
  const path = '../../../scripts/ci/serving-workers-apps.mjs';
  const { SERVING_WORKERS } = (await import(
    /* @vite-ignore */ new URL(path, import.meta.url).href
  )) as {
    SERVING_WORKERS: Record<string, { origins: string[]; worker: string }>;
  };
  expect(
    RECONCILE_WORKERS.map(({ buildInfo, script }) => ({ buildInfo, script }))
  ).toEqual(
    Object.values(SERVING_WORKERS).map((app) => ({
      buildInfo: `${app.origins[0]}/api/build-info`,
      script: app.worker,
    }))
  );
  expect(RECONCILE_WORKERS.length).toBeLessThanOrEqual(MAX_WORKERS);
});

it('does nothing while disabled or on the half-hour tick', async () => {
  const w = world();
  expect(await w.run({ ...baseEnv, CRON_CONTROL_ENABLED_JOBS: '' })).toEqual(
    []
  );
  expect(await w.run(baseEnv, T0 + 30 * 60_000)).toEqual([]);
  expect(w.calls).toHaveLength(0);
  expect(w.rpc).toHaveLength(0);
});

it('reads a healthy state with GETs only and raises no alert', async () => {
  const w = world();
  const result = report(await w.run());
  expect(result.outcome).toBe('ok');
  // One variables page, the ref, then a deployments and a build-info read
  // per Worker.
  expect(w.calls).toHaveLength(2 + 2 * RECONCILE_WORKERS.length);
  expect(w.calls.every((call) => call.method === 'GET')).toBe(true);
  expect(result.detail).toMatchObject({ flagged: 0, requests: w.calls.length });
  expect(w.rpc).toHaveLength(0);
  // Credentials go only to their own provider.
  for (const call of w.calls) {
    const host = new URL(call.url).hostname;
    expect(call.auth).toBe(
      host === 'api.github.com'
        ? `Bearer ${GH_TOKEN}`
        : host === 'api.cloudflare.com'
          ? `Bearer ${CF_TOKEN}`
          : null
    );
  }
});

it('alerts once per distinct flagged state across repeated slots', async () => {
  const w = world();
  // First sight of the production ref starts its lag window.
  expect(report(await w.run()).outcome).toBe('ok');
  flag(w);
  w.state.clock += 3 * HOUR;
  const first = report(await w.run());
  expect(first.outcome).toBe('ok');
  expect(first.detail).toMatchObject({
    alerts: 1,
    flagged: 3,
    lagging: 1,
    splits: 1,
    staleStops: 1,
  });
  w.state.clock += HOUR;
  const second = report(await w.run());
  expect(second.detail).toMatchObject({ alerts: 0, deduped: 1, flagged: 3 });
  expect(w.state.alerts.size).toBe(1);
  expect(w.state.notifications).toBe(2);
  const [alert] = [...w.state.alerts.values()];
  expect(alert).toMatchObject({
    p_kind: ALERT_KIND,
    p_permissions: ['view_infrastructure'],
    p_title: 'Auto-publish reconcile: 3 flagged',
  });
  expect(String(alert!.p_dedupe_key)).toMatch(
    /^auto-publish:reconcile:[0-9a-f]{32}$/u
  );
  expect(JSON.stringify(alert)).not.toContain(GH_TOKEN);
  expect(JSON.stringify(alert)).not.toContain(CF_TOKEN);
  // A new fact is a new state: one more alert, then quiet again.
  w.state.buildInfo.set(RECONCILE_WORKERS[1]!.buildInfo, OLD);
  w.state.clock += HOUR;
  expect(report(await w.run()).detail).toMatchObject({ alerts: 1, flagged: 4 });
  w.state.clock += HOUR;
  expect(report(await w.run()).detail).toMatchObject({ deduped: 1 });
  expect(w.state.alerts.size).toBe(2);
});

it('starts the lag window when the production ref moves', async () => {
  const w = world();
  w.state.buildInfo.set(RECONCILE_WORKERS[0]!.buildInfo, OLD);
  expect(report(await w.run()).detail).toMatchObject({ lagging: 0 });
  w.state.clock += HOUR;
  expect(report(await w.run()).detail).toMatchObject({ lagging: 0 });
  w.state.clock += 2 * HOUR;
  expect(report(await w.run()).detail).toMatchObject({ lagging: 1 });
  // A new ref restarts the window; the ledger keeps one ref record.
  w.state.productionSha = 'c'.repeat(40);
  w.state.clock += HOUR;
  expect(report(await w.run()).detail).toMatchObject({ lagging: 0 });
  const pending = w.core.pendingWork(RECONCILE_JOB);
  expect(pending).toEqual([
    `production-ref:${'c'.repeat(40)}:${w.state.clock}`,
  ]);
});

it('flags a split only past its TTL and honors a stop expiry', async () => {
  const w = world();
  w.state.deployments.set('tuturuuu-nova', {
    created_on: new Date(T0 - 30 * 60_000).toISOString(),
    id: 'dep-fresh-stage',
    versions: [
      { percentage: 100, version_id: 'ver-old' },
      { percentage: 0, version_id: 'ver-candidate' },
    ],
  });
  w.state.variables.push({
    name: 'PRODUCTION_AUTO_PUBLISH',
    value: `stopped:${new Date(T0 + HOUR).toISOString()}:drill`,
    updated_at: new Date(T0 - 48 * HOUR).toISOString(),
  });
  expect(report(await w.run()).detail).toMatchObject({ flagged: 0 });
  w.state.clock += 2 * HOUR;
  expect(report(await w.run()).detail).toMatchObject({
    splits: 1,
    staleStops: 1,
  });
  expect(parseFenceValue('stopped:2026-11-28T10:00:00Z:reason: x')).toEqual({
    stopped: true,
    until: Date.parse('2026-11-28T10:00:00Z'),
  });
  expect(parseFenceValue('enabled')).toEqual({ stopped: false, until: null });
  expect(parseFenceValue('STOPPED').stopped).toBe(false);
});

it('stops fail-closed through the durable job switch, even mid-run', async () => {
  const w = world();
  flag(w);
  w.core.stop(RECONCILE_JOB, 'operator');
  expect(await w.run()).toEqual([
    { id: RECONCILE_JOB, outcome: 'skipped', reason: 'stopped' },
  ]);
  expect(w.calls).toHaveLength(0);
  w.core.resume(RECONCILE_JOB);
  w.state.clock += 3 * HOUR;
  w.state.stopAfterGithub = async () => {
    w.core.stop(RECONCILE_JOB, 'operator');
  };
  expect(report(await w.run()).outcome).toBe('stopped');
  expect(
    w.calls.filter((call) => call.url.includes('api.cloudflare.com'))
  ).toHaveLength(0);
  expect(w.rpc).toHaveLength(0);
});

it('fails a provider error without alerting and recovers on restart', async () => {
  const w = world();
  flag(w);
  w.state.clock += 3 * HOUR;
  w.state.failCloudflare = 500;
  const failed = report(await w.run());
  expect(failed.outcome).toBe('failed');
  expect(w.rpc).toHaveLength(0);
  // No in-run retry: one attempt per Worker at most.
  expect(
    w.calls.filter((call) => call.url.includes('api.cloudflare.com')).length
  ).toBeLessThanOrEqual(RECONCILE_WORKERS.length);
  w.state.failCloudflare = null;
  w.state.clock += HOUR;
  expect(report(await w.run()).detail).toMatchObject({ alerts: 1 });
  expect(w.state.alerts.size).toBe(1);
});

it('exhausts the failure budget and then makes no provider calls', async () => {
  const w = world();
  w.state.failGithub = 429;
  w.state.failCloudflare = 503;
  for (let slot = 0; slot < 5; slot++) {
    expect(report(await w.run()).outcome).toBe('failed');
    w.state.clock += HOUR;
  }
  const before = w.calls.length;
  // A 429 ends the GitHub reads and a refused Cloudflare read ends the loop.
  expect(before).toBeLessThanOrEqual(5 * (1 + RECONCILE_WORKERS.length));
  expect(await w.run()).toEqual([
    { id: RECONCILE_JOB, outcome: 'skipped', reason: 'stopped' },
  ]);
  expect(w.calls.length).toBe(before);
});

it('bounds variable pages, the request budget and the wall time', async () => {
  const w = world();
  for (let index = 0; index < 400; index++)
    w.state.variables.push({
      name: `FILLER_${index}`,
      value: 'x',
      updated_at: new Date(T0).toISOString(),
    });
  // A listing past the page cap fails after one page instead of paging on.
  expect(report(await w.run()).outcome).toBe('failed');
  expect(
    w.calls.filter((call) => call.url.includes('/actions/variables'))
  ).toHaveLength(1);
  // A listing exactly at the cap reads every page and no more.
  const w2 = world();
  w2.state.variablesTotal = MAX_VARIABLE_PAGES * 30;
  for (let index = 0; index < MAX_VARIABLE_PAGES * 30; index++)
    w2.state.variables.push({
      name: `FILLER_${index}`,
      value: 'x',
      updated_at: new Date(T0).toISOString(),
    });
  await w2.run();
  expect(
    w2.calls.filter((call) => call.url.includes('/actions/variables'))
  ).toHaveLength(MAX_VARIABLE_PAGES);
  expect(w2.calls.length).toBeLessThanOrEqual(PROVIDER_REQUEST_BUDGET);
  // Slow providers: the run stops at its wall cap, not the lease.
  const w3 = world();
  w3.state.perRequestMs = 15_000;
  const slow = report(await w3.run());
  expect(['degraded', 'failed']).toContain(slow.outcome);
  expect(w3.calls.length).toBeLessThanOrEqual(RUN_WALL_MS / 15_000);
  expect(w3.rpc).toHaveLength(0);
});

it('runs a configured half and redelivers an undelivered alert', async () => {
  const w = world();
  flag(w);
  w.state.clock += 3 * HOUR;
  const half = report(
    await w.run(without('AUTO_PUBLISH_RECONCILE_GITHUB_TOKEN'))
  );
  expect(half.outcome).toBe('degraded');
  expect(half.detail).toMatchObject({
    splits: 1,
    staleStops: 0,
    unconfigured: 1,
  });
  expect(w.calls.every((call) => call.url.includes('api.cloudflare.com'))).toBe(
    true
  );
  const w2 = world();
  flag(w2);
  w2.state.recipients = 0;
  w2.state.clock += 3 * HOUR;
  expect(report(await w2.run()).outcome).toBe('degraded');
  w2.state.recipients = 1;
  w2.state.clock += HOUR;
  expect(report(await w2.run()).detail).toMatchObject({ alerts: 1 });
  const none = world();
  const unconfigured = without(
    'AUTO_PUBLISH_RECONCILE_GITHUB_TOKEN',
    'AUTO_PUBLISH_RECONCILE_CLOUDFLARE_TOKEN'
  );
  expect(report(await none.run(unconfigured)).outcome).toBe('failed');
  expect(none.calls).toHaveLength(0);
});

it('refuses provider reads past the request budget', async () => {
  const fetchMock = vi.fn<typeof fetch>(async () =>
    Response.json({
      total_count: MAX_VARIABLE_PAGES * 30,
      variables: Array.from({ length: 30 }, (_, index) => ({
        name: `FILLER_${index}`,
        value: 'x',
        updated_at: new Date(T0).toISOString(),
      })),
    })
  );
  const budget = new RequestBudget(2);
  await expect(
    readFenceVariables(
      { deadline: T0 + 60_000, fetch: fetchMock, now: () => T0 },
      budget,
      GH_TOKEN,
      'test'
    )
  ).rejects.toMatchObject({ problem: 'rate-limited' });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(budget.used).toBe(2);
});

it('honors a stop that lands between the claim and the first read', async () => {
  const fetchMock = vi.fn<typeof fetch>();
  const pending = vi.fn(async (): Promise<never> => {
    throw new Error('no pending-work call expected');
  });
  const result = await reconcileAutoPublish({
    deadline: T0 + 90_000,
    env: baseEnv as never,
    fence: async () => false,
    fetch: fetchMock,
    now: () => T0,
    pending: {
      add: pending,
      fail: pending,
      list: pending,
      quarantined: pending,
      settle: pending,
    },
    target: { secret: 'disposable', url: new URL(baseEnv.SUPABASE_URL!) },
    userAgent: 'test',
  });
  expect(result.outcome).toBe('stopped');
  expect(fetchMock).not.toHaveBeenCalled();
  expect(pending).not.toHaveBeenCalled();
});

it.each(['404', 'empty deployments', 'unreadable build-info'] as const)(
  'alerts once for a dark Worker with %s after the lag window',
  async (failure) => {
    const w = world();
    const worker = RECONCILE_WORKERS[0]!;
    if (failure === '404') w.state.deployments.delete(worker.script);
    else if (failure === 'empty deployments')
      w.state.deployments.set(worker.script, null);
    else w.state.buildInfo.delete(worker.buildInfo);

    expect(report(await w.run()).detail).toMatchObject({ dark: 0 });
    expect(w.rpc).toHaveLength(0);
    w.state.clock += 3 * HOUR;
    const first = report(await w.run());
    expect(first.outcome).toBe('degraded');
    expect(first.detail).toMatchObject({ alerts: 1, dark: 1, flagged: 1 });
    expect(w.rpc[0]).toMatchObject({
      p_data: { findings: [{ kind: 'dark', subject: worker.script }] },
    });
    w.state.clock += HOUR;
    expect(report(await w.run()).detail).toMatchObject({
      alerts: 0,
      deduped: 1,
    });
    expect(w.state.notifications).toBe(w.state.recipients);
  }
);

it('reports an unreadable committed alert response as unknown and deduplicates the next slot', async () => {
  const w = world();
  w.state.invalidAlertResponse = true;
  w.state.deployments.delete(RECONCILE_WORKERS[0]!.script);
  await w.run();
  w.state.clock += 3 * HOUR;
  expect(report(await w.run()).outcome).toBe('unknown');
  expect(w.rpc).toHaveLength(1);
  expect(w.state.notifications).toBe(w.state.recipients);
  w.state.clock += HOUR;
  expect(report(await w.run()).detail).toMatchObject({ alerts: 0, deduped: 1 });
  expect(w.rpc[1]?.p_dedupe_key).toBe(w.rpc[0]?.p_dedupe_key);
  expect(w.state.notifications).toBe(w.state.recipients);
});
