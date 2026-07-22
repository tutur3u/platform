import { Badge } from '@tuturuuu/ui/badge';
import type { WorkspaceAccessRole } from './types';

export function enabledPermissionCount(
  role?: WorkspaceAccessRole | null,
  permissionCount?: number
) {
  if (
    permissionCount !== undefined &&
    role?.permissions.some(
      (permission) => permission.id === 'admin' && permission.enabled
    )
  ) {
    return permissionCount;
  }

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
  const adminEnabled = enabledPermissions.some(
    (permission) => permission.id === 'admin'
  );

  if (enabledPermissions.length === 0) {
    return (
      <Badge variant="outline" className="rounded-full">
        {emptyLabel}
      </Badge>
    );
  }

  if (adminEnabled) {
    return (
      <Badge className="rounded-full border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green">
        {permissionTitles.get('admin') ?? 'Administrator'}
      </Badge>
    );
  }

  return enabledPermissions.slice(0, 5).map((permission) => (
    <Badge key={permission.id} variant="secondary" className="rounded-full">
      {permissionTitles.get(permission.id) ?? permission.id}
    </Badge>
  ));
}
