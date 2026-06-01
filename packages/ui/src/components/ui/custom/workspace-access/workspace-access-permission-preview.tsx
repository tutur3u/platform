import { Badge } from '@tuturuuu/ui/badge';
import type { WorkspaceAccessRole } from './types';

export function enabledPermissionCount(role?: WorkspaceAccessRole | null) {
  return (
    role?.permissions.filter((permission) => permission.enabled).length ?? 0
  );
}

export function WorkspaceAccessPermissionPreview({
  emptyLabel,
  permissionTitles,
  role,
}: {
  emptyLabel: string;
  permissionTitles: Map<string, string>;
  role?: WorkspaceAccessRole | null;
}) {
  const enabledPermissions =
    role?.permissions.filter((permission) => permission.enabled) ?? [];

  if (enabledPermissions.length === 0) {
    return (
      <Badge variant="outline" className="rounded-full">
        {emptyLabel}
      </Badge>
    );
  }

  return enabledPermissions.slice(0, 5).map((permission) => (
    <Badge key={permission.id} variant="secondary" className="rounded-full">
      {permissionTitles.get(permission.id) ?? permission.id}
    </Badge>
  ));
}
