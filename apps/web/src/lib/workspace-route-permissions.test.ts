import { describe, expect, it } from 'vitest';
import {
  getWorkspaceRoutePermissionRequirements,
  hasRequiredWorkspaceRoutePermission,
} from './workspace-route-permissions';

describe('workspace route permission mapping', () => {
  it('denies routes without a mapped permission by returning null', () => {
    expect(getWorkspaceRoutePermissionRequirements([])).toBeNull();
    expect(
      getWorkspaceRoutePermissionRequirements(['qr-generator'])
    ).toBeNull();
  });

  it('maps role settings to workspace role management', () => {
    expect(getWorkspaceRoutePermissionRequirements(['roles'])).toEqual([
      'manage_workspace_roles',
    ]);
  });

  it('allows guest admin to satisfy mapped route permissions only', () => {
    expect(
      hasRequiredWorkspaceRoutePermission({
        grantedPermissions: ['admin'],
        requiredPermissions: ['manage_workspace_roles'],
      })
    ).toBe(true);
    expect(
      hasRequiredWorkspaceRoutePermission({
        grantedPermissions: ['admin'],
        requiredPermissions: [],
      })
    ).toBe(false);
  });

  it('matches any explicitly enabled route permission', () => {
    expect(
      hasRequiredWorkspaceRoutePermission({
        grantedPermissions: ['view_transactions'],
        requiredPermissions: ['manage_finance', 'view_transactions'],
      })
    ).toBe(true);
    expect(
      hasRequiredWorkspaceRoutePermission({
        grantedPermissions: ['manage_projects'],
        requiredPermissions: ['manage_calendar'],
      })
    ).toBe(false);
  });
});
