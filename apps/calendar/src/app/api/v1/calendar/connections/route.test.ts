import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createAdminClientMock,
  normalizeWorkspaceIdMock,
  resolveSessionAuthContextMock,
  verifyWorkspaceMembershipTypeMock,
} = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  normalizeWorkspaceIdMock: vi.fn(),
  resolveSessionAuthContextMock: vi.fn(),
  verifyWorkspaceMembershipTypeMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: verifyWorkspaceMembershipTypeMock,
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: resolveSessionAuthContextMock,
}));

vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: normalizeWorkspaceIdMock,
}));

import { GET, PATCH, POST } from './route';

const NORMALIZED_WS_ID = '071e0fc7-9aa8-42d8-92e5-cc9b3aeec2f1';
const OTHER_WS_ID = '5a4c1f0e-3b2d-4e8f-9a7b-6c5d4e3f2a1b';
const CONNECTION_ID = '9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

function createPatchSupabase(
  connectionWsId: string | null,
  { withLookup = true } = {}
) {
  const lookup = {
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: connectionWsId ? { ws_id: connectionWsId } : null,
      error: null,
    }),
    select: vi.fn(),
  };
  lookup.select.mockReturnValue(lookup);
  lookup.eq.mockReturnValue(lookup);

  const update = {
    eq: vi.fn(),
    is: vi.fn(),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue({
      data: { id: CONNECTION_ID, ws_id: connectionWsId },
      error: null,
    }),
    update: vi.fn(),
  };
  update.update.mockReturnValue(update);
  update.eq.mockReturnValue(update);
  update.is.mockReturnValue(update);
  update.select.mockReturnValue(update);

  let call = 0;
  const supabase = {
    from: vi.fn(() => {
      call += 1;
      return withLookup && call === 1 ? lookup : update;
    }),
  };
  return { lookup, supabase, update };
}

function patchRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/v1/calendar/connections', {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'PATCH',
  });
}

