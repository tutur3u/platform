import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  create: vi.fn(),
  createAdminClient: vi.fn(),
  list: vi.fn(),
  policyMaybeSingle: vi.fn(),
  policyUpsert: vi.fn(),
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

function adminClient() {
  const read = {
    eq: vi.fn(() => read),
    maybeSingle: () => mocks.policyMaybeSingle(),
    select: vi.fn(() => read),
  };
  return {
    from: vi.fn((table: string) => {
      if (table !== 'workspace_configs') {
        throw new Error(`Unexpected table ${table}`);
      }
      return {
        ...read,
        upsert: (...args: unknown[]) => mocks.policyUpsert(...args),
      };
    }),
    id: 'admin',
  };
}

const context = { params: Promise.resolve({ wsId: 'personal' }) };

describe('inventory sales periods collection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.policyMaybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.policyUpsert.mockResolvedValue({ error: null });
    mocks.createAdminClient.mockResolvedValue(adminClient());
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
      sbAdmin: expect.objectContaining({ id: 'admin' }),
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
        product_scope: 'all',
        starts_at: '2027-03-01',
      },
      sbAdmin: expect.objectContaining({ id: 'admin' }),
      wsId: 'ws-real',
    });
    await expect(response.json()).resolves.toMatchObject({
      data: { id: 'period-2' },
      salesDefault: { status: 'unchanged' },
    });
    expect(mocks.policyUpsert).not.toHaveBeenCalled();
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

  it('requires products for allowlist and blocklist periods', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/sales-periods', {
        body: JSON.stringify({
          name: 'Restricted period',
          product_scope: 'allowlist',
        }),
        method: 'POST',
      }),
      context
    );

    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('sets the new period as the default only when the saved policy is on', async () => {
    mocks.policyMaybeSingle.mockResolvedValue({
      data: { value: 'true' },
      error: null,
    });
    mocks.create.mockResolvedValue({
      id: 'period-2',
      name: 'Spring 2027',
      sale_count: 0,
      ws_id: 'ws-real',
    });
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/sales-periods', {
        body: JSON.stringify({ name: 'Spring 2027' }),
        method: 'POST',
      }),
      context
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      data: { id: 'period-2' },
      salesDefault: { status: 'updated' },
    });
    expect(mocks.policyUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'inventory_default_sales_period_id',
        value: 'period-2',
        ws_id: 'ws-real',
      }),
      { onConflict: 'ws_id,id' }
    );
  });

  it('ignores a client auto-default flag when the saved policy is off', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/sales-periods', {
        body: JSON.stringify({
          autoSetNewSalesPeriodAsDefault: true,
          name: 'Spring 2027',
        }),
        method: 'POST',
      }),
      context
    );

    expect(response.status).toBe(201);
    expect(mocks.create.mock.calls[0]?.[0].payload).toEqual({
      name: 'Spring 2027',
      product_scope: 'all',
    });
    await expect(response.json()).resolves.toMatchObject({
      salesDefault: { status: 'unchanged' },
    });
    expect(mocks.policyUpsert).not.toHaveBeenCalled();
  });

  it('keeps a saved false policy from changing later periods', async () => {
    mocks.policyMaybeSingle.mockResolvedValue({
      data: { value: 'false' },
      error: null,
    });
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/sales-periods', {
        body: JSON.stringify({ name: 'Spring 2027' }),
        method: 'POST',
      }),
      context
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      salesDefault: { status: 'unchanged' },
    });
    expect(mocks.policyUpsert).not.toHaveBeenCalled();
  });

  it('reports a config failure after the period exists', async () => {
    mocks.policyMaybeSingle.mockResolvedValue({
      data: { value: 'true' },
      error: null,
    });
    mocks.policyUpsert.mockResolvedValue({
      error: { message: 'write failed' },
    });
    mocks.create.mockResolvedValue({
      id: 'period-2',
      ws_id: 'ws-real',
    });
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/sales-periods', {
        body: JSON.stringify({ name: 'Spring 2027' }),
        method: 'POST',
      }),
      context
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      data: { id: 'period-2', ws_id: 'ws-real' },
      salesDefault: { status: 'failed' },
    });
  });

  it('reports a policy read failure without writing another default', async () => {
    mocks.policyMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'read failed' },
    });
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/sales-periods', {
        body: JSON.stringify({ name: 'Spring 2027' }),
        method: 'POST',
      }),
      context
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      data: { id: 'period-2' },
      salesDefault: { status: 'failed' },
    });
    expect(mocks.policyUpsert).not.toHaveBeenCalled();
  });

  it('does not write a period id from another workspace', async () => {
    mocks.policyMaybeSingle.mockResolvedValue({
      data: { value: 'true' },
      error: null,
    });
    mocks.create.mockResolvedValue({ id: 'period-2', ws_id: 'other-ws' });
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/sales-periods', {
        body: JSON.stringify({ name: 'Spring 2027' }),
        method: 'POST',
      }),
      context
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      salesDefault: { status: 'failed' },
    });
    expect(mocks.policyUpsert).not.toHaveBeenCalled();
  });

  it('fails closed when the created period has no id', async () => {
    mocks.policyMaybeSingle.mockResolvedValue({
      data: { value: 'true' },
      error: null,
    });
    mocks.create.mockResolvedValue({ ws_id: 'ws-real' });
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/sales-periods', {
        body: JSON.stringify({ name: 'Spring 2027' }),
        method: 'POST',
      }),
      context
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      salesDefault: { status: 'failed' },
    });
    expect(mocks.policyUpsert).not.toHaveBeenCalled();
  });

  it('reports a thrown config read after the period exists', async () => {
    mocks.policyMaybeSingle.mockRejectedValue(new Error('config unavailable'));
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/sales-periods', {
        body: JSON.stringify({ name: 'Spring 2027' }),
        method: 'POST',
      }),
      context
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      data: { id: 'period-2' },
      salesDefault: { status: 'failed' },
    });
    expect(mocks.policyUpsert).not.toHaveBeenCalled();
  });
});
