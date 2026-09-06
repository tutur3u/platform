import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import MyTasksContent from '@tuturuuu/tasks-ui/tu-do/my-tasks/my-tasks-content';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';

export default async function TasksPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  await connection();
  const { wsId } = await params;
  const user = await getSatelliteAppSessionUser('calendar');
  if (!user) redirect('/login');
  const workspace = await getWorkspace(wsId, { useAdmin: true, user });
  if (!workspace?.joined) notFound();
  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-6">
      <MyTasksContent
        embedded
        wsId={workspace.id}
        userId={user.id}
        isPersonal={!!workspace.personal}
      />
    </div>
  );
}
