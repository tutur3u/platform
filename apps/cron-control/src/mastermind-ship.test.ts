import { expect, it } from 'vite-plus/test';
import { dispatchScheduledJobs } from './dispatch';
import { LedgerCore, localLedger, memoryLedgerStore } from './ledger';
import { handleShipCheck } from './ship-check';
import {
  SHIP_COLLECTOR_KEY,
  SHIP_SNAPSHOT_KEY,
  type ShipSnapshot,
} from './processors/mastermind-ship/snapshot';
import {
  ACCOUNT,
  CF_TOKEN,
  GITHUB_TOKEN,
  makeWorld,
  seedWorld,
  sha,
  STORE_TOKEN,
  STORE_URL,
} from './processors/mastermind-ship/test-world';

// The job runs every second minute on the one-minute trigger.
const CRON = '* * * * *';
const T0 = Date.parse('2026-11-22T10:00:00Z');
const MINUTES = 60_000;

function setup(overrides: Record<string, string | undefined> = {}) {
  const { world, fetch } = makeWorld();
  seedWorld(world);
  const { store } = memoryLedgerStore();
  const env: Record<string, string | undefined> = {
    CRON_CONTROL_ENABLED_JOBS: 'mastermind-ship',
    MASTERMIND_STORE_URL: STORE_URL,
    MASTERMIND_STORE_TOKEN: STORE_TOKEN,
    MASTERMIND_SHIP_GITHUB_TOKEN: GITHUB_TOKEN,
    MASTERMIND_SHIP_CLOUDFLARE_TOKEN: CF_TOKEN,
    CLOUDFLARE_ACCOUNT_ID: ACCOUNT,
    ...overrides,
  };
  // A fresh LedgerCore over the same store models a Worker restart.
  const ledger = () => localLedger(new LedgerCore(store));
  const deps = (time: number) => ({
    fetch,
    ledger,
    now: () => time,
    sleep: async () => {
      throw new Error('Unexpected retry');
    },
  });
  return {
    world,
    env,
    ledger,
    deps,
    tick: (time: number) => dispatchScheduledJobs(CRON, time, env, deps(time)),
    snapshot: () =>
      JSON.parse(world.store.get(SHIP_SNAPSHOT_KEY) ?? 'null') as ShipSnapshot,
  };
}

it('stays off until enabled and then writes one sanitized snapshot per tick', async () => {
  const off = setup({ CRON_CONTROL_ENABLED_JOBS: '' });
  expect(await off.tick(T0)).toEqual([]);
  expect(off.world.log).toEqual([]);

  const h = setup();
  const [report] = await h.tick(T0);
  expect(report).toMatchObject({ id: 'mastermind-ship', outcome: 'ok' });
  const snap = h.snapshot();
  expect(snap).toMatchObject({ version: 1, trigger: 'schedule' });
  expect(snap.apps.map((app) => app.id)).toEqual([
    'web',
    'calendar',
    'contacts',
    'meet',
    'mail',
    'mastermind',
    'mobile',
    'upskii',
    'mastery-ai',
    'pktm',
  ]);
  const app = (id: string) => snap.apps.find((entry) => entry.id === id)!;
  // The failed newer deployment never counts as live; it shows as the attempt.
  expect(app('web').production.release).toEqual({
    sha: sha('a'),
    deployedAt: '2026-11-20T02:00:00.000Z',
    environment: 'cloudflare-production-web',
    ci: 'success',
    deploy: 'failed',
  });
  expect(app('web').staging?.release).toMatchObject({
    sha: sha('c'),
    ci: 'pending',
  });
  // apps/web and packages commits after production, deduplicated.
  expect(app('web').pending).toEqual({
    commits: 2,
    capped: false,
    oldestAt: '2026-11-21T01:00:00.000Z',
    headSha: sha('c'),
  });
  expect(app('calendar').production).toMatchObject({
    release: { sha: sha('a'), ci: 'failure' },
    worker: { script: 'tuturuuu-calendar', sha: sha('a'), percentage: 100 },
  });
  expect(app('calendar').pending?.commits).toBe(0);
  expect(app('mobile').staging).toBeNull();
  expect(app('upskii').production.release?.sha).toBe(sha('d'));
  expect(app('upskii').staging?.release?.sha).toBe(sha('e'));
  expect(app('upskii').pending?.commits).toBe(1);
  expect(app('pktm')).toMatchObject({
    repository: 'tutur3u/pktm',
    sources: ['github:tutur3u/pktm'],
    production: { release: { sha: sha('f') } },
    pending: { commits: 0 },
  });
  expect(app('mastery-ai')).toMatchObject({ repository: null, sources: [] });
  // Missing Worker scripts make Cloudflare a partial source, not a silent row.
  const sources = Object.fromEntries(snap.sources.map((s) => [s.id, s]));
  expect(sources['github:tutur3u/platform']).toMatchObject({
    state: 'ok',
    okAt: '2026-11-22T10:00:00.000Z',
  });
  expect(sources['github:upskii/platform']?.state).toBe('ok');
  // Catalog scripts the account does not have (404) read as no Worker.
  expect(sources.cloudflare).toMatchObject({ state: 'ok', problem: null });
  expect(app('meet').production.worker).toBeNull();
  expect(app('contacts').production.worker).toBeNull();
  const raw = h.world.store.get(SHIP_SNAPSHOT_KEY)!;
  for (const secret of [
    GITHUB_TOKEN,
    CF_TOKEN,
    STORE_TOKEN,
    'etag',
    'installations',
  ])
    expect(raw).not.toContain(secret);
  // One GraphQL query per repository, no probes on a first read.
  expect(h.world.log.filter((e) => e.startsWith('github'))).toEqual([
    'github POST /graphql',
    'github POST /graphql',
    'github POST /graphql',
  ]);
  expect(h.world.providerRequests()).toBeLessThanOrEqual(32);
  expect(h.world.store.get(SHIP_COLLECTOR_KEY)).toContain('11111111');
});

