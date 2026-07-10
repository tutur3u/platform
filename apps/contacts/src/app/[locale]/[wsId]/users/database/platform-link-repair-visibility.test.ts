import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { describe, expect, it } from 'vitest';
import { canShowPlatformLinkRepairAction } from './platform-link-repair-visibility';

const baseUser: WorkspaceUser = {
  id: 'user-1',
  email: 'user@example.com',
  linked_users: [],
  ws_id: 'ws-1',
};

const repairPermissions = {
  canUpdateUsers: true,
  hasPrivateInfo: true,
  hasPublicInfo: true,
};

describe('canShowPlatformLinkRepairAction', () => {
  it('shows the row action for unlinked email-bearing users with repair permissions', () => {
    expect(canShowPlatformLinkRepairAction(baseUser, repairPermissions)).toBe(
      true
    );
  });

  it('hides the row action for linked users', () => {
    expect(
      canShowPlatformLinkRepairAction(
        {
          ...baseUser,
          linked_users: [{ id: 'platform-1', display_name: 'Platform User' }],
        },
        repairPermissions
      )
    ).toBe(false);
  });

  it('hides the row action without email, private info, update permission, or known link state', () => {
    expect(
      canShowPlatformLinkRepairAction(
        { ...baseUser, email: '   ' },
        repairPermissions
      )
    ).toBe(false);
    expect(
      canShowPlatformLinkRepairAction(baseUser, {
        ...repairPermissions,
        hasPrivateInfo: false,
      })
    ).toBe(false);
    expect(
      canShowPlatformLinkRepairAction(baseUser, {
        ...repairPermissions,
        canUpdateUsers: false,
      })
    ).toBe(false);
    expect(
      canShowPlatformLinkRepairAction(baseUser, {
        ...repairPermissions,
        hasPublicInfo: false,
      })
    ).toBe(false);
  });
});
