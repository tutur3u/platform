import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  create: vi.fn(),
  createAdminClient: vi.fn(),
  list: vi.fn(),
}));

vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: (...args: unknown[]) => mocks.authorize(...args),
}));
vi.mock('@tuturuuu/inventory-core/sales-periods', () => ({
  createInventorySalesPeriod: (...args: unknown[]) => mocks.create(...args),
  listInventorySalesPeriods: (...args: unknown[]) => mocks.list(...args),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

function permissions(granted: string[]) {
  return {
    containsPermission: vi.fn((value: string) => granted.includes(value)),
  };
}

const context = { params: Promise.resolve({ wsId: 'personal' }) };

describe('inventory sales periods collection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({ id: 'admin' });
    mocks.authorize.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissions([
          'view_inventory_sales',
          'create_inventory_sales',
        ]),
        userId: 'actor-1',
        wsId: 'ws-real',
      },
    });
    mocks.list.mockResolvedValue([
      { id: 'period-1', name: 'TuCon 2026', sale_count: 12 },
    ]);
    mocks.create.mockResolvedValue({
      id: 'period-2',
      name: 'Spring 2027',
      sale_count: 0,
    });
  });

  it('lists active and archived periods when requested', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/sales-periods?include_archived=true'),
      context
    );

    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith({
      includeArchived: true,
      sbAdmin: { id: 'admin' },
      wsId: 'ws-real',
    });
  });

  it('creates a dated sales period', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/sales-periods', {
        body: JSON.stringify({
          ends_at: '2027-05-31',
          name: 'Spring 2027',
          starts_at: '2027-03-01',
        }),
        method: 'POST',
      }),
      context
    );

    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({
      actorId: 'actor-1',
      payload: {
        ends_at: '2027-05-31',
        name: 'Spring 2027',
        starts_at: '2027-03-01',
      },
      sbAdmin: { id: 'admin' },
      wsId: 'ws-real',
    });
  });

  it('rejects reversed date ranges', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/sales-periods', {
        body: JSON.stringify({
          ends_at: '2026-06-01',
          name: 'Summer 2026',
          starts_at: '2026-08-31',
        }),
        method: 'POST',
      }),
      context
    );

    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
