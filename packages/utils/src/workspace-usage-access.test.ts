import { describe, expect, it } from 'vitest';
import {
  canViewWorkspaceUsage,
  WORKSPACE_USAGE_PERMISSION,
} from './workspace-usage-access';

const permissionsWith = (...granted: string[]) => ({
  containsPermission: (permission: string) => granted.includes(permission),
});

describe('canViewWorkspaceUsage', () => {
  it('requires the workspace usage permission', () => {
    expect(WORKSPACE_USAGE_PERMISSION).toBe('manage_workspace_members');
    expect(
      canViewWorkspaceUsage(permissionsWith('manage_workspace_members'))
    ).toBe(true);
  });

  it('denies non-members and members without the permission', () => {
    expect(canViewWorkspaceUsage(null)).toBe(false);
    expect(
      canViewWorkspaceUsage(permissionsWith('manage_workspace_settings'))
    ).toBe(false);
  });
});
