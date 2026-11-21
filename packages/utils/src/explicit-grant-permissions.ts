import type { PermissionId } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from './constants';
import { isAdminImpliedPermission } from './creator-grant-permissions';

// Only an explicit root-workspace role grant confers these permissions:
// manage_mastermind through the audited singleton role
// (apps/docs/platform/features/mobile-mastermind.mdx), operate_mira_channels
// through a root role grant made by a database-owner session
// (apps/docs/platform/ai/mira-cloud-channels.mdx). Workspace creators, `admin`
// and default permissions never imply them.
export const EXPLICIT_GRANT_PERMISSIONS = [
  'manage_mastermind',
  'operate_mira_channels',
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
