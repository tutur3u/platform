import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  createAdminClient: vi.fn(),
  getCurrency: vi.fn(),
}));

vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: (...args: unknown[]) => mocks.authorize(...args),
}));
vi.mock('@tuturuuu/inventory-core/workspace-currency', () => ({
  getWorkspaceDefaultCurrency: (...args: unknown[]) =>
    mocks.getCurrency(...args),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));

function permissions(granted: string[]) {
  return {
    containsPermission: vi.fn((permission: string) =>
      granted.includes(permission)
    ),
  };
}

describe('inventory analytics summary route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissions(['view_inventory_analytics']),
        wsId: 'ws-real',
      },
    });
    mocks.getCurrency.mockResolvedValue('USD');
    mocks.createAdminClient.mockResolvedValue({
      schema: vi.fn(() => ({
        rpc: vi.fn().mockResolvedValue({
          data: {
            generatedAt: '2026-07-18T00:00:00Z',
            summary: { revenue: 25 },
            trend: [{ date: '2026-07-18', revenue: 25, sales: 1 }],
          },
          error: null,
        }),
      })),
    });
  });

  it('returns the RPC snapshot with workspace currency', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/analytics?days=90'),
      { params: Promise.resolve({ wsId: 'alias' }) }
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      currency: 'USD',
      observability: {
        dataPoints: 1,
        queryDurationMs: expect.any(Number),
      },
      summary: { revenue: 25 },
    });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('server-timing')).toMatch(
      /^inventory-analytics;dur=\d+$/
    );
    expect(response.headers.get('x-inventory-analytics-generated-at')).toBe(
      '2026-07-18T00:00:00Z'
    );
    const client = await mocks.createAdminClient.mock.results[0]?.value;
    expect(client.schema).toHaveBeenCalledWith('private');
    const privateSchema = client.schema.mock.results[0]?.value;
    expect(privateSchema.rpc).toHaveBeenCalledWith('get_inventory_analytics', {
      p_currency: 'USD',
      p_days: 90,
      p_ws_id: 'ws-real',
    });
  });

  it('rejects unsupported ranges before reading data', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/analytics?days=2'),
      { params: Promise.resolve({ wsId: 'alias' }) }
    );
    expect(response.status).toBe(400);
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
});