it('fails only the rows of an unreadable repository', async () => {
  const h = setup();
  h.world.repos.delete('tutur3u/pktm');
  expect((await h.tick(T0))[0]?.outcome).toBe('degraded');
  const sources = Object.fromEntries(
    h.snapshot().sources.map((s) => [s.id, s])
  );
  expect(sources['github:tutur3u/pktm']).toMatchObject({
    state: 'error',
    problem: 'invalid',
  });
  expect(sources['github:tutur3u/platform']?.state).toBe('ok');
  expect(h.snapshot().apps[0]?.production.release?.sha).toBe(sha('a'));
});

it('runs only on even minutes of the one-minute trigger', async () => {
  const h = setup();
  expect(await h.tick(T0 + MINUTES)).toEqual([]);
  expect(h.world.log).toEqual([]);
  expect((await h.ledger().status())['mastermind-ship']).toBeUndefined();
  expect((await h.tick(T0 + 2 * MINUTES))[0]).toMatchObject({
    id: 'mastermind-ship',
    outcome: 'ok',
  });
});

it('reports unconfigured sources honestly without provider calls', async () => {
  const h = setup({
    MASTERMIND_SHIP_GITHUB_TOKEN: undefined,
    MASTERMIND_SHIP_CLOUDFLARE_TOKEN: undefined,
  });
  expect((await h.tick(T0))[0]?.outcome).toBe('degraded');
  expect(h.world.providerRequests()).toBe(0);
  expect(h.snapshot().sources.every((s) => s.state === 'unconfigured')).toBe(
    true
  );
  expect(h.snapshot().apps[0]?.production.release).toBeNull();
});

it('reuses a read across 304 probes for at most four minutes', async () => {
  const h = setup();
  const graphql: number[] = [];
  for (let minute = 0; minute <= 14; minute += 2) {
    h.world.log.length = 0;
    await h.tick(T0 + minute * MINUTES);
    if (h.world.log.includes('github POST /graphql')) graphql.push(minute);
    const okAt = Date.parse(h.snapshot().sources[0]!.okAt!);
    // `okAt` is the last full read; a 304 never moves it forward.
    expect(T0 + minute * MINUTES - okAt).toBeLessThanOrEqual(4 * MINUTES);
  }
  // 0 and 2 read (no ETag yet at 2), 4 is a 304, then every four minutes.
  expect(graphql).toEqual([0, 2, 6, 10, 14]);
  h.world.log.length = 0;
  await h.tick(T0 + 16 * MINUTES);
  expect(h.world.log.filter((e) => e.startsWith('github'))).toEqual([
    'github GET /repos/tutur3u/platform/actions/runs',
    'github GET /repos/upskii/platform/actions/runs',
    'github GET /repos/tutur3u/pktm/actions/runs',
  ]);
  expect(h.snapshot().sources[0]).toMatchObject({
    state: 'ok',
    okAt: '2026-11-22T10:14:00.000Z',
    checkedAt: '2026-11-22T10:16:00.000Z',
  });
});

