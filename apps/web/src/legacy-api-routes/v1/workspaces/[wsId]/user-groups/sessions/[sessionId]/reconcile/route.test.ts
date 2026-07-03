import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();
const getPermissionsMock = vi.fn();
const previewDetachedUserGroupSessionReconciliationMock = vi.fn();
const reconcileDetachedUserGroupSessionMock = vi.fn();
const resolveUserGroupRouteWorkspaceIdMock = vi.fn();

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof createAdminClientMock>) =>
    createAdminClientMock(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof getPermissionsMock>) =>
    getPermissionsMock(...args),
}));

vi.mock('@/lib/user-groups/route-helpers', () => ({
  resolveUserGroupRouteWorkspaceId: (
    ...args: Parameters<typeof resolveUserGroupRouteWorkspaceIdMock>
  ) => resolveUserGroupRouteWorkspaceIdMock(...args),
}));

vi.mock('@/lib/user-groups/session-schedule', () => ({
  previewDetachedUserGroupSessionReconciliation: (
    ...args: Parameters<
      typeof previewDetachedUserGroupSessionReconciliationMock
    >
  ) => previewDetachedUserGroupSessionReconciliationMock(...args),
  reconcileDetachedUserGroupSession: (
    ...args: Parameters<typeof reconcileDetachedUserGroupSessionMock>
  ) => reconcileDetachedUserGroupSessionMock(...args),
}));

import { GET, POST } from './route';

