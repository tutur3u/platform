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

import { GET, POST } from './route';

const NORMALIZED_WS_ID = '071e0fc7-9aa8-42d8-92e5-cc9b3aeec2f1';

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
});