it('keeps the live release when a page holds only newer failed deploys', async () => {
  const h = setup();
  await h.tick(T0);
  const repo = h.world.repos.get('tutur3u/platform')!;
  for (let n = 0; n < 12; n++)
    repo.deployments.push({
      environment: 'cloudflare-production-web',
      sha: sha('c'),
      at: `2026-11-22T0${Math.floor(n / 6)}:${String((n % 6) * 10).padStart(2, '0')}:00Z`,
      state: 'FAILURE',
    });
  await h.tick(T0 + 2 * MINUTES);
  const web = h.snapshot().apps.find((app) => app.id === 'web')!;
  expect(web.production.release).toMatchObject({
    sha: sha('a'),
    deploy: 'failed',
  });
  expect(web.pending?.commits).toBe(2);
});

it('pages past newer failed deploys on a cold start, within the budget', async () => {
  const failures = (count: number) =>
    Array.from({ length: count }, (_, n) => ({
      environment: 'cloudflare-production-web',
      sha: sha('c'),
      at: new Date(
        Date.parse('2026-11-21T06:00:00Z') + n * 60_000
      ).toISOString(),
      state: 'FAILURE',
    }));
  const cold = setup();
  cold.world.repos.get('tutur3u/platform')!.deployments.push(...failures(12));
  await cold.tick(T0);
  const web = () => cold.snapshot().apps.find((app) => app.id === 'web')!;
  expect(web().production.release).toMatchObject({
    sha: sha('a'),
    deploy: 'failed',
  });
  expect(web().pending?.commits).toBe(2);
  expect(
    cold.world.log.filter((e) => e === 'github POST /graphql')
  ).toHaveLength(4);

  // Past every page a run may read, the previous release is kept and marked
  // with the newest attempt; nothing replaces it with an empty record.
  const deep = setup();
  await deep.tick(T0);
  deep.world.repos.get('tutur3u/platform')!.deployments.push(...failures(215));
  deep.world.log.length = 0;
  await deep.tick(T0 + 6 * MINUTES);
  const kept = deep.snapshot().apps.find((app) => app.id === 'web')!;
  expect(kept.production.release).toMatchObject({
    sha: sha('a'),
    deploy: 'failed',
  });
  expect(kept.pending?.commits).toBe(2);
  expect(
    deep.world.log.filter((e) => e === 'github POST /graphql')
  ).toHaveLength(5);
});

it('keeps Deployed for a matched-name app whose success is on a later page', async () => {
  const h = setup();
  const upskii = h.world.repos.get('upskii/platform')!;
  for (let n = 0; n < 60; n++)
    upskii.deployments.push({
      environment: 'Preview',
      sha: sha('e'),
      at: new Date(
        Date.parse('2026-11-21T03:00:00Z') + n * 60_000
      ).toISOString(),
    });
  await h.tick(T0);
  const app = h.snapshot().apps.find((entry) => entry.id === 'upskii')!;
  expect(app.production.release).toMatchObject({ sha: sha('d'), deploy: 'ok' });
});

it('fails the slot when every source fails, so a revoked token stops the job', async () => {
  const h = setup();
  h.world.githubStatus = 401;
  h.world.cloudflareStatus = 401;
  for (let slot = 0; slot < 5; slot++)
    expect((await h.tick(T0 + slot * 2 * MINUTES))[0]?.outcome).toBe('failed');
  expect((await h.ledger().status())['mastermind-ship']).toMatchObject({
    stopped: true,
    stopReason: 'failure-budget-exhausted',
  });
  h.world.log.length = 0;
  expect((await h.tick(T0 + 10 * MINUTES))[0]).toMatchObject({
    reason: 'stopped',
  });
  expect(h.world.log).toEqual([]);
  // One failing source beside a working one is degraded, not failed.
  const partial = setup();
  partial.world.githubStatus = 401;
  expect((await partial.tick(T0))[0]?.outcome).toBe('degraded');
});

it('fails the Cloudflare source when every catalog script is missing', async () => {
  const h = setup();
  await h.tick(T0);
  h.world.workers.clear();
  await h.tick(T0 + 2 * MINUTES);
  expect(
    h.snapshot().sources.find((source) => source.id === 'cloudflare')
  ).toMatchObject({ state: 'error', problem: 'invalid' });
  // The last-known Worker is kept, not erased.
  expect(
    h.snapshot().apps.find((app) => app.id === 'calendar')?.production.worker
  ).toMatchObject({ script: 'tuturuuu-calendar' });
});

it('never stops on missing catalog scripts while GitHub is unconfigured', async () => {
  const h = setup({ MASTERMIND_SHIP_GITHUB_TOKEN: undefined });
  for (let slot = 0; slot < 6; slot++)
    expect((await h.tick(T0 + slot * 2 * MINUTES))[0]?.outcome).toBe(
      'degraded'
    );
  expect((await h.ledger().status())['mastermind-ship']?.stopped).toBe(false);
  expect(
    h.snapshot().sources.find((source) => source.id === 'cloudflare')?.state
  ).toBe('ok');
});

