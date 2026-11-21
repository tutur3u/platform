import { expect, it, vi } from 'vite-plus/test';
import {
  collectProviderCosts,
  MAX_DAYS_PER_SOURCE,
} from './provider-cost-collection';
import {
  type CostSource,
  CostSourceError,
  configuredCostSources,
  githubSource,
  MAX_COST_LINES_PER_DAY,
  routingDay,
  vercelSource,
} from './provider-cost-sources';
import { LedgerCore, memoryLedgerStore } from '../ledger';
import type { ProcessorContext } from './types';

const NOW = Date.parse('2026-11-21T03:17:00.000Z');
const env = {
  SUPABASE_SECRET_KEY: 'service-key',
  SUPABASE_URL: 'https://db.example.test',
};

type Call = { body: Record<string, unknown> | undefined; url: URL };

function harness(
  options: {
    claim?: (day: string) => boolean;
    fence?: () => Promise<boolean>;
    plan?: string[];
    provider?: (url: URL) => Response;
    recordStatus?: number;
  } = {}
) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ body, url });
      if (url.hostname === 'db.example.test') {
        if (url.pathname.endsWith('/plan_provider_cost_days'))
          return Response.json(options.plan ?? ['2026-11-20', '2026-11-19']);
        // PostgREST returns a scalar function result as a JSON value.
        if (url.pathname.endsWith('/mark_provider_cost_day_exhausted'))
          return Response.json(true);
        if (url.pathname.endsWith('/claim_provider_cost_day'))
          return Response.json(
            options.claim?.(String(body?.p_usage_date)) ?? true
          );
        if (options.recordStatus && options.recordStatus !== 200)
          return new Response('no', { status: options.recordStatus });
        return Response.json(((body?.p_lines ?? []) as unknown[]).length);
      }
      return options.provider?.(url) ?? Response.json({ usageItems: [] });
    }
  );
  const context: ProcessorContext = {
    deadline: NOW + 140_000,
    env,
    fence: options.fence ?? (async () => true),
    fetch: fetchMock as unknown as typeof fetch,
    now: () => NOW,
    pending: {
      add: async () => undefined,
      fail: async () => [],
      list: async () => [],
      quarantined: async () => [],
      settle: async () => undefined,
    },
    target: { secret: 'service-key', url: new URL('https://db.example.test') },
    userAgent: 'test-agent',
  };
  return { calls, context };
}

const recorded = (calls: Call[]) =>
  calls.filter((call) =>
    call.url.pathname.endsWith('/record_provider_cost_day')
  );

it('collects nothing and succeeds when no collector credential is set', async () => {
  const { calls, context } = harness();
  await expect(collectProviderCosts(context)).resolves.toEqual({
    detail: {
      budget_alerts: 0,
      days: 0,
      exhausted_days: 0,
      failed_days: 0,
      lines: 0,
      sources: 0,
    },
    outcome: 'ok',
  });
  expect(calls).toHaveLength(0);
});

it('only configures sources with both an account and a token', () => {
  expect(configuredCostSources({ COST_GITHUB_TOKEN: 'x' })).toHaveLength(0);
  expect(
    configuredCostSources({
      COST_GITHUB_ORG: 'org/../x',
      COST_GITHUB_TOKEN: 'x',
    })
  ).toHaveLength(0);
  expect(
    configuredCostSources({
      COST_GITHUB_ORG: 'tutur3u',
      COST_GITHUB_TOKEN: 'x',
      COST_VERCEL_API_TOKEN: 'y',
      COST_VERCEL_TEAM_ID: 'team_1',
    }).map((source) => source.provider)
  ).toEqual(['github', 'vercel']);
});

