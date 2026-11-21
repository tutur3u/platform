import type { PermissionId } from '@tuturuuu/types';

/**
 * MEMBER default permissions that `public.initialize_workspace_admin_permission`
 * seeds on every new workspace. They give members basic drive and chat access
 * and never include `admin`.
 */
export const SEEDED_MEMBER_DEFAULT_PERMISSIONS = [
  'view_drive',
  'manage_drive_tasks_directory',
  'view_chat',
  'create_chat',
] as const satisfies readonly PermissionId[];

/**
 * Whether enabled MEMBER defaults show that someone configured workspace
 * access. The seeded baseline and `admin` do not count: `admin` as a member
 * default hands every member near-full access instead of configuring it.
 */
export function hasConfiguredMemberDefaults(
  enabledPermissions: readonly string[]
): boolean {
  const ignored = new Set<string>([
    ...SEEDED_MEMBER_DEFAULT_PERMISSIONS,
    'admin',
  ]);
  return enabledPermissions.some((permission) => !ignored.has(permission));
}