it('backs off on a GitHub rate limit and keeps last-known facts with their stamp', async () => {
  const h = setup();
  await h.tick(T0);
  h.world.githubStatus = 403;
  h.world.githubHeaders = {
    'x-ratelimit-remaining': '0',
    'retry-after': '600',
  };
  await h.tick(T0 + 16 * MINUTES);
  const github = h.snapshot().sources[0]!;
  expect(github).toMatchObject({
    state: 'backoff',
    problem: 'rate-limited',
    okAt: '2026-11-22T10:00:00.000Z',
    retryAt: '2026-11-22T10:26:00.000Z',
  });
  expect(h.snapshot().apps[0]?.production.release?.sha).toBe(sha('a'));
  h.world.githubStatus = 0;
  h.world.log.length = 0;
  await h.tick(T0 + 20 * MINUTES);
  expect(h.world.log.some((e) => e.startsWith('github'))).toBe(false);
  expect(h.snapshot().sources[0]?.state).toBe('backoff');
  await h.tick(T0 + 26 * MINUTES);
  expect(h.snapshot().sources[0]?.state).toBe('ok');
});

it('honors the durable stop fence across a restart and the store fence', async () => {
  const h = setup();
  await h.ledger().stop('mastermind-ship', 'operator');
  expect((await h.tick(T0))[0]).toMatchObject({
    outcome: 'skipped',
    reason: 'stopped',
  });
  expect(h.world.log).toEqual([]);
  await h.ledger().resume('mastermind-ship');
  h.world.storeStopped = true;
  expect((await h.tick(T0 + 2 * MINUTES))[0]?.outcome).toBe('stopped');
  expect(h.world.providerRequests()).toBe(0);
  const state = (await h.ledger().status())['mastermind-ship'];
  expect(state?.consecutiveFailures).toBe(0);
});

it('stops itself after five failed slots and makes no further calls', async () => {
  const h = setup();
  h.world.storeDown = true;
  for (let slot = 0; slot < 5; slot++)
    expect((await h.tick(T0 + slot * 2 * MINUTES))[0]?.outcome).toBe('failed');
  const state = (await h.ledger().status())['mastermind-ship'];
  expect(state).toMatchObject({
    stopped: true,
    stopReason: 'failure-budget-exhausted',
  });
  h.world.log.length = 0;
  expect((await h.tick(T0 + 10 * MINUTES))[0]).toMatchObject({
    reason: 'stopped',
  });
  expect(h.world.log).toEqual([]);
});

it('is misconfigured without an HTTPS store target', async () => {
  const h = setup({ MASTERMIND_STORE_URL: 'http://store.example.test' });
  expect((await h.tick(T0))[0]).toMatchObject({ outcome: 'misconfigured' });
  expect(h.world.log).toEqual([]);
});

