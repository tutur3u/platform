import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  permissions: vi.fn(),
  upsert: vi.fn(),
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
    mocks.admin.mockResolvedValue({ from: () => ({ upsert: mocks.upsert }) });
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
            group_id: 'another-workspace',
          }),
          context
        )
      ).status
    ).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('does not report success when saving fails', async () => {
    mocks.upsert.mockResolvedValue({ error: new Error('unavailable') });
    expect(
      (await PUT(request({ autoSendAfterApproval: true }), context)).status
    ).toBe(500);
  });
});
