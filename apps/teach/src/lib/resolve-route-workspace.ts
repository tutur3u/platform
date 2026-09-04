import { getSatelliteWorkspace } from '@tuturuuu/satellite/workspace-access';
import { notFound } from 'next/navigation';

type ResolvedWorkspace = NonNullable<
  Awaited<ReturnType<typeof getSatelliteWorkspace>>
>;

export async function resolveRouteWorkspace(routeWsId: string): Promise<{
  routeWsId: string;
  resolvedWsId: string;
  workspace: ResolvedWorkspace;
}> {
  const workspace = await getSatelliteWorkspace('teach', routeWsId);

  if (!workspace) {
    notFound();
  }

  return {
    routeWsId,
    resolvedWsId: workspace.id,
    workspace,
  };
}
