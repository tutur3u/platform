import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  insert: vi.fn(),
  requestMaybeSingle: vi.fn(),
  resolveSessionAuthContext: vi.fn(),
  rpc: vi.fn(),
  sessionEq: vi.fn(),
  sessionMaybeSingle: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createDynamicClient: vi.fn(async () => ({
    storage: { from: vi.fn(() => ({ remove: vi.fn() })) },
  })),
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: (
    ...args: Parameters<typeof mocks.resolveSessionAuthContext>
  ) => mocks.resolveSessionAuthContext(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/utils/workspace-helper')>();
  return {
    ...actual,
    getPermissions: vi.fn(async () => ({ withoutPermission: () => false })),
    verifyWorkspaceMembershipType: (
      ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
    ) => mocks.verifyWorkspaceMembershipType(...args),
  };
});

vi.mock('@/lib/workspace-helper', () => ({
  getWorkspaceConfig: vi.fn(async () => null),
  normalizeWorkspaceId: vi.fn(async () => WS_ID),
}));

const WS_ID = '00000000-0000-4000-8000-0000000000a1';
const REQUEST_ID = '00000000-0000-4000-8000-0000000000b1';
const SESSION_ID = '00000000-0000-4000-8000-0000000000c1';

function createAdminClient() {
  const sessionQuery = {
    eq: vi.fn((column: string, value: string) => {
      mocks.sessionEq(column, value);
      return sessionQuery;
    }),
    maybeSingle: () => mocks.sessionMaybeSingle(),
    select: vi.fn(() => sessionQuery),
  };
  const requestQuery = {
    eq: vi.fn(() => requestQuery),
    insert: (...args: unknown[]) => {
      mocks.insert(...args);
      return {
        select: vi.fn(async () => ({
          data: [{ id: REQUEST_ID }],
          error: null,
        })),
      };
    },
    maybeSingle: () => mocks.requestMaybeSingle(),
    select: vi.fn(() => requestQuery),
  };

  return {
    from: vi.fn((table: string) => {
      expect(table).toBe('time_tracking_sessions');
      return sessionQuery;
    }),
    schema: vi.fn(() => ({
      from: vi.fn(() => requestQuery),
      rpc: (...args: Parameters<typeof mocks.rpc>) => mocks.rpc(...args),
    })),
  };
}

function jsonRequest(method: string, body: Record<string, unknown>) {
  return new NextRequest(
    `http://localhost/api/v1/workspaces/${WS_ID}/time-tracking/requests`,
    {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      method,
    }
  );
}

describe('time tracking request linked sessions', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.createAdminClient.mockImplementation(async () => createAdminClient());
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      supabase: {},
      user: { id: 'user-1' },
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.rpc.mockResolvedValue({ data: { success: true }, error: null });
  });

  async function create(linkedSessionId: string) {
    const { POST } = await import('./route');
    return POST(
      jsonRequest('POST', {
        endTime: '2026-08-10T02:00:00.000Z',
        linkedSessionId,
        startTime: '2026-08-10T01:00:00.000Z',
        title: 'Missed entry',
      }),
      { params: Promise.resolve({ wsId: WS_ID }) }
    );
  }

  async function review(action: 'approve' | 'reject') {
    const { PATCH } = await import('./[id]/route');
    return PATCH(
      jsonRequest(
        'PATCH',
        action === 'reject'
          ? { action, rejection_reason: 'Not worked' }
          : { action }
      ),
      { params: Promise.resolve({ id: REQUEST_ID, wsId: WS_ID }) }
    );
  }

  it("links the caller's own session in the request workspace", async () => {
    mocks.sessionMaybeSingle.mockResolvedValue({
      data: { id: SESSION_ID },
      error: null,
    });

    const response = await create(SESSION_ID);

    expect(response.status).toBe(201);
    expect(mocks.sessionEq).toHaveBeenCalledWith('id', SESSION_ID);
    expect(mocks.sessionEq).toHaveBeenCalledWith('ws_id', WS_ID);
    expect(mocks.sessionEq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ linked_session_id: SESSION_ID })
    );
  });

  it('rejects a session outside the caller and workspace', async () => {
    mocks.sessionMaybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await create(SESSION_ID);

    expect(response.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it.each(['approve', 'reject'] as const)(
    'refuses to %s a request whose linked session is foreign',
    async (action) => {
      mocks.requestMaybeSingle.mockResolvedValue({
        data: { linked_session_id: SESSION_ID, user_id: 'owner-1' },
        error: null,
      });
      mocks.sessionMaybeSingle.mockResolvedValue({ data: null, error: null });

      const response = await review(action);

      expect(response.status).toBe(409);
      expect(mocks.sessionEq).toHaveBeenCalledWith('user_id', 'owner-1');
      expect(mocks.sessionEq).toHaveBeenCalledWith('ws_id', WS_ID);
      expect(mocks.rpc).not.toHaveBeenCalled();
    }
  );

  it('approves a request whose linked session belongs to its owner', async () => {
    mocks.requestMaybeSingle.mockResolvedValue({
      data: { linked_session_id: SESSION_ID, user_id: 'owner-1' },
      error: null,
    });
    mocks.sessionMaybeSingle.mockResolvedValue({
      data: { id: SESSION_ID },
      error: null,
    });

    const response = await review('approve');

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'update_time_tracking_request',
      expect.objectContaining({ p_action: 'approve', p_workspace_id: WS_ID })
    );
  });

  it('approves a request without a linked session', async () => {
    mocks.requestMaybeSingle.mockResolvedValue({
      data: { linked_session_id: null, user_id: 'owner-1' },
      error: null,
    });

    const response = await review('approve');

    expect(response.status).toBe(200);
    expect(mocks.sessionMaybeSingle).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalled();
  });
});
