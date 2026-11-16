import type { PermissionId } from '@tuturuuu/types';

/** The workspace permission that grants access to workspace usage. */
export const WORKSPACE_USAGE_PERMISSION =
  'manage_workspace_members' satisfies PermissionId;

/**
 * Whether a member may view workspace usage. One rule for the usage page,
 * its stats and the settings dialog availability summary.
 */
export function canViewWorkspaceUsage(
  permissions: {
    containsPermission: (permission: PermissionId) => boolean;
  } | null
): boolean {
  return permissions?.containsPermission(WORKSPACE_USAGE_PERMISSION) ?? false;
}