describe('workspace user group session reconcile route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAdminClientMock.mockResolvedValue({ admin: true });
    getPermissionsMock.mockResolvedValue({
      withoutPermission: (permission: string) =>
        permission !== 'update_user_groups',
    });
    previewDetachedUserGroupSessionReconciliationMock.mockResolvedValue({
      date: '2026-06-24',
      mode: 'snap',
      occurrence: {
        date: '2026-06-24',
        endTimezone: 'Asia/Ho_Chi_Minh',
        endsAt: '2026-06-24T09:00:00.000Z',
        groupId: '00000000-0000-0000-0000-000000000101',
        groupName: 'Test group',
        seriesId: '00000000-0000-4000-8000-000000000301',
        startTimezone: 'Asia/Ho_Chi_Minh',
        startsAt: '2026-06-24T07:00:00.000Z',
        title: 'Test group',
      },
      seriesId: '00000000-0000-4000-8000-000000000301',
      session: {
        id: '00000000-0000-0000-0000-000000000201',
        seriesId: null,
      },
    });
    reconcileDetachedUserGroupSessionMock.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000201',
      seriesId: '00000000-0000-4000-8000-000000000301',
    });
    resolveUserGroupRouteWorkspaceIdMock.mockResolvedValue(
      '00000000-0000-0000-0000-000000000001'
    );
  });

  it('previews a safe recurring match before mutating', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/00000000-0000-0000-0000-000000000001/user-groups/sessions/00000000-0000-0000-0000-000000000201/reconcile',
        { method: 'GET' }
      ),
      {
        params: Promise.resolve({
          sessionId: '00000000-0000-0000-0000-000000000201',
          wsId: '00000000-0000-0000-0000-000000000001',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { mode: 'snap' },
    });
    expect(
      previewDetachedUserGroupSessionReconciliationMock
    ).toHaveBeenCalledWith({
      sessionId: '00000000-0000-0000-0000-000000000201',
      supabase: { admin: true },
      wsId: '00000000-0000-0000-0000-000000000001',
    });
    expect(reconcileDetachedUserGroupSessionMock).not.toHaveBeenCalled();
  });

  it('reconciles one detached session through the schedule service', async () => {
    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/00000000-0000-0000-0000-000000000001/user-groups/sessions/00000000-0000-0000-0000-000000000201/reconcile',
        {
          body: JSON.stringify({ mode: 'snap' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }
      ),
      {
        params: Promise.resolve({
          sessionId: '00000000-0000-0000-0000-000000000201',
          wsId: '00000000-0000-0000-0000-000000000001',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(reconcileDetachedUserGroupSessionMock).toHaveBeenCalledWith({
      payload: { mode: 'snap' },
      sessionId: '00000000-0000-0000-0000-000000000201',
      supabase: { admin: true },
      wsId: '00000000-0000-0000-0000-000000000001',
    });
  });

  it('passes exact repair mode through to the schedule service', async () => {
    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/00000000-0000-0000-0000-000000000001/user-groups/sessions/00000000-0000-0000-0000-000000000201/reconcile',
        {
          body: JSON.stringify({ mode: 'exact' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }
      ),
      {
        params: Promise.resolve({
          sessionId: '00000000-0000-0000-0000-000000000201',
          wsId: '00000000-0000-0000-0000-000000000001',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(reconcileDetachedUserGroupSessionMock).toHaveBeenCalledWith({
      payload: { mode: 'exact' },
      sessionId: '00000000-0000-0000-0000-000000000201',
      supabase: { admin: true },
      wsId: '00000000-0000-0000-0000-000000000001',
    });
  });

  it('passes weekly repair mode through to the schedule service', async () => {
    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/00000000-0000-0000-0000-000000000001/user-groups/sessions/00000000-0000-0000-0000-000000000201/reconcile',
        {
          body: JSON.stringify({ mode: 'weekly' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }
      ),
      {
        params: Promise.resolve({
          sessionId: '00000000-0000-0000-0000-000000000201',
          wsId: '00000000-0000-0000-0000-000000000001',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(reconcileDetachedUserGroupSessionMock).toHaveBeenCalledWith({
      payload: { mode: 'weekly' },
      sessionId: '00000000-0000-0000-0000-000000000201',
      supabase: { admin: true },
      wsId: '00000000-0000-0000-0000-000000000001',
    });
  });

  it('passes weekly conversion mode through to the schedule service', async () => {
    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/00000000-0000-0000-0000-000000000001/user-groups/sessions/00000000-0000-0000-0000-000000000201/reconcile',
        {
          body: JSON.stringify({ mode: 'convert_weekly' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }
      ),
      {
        params: Promise.resolve({
          sessionId: '00000000-0000-0000-0000-000000000201',
          wsId: '00000000-0000-0000-0000-000000000001',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(reconcileDetachedUserGroupSessionMock).toHaveBeenCalledWith({
      payload: { mode: 'convert_weekly' },
      sessionId: '00000000-0000-0000-0000-000000000201',
      supabase: { admin: true },
      wsId: '00000000-0000-0000-0000-000000000001',
    });
  });

  it('rejects invalid repair modes', async () => {
    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/00000000-0000-0000-0000-000000000001/user-groups/sessions/00000000-0000-0000-0000-000000000201/reconcile',
        {
          body: JSON.stringify({ mode: 'future' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }
      ),
      {
        params: Promise.resolve({
          sessionId: '00000000-0000-0000-0000-000000000201',
          wsId: '00000000-0000-0000-0000-000000000001',
        }),
      }
    );

    expect(response.status).toBe(400);
    expect(reconcileDetachedUserGroupSessionMock).not.toHaveBeenCalled();
  });

  it('returns 404 when no recurring series safely matches', async () => {
    reconcileDetachedUserGroupSessionMock.mockResolvedValueOnce(null);

    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/00000000-0000-0000-0000-000000000001/user-groups/sessions/00000000-0000-0000-0000-000000000201/reconcile',
        { method: 'POST' }
      ),
      {
        params: Promise.resolve({
          sessionId: '00000000-0000-0000-0000-000000000201',
          wsId: '00000000-0000-0000-0000-000000000001',
        }),
      }
    );

    expect(response.status).toBe(404);
  });

  it('returns 409 when more than one recurring series matches', async () => {
    reconcileDetachedUserGroupSessionMock.mockRejectedValueOnce(
      new Error('ambiguous_series_reconciliation')
    );

    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/00000000-0000-0000-0000-000000000001/user-groups/sessions/00000000-0000-0000-0000-000000000201/reconcile',
        { method: 'POST' }
      ),
      {
        params: Promise.resolve({
          sessionId: '00000000-0000-0000-0000-000000000201',
          wsId: '00000000-0000-0000-0000-000000000001',
        }),
      }
    );

    expect(response.status).toBe(409);
  });

  it('returns 409 when the recurring occurrence already exists', async () => {
    reconcileDetachedUserGroupSessionMock.mockRejectedValueOnce(
      new Error('series_occurrence_already_exists')
    );

    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/00000000-0000-0000-0000-000000000001/user-groups/sessions/00000000-0000-0000-0000-000000000201/reconcile',
        {
          body: JSON.stringify({ mode: 'snap' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }
      ),
      {
        params: Promise.resolve({
          sessionId: '00000000-0000-0000-0000-000000000201',
          wsId: '00000000-0000-0000-0000-000000000001',
        }),
      }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      message: 'A recurring session already exists for this date',
    });
  });
});
