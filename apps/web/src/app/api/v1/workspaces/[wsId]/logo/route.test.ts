import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
const VICTIM_WORKSPACE_ID = '22222222-2222-2222-2222-222222222222';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createSignedUrl: vi.fn(),
  getPermissions: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  remove: vi.fn(),
  storageFrom: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown) => handler,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
}));

vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
}));

type RouteHandler = (
  request: NextRequest,
  context: { supabase: ReturnType<typeof createWorkspaceClient>['client'] },
  params: { wsId: string }
) => Promise<Response>;

function routeHandler(handler: unknown) {
  return handler as RouteHandler;
}

function createWorkspaceClient({ logoUrl }: { logoUrl?: string | null } = {}) {
  const single = vi.fn().mockResolvedValue({
    data: {
      logo_url: logoUrl ?? null,
    },
    error: null,
  });
  const selectEq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq: selectEq }));
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq: updateEq }));
  const from = vi.fn(() => ({ select, update }));

  return {
    client: { from },
    from,
    select,
    selectEq,
    single,
    update,
    updateEq,
  };
}

function request(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/v1/workspaces/ws-1/logo', {
    body: body ? JSON.stringify(body) : undefined,
    method,
  });
}

describe('workspace logo route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.normalizeWorkspaceId.mockResolvedValue(WORKSPACE_ID);
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: () => false,
    });
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/logo.png' },
      error: null,
    });
    mocks.remove.mockResolvedValue({ data: [], error: null });
    mocks.storageFrom.mockReturnValue({
      createSignedUrl: mocks.createSignedUrl,
      remove: mocks.remove,
    });
    mocks.createAdminClient.mockResolvedValue({
      storage: {
        from: mocks.storageFrom,
      },
    });
  });

  it('rejects traversal logo paths before storing them', async () => {
    const workspaceClient = createWorkspaceClient();
    const { PATCH } = await import('@/app/api/v1/workspaces/[wsId]/logo/route');

    const response = await routeHandler(PATCH)(
      request('PATCH', {
        filePath: `${WORKSPACE_ID}/../${VICTIM_WORKSPACE_ID}/logos/logo-1.png`,
      }),
      { supabase: workspaceClient.client },
      { wsId: 'ws-1' }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'Invalid file path',
    });
    expect(workspaceClient.update).not.toHaveBeenCalled();
  });

  it('stores logo paths that match the upload-url route shape', async () => {
    const workspaceClient = createWorkspaceClient();
    const safePath = `${WORKSPACE_ID}/logos/logo-1770000000000.webp`;
    const { PATCH } = await import('@/app/api/v1/workspaces/[wsId]/logo/route');

    const response = await routeHandler(PATCH)(
      request('PATCH', { filePath: safePath }),
      { supabase: workspaceClient.client },
      { wsId: 'ws-1' }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(workspaceClient.update).toHaveBeenCalledWith({
      logo_url: safePath,
    });
    expect(workspaceClient.updateEq).toHaveBeenCalledWith('id', WORKSPACE_ID);
  });

  it('does not sign unsafe legacy logo paths', async () => {
    const workspaceClient = createWorkspaceClient({
      logoUrl: `${WORKSPACE_ID}/../${VICTIM_WORKSPACE_ID}/logos/logo-1.png`,
    });
    const { GET } = await import('@/app/api/v1/workspaces/[wsId]/logo/route');

    const response = await routeHandler(GET)(
      request('GET'),
      { supabase: workspaceClient.client },
      { wsId: 'ws-1' }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ url: null });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it('signs safe stored logo paths', async () => {
    const safePath = `${WORKSPACE_ID}/logos/logo-1770000000000.png`;
    const workspaceClient = createWorkspaceClient({ logoUrl: safePath });
    const { GET } = await import('@/app/api/v1/workspaces/[wsId]/logo/route');

    const response = await routeHandler(GET)(
      request('GET'),
      { supabase: workspaceClient.client },
      { wsId: 'ws-1' }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: 'https://storage.example.com/logo.png',
    });
    expect(mocks.storageFrom).toHaveBeenCalledWith('workspaces');
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(safePath, 60 * 15);
  });

  it('clears unsafe legacy logo paths without deleting traversed storage objects', async () => {
    const workspaceClient = createWorkspaceClient({
      logoUrl: `${WORKSPACE_ID}/../${VICTIM_WORKSPACE_ID}/logos/logo-1.png`,
    });
    const { DELETE } = await import(
      '@/app/api/v1/workspaces/[wsId]/logo/route'
    );

    const response = await routeHandler(DELETE)(
      request('DELETE'),
      { supabase: workspaceClient.client },
      { wsId: 'ws-1' }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(workspaceClient.update).toHaveBeenCalledWith({ logo_url: null });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
