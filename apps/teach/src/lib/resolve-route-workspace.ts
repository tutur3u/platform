import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';

type ResolvedWorkspace = NonNullable<Awaited<ReturnType<typeof getWorkspace>>>;

export async function resolveRouteWorkspace(routeWsId: string): Promise<{
  routeWsId: string;
  resolvedWsId: string;
  workspace: ResolvedWorkspace;
}> {
  const workspace = await getWorkspace(routeWsId);

  if (!workspace) {
    notFound();
  }

  return {
    routeWsId,
    resolvedWsId: workspace.id,
    workspace,
  };
}
