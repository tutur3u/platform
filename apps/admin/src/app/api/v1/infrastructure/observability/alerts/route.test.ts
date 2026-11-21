import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authorizeMock, rpcMock } = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(async () => undefined),
}));
vi.mock('@/lib/infrastructure-admin-access', () => ({
  authorizeInfrastructureAdminRequest: authorizeMock,
}));

import { GET } from './route';

const request = () =>
  new Request('http://localhost/api/v1/infrastructure/observability/alerts');

describe('observability alerts route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorizeMock.mockResolvedValue({
      ok: true,
      sbAdmin: { schema: () => ({ rpc: rpcMock }) },
    });
  });

  it('requires infrastructure access and passes the request for bearer callers', async () => {
    authorizeMock.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    });
    const req = request();
    expect((await GET(req)).status).toBe(403);
    expect(authorizeMock).toHaveBeenCalledWith(
      'view_infrastructure',
      true,
      req
    );
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('returns alerts and Perf Factory regressions without caching', async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          burn_long: 15,
          burn_short: 20,
          dedupe_key: 'slo:a:page:tuturuuu-mail:20261121T0300',
          indicator: 'availability',
          latency_threshold_ms: null,
          objective: 0.995,
          resolved_at: null,
          service: 'tuturuuu-mail',
          severity: 'page',
          slo_id: 'a',
          started_at: '2026-11-21T03:00:00Z',
          state: 'firing',
        },
      ],
      error: null,
    });
    const response = await GET(request());
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body.alerts).toHaveLength(1);
    expect(body.regressions[0]).toMatchObject({
      app: 'mail',
      metric: 'error_rate',
    });
    expect(rpcMock).toHaveBeenCalledWith('list_observability_alerts', {
      p_limit: 200,
    });
  });

  it('reports an unreadable source as unavailable, not as no alerts', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'down' } });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await GET(request())).status).toBe(503);
  });
});
