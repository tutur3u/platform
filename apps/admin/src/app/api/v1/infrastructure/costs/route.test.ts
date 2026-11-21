import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authorizeMock } = vi.hoisted(() => ({ authorizeMock: vi.fn() }));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(async () => undefined),
}));
vi.mock('@/lib/infrastructure-admin-access', () => ({
  authorizeInfrastructureAdminRequest: authorizeMock,
}));

import { GET } from './route';

type RpcResult = { data: unknown; error: unknown };

function grant(
  rpc: Record<string, RpcResult>,
  permissions: string[] = ['view_finance_stats', 'view_infrastructure']
) {
  const calls: { name: string; args: unknown; range?: [number, number] }[] = [];
  // Mirrors the PostgREST builder: awaitable, with an optional range().
  const call = (name: string, args?: unknown) => {
    const result = rpc[name] ?? { data: [], error: null };
    const entry: { name: string; args: unknown; range?: [number, number] } = {
      args,
      name,
    };
    calls.push(entry);
    return {
      range: async (from: number, to: number) => {
        entry.range = [from, to];
        return Array.isArray(result.data)
          ? { ...result, data: result.data.slice(from, to + 1) }
          : result;
      },
      then: (resolve: (value: RpcResult) => unknown) => resolve(result),
    };
  };
  authorizeMock.mockResolvedValue({
    ok: true,
    permissions: {
      containsPermission: (id: string) => permissions.includes(id),
    },
    sbAdmin: { rpc: call, schema: () => ({ rpc: call }) },
    user: { id: 'user-1' },
  });
  return calls;
}

const request = () =>
  new Request('http://localhost/api/v1/infrastructure/costs');

describe('infrastructure costs route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a viewer without finance access', async () => {
    authorizeMock.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'denied' }, { status: 403 }),
    });
    expect((await GET(request())).status).toBe(403);
    expect(authorizeMock).toHaveBeenCalledWith(
      'view_finance_stats',
      true,
      expect.any(Request)
    );
  });

  it('also requires infrastructure access', async () => {
    const calls = grant({}, ['view_finance_stats']);
    expect((await GET(request())).status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('normalizes each source and keeps failures separate', async () => {
    grant({
      get_mau_count: { data: 42, error: null },
      get_provider_cost_daily: {
        data: [
          {
            account_id: 'team_1',
            app_id: 'web',
            billed_amount_usd: '1.5',
            collected_at: '2026-11-20T03:17:00Z',
            environment: 'shared',
            list_amount_usd: '3',
            provider: 'vercel',
            service: 'Fluid Active CPU',
            usage_date: '2026-11-19',
          },
        ],
        error: null,
      },
      get_root_provider_invoice_postings: {
        data: null,
        error: { message: 'boom' },
      },
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.json();
    expect(body.daily).toEqual({
      data: [
        {
          app: 'web',
          billedUsd: 1.5,
          day: '2026-11-19',
          environment: 'shared',
          listUsd: 3,
          provider: 'vercel',
          service: 'Fluid Active CPU',
        },
      ],
      status: 'ok',
    });
    expect(body.invoices).toEqual({ status: 'unavailable' });
    expect(body.monthlyActiveUsers).toEqual({ data: 42, status: 'ok' });
    expect(body.collection).toEqual({ data: [], status: 'ok' });
  });

  it('pages through daily groups beyond one response', async () => {
    const rows = Array.from({ length: 1_500 }, (_, index) => ({
      account_id: 'team_1',
      app_id: `app-${index}`,
      billed_amount_usd: 1,
      collected_at: '2026-11-20T03:17:00Z',
      environment: 'shared',
      list_amount_usd: null,
      provider: 'vercel',
      service: 'usage',
      usage_date: '2026-11-19',
    }));
    const calls = grant({
      get_provider_cost_daily: { data: rows, error: null },
    });
    const body = await (await GET(request())).json();
    expect(body.daily.status).toBe('ok');
    expect(body.daily.data).toHaveLength(1_500);
    expect(body.daily.data[0].listUsd).toBe(null);
    expect(
      calls
        .filter((call) => call.name === 'get_provider_cost_daily')
        .map((call) => call.range)
    ).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it('marks a provider-day complete only when every account completed it', async () => {
    grant({
      get_provider_cost_collection_status: {
        data: [
          { account_id: 'a', days: 2, exhausted_days: 0, provider: 'github' },
          { account_id: 'b', days: 1, exhausted_days: 1, provider: 'github' },
          { account_id: 'c', days: 0, exhausted_days: 0, provider: 'vercel' },
        ],
        error: null,
      },
      get_provider_cost_complete_days: {
        data: [
          {
            account_id: 'a',
            days: ['2026-11-18', '2026-11-19'],
            provider: 'github',
          },
          { account_id: 'b', days: ['2026-11-19'], provider: 'github' },
        ],
        error: null,
      },
    });
    const body = await (await GET(request())).json();
    expect(body.reportingMonth).toMatch(/^\d{4}-\d{2}$/);
    expect(body.completeDays).toEqual({
      data: [
        { days: ['2026-11-19'], provider: 'github' },
        { days: [], provider: 'vercel' },
      ],
      status: 'ok',
    });
  });

  it.each([
    [20_000, 'ok'],
    [20_001, 'unavailable'],
  ])('reads %i daily groups as %s', async (count, status) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const rows = Array.from({ length: count }, () => ({
      account_id: 'team_1',
      app_id: 'web',
      billed_amount_usd: 1,
      collected_at: '2026-11-20T03:17:00Z',
      environment: 'shared',
      list_amount_usd: 1,
      provider: 'vercel',
      service: 'usage',
      usage_date: '2026-11-19',
    }));
    grant({ get_provider_cost_daily: { data: rows, error: null } });
    const body = await (await GET(request())).json();
    expect(body.daily.status).toBe(status);
    if (status === 'ok') expect(body.daily.data).toHaveLength(20_000);
  });
});
