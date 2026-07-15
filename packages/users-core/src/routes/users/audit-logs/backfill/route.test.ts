import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@tuturuuu/users-core/lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.getPermissions,
}));

import { POST } from './route';

describe('Contacts-owned workspace user audit backfill route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPermissions.mockResolvedValue({
      containsPermission: (permission: string) =>
        permission === 'manage_workspace_audit_logs',
    });
    mocks.rpc.mockResolvedValue({
      data: [
        {
          audit_record_version_id: 123,
          event_kind: 'archived',
        },
      ],
      error: null,
    });
    mocks.createAdminClient.mockResolvedValue({ rpc: mocks.rpc });
  });

  function createRequest(body = { dryRun: true, limit: 25 }) {
    return new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/ws-1/users/audit-logs/backfill',
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  it('rejects callers without audit permission', async () => {
    mocks.getPermissions.mockResolvedValue({
      containsPermission: () => false,
    });

    const request = createRequest();
    const response = await POST(request, {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    expect(response.status).toBe(403);
    expect(mocks.getPermissions).toHaveBeenCalledWith('ws-1', request);
  });

  it('returns preview rows for dry-run requests', async () => {
    const request = createRequest();
    const response = await POST(request, {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

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
    expect(mocks.rpc).toHaveBeenCalledWith(
      'backfill_workspace_user_status_changes',
      {
        p_ws_id: 'ws-1',
        p_dry_run: true,
        p_limit: 25,
      }
    );
    expect(mocks.getPermissions).toHaveBeenCalledWith('ws-1', request);
  });
});
