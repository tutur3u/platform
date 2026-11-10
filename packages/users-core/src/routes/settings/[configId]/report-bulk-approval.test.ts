import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), permissions: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/users-core/lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.permissions,
}));
vi.mock('@tuturuuu/users-core/lib/user-groups/route-helpers', () => ({
  resolveUserGroupRouteWorkspaceId: async () => 'resolved-workspace',
}));
import { PUT } from './route';
const upsert = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  upsert.mockResolvedValue({ error: null });
  mocks.admin.mockResolvedValue({
    from: (table: string) => {
      expect(table).toBe('workspace_configs');
      return { upsert };
    },
  });
});
const invoke = (value: string) =>
  PUT(
    new Request('https://contacts.example.invalid/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),
    {
      params: Promise.resolve({
        wsId: 'workspace-alias',
        configId: 'ALLOW_BULK_REPORT_APPROVAL',
      }),
    }
  );
it.each(['approve_reports', 'update_users', 'manage_user_report_automation'])(
  'denies setting changes with only %s',
  async (permission) => {
    mocks.permissions.mockResolvedValue({
      containsPermission: (key: string) => key === permission,
      withoutPermission: (key: string) => key !== permission,
    });
    expect((await invoke('true'))?.status).toBe(403);
    expect(upsert).not.toHaveBeenCalled();
  }
);
it.each(['true', 'false'])(
  'allows an admin to save %s for the resolved workspace',
  async (value) => {
    mocks.permissions.mockResolvedValue({
      containsPermission: (key: string) => key === 'manage_workspace_settings',
      withoutPermission: (key: string) => key !== 'manage_workspace_settings',
    });
    expect((await invoke(value))?.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      {
        id: 'ALLOW_BULK_REPORT_APPROVAL',
        ws_id: 'resolved-workspace',
        value,
        updated_at: expect.any(String),
      },
      { onConflict: 'id,ws_id' }
    );
  }
);
