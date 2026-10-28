import type { PermissionId } from '@tuturuuu/types';
import { isExplicitGrantPermission } from '@tuturuuu/utils/explicit-grant-permissions';

export function rolePermissionPayload(
  permissions: Record<PermissionId, boolean>
) {
  return Object.entries(permissions)
    .filter(([id]) => !isExplicitGrantPermission(id))
    .map(([id, enabled]) => ({ id: id as PermissionId, enabled }));
}

export function rolePermissionValues(
  groups: Array<{ permissions: Array<{ id: PermissionId }> }>,
  stored: Array<{ id: PermissionId; enabled: boolean }> = []
) {
  return groups.reduce(
    (values, group) => {
      for (const permission of group.permissions) {
        values[permission.id] = stored.some(
          (row) => row.id === permission.id && row.enabled
        );
      }
      return values;
    },
    {} as Record<PermissionId, boolean>
  );
}
