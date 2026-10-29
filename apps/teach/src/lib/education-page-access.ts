import { getSatelliteWorkspacePermissions } from '@tuturuuu/satellite/workspace-access';
import { notFound } from 'next/navigation';
import { resolveRouteWorkspace } from '@/lib/resolve-route-workspace';

export async function requireEducationPageAccess(routeWsId: string) {
  const resolved = await resolveRouteWorkspace(routeWsId);
  if (!resolved.workspace.joined) notFound();

  const permissions = await getSatelliteWorkspacePermissions(
    'teach',
    resolved.resolvedWsId
  );
  if (!permissions || permissions.withoutPermission('ai_lab')) notFound();

  return resolved;
}
