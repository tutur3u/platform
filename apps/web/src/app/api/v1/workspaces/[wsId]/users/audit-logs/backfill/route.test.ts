import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();
const getPermissionsMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof createAdminClientMock>) =>
    createAdminClientMock(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof getPermissionsMock>) =>
    getPermissionsMock(...args),
}));

import { POST } from './route';

describe('workspace user audit backfill route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPermissionsMock.mockResolvedValue({
      containsPermission: (permission: string) =>
        permission === 'manage_workspace_audit_logs',
    });
    rpcMock.mockResolvedValue({
      data: [
        {
          audit_record_version_id: 123,
          user_id: 'user-1',
          ws_id: 'ws-1',
          archived: true,
          archived_until: null,
          actor_auth_uid: 'actor-1',
          creator_id: null,
          source: 'backfilled',
          created_at: '2026-03-10T10:00:00.000Z',
          event_kind: 'archived',
        },
      ],
      error: null,
    });
    createAdminClientMock.mockResolvedValue({
      rpc: rpcMock,
    });
  });

  it('rejects callers without audit permission', async () => {
    getPermissionsMock.mockResolvedValue({
      containsPermission: () => false,
    });

    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/users/audit-logs/backfill',
        {
          method: 'POST',
          body: JSON.stringify({ dryRun: true }),
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(403);
  });

  it('returns preview rows for dry-run requests', async () => {
    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/users/audit-logs/backfill',
        {
          method: 'POST',
          body: JSON.stringify({ dryRun: true, limit: 25 }),
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      rows: [
        expect.objectContaining({
          audit_record_version_id: 123,
          event_kind: 'archived',
        }),
      ],
      count: 1,
      dryRun: true,
    });
    expect(rpcMock).toHaveBeenCalledWith(
      'backfill_workspace_user_status_changes',
      {
        p_ws_id: 'ws-1',
        p_dry_run: true,
        p_limit: 25,
      }
    );
  });
});