it('collects the restated days plus one backfill day, bounded per source', async () => {
  const { calls, context } = harness({
    plan: ['2026-11-20', '2026-11-19', '2026-08-23', '2026-08-24'],
    provider: () =>
      Response.json({
        usageItems: [
          {
            date: '2026-11-20T00:00:00Z',
            grossAmount: 6,
            netAmount: 0,
            product: 'actions',
            quantity: 1000,
            repositoryName: 'platform',
            sku: 'Actions Linux',
            unitType: 'Minutes',
          },
          {
            date: '2026-11-20T00:00:00Z',
            grossAmount: 0.6,
            netAmount: 0,
            product: 'actions',
            quantity: 100,
            repositoryName: 'platform',
            sku: 'Actions Linux',
            unitType: 'Minutes',
          },
          {
            date: '2026-11-20T00:00:00Z',
            grossAmount: 1,
            netAmount: 1,
            product: 'ghas',
            quantity: 1,
            sku: 'Secret Protection',
            unitType: 'UserMonths',
          },
        ],
      }),
  });
  const result = await collectProviderCosts(context, [
    githubSource('tutur3u', 'token'),
  ]);
  const writes = recorded(calls);
  expect(writes.map((call) => call.body?.p_usage_date)).toEqual([
    '2026-11-20',
    '2026-11-19',
    '2026-08-23',
  ]);
  expect(writes.length).toBeLessThanOrEqual(MAX_DAYS_PER_SOURCE);
  // Only the 2026-11-20 response rows match that day; they aggregate to two.
  expect(writes[0]?.body?.p_lines).toEqual([
    {
      app_id: 'platform',
      billed_amount_usd: 0,
      environment: 'ci',
      list_amount_usd: 6.6,
      quantity: 1100,
      service: 'actions',
      sku: 'Actions Linux',
      unit: 'Minutes',
    },
    {
      app_id: '',
      billed_amount_usd: 1,
      environment: 'shared',
      list_amount_usd: 1,
      quantity: 1,
      service: 'ghas',
      sku: 'Secret Protection',
      unit: 'UserMonths',
    },
  ]);
  expect(writes[1]?.body?.p_lines).toEqual([]);
  expect(result).toEqual({
    detail: {
      budget_alerts: 0,
      days: 3,
      exhausted_days: 0,
      failed_days: 0,
      lines: 2,
      sources: 1,
    },
    outcome: 'ok',
  });
  const github = calls.find((call) => call.url.hostname === 'api.github.com');
  expect(github?.url.searchParams.get('day')).toBe('20');
});

it('asks the database to plan the recent and backfill days', async () => {
  const { calls, context } = harness();
  await collectProviderCosts(context, [githubSource('tutur3u', 'token')]);
  const plan = calls.find((call) =>
    call.url.pathname.endsWith('/plan_provider_cost_days')
  );
  expect(plan?.body).toEqual({
    p_account_id: 'tutur3u',
    p_backfill_limit: 1,
    p_from: '2026-08-23',
    p_provider: 'github',
    p_recent: ['2026-11-20', '2026-11-19'],
    p_to: '2026-11-20',
  });
});

it('marks an over-budget day exhausted instead of retrying it', async () => {
  const { calls, context } = harness({
    plan: ['2026-11-20'],
    provider: () =>
      new Response(new Uint8Array(5 * 1024 * 1024), {
        headers: { 'Content-Type': 'application/json' },
      }),
  });
  const result = await collectProviderCosts(context, [
    githubSource('tutur3u', 'token'),
  ]);
  const marked = calls.filter((call) =>
    call.url.pathname.endsWith('/mark_provider_cost_day_exhausted')
  );
  expect(marked.map((call) => call.body?.p_usage_date)).toEqual(['2026-11-20']);
  expect(recorded(calls)).toHaveLength(0);
  expect(result).toMatchObject({
    detail: { days: 0, exhausted_days: 1, failed_days: 0 },
    outcome: 'degraded',
  });
});

it('skips a day whose durable attempt budget is spent', async () => {
  const { calls, context } = harness({
    claim: (day) => day !== '2026-11-19',
  });
  const result = await collectProviderCosts(context, [
    githubSource('tutur3u', 'token'),
  ]);
  const providerCalls = calls.filter(
    (call) => call.url.hostname === 'api.github.com'
  );
  expect(providerCalls.map((call) => call.url.searchParams.get('day'))).toEqual(
    ['20']
  );
  expect(result).toMatchObject({
    detail: { days: 1, exhausted_days: 1 },
    outcome: 'degraded',
  });
});

it('claims each day before calling its provider', async () => {
  const { calls, context } = harness({ plan: ['2026-11-20'] });
  await collectProviderCosts(context, [githubSource('tutur3u', 'token')]);
  const order = calls.map((call) =>
    call.url.hostname === 'api.github.com'
      ? 'provider'
      : call.url.pathname.split('/').pop()
  );
  expect(order).toEqual([
    'plan_provider_cost_days',
    'claim_provider_cost_day',
    'provider',
    'record_provider_cost_day',
    'dispatch_provider_cost_budget_alerts',
  ]);
});

