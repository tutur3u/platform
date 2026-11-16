import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ROOT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';
const WORKSPACE_ID = '00000000-0000-0000-0000-000000000011';

const mocks = vi.hoisted(() => ({
  getPermissions: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  verifyHasSecrets: vi.fn(),
  createAdminClient: vi.fn(),
  subscriptionCount: vi.fn(),
  adminSubscriptionSelect: vi.fn(),
  adminSubscriptionEq: vi.fn(),
  adminFrom: vi.fn(),
  workspaceRow: vi.fn(),
  deleteEq: vi.fn(),
  from: vi.fn(),
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
      options?: { allowAppSessionAuth?: unknown }
    ) => {
      (
        handler as unknown as { __withSessionAuthOptions?: unknown }
      ).__withSessionAuthOptions = options;
      return async (
        request: NextRequest,
        routeContext?: { params?: Promise<{ wsId: string }> }
      ) =>
        handler(
          request,
          { supabase: { from: mocks.from }, user: { id: 'user-1' } },
          routeContext?.params ? await routeContext.params : { wsId: 'team-ws' }
        );
    }
  ),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
  verifyHasSecrets: (...args: Parameters<typeof mocks.verifyHasSecrets>) =>
    mocks.verifyHasSecrets(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: mocks.withSessionAuth,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
}));

const permissionsWith = (...granted: string[]) => ({
  containsPermission: (permission: string) => granted.includes(permission),
});

/** Caller RLS hides billing rows from an actor without manage_subscription. */
function callerHiddenSubscription() {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        neq: vi.fn(() => ({
          not: vi.fn(async () => ({ count: 0, error: null })),
        })),
      })),
    })),
  };
}

function mockTables() {
  mocks.from.mockImplementation((table: string) => {
    if (table === 'workspaces') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: mocks.workspaceRow })),
        })),
        delete: vi.fn(() => ({ eq: mocks.deleteEq })),
      };
    }
    if (table === 'workspace_subscriptions') {
      return callerHiddenSubscription();
    }
    throw new Error(`Unexpected table: ${table}`);
  });
  mocks.adminFrom.mockImplementation((table: string) => {
    if (table !== 'workspace_subscriptions') {
      throw new Error(`Unexpected admin table: ${table}`);
    }
    return {
      select: mocks.adminSubscriptionSelect.mockImplementation(() => ({
        eq: mocks.adminSubscriptionEq.mockImplementation(() => ({
          neq: vi.fn(() => ({ not: mocks.subscriptionCount })),
        })),
      })),
    };
  });
}

