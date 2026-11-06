import type { PermissionId } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from './constants';
import { isAdminImpliedPermission } from './creator-grant-permissions';

// Only the audited root-workspace singleton role can grant these permissions.
// Workspace creators, `admin` and default permissions never imply them; see
// apps/docs/platform/features/mobile-mastermind.mdx.
export const EXPLICIT_GRANT_PERMISSIONS = [
  'manage_mastermind',
] as const satisfies readonly PermissionId[];

export function isExplicitGrantPermission(permission: string): boolean {
  return (EXPLICIT_GRANT_PERMISSIONS as readonly string[]).includes(permission);
}

/**
 * Drops explicit-grant permissions from [implied] (creator catalog, role and
 * default permissions) and adds back only those granted by a root-workspace
 * role. Root creators load roles too, since only roles carry them.
 */
export function applyExplicitGrants<T extends string>(
  wsId: string,
  roleGranted: readonly T[],
  implied: readonly T[]
): { explicitGrants: T[]; permissions: T[] } {
  const explicitGrants =
    wsId === ROOT_WORKSPACE_ID
      ? roleGranted.filter(isExplicitGrantPermission)
      : [];
  const permissions = [
    ...new Set([
      ...implied.filter((permission) => !isExplicitGrantPermission(permission)),
      ...explicitGrants,
    ]),
  ];
  return { explicitGrants, permissions };
}

/**
 * Whether the caller holds a permission. Explicit-grant permissions count only
 * through [explicitGrants]; the rest match has_workspace_permission, where
 * admin never implies a creator-grant permission such as manage_subscription.
 */
export function createPermissionCheck({
  explicitGrants,
  isCreator,
  permissions,
}: {
  explicitGrants: readonly string[];
  isCreator: boolean;
  permissions: readonly string[];
}): (permission: string) => boolean {
  const isAdmin = permissions.includes('admin');
  return (permission) =>
    isExplicitGrantPermission(permission)
      ? explicitGrants.includes(permission)
      : isCreator ||
        permissions.includes(permission) ||
        (isAdmin && isAdminImpliedPermission(permission));
}
