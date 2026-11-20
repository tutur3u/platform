import { getSatelliteWorkspacePermissions } from '@tuturuuu/satellite/workspace-access';
import type { PermissionId } from '@tuturuuu/types/db';
import { notFound } from 'next/navigation';
import { resolveRouteWorkspace } from '@/lib/resolve-route-workspace';

export async function requireEducationPageAccess(
  routeWsId: string,
  anyOf: readonly PermissionId[] = ['ai_lab']
) {
  const resolved = await resolveRouteWorkspace(routeWsId);
  if (!resolved.workspace.joined) notFound();

  const permissions = await getSatelliteWorkspacePermissions(
    'teach',
    resolved.resolvedWsId
  );
  if (
    !permissions ||
    anyOf.every((permission) => permissions.withoutPermission(permission))
  ) {
    notFound();
  }

  return resolved;
}
