import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ROOT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';
const WORKSPACE_ID = '00000000-0000-0000-0000-000000000011';
const ACTOR_ID = 'owner-id';
const mocks = vi.hoisted(() => ({
  getPermissions: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  createAdminClient: vi.fn(),
  workspaceRow: vi.fn(),
  from: vi.fn(),
  adminFrom: vi.fn(),
  billingCheck: vi.fn(),
  rpc: vi.fn(),
  withSessionAuth: vi.fn(
    (
      handler: (
        request: NextRequest,
        context: {
          supabase: { from: ReturnType<typeof vi.fn> };
          user: { id: string };
        },
        params: { wsId: string }
      ) => unknown,
      _options?: { allowAppSessionAuth?: unknown }
    ) =>
      async (
        request: NextRequest,
        routeContext: { params: Promise<{ wsId: string }> }
      ) =>
        handler(
          request,
          { supabase: { from: mocks.from }, user: { id: ACTOR_ID } },
          await routeContext.params
        )
  ),
}));

vi.mock('next/server', async () => ({
  ...(await vi.importActual('next/server')),
  connection: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
}));
vi.mock('@/lib/api-auth', () => ({ withSessionAuth: mocks.withSessionAuth }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

const ownedWorkspace = {
  id: WORKSPACE_ID,
  name: 'Acme',
  creator_id: ACTOR_ID,
  personal: false,
};

async function callDelete(body?: unknown) {
  const { DELETE } = await import('./route');
  const request = new NextRequest(
    `http://localhost/api/workspaces/${WORKSPACE_ID}`,
    {
      method: 'DELETE',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }
  );
  return DELETE(request, { params: Promise.resolve({ wsId: WORKSPACE_ID }) });
}

async function callStatus() {
  const { GET } = await import('./deletion-status/route');
  return GET(
    new NextRequest(
      `http://localhost/api/workspaces/${WORKSPACE_ID}/deletion-status`
    ),
    { params: Promise.resolve({ wsId: WORKSPACE_ID }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.normalizeWorkspaceId.mockResolvedValue(WORKSPACE_ID);
  mocks.workspaceRow.mockResolvedValue({ data: ownedWorkspace, error: null });
  mocks.from.mockReturnValue({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({ maybeSingle: mocks.workspaceRow })),
    })),
  });
  mocks.rpc.mockResolvedValue({ data: 'deleted', error: null });
  mocks.createAdminClient.mockResolvedValue({
    rpc: mocks.rpc,
    from: mocks.adminFrom,
    schema: vi.fn(() => ({ rpc: mocks.billingCheck })),
  });
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('workspace deletion', () => {
  it('uses the verified actor and exact workspace name in one transaction', async () => {
    const response = await callDelete({ confirmation: ' Acme ' });

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      'delete_owned_workspace',
      {
        p_ws_id: WORKSPACE_ID,
        p_actor_id: ACTOR_ID,
        p_confirmation: 'Acme',
      }
    );
    expect(console.info).toHaveBeenCalledWith(
      '[audit] workspace.delete',
      expect.objectContaining({
        actorId: ACTOR_ID,
        outcome: 'deleted',
        workspaceId: WORKSPACE_ID,
      })
    );
  });

  it.each([
    { ...ownedWorkspace, creator_id: 'another-user' },
    { ...ownedWorkspace, personal: true },
    { ...ownedWorkspace, id: ROOT_WORKSPACE_ID },
  ])(
    'rejects deletion of %j without using service-role access',
    async (workspace) => {
      mocks.workspaceRow.mockResolvedValue({ data: workspace, error: null });
      const response = await callDelete({ confirmation: 'Acme' });
      expect(response.status).toBe(403);
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, {}, { confirmation: 'acme' }, { confirmation: 123 }])(
    'rejects an invalid name (%j)',
    async (body) => {
      expect((await callDelete(body)).status).toBe(400);
      expect(mocks.rpc).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['forbidden', 403],
    ['subscription_active', 409],
    ['confirmation_mismatch', 400],
    ['not_found', 404],
  ])('surfaces a transaction refusal (%s)', async (data, status) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    const response = await callDelete({ confirmation: 'Acme' });
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ code: data });
    expect(console.info).toHaveBeenCalledWith(
      '[audit] workspace.delete',
      expect.objectContaining({ outcome: 'denied' })
    );
  });

  it('reports lookup failures without attempting deletion', async () => {
    mocks.workspaceRow.mockResolvedValue({
      data: null,
      error: { code: 'XX000' },
    });
    expect((await callDelete({ confirmation: 'Acme' })).status).toBe(500);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('redacts database error details', async () => {
    mocks.rpc.mockResolvedValue({
      error: { code: '23503', message: 'secret detail', details: 'row data' },
    });
    const response = await callDelete({ confirmation: 'Acme' });
    expect(response.status).toBe(500);
    expect(console.error).toHaveBeenCalledWith('Workspace deletion failed', {
      code: '23503',
    });
    expect(await response.text()).not.toContain('secret');
  });
});

describe('workspace deletion status', () => {
  it('keeps non-owners from reading billing and protection state', async () => {
    mocks.workspaceRow.mockResolvedValue({
      data: { ...ownedWorkspace, creator_id: 'another-user' },
      error: null,
    });
    expect((await callStatus()).status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it.each([
    [[], false, 'ready'],
    [[], true, 'subscription_active'],
    [[{ value: 'True' }], true, 'protected'],
  ])(
    'shows the owner the available deletion state',
    async (secrets, billingBlocked, status) => {
      mockEligibility(secrets, billingBlocked);

      const response = await callStatus();
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status });
      expect(mocks.billingCheck).toHaveBeenCalledExactlyOnceWith(
        'workspace_has_blocking_subscription',
        { p_ws_id: WORKSPACE_ID }
      );
    }
  );

  it('fails closed when the billing check returns no decision', async () => {
    mockEligibility([], null);

    expect((await callStatus()).status).toBe(500);
  });

  function mockEligibility(
    secrets: { value: string }[],
    billingBlocked: boolean | null
  ) {
    mocks.adminFrom.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ data: secrets, error: null }),
        })),
      })),
    });
    mocks.billingCheck.mockResolvedValue({
      data: billingBlocked,
      error: null,
    });
  }
});

describe('workspace handle reservations', () => {
  it.each(['meet', 'calendar', 'ai'])('reserves %s', async (handle) => {
    const update = vi.fn();
    mocks.normalizeWorkspaceId.mockResolvedValue(WORKSPACE_ID);
    mocks.getPermissions.mockResolvedValue({ containsPermission: () => true });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: WORKSPACE_ID, personal: false },
      error: null,
    });
    mocks.from.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
      })),
      update,
    });
    const { PUT } = await import('./route');
    const response = await PUT(
      new NextRequest(`http://localhost/api/workspaces/${WORKSPACE_ID}`, {
        method: 'PUT',
        body: JSON.stringify({ handle, name: 'Workspace' }),
      }),
      { params: Promise.resolve({ wsId: WORKSPACE_ID }) }
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'Workspace handle is reserved',
    });
    expect(update).not.toHaveBeenCalled();
  });
});
