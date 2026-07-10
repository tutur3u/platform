import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authorizeMock, createAdminClientMock } = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  createAdminClientMock: vi.fn(),
}));

vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: authorizeMock,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

function createClient() {
  const result = {
    data: [
      {
        display_name: 'Ada',
        email: 'ada@example.com',
        full_name: 'Ada Lovelace',
        id: 'person-1',
      },
    ],
    error: null,
  };
  const query = {
    eq: vi.fn(() => query),
    limit: vi.fn(() => query),
    or: vi.fn(async () => result),
    order: vi.fn(() => query),
    select: vi.fn(() => query),
  };
  return { from: vi.fn(() => query), query };
}

describe('stock beneficiaries route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorizeMock.mockResolvedValue({
      ok: true,
      value: {
        permissions: {
          containsPermission: vi.fn((permission: string) =>
            ['update_stock_quantity'].includes(permission)
          ),
        },
        wsId: 'workspace-1',
      },
    });
  });

  it('searches active workspace people without exposing unrelated fields', async () => {
    const client = createClient();
    createAdminClientMock.mockResolvedValue(client);

    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/beneficiaries?q=Ada&limit=10'),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [
        {
          email: 'ada@example.com',
          id: 'person-1',
          name: 'Ada Lovelace',
        },
      ],
    });
    expect(client.query.eq).toHaveBeenCalledWith('ws_id', 'workspace-1');
    expect(client.query.eq).toHaveBeenCalledWith('archived', false);
    expect(client.query.limit).toHaveBeenCalledWith(10);
    expect(client.query.or).toHaveBeenCalledWith(
      'display_name.ilike.%Ada%,full_name.ilike.%Ada%,email.ilike.%Ada%'
    );
  });

  it('requires stock-adjust permission', async () => {
    authorizeMock.mockResolvedValue({
      ok: true,
      value: {
        permissions: { containsPermission: vi.fn(() => false) },
        wsId: 'workspace-1',
      },
    });

    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/beneficiaries'), {
      params: Promise.resolve({ wsId: 'personal' }),
    });

    expect(response.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });
});
