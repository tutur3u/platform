import type { PermissionId } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from './constants';

/**
 * Permissions that workspace creators, `admin` and default permissions never
 * imply. They count only through an explicit role grant in the root
 * workspace, made by an audited database procedure; see
 * apps/docs/platform/features/mobile-mastermind.mdx.
 */
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