it('keeps provider response content out of failure logs', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { context } = harness({
    plan: ['2026-11-20'],
    provider: () => new Response('leaked-provider-body {'),
  });
  const result = await collectProviderCosts(context, [
    githubSource('tutur3u', 'token'),
  ]);
  expect(result.outcome).toBe('failed');
  const logged = JSON.stringify(errors.mock.calls);
  expect(logged).not.toContain('leaked-provider-body');
  expect(logged).not.toContain('token');
  expect(errors).toHaveBeenCalledWith('Provider cost day failed', {
    category: 'shape',
    day: '2026-11-20',
    provider: 'github',
    status: undefined,
  });
  errors.mockRestore();
});

it('stops between provider days when the ledger fence closes', async () => {
  const core = new LedgerCore(memoryLedgerStore().store);
  const jobId = 'provider-cost-collection';
  const claim = core.claim({
    jobId,
    leaseMs: 200_000,
    maxConsecutiveFailures: 5,
    now: NOW,
    slot: '2026-11-21T03:17',
  });
  if (!claim.granted) throw new Error('claim');
  let providerRequests = 0;
  const { context } = harness({
    provider: () => {
      providerRequests += 1;
      core.stop(jobId, 'operator');
      return Response.json({ usageItems: [] });
    },
  });
  context.fence = async () => core.checkFence(jobId, claim.generation);
  const sources = [githubSource('tutur3u', 'token')];
  await expect(collectProviderCosts(context, sources)).resolves.toMatchObject({
    outcome: 'stopped',
  });
  expect(providerRequests).toBe(1);

  // Resuming starts a new generation; the stopped run stays fenced out.
  core.resume(jobId);
  await expect(collectProviderCosts(context, sources)).resolves.toMatchObject({
    outcome: 'stopped',
  });
  expect(providerRequests).toBe(1);
});

it('does not call the provider when a stop lands during the claim', async () => {
  const core = new LedgerCore(memoryLedgerStore().store);
  const jobId = 'provider-cost-collection';
  const claim = core.claim({
    jobId,
    leaseMs: 200_000,
    maxConsecutiveFailures: 5,
    now: NOW,
    slot: '2026-11-21T03:17',
  });
  if (!claim.granted) throw new Error('claim');
  const { calls, context } = harness({
    claim: () => {
      core.stop(jobId, 'operator');
      core.resume(jobId);
      return true;
    },
  });
  context.fence = async () => core.checkFence(jobId, claim.generation);
  await expect(
    collectProviderCosts(context, [githubSource('tutur3u', 'token')])
  ).resolves.toMatchObject({ outcome: 'stopped' });
  expect(calls.some((call) => call.url.hostname === 'api.github.com')).toBe(
    false
  );
});

it('counts a provider request timeout as a day failure and continues', async () => {
  let slowReads = 0;
  const slow: CostSource = {
    accountId: 'tutur3u',
    provider: 'github',
    read: ({ signal }) =>
      new Promise((_resolve, reject) => {
        slowReads += 1;
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        });
      }),
  };
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { calls, context } = harness({
    plan: ['2026-11-20', '2026-11-19'],
    provider: () => new Response(''),
  });
  const result = await collectProviderCosts(
    context,
    [slow, vercelSource('team_1', 'token')],
    { providerTimeoutMs: 20 }
  );
  expect(calls.some((call) => call.url.hostname === 'api.vercel.com')).toBe(
    true
  );
  // The timed-out source is skipped for its second day; Vercel runs both.
  expect(slowReads).toBe(1);
  expect(result).toMatchObject({
    detail: { days: 2, failed_days: 1 },
    outcome: 'degraded',
  });
  expect(errors).toHaveBeenCalledWith('Provider cost day failed', {
    category: 'timeout',
    day: '2026-11-20',
    provider: 'github',
  });
  errors.mockRestore();
});

it('fails a day whose rows lack a valid routing date', async () => {
  const github = githubSource('tutur3u', 'token');
  await expect(
    github.read({
      day: '2026-11-20',
      fetch: (async () =>
        Response.json({
          usageItems: [{ grossAmount: 1, netAmount: 0, product: 'actions' }],
        })) as typeof fetch,
      signal: AbortSignal.timeout(1_000),
      userAgent: 'test-agent',
    })
  ).rejects.toMatchObject({ category: 'shape' });
  const vercel = vercelSource('team_1', 'token');
  await expect(
    vercel.read({
      day: '2026-11-20',
      fetch: (async () =>
        new Response(
          JSON.stringify({ BilledCost: 1, ServiceName: 'x' })
        )) as typeof fetch,
      signal: AbortSignal.timeout(1_000),
      userAgent: 'test-agent',
    })
  ).rejects.toMatchObject({ category: 'shape' });
});

