import { describe, expect, it } from 'vitest';
import {
  isAdminImpliedPermission,
  isCreatorGrantPermission,
  withoutCreatorGrantPermissions,
} from '../creator-grant-permissions';

describe('creator-grant permissions', () => {
  it('treats manage_subscription as creator-grant only', () => {
    expect(isCreatorGrantPermission('manage_subscription')).toBe(true);
    expect(isCreatorGrantPermission('manage_workspace_billing')).toBe(false);
  });

  it('does not let admin imply manage_subscription or itself', () => {
    expect(isAdminImpliedPermission('manage_workspace_roles')).toBe(true);
    expect(isAdminImpliedPermission('manage_subscription')).toBe(false);
    expect(isAdminImpliedPermission('admin')).toBe(false);
  });

  it('filters creator-grant entries for non-creators only', () => {
    const payload = [
      { enabled: true, id: 'manage_subscription' },
      { enabled: true, id: 'manage_users' },
    ];

    expect(withoutCreatorGrantPermissions(payload, false)).toEqual([
      { enabled: true, id: 'manage_users' },
    ]);
    expect(withoutCreatorGrantPermissions(payload, true)).toEqual(payload);
  });
});