describe('calendar connections route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeWorkspaceIdMock.mockResolvedValue(NORMALIZED_WS_ID);
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({ ok: true });
  });

  it('normalizes the personal workspace alias before membership and lookup', async () => {
    const listQuery = {
      data: [],
      error: null,
      eq: vi.fn(),
      order: vi.fn(),
      select: vi.fn(),
    };
    listQuery.select.mockReturnValue(listQuery);
    listQuery.eq.mockReturnValue(listQuery);
    listQuery.order.mockReturnValue(listQuery);

    const supabase = { from: vi.fn(() => listQuery) };
    resolveSessionAuthContextMock.mockResolvedValue({
      ok: true,
      supabase,
      user: { id: 'user-1' },
    });

    const response = await GET(
      new Request('http://localhost/api/v1/calendar/connections?wsId=personal')
    );

    expect(response.status).toBe(200);
    expect(normalizeWorkspaceIdMock).toHaveBeenCalledWith('personal', supabase);
    expect(verifyWorkspaceMembershipTypeMock).toHaveBeenCalledWith({
      supabase,
      userId: 'user-1',
      wsId: NORMALIZED_WS_ID,
    });
    expect(listQuery.eq).toHaveBeenCalledWith('ws_id', NORMALIZED_WS_ID);
  });

  it('stores provider hex colors separately from workspace color keys', async () => {
    const duplicateQuery = {
      eq: vi.fn(),
      is: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    duplicateQuery.eq.mockReturnValue(duplicateQuery);
    duplicateQuery.is.mockReturnValue(duplicateQuery);

    const connectionInsert = vi.fn();
    const connectionInsertQuery = {
      select: vi.fn(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'connection-1' },
        error: null,
      }),
    };
    connectionInsertQuery.select.mockReturnValue(connectionInsertQuery);
    connectionInsert.mockReturnValue(connectionInsertQuery);

    const supabase = {
      from: vi.fn(() => ({
        insert: connectionInsert,
        select: vi.fn(() => duplicateQuery),
      })),
    };
    resolveSessionAuthContextMock.mockResolvedValue({
      ok: true,
      supabase,
      user: { id: 'user-1' },
    });

    const workspaceCalendarInsert = vi.fn();
    const workspaceCalendarQuery = {
      select: vi.fn(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'workspace-calendar-1' },
        error: null,
      }),
    };
    workspaceCalendarQuery.select.mockReturnValue(workspaceCalendarQuery);
    workspaceCalendarInsert.mockReturnValue(workspaceCalendarQuery);
    createAdminClientMock.mockResolvedValue({
      schema: vi.fn(() => ({
        from: vi.fn(() => ({ insert: workspaceCalendarInsert })),
      })),
    });

    const response = await POST(
      new Request('http://localhost/api/v1/calendar/connections', {
        body: JSON.stringify({
          calendarId: 'provider-calendar-1',
          calendarName: 'Family',
          color: '#b99aff',
          wsId: 'personal',
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
    );

    expect(response.status).toBe(201);
    expect(workspaceCalendarInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'BLUE',
        ws_id: NORMALIZED_WS_ID,
      })
    );
    expect(connectionInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        color: '#b99aff',
        ws_id: NORMALIZED_WS_ID,
      })
    );
  });

  describe('PATCH', () => {
    it("authorizes and scopes an id update to the connection's own workspace", async () => {
      const { supabase, update } = createPatchSupabase(OTHER_WS_ID);
      normalizeWorkspaceIdMock.mockResolvedValue(OTHER_WS_ID);
      resolveSessionAuthContextMock.mockResolvedValue({
        ok: true,
        supabase,
        user: { id: 'user-1' },
      });

      const response = await PATCH(
        patchRequest({ id: CONNECTION_ID, isEnabled: false })
      );

      expect(response.status).toBe(200);
      expect(verifyWorkspaceMembershipTypeMock).toHaveBeenCalledWith({
        supabase,
        userId: 'user-1',
        wsId: OTHER_WS_ID,
      });
      expect(update.eq).toHaveBeenCalledWith('ws_id', OTHER_WS_ID);
      expect(update.eq).toHaveBeenCalledWith('id', CONNECTION_ID);
    });

    it('rejects an id that belongs to a different workspace than the body wsId', async () => {
      const { supabase, update } = createPatchSupabase(OTHER_WS_ID);
      resolveSessionAuthContextMock.mockResolvedValue({
        ok: true,
        supabase,
        user: { id: 'user-1' },
      });

      const response = await PATCH(
        patchRequest({
          id: CONNECTION_ID,
          isEnabled: false,
          wsId: NORMALIZED_WS_ID,
        })
      );

      expect(response.status).toBe(404);
      expect(verifyWorkspaceMembershipTypeMock).not.toHaveBeenCalled();
      expect(update.update).not.toHaveBeenCalled();
    });

    it('returns not found for an unknown connection id', async () => {
      const { supabase, update } = createPatchSupabase(null);
      resolveSessionAuthContextMock.mockResolvedValue({
        ok: true,
        supabase,
        user: { id: 'user-1' },
      });

      const response = await PATCH(
        patchRequest({ id: CONNECTION_ID, isEnabled: false })
      );

      expect(response.status).toBe(404);
      expect(update.update).not.toHaveBeenCalled();
    });

    it('scopes a calendarId update to the normalized workspace', async () => {
      const { supabase, update } = createPatchSupabase(NORMALIZED_WS_ID, {
        withLookup: false,
      });
      resolveSessionAuthContextMock.mockResolvedValue({
        ok: true,
        supabase,
        user: { id: 'user-1' },
      });

      const response = await PATCH(
        patchRequest({
          calendarId: 'primary',
          isEnabled: true,
          wsId: 'personal',
        })
      );

      expect(response.status).toBe(200);
      expect(update.eq).toHaveBeenCalledWith('ws_id', NORMALIZED_WS_ID);
      expect(update.eq).toHaveBeenCalledWith('calendar_id', 'primary');
      expect(update.is).toHaveBeenCalledWith('auth_token_id', null);
    });
  });
});