it('stops before any provider call once the fence closes', async () => {
  const { calls, context } = harness({ fence: async () => false });
  await expect(
    collectProviderCosts(context, [githubSource('tutur3u', 'token')])
  ).resolves.toMatchObject({ outcome: 'stopped' });
  expect(calls).toHaveLength(0);
});

it('reports a provider failure without writing and degrades when partial', async () => {
  let first = true;
  const { calls, context } = harness({
    provider: () => {
      if (first) {
        first = false;
        return new Response('denied', { status: 403 });
      }
      return Response.json({ usageItems: [] });
    },
  });
  const result = await collectProviderCosts(context, [
    githubSource('tutur3u', 'token'),
  ]);
  expect(recorded(calls)).toHaveLength(1);
  expect(result).toMatchObject({
    detail: { days: 1, failed_days: 1 },
    outcome: 'degraded',
  });
});

it('fails when every day write is rejected', async () => {
  const { context } = harness({ recordStatus: 400 });
  await expect(
    collectProviderCosts(context, [githubSource('tutur3u', 'token')])
  ).resolves.toMatchObject({ outcome: 'failed' });
});

it('keeps Vercel rows that start on the usage day and aggregates by project', async () => {
  const row = (start: string, project: string, billed: number) =>
    JSON.stringify({
      BilledCost: String(billed),
      ChargeCategory: 'Usage',
      ChargePeriodStart: start,
      ConsumedQuantity: '1',
      ConsumedUnit: 'GB',
      EffectiveCost: billed * 2,
      ListCost: billed * 3,
      SkuId: 'sku_fot',
      ServiceName: 'Fast Origin Transfer',
      Tags: { ProjectName: project },
    });
  const body = [
    row('2026-11-19T08:00:00.000Z', 'platform', 9),
    row('2026-11-20T08:00:00.000Z', 'platform', 1),
    row('2026-11-20T08:00:00.000Z', 'platform', 2),
    row('2026-11-20T08:00:00.000Z', 'contacts', 0.5),
  ].join('\n');
  let requested: URL | undefined;
  const source = vercelSource('team_1', 'token');
  const lines = await source.read({
    day: '2026-11-20',
    fetch: (async (input: RequestInfo | URL) => {
      requested = new URL(String(input));
      return new Response(body);
    }) as typeof fetch,
    signal: AbortSignal.timeout(1_000),
    userAgent: 'test-agent',
  });
  expect(requested?.searchParams.get('from')).toBe('2026-11-20T00:00:00.000Z');
  expect(requested?.searchParams.get('to')).toBe('2026-11-21T00:00:00.000Z');
  expect(lines).toEqual([
    expect.objectContaining({
      app_id: 'platform',
      billed_amount_usd: 3,
      list_amount_usd: 9,
      quantity: 2,
      sku: 'sku_fot',
    }),
    expect.objectContaining({ app_id: 'contacts', billed_amount_usd: 0.5 }),
  ]);
});

it('rejects a provider day above the line limit', async () => {
  const items = Array.from({ length: MAX_COST_LINES_PER_DAY + 1 }, (_, i) => ({
    date: '2026-11-20T00:00:00Z',
    grossAmount: 1,
    netAmount: 0,
    product: 'actions',
    quantity: 1,
    repositoryName: `repo-${i}`,
    sku: 'Actions Linux',
    unitType: 'Minutes',
  }));
  const source: CostSource = githubSource('tutur3u', 'token');
  await expect(
    source.read({
      day: '2026-11-20',
      fetch: (async () => Response.json({ usageItems: items })) as typeof fetch,
      signal: AbortSignal.timeout(1_000),
      userAgent: 'test-agent',
    })
  ).rejects.toThrow('line limit');
});

it('fails a Vercel day with an unusable billed amount', async () => {
  const source = vercelSource('team_1', 'token');
  await expect(
    source.read({
      day: '2026-11-20',
      fetch: (async () =>
        new Response(
          JSON.stringify({
            ChargePeriodStart: '2026-11-20T08:00:00.000Z',
            ServiceName: 'Fast Origin Transfer',
          })
        )) as typeof fetch,
      signal: AbortSignal.timeout(1_000),
      userAgent: 'test-agent',
    })
  ).rejects.toMatchObject({ category: 'shape', name: 'CostSourceError' });
});

