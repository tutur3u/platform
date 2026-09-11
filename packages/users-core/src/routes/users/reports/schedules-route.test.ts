import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  permissions: vi.fn(),
  upsert: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({ verifySecret: vi.fn() }));
vi.mock('@tuturuuu/utils/workspace-user-link', () => ({
  getWorkspaceUserLinkForUser: vi.fn(),
}));
vi.mock('../../../lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.permissions,
}));
vi.mock('../../../lib/user-groups/route-helpers', () => ({
  resolveUserGroupRouteWorkspaceId: async () => 'workspace-1',
  resolveRequestActorAuthUid: vi.fn(),
}));

import { PUT } from './schedules/route';

const context = { params: Promise.resolve({ wsId: 'personal' }) };
function request(value: unknown) {
  return new Request('https://example.com/schedules', {
    method: 'PUT',
    body: JSON.stringify(value),
  });
}

describe('monthly report automatic sending configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permissions.mockResolvedValue({ containsPermission: () => true });
    mocks.admin.mockResolvedValue({
      from: () => ({ upsert: mocks.upsert }),
      schema: () => ({ rpc: mocks.rpc }),
    });
    mocks.rpc.mockResolvedValue({ data: { code: 400 }, error: null });
    mocks.upsert.mockResolvedValue({ error: null });
  });
  it.each(['manage_user_report_automation', 'send_user_group_report_emails'])(
    'requires %s',
    async (missing) => {
      mocks.permissions.mockResolvedValue({
        containsPermission: (name: string) => name !== missing,
      });
      expect(
        (await PUT(request({ autoSendAfterApproval: true }), context)).status
      ).toBe(403);
      expect(mocks.upsert).not.toHaveBeenCalled();
    }
  );
  it.each([true, false])(
    'saves %s to the normalized workspace',
    async (enabled) => {
      expect(
        (await PUT(request({ autoSendAfterApproval: enabled }), context)).status
      ).toBe(200);
      expect(mocks.upsert).toHaveBeenCalledWith(
        {
          ws_id: 'workspace-1',
          id: 'AUTO_SEND_APPROVED_REPORTS',
          value: String(enabled),
          updated_at: expect.any(String),
        },
        { onConflict: 'ws_id,id' }
      );
    }
  );
  it('rejects non-boolean and mixed setting payloads', async () => {
    expect(
      (await PUT(request({ autoSendAfterApproval: 'true' }), context)).status
    ).toBe(400);
    expect(
      (
        await PUT(
          request({
            autoSendAfterApproval: true,
            cadence: 'monthly',
            enabled: true,
            generation_mode: 'manual',
            timezone: 'Asia/Ho_Chi_Minh',
          }),
          context
        )
      ).status
    ).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it.each(['PGRST202', '42883'])(
    'waits for the migration before enabling (%s)',
    async (code) => {
      mocks.rpc.mockResolvedValue({ data: null, error: { code } });
      const response = await PUT(
        request({ autoSendAfterApproval: true }),
        context
      );
      expect(response.status).toBe(503);
      expect(response.headers.get('Retry-After')).toBe('60');
      expect(mocks.upsert).not.toHaveBeenCalled();
    }
  );
  it('can disable automatic sending while the migration is pending', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    expect(
      (await PUT(request({ autoSendAfterApproval: false }), context)).status
    ).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('does not report success when saving fails', async () => {
    mocks.upsert.mockResolvedValue({ error: new Error('unavailable') });
    expect(
      (await PUT(request({ autoSendAfterApproval: true }), context)).status
    ).toBe(500);
  });
});