function deleteRequest(body?: unknown) {
  return new NextRequest(`http://localhost/api/workspaces/${WORKSPACE_ID}`, {
    method: 'DELETE',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function callDelete(wsId: string, body?: unknown) {
  mocks.normalizeWorkspaceId.mockResolvedValue(wsId);
  const route = await import('./route');
  return route.DELETE(deleteRequest(body), {
    params: Promise.resolve({ wsId }),
  });
}

describe('legacy workspace detail route DELETE', () => {
  let audit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockTables();
    mocks.workspaceRow.mockResolvedValue({
      data: { id: WORKSPACE_ID, name: 'Acme', handle: 'acme', personal: false },
      error: null,
    });
    mocks.getPermissions.mockResolvedValue(
      permissionsWith('manage_workspace_security')
    );
    mocks.verifyHasSecrets.mockResolvedValue(false);
    mocks.createAdminClient.mockResolvedValue({ from: mocks.adminFrom });
    mocks.subscriptionCount.mockResolvedValue({ count: 0, error: null });
    mocks.deleteEq.mockResolvedValue({ error: null });
    audit = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  it('opts GET, PUT, and DELETE into app-session auth', async () => {
    await import('./route');

    expect(mocks.withSessionAuth).toHaveBeenCalledTimes(3);
    expect(
      mocks.withSessionAuth.mock.calls.every(
        ([, options]) => options?.allowAppSessionAuth !== undefined
      )
    ).toBe(true);
  });

  it('deletes when permitted and confirmed, and records an audit event', async () => {
    const response = await callDelete(WORKSPACE_ID, { confirmation: 'Acme' });

    expect(response.status).toBe(200);
    expect(mocks.deleteEq).toHaveBeenCalledWith('id', WORKSPACE_ID);
    expect(audit).toHaveBeenCalledWith(
      '[audit] workspace.delete',
      expect.objectContaining({
        actorId: 'user-1',
        outcome: 'deleted',
        workspaceId: WORKSPACE_ID,
      })
    );
  });

  it('refuses a role with only manage_workspace_settings', async () => {
    mocks.getPermissions.mockResolvedValue(
      permissionsWith('manage_workspace_settings')
    );
    mocks.subscriptionCount.mockResolvedValue({ count: 1, error: null });
    const response = await callDelete(WORKSPACE_ID, { confirmation: 'Acme' });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: 'forbidden',
      message: 'This workspace cannot be deleted.',
    });
    expect(mocks.deleteEq).not.toHaveBeenCalled();
  });

  it('refuses the root workspace', async () => {
    mocks.workspaceRow.mockResolvedValue({
      data: {
        id: ROOT_WORKSPACE_ID,
        name: 'Tuturuuu',
        handle: 'tuturuuu',
        personal: false,
      },
      error: null,
    });
    const response = await callDelete(ROOT_WORKSPACE_ID, {
      confirmation: 'Tuturuuu',
    });

    expect(response.status).toBe(403);
    expect(mocks.deleteEq).not.toHaveBeenCalled();
  });

  it('refuses a personal workspace', async () => {
    mocks.workspaceRow.mockResolvedValue({
      data: { id: WORKSPACE_ID, name: 'Acme', handle: null, personal: true },
      error: null,
    });
    const response = await callDelete(WORKSPACE_ID, { confirmation: 'Acme' });

    expect(response.status).toBe(403);
    expect(mocks.deleteEq).not.toHaveBeenCalled();
  });

  it('refuses when PREVENT_WORKSPACE_DELETION is set', async () => {
    mocks.verifyHasSecrets.mockResolvedValue(true);
    const response = await callDelete(WORKSPACE_ID, { confirmation: 'Acme' });

    expect(response.status).toBe(403);
    expect(mocks.verifyHasSecrets).toHaveBeenCalledWith(WORKSPACE_ID, [
      'PREVENT_WORKSPACE_DELETION',
    ]);
    expect(mocks.deleteEq).not.toHaveBeenCalled();
  });

  it('asks to cancel an active paid subscription first', async () => {
    mocks.subscriptionCount.mockResolvedValue({ count: 1, error: null });
    const response = await callDelete(WORKSPACE_ID, { confirmation: 'Acme' });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'subscription_active',
    });
    expect(mocks.deleteEq).not.toHaveBeenCalled();
  });

  it('returns 409 for a security manager without manage_subscription when a paid subscription is active', async () => {
    const permissions = permissionsWith('manage_workspace_security');
    expect(permissions.containsPermission('manage_subscription')).toBe(false);
    mocks.getPermissions.mockResolvedValue(permissions);
    mocks.subscriptionCount.mockResolvedValue({ count: 1, error: null });
    const response = await callDelete(WORKSPACE_ID, { confirmation: 'Acme' });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: 'subscription_active',
      message: 'Cancel the workspace subscription before deleting it.',
    });
    expect(mocks.deleteEq).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
    expect(mocks.adminFrom).toHaveBeenCalledWith('workspace_subscriptions');
    expect(mocks.adminSubscriptionSelect).toHaveBeenCalledWith('id', {
      count: 'exact',
      head: true,
    });
    expect(mocks.adminSubscriptionEq).toHaveBeenCalledWith(
      'ws_id',
      WORKSPACE_ID
    );
    expect(mocks.from.mock.calls.map((call) => call[0])).not.toContain(
      'workspace_subscriptions'
    );
    expect(mocks.subscriptionCount).toHaveBeenCalledWith(
      'polar_subscription_id',
      'is',
      null
    );
  });

  it.each([undefined, {}, { confirmation: 'acme team' }])(
    'rejects a missing or wrong confirmation (%j)',
    async (body) => {
      const response = await callDelete(WORKSPACE_ID, body);

      expect(response.status).toBe(400);
      expect(mocks.deleteEq).not.toHaveBeenCalled();
    }
  );

  it('returns the same generic denial for every forbidden reason', async () => {
    mocks.verifyHasSecrets.mockResolvedValue(true);
    const prevented = await (
      await callDelete(WORKSPACE_ID, { confirmation: 'Acme' })
    ).json();
    mocks.verifyHasSecrets.mockResolvedValue(false);
    mocks.getPermissions.mockResolvedValue(null);
    const denied = await (
      await callDelete(WORKSPACE_ID, { confirmation: 'Acme' })
    ).json();

    expect(prevented).toEqual(denied);
  });

  it('stops without deleting when the subscription lookup fails', async () => {
    mocks.subscriptionCount.mockResolvedValue({
      count: null,
      error: { code: 'XX000' },
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await callDelete(WORKSPACE_ID, { confirmation: 'Acme' });

    expect(response.status).toBe(500);
    expect(mocks.deleteEq).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('logs only the database code when deletion fails', async () => {
    mocks.deleteEq.mockResolvedValue({
      error: { code: '23503', message: 'secret detail', details: 'row data' },
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await callDelete(WORKSPACE_ID, { confirmation: 'Acme' });

    expect(response.status).toBe(500);
    expect(log).toHaveBeenCalledWith('Workspace deletion failed', {
      code: '23503',
    });
    expect(JSON.stringify(await response.json())).not.toContain('secret');
    log.mockRestore();
  });
});

describe('legacy workspace handle reservations', () => {
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
