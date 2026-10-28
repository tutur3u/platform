import type { PermissionId } from '@tuturuuu/types';
import { isExplicitGrantPermission } from '@tuturuuu/utils/explicit-grant-permissions';

export function rolePermissionPayload(
  permissions: Record<PermissionId, boolean>
) {
  return Object.entries(permissions)
    .filter(([id]) => !isExplicitGrantPermission(id))
    .map(([id, enabled]) => ({ id: id as PermissionId, enabled }));
}
