import type { PermissionsResult } from '@tuturuuu/utils/workspace-helper';

const PRIVATE_FIELDS = [
  'email',
  'phone',
  'birthday',
  'gender',
  'ethnicity',
  'guardian',
  'national_id',
  'address',
  'note',
  'archival_note',
] as const;
const PUBLIC_FIELDS = [
  'avatar_url',
  'full_name',
  'display_name',
  'group_count',
  'linked_users',
  'created_at',
  'updated_at',
] as const;

type UserReadPermissions = Pick<PermissionsResult, 'containsPermission'>;

export function canReadWorkspaceUsers(permissions: UserReadPermissions) {
  return (
    permissions.containsPermission('view_users_private_info') ||
    permissions.containsPermission('view_users_public_info')
  );
}

export function redactWorkspaceUser<T extends object>(
  user: T,
  permissions: UserReadPermissions
): Partial<T> {
  const result: Partial<T> = { ...user };
  if (!permissions.containsPermission('view_users_private_info')) {
    for (const field of PRIVATE_FIELDS) Reflect.deleteProperty(result, field);
  }
  if (!permissions.containsPermission('view_users_public_info')) {
    for (const field of PUBLIC_FIELDS) Reflect.deleteProperty(result, field);
  }
  if (!permissions.containsPermission('check_user_attendance')) {
    Reflect.deleteProperty(result, 'attendance_count');
  }
  return result;
}
