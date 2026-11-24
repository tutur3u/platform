import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { SkeletonCard } from '@tuturuuu/ui/skeleton';
import { getLettinNotebookReferenceUrl } from '@tuturuuu/utils/lettin-task-reference';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { TaskPlanComposer } from '@/components/task-plan-composer';

type Props = {
  params: Promise<{ wsId: string; locale: string }>;
  searchParams: Promise<{
    lettinWorld?: string | string[];
    lettinEntry?: string | string[];
  }>;
};
export default function Page(props: Props) {
  return (
    <Suspense fallback={<SkeletonCard className="m-2" lines={4} />}>
      <NewTaskPage {...props} />
    </Suspense>
  );
}
async function NewTaskPage({ params, searchParams }: Props) {
  await connection();
  const [{ wsId, locale }, source] = await Promise.all([params, searchParams]);
  const user = await getSatelliteAppSessionUser('tasks');
  if (!user?.id) redirect('/login');
  const workspace = await getWorkspace(wsId, { useAdmin: true, user });
  if (!workspace) notFound();
  if (!workspace.joined) redirect('/');
  let sourceUrl: string | undefined;
  if (source.lettinWorld !== undefined || source.lettinEntry !== undefined) {
    if (
      typeof source.lettinWorld !== 'string' ||
      (source.lettinEntry !== undefined &&
        typeof source.lettinEntry !== 'string')
    )
      notFound();
    const url = getLettinNotebookReferenceUrl({
      workspaceId: workspace.id,
      locale,
      worldId: source.lettinWorld,
      entryId: source.lettinEntry,
    });
    if (!url) notFound();
    sourceUrl = url;
  }
  return (
    <TaskPlanComposer
      key={`${workspace.id}:${sourceUrl ?? ''}`}
      wsId={workspace.id}
      routeWsId={wsId}
      sourceUrl={sourceUrl}
    />
  );
}
