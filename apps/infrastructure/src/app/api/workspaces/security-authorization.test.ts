import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeAdmin: vi.fn(),
  authorizeSecrets: vi.fn(),
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
    mocks.authorizeAdmin.mockResolvedValue(forbidden());
    mocks.authorizeSecrets.mockResolvedValue(forbidden());
  });

  it('requires role management permission before enumerating workspaces', async () => {
    const { GET } = await import('./route');

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.authorizeAdmin).toHaveBeenCalledWith('manage_workspace_roles');
  });

  it('binds workspace secret listing and creation authorization to wsId', async () => {
    const { GET, POST } = await import('./[wsId]/secrets/route');
    const context = { params: Promise.resolve({ wsId: 'tenant-workspace' }) };

    const getResponse = await GET(new Request('https://example.test'), context);
    const postResponse = await POST(
      new Request('https://example.test', {
        body: JSON.stringify({ name: 'key', value: 'secret' }),
        method: 'POST',
      }),
      context
    );

    expect(getResponse.status).toBe(403);
    expect(postResponse.status).toBe(403);
    expect(mocks.authorizeSecrets).toHaveBeenNthCalledWith(
      1,
      'tenant-workspace'
    );
    expect(mocks.authorizeSecrets).toHaveBeenNthCalledWith(
      2,
      'tenant-workspace'
    );
  });

  it('binds workspace secret update and deletion authorization to wsId', async () => {
    const { DELETE, PUT } = await import('./[wsId]/secrets/[secretId]/route');
    const context = {
      params: Promise.resolve({
        secretId: 'secret-id',
        wsId: 'tenant-workspace',
      }),
    };

    const putResponse = await PUT(
      new Request('https://example.test', {
        body: JSON.stringify({ value: 'replacement' }),
        method: 'PUT',
      }),
      context
    );
    const deleteResponse = await DELETE(
      new Request('https://example.test', { method: 'DELETE' }),
      context
    );

    expect(putResponse.status).toBe(403);
    expect(deleteResponse.status).toBe(403);
    expect(mocks.authorizeSecrets).toHaveBeenNthCalledWith(
      1,
      'tenant-workspace'
    );
    expect(mocks.authorizeSecrets).toHaveBeenNthCalledWith(
      2,
      'tenant-workspace'
    );
  });
});
