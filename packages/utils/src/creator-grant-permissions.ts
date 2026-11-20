import type { PermissionId } from '@tuturuuu/types';

/**
 * Permissions that the `admin` permission never implies, mirroring
 * `public.has_workspace_permission`. Only the workspace creator (or the
 * service role) may enable them on a role. Only permissions supported by the
 * database default policy can be granted by default.
 */
export const CREATOR_GRANT_PERMISSIONS = [
  'manage_courses',
  'manage_subscription',
] as const satisfies readonly PermissionId[];

export function isCreatorGrantPermission(permission: string): boolean {
  return (CREATOR_GRANT_PERMISSIONS as readonly string[]).includes(permission);
}

/** Whether holding `admin` grants [permission] without an explicit row. */
export function isAdminImpliedPermission(permission: string): boolean {
  return permission !== 'admin' && !isCreatorGrantPermission(permission);
}

/**
 * Drops creator-grant permissions from a role or default-permission payload
 * when the caller is not the workspace creator, leaving their stored state
 * unchanged.
 */
export function withoutCreatorGrantPermissions<T extends { id: string }>(
  permissions: readonly T[],
  callerIsCreator: boolean
): T[] {
  return callerIsCreator
    ? [...permissions]
    : permissions.filter(
        (permission) => !isCreatorGrantPermission(permission.id)
      );
}
