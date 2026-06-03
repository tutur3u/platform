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

  it('maps dashboard routes to the same feature permissions exposed in navigation', () => {
    expect(getWorkspaceRoutePermissionRequirements(['education'])).toEqual([
      'manage_users',
      'view_user_groups',
      'view_user_groups_reports',
      'view_user_groups_scores',
      'view_user_groups_posts',
    ]);
    expect(
      getWorkspaceRoutePermissionRequirements(['education', 'attempts'])
    ).toEqual(['manage_users', 'view_user_groups_reports']);
    expect(getWorkspaceRoutePermissionRequirements(['cron'])).toEqual([
      'ai_lab',
    ]);
    expect(getWorkspaceRoutePermissionRequirements(['memories'])).toEqual([
      'ai_lab',
    ]);
    expect(getWorkspaceRoutePermissionRequirements(['ai', 'spark'])).toEqual([
      'manage_projects',
    ]);
    expect(getWorkspaceRoutePermissionRequirements(['posts'])).toContain(
      'approve_posts'
    );
    expect(
      getWorkspaceRoutePermissionRequirements(['users', 'groups', 'indicators'])
    ).toContain('view_user_groups_scores');
    expect(
      getWorkspaceRoutePermissionRequirements(['users', 'guest-leads'])
    ).toEqual(['create_lead_generations']);
    expect(
      getWorkspaceRoutePermissionRequirements(['users', 'topic-announcements'])
    ).toEqual(['manage_users', 'send_user_group_post_emails']);
    expect(
      getWorkspaceRoutePermissionRequirements([
        'users',
        'topic-announcements',
        'import',
      ])
    ).toEqual(['manage_users', 'send_user_group_post_emails']);
    expect(
      hasRequiredWorkspaceRoutePermission({
        grantedPermissions: ['ai_lab'],
        requiredPermissions:
          getWorkspaceRoutePermissionRequirements(['education', 'attempts']) ??
          [],
      })
    ).toBe(false);
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