const CHECK_TOKEN = 'k'.repeat(40);
const check = (token = CHECK_TOKEN) =>
  new Request('https://cron.example.test/mastermind-ship/check', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

it('runs "Check now" through the ledger, at most once per 30 seconds', async () => {
  const h = setup({ MASTERMIND_SHIP_CHECK_TOKEN: CHECK_TOKEN });
  const run = async (time: number, request = check()) => {
    const response = await handleShipCheck(request, h.env, h.deps(time));
    return { status: response!.status, body: await response!.json() };
  };
  expect(
    await handleShipCheck(
      new Request('https://x.test/other'),
      h.env,
      h.deps(T0)
    )
  ).toBeNull();
  expect((await run(T0, check('wrong'.repeat(8)))).status).toBe(404);
  expect(h.world.log).toEqual([]);

  await h.tick(T0);
  h.world.log.length = 0;
  // Ten seconds after a scheduled tick the check is refused without work.
  expect(await run(T0 + 10_000)).toEqual({
    status: 429,
    body: { state: 'rate_limited', retryAfterMs: 20_000 },
  });
  expect(h.world.log).toEqual([]);

  const checked = await run(T0 + 45_000);
  expect(checked).toEqual({
    status: 200,
    body: { state: 'checked', outcome: 'ok' },
  });
  expect(h.snapshot()).toMatchObject({
    trigger: 'check',
    collectedAt: '2026-11-22T10:00:45.000Z',
  });
  // A check forces the full read instead of trusting the probe.
  expect(h.world.log).toContain('github POST /graphql');
  expect(h.world.log.some((e) => e.endsWith('/actions/runs'))).toBe(false);
  expect((await run(T0 + 60_000)).status).toBe(429);

  // The next scheduled slot still runs after a check.
  expect((await h.tick(T0 + 2 * MINUTES))[0]?.outcome).toBe('ok');

  await h.ledger().stop('mastermind-ship', 'operator');
  h.world.log.length = 0;
  expect(await run(T0 + 5 * MINUTES)).toEqual({
    status: 409,
    body: { state: 'stopped' },
  });
  expect(h.world.log).toEqual([]);
});

it('resumes a job its failure budget stopped, never an operator stop', async () => {
  const h = setup({ MASTERMIND_SHIP_CHECK_TOKEN: CHECK_TOKEN });
  h.world.githubStatus = 401;
  h.world.cloudflareStatus = 401;
  for (let slot = 0; slot < 5; slot++) await h.tick(T0 + slot * 2 * MINUTES);
  expect((await h.ledger().status())['mastermind-ship']).toMatchObject({
    stopped: true,
    stopReason: 'failure-budget-exhausted',
  });
  h.world.githubStatus = 0;
  h.world.cloudflareStatus = 0;
  const at = T0 + 9 * MINUTES;
  // Inside the 30-second window the check neither resumes nor runs.
  const early = await handleShipCheck(
    check(),
    h.env,
    h.deps(T0 + 8 * MINUTES + 10_000)
  );
  expect(early?.status).toBe(429);
  expect((await h.ledger().status())['mastermind-ship']?.stopped).toBe(true);
  const resumed = await handleShipCheck(check(), h.env, h.deps(at));
  expect(await resumed?.json()).toEqual({ state: 'checked', outcome: 'ok' });
  expect((await h.ledger().status())['mastermind-ship']).toMatchObject({
    stopped: false,
    consecutiveFailures: 0,
  });
  // The schedule runs again after the resume.
  expect((await h.tick(T0 + 10 * MINUTES))[0]?.outcome).toBe('ok');

  await h.ledger().stop('mastermind-ship', 'operator');
  h.world.log.length = 0;
  const refused = await handleShipCheck(
    check(),
    h.env,
    h.deps(T0 + 12 * MINUTES)
  );
  expect(refused?.status).toBe(409);
  expect(h.world.log).toEqual([]);
  expect((await h.ledger().status())['mastermind-ship']?.stopReason).toBe(
    'operator'
  );
});

it('resumes atomically: an operator stop that lands first wins, a second check is a no-op', async () => {
  const h = setup({ MASTERMIND_SHIP_CHECK_TOKEN: CHECK_TOKEN });
  h.world.githubStatus = 401;
  h.world.cloudflareStatus = 401;
  for (let slot = 0; slot < 5; slot++) await h.tick(T0 + slot * 2 * MINUTES);
  h.world.githubStatus = 0;
  h.world.cloudflareStatus = 0;
  const at = T0 + 9 * MINUTES;
  // An operator stop landing between the status read and the resume.
  const raced = h.deps(at);
  const status = raced.ledger().status;
  raced.ledger = () => {
    const ledger = h.ledger();
    return {
      ...ledger,
      status: async () => {
        const read = await status.call(ledger);
        await ledger.stop('mastermind-ship', 'operator');
        return read;
      },
    };
  };
  expect((await handleShipCheck(check(), h.env, raced))?.status).toBe(409);
  expect((await h.ledger().status())['mastermind-ship']?.stopReason).toBe(
    'operator'
  );
  // The ledger-level guard: a second resume after one succeeded changes
  // nothing.
  await h.ledger().resume('mastermind-ship');
  await h.ledger().stop('mastermind-ship', 'failure-budget-exhausted');
  const first = await h
    .ledger()
    .resumeIf('mastermind-ship', 'failure-budget-exhausted');
  const second = await h
    .ledger()
    .resumeIf('mastermind-ship', 'failure-budget-exhausted');
  expect(first.resumed).toBe(true);
  expect(second).toMatchObject({
    resumed: false,
    state: { generation: first.state.generation },
  });
});

it('refuses "Check now" while the job is disabled or the token is unset', async () => {
  const h = setup({
    MASTERMIND_SHIP_CHECK_TOKEN: CHECK_TOKEN,
    CRON_CONTROL_ENABLED_JOBS: '',
  });
  const disabled = await handleShipCheck(check(), h.env, h.deps(T0));
  expect(disabled?.status).toBe(409);
  const unset = setup();
  expect(
    (await handleShipCheck(check(), unset.env, unset.deps(T0)))?.status
  ).toBe(404);
  expect(h.world.log).toEqual([]);
});