it('keeps a missing Vercel list price as unavailable', async () => {
  const source = vercelSource('team_1', 'token');
  const lines = await source.read({
    day: '2026-11-20',
    fetch: (async () =>
      new Response(
        JSON.stringify({
          BilledCost: 2,
          ChargePeriodStart: '2026-11-20T08:00:00.000Z',
          ServiceName: 'Pro',
          SkuId: 'sku_pro',
        })
      )) as typeof fetch,
    signal: AbortSignal.timeout(1_000),
    userAgent: 'test-agent',
  });
  expect(lines).toEqual([
    expect.objectContaining({ billed_amount_usd: 2, list_amount_usd: null }),
  ]);
});

it.each([
  '2026-02-30',
  '2026-11-20Tgarbage',
  '2026-11-20T25:00:00Z',
  '2026-11-20 00:00',
  20261120,
])('rejects the routing date %s', (value) => {
  expect(() => routingDay(value)).toThrow(CostSourceError);
});

it('accepts provider routing timestamps', () => {
  expect(routingDay('2026-11-20T00:00:00Z')).toBe('2026-11-20');
  expect(routingDay('2026-11-20T08:00:00.000Z')).toBe('2026-11-20');
  expect(routingDay('2026-11-20')).toBe('2026-11-20');
});

it('ends the run as unknown when a day write cannot be confirmed', async () => {
  const { context } = harness({ plan: ['2026-11-20', '2026-11-19'] });
  const fetch = context.fetch;
  context.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
    String(input).endsWith('/record_provider_cost_day')
      ? new Response('not json')
      : fetch(input, init)) as typeof fetch;
  await expect(
    collectProviderCosts(context, [githubSource('tutur3u', 'token')])
  ).resolves.toMatchObject({ detail: { days: 0 }, outcome: 'unknown' });
});

it('fails only the day whose claim is rejected', async () => {
  const { context } = harness({ plan: ['2026-11-20', '2026-11-19'] });
  const fetch = context.fetch;
  let claims = 0;
  context.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/claim_provider_cost_day') && claims++ === 0)
      return new Response('no', { status: 500 });
    return fetch(input, init);
  }) as typeof fetch;
  await expect(
    collectProviderCosts(context, [githubSource('tutur3u', 'token')])
  ).resolves.toMatchObject({
    detail: { days: 1, failed_days: 1 },
    outcome: 'degraded',
  });
});

it('evaluates budget alerts for the last complete day after collecting', async () => {
  const { context } = harness({ plan: ['2026-11-20'] });
  const fetch = context.fetch;
  let asOf: unknown;
  context.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).endsWith('/dispatch_provider_cost_budget_alerts'))
      return fetch(input, init);
    asOf = JSON.parse(String(init?.body)).p_as_of;
    return Response.json(2);
  }) as typeof fetch;
  const result = await collectProviderCosts(context, [
    githubSource('tutur3u', 'token'),
  ]);
  expect(asOf).toBe('2026-11-20');
  expect(result).toMatchObject({ detail: { budget_alerts: 2 }, outcome: 'ok' });
});

it('degrades the run when budget alerts fail', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { context } = harness({ plan: ['2026-11-20'] });
  const fetch = context.fetch;
  context.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
    String(input).endsWith('/dispatch_provider_cost_budget_alerts')
      ? new Response('no', { status: 400 })
      : fetch(input, init)) as typeof fetch;
  const result = await collectProviderCosts(context, [
    githubSource('tutur3u', 'token'),
  ]);
  expect(result).toMatchObject({ detail: { days: 1 }, outcome: 'degraded' });
  expect(errors).toHaveBeenCalledWith('Provider cost budget alerts failed', {
    category: 'alerts',
  });
  errors.mockRestore();
});

it.each([
  ['an unreadable body', () => new Response('not json')],
  ['a lost response', () => Promise.reject(new TypeError('network'))],
  ['a gateway error', () => new Response('bad gateway', { status: 502 })],
  ['a gateway timeout', () => new Response('timeout', { status: 504 })],
])(
  'reports an unconfirmed budget dispatch with %s as unknown',
  async (_label, reply) => {
    const { context } = harness({ plan: ['2026-11-20'] });
    const fetch = context.fetch;
    context.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith('/dispatch_provider_cost_budget_alerts')
        ? reply()
        : fetch(input, init)) as typeof fetch;
    await expect(
      collectProviderCosts(context, [githubSource('tutur3u', 'token')])
    ).resolves.toMatchObject({ outcome: 'unknown' });
  }
);
