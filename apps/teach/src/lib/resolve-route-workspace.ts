import { getSatelliteWorkspace } from '@tuturuuu/satellite/workspace-access';
import type { PermissionId } from '@tuturuuu/types/db';
import { notFound } from 'next/navigation';
import { requireTeachWorkspaceMember } from './require-teach-workspace-member';

type ResolvedWorkspace = NonNullable<
  Awaited<ReturnType<typeof getSatelliteWorkspace>>
>;

export async function resolveRouteWorkspace(
  routeWsId: string,
  permission: PermissionId | null
): Promise<{
  routeWsId: string;
  resolvedWsId: string;
  workspace: ResolvedWorkspace;
}> {
  const { wsId } = await requireTeachWorkspaceMember(routeWsId, permission);
  const workspace = await getSatelliteWorkspace('teach', wsId);

  if (!workspace) {
    notFound();
  }

  return {
    routeWsId,
    resolvedWsId: workspace.id,
    workspace,
  };
}
