import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeAdmin: vi.fn(),
  authorizeSecrets: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
}));

vi.mock('@/lib/infrastructure-admin-access', () => ({
  authorizeInfrastructureAdminRequest: mocks.authorizeAdmin,
  authorizeInfrastructureWorkspaceSecretsRequest: mocks.authorizeSecrets,
}));

const forbidden = () => ({
  ok: false as const,
  response: Response.json({ error: 'Forbidden' }, { status: 403 }),
});

describe('Infrastructure workspace API authorization', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ order: mocks.order });
    mocks.order.mockResolvedValue({
      data: [{ id: 'tenant', name: 'Tenant' }],
      error: null,
    });
    mocks.authorizeAdmin.mockResolvedValue(forbidden());
    mocks.authorizeSecrets.mockResolvedValue(forbidden());
  });

  it('requires request-bound infrastructure viewing permission before enumerating workspaces', async () => {
    const { GET } = await import('./route');

    const request = new Request('https://example.test');
    const response = await GET(request);

    expect(response.status).toBe(403);
    expect(mocks.authorizeAdmin).toHaveBeenCalledExactlyOnceWith(
      'view_infrastructure',
      true,
      request
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('binds workspace secret listing and creation platform authorization', async () => {
    const { GET, POST } = await import('./[wsId]/secrets/route');
    const context = { params: Promise.resolve({ wsId: 'tenant-workspace' }) };

    const getRequest = new Request('https://example.test');
    const postRequest = new Request('https://example.test', {
      body: JSON.stringify({ name: 'key', value: 'secret' }),
      method: 'POST',
    });
    const getResponse = await GET(getRequest, context);
    const postResponse = await POST(postRequest, context);

    expect(getResponse.status).toBe(403);
    expect(postResponse.status).toBe(403);
    expect(mocks.authorizeAdmin).toHaveBeenCalledExactlyOnceWith(
      'view_infrastructure',
      true,
      getRequest
    );
    expect(mocks.authorizeSecrets).toHaveBeenCalledExactlyOnceWith(postRequest);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('binds workspace secret update and deletion platform authorization', async () => {
    const { DELETE, PUT } = await import('./[wsId]/secrets/[secretId]/route');
    const context = {
      params: Promise.resolve({
        secretId: 'secret-id',
        wsId: 'tenant-workspace',
      }),
    };

    const putRequest = new Request('https://example.test', {
      body: JSON.stringify({ value: 'replacement' }),
      method: 'PUT',
    });
    const deleteRequest = new Request('https://example.test', {
      method: 'DELETE',
    });
    const putResponse = await PUT(putRequest, context);
    const deleteResponse = await DELETE(deleteRequest, context);

    expect(putResponse.status).toBe(403);
    expect(deleteResponse.status).toBe(403);
    expect(mocks.authorizeSecrets).toHaveBeenNthCalledWith(1, putRequest);
    expect(mocks.authorizeSecrets).toHaveBeenNthCalledWith(2, deleteRequest);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('enumerates workspaces only after admission', async () => {
    const { GET } = await import('./route');
    const request = new Request('https://example.test');
    mocks.authorizeAdmin.mockResolvedValue({
      ok: true,
      sbAdmin: { from: mocks.from },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      { id: 'tenant', name: 'Tenant', color: 'bg-blue-500' },
    ]);
    expect(mocks.authorizeAdmin).toHaveBeenCalledExactlyOnceWith(
      'view_infrastructure',
      true,
      request
    );
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith('workspaces');
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith('id,name');
    expect(mocks.order).toHaveBeenCalledExactlyOnceWith('name', {
      ascending: true,
    });
  });
});
