import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { CyclePlanningView } from '@tuturuuu/tasks-ui/tu-do/cycles/planning/cycle-planning-view';
import { loadTaskCycles } from '@tuturuuu/tasks-ui/tu-do/cycles/task-cycles-page-model';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function CyclePlanningPage({ params }: Props) {
  await connection();

  const { wsId: id } = await params;
  const user = await getSatelliteAppSessionUser('tasks');
  if (!user?.id) redirect('/login');

  const workspace = await getWorkspace(id, { useAdmin: true, user });
  if (!workspace) notFound();

  const permissions = await getPermissions({ user, wsId: workspace.id });
  if (!permissions) notFound();
  if (permissions.withoutPermission('manage_projects')) {
    redirect(`/${workspace.id}`);
  }

  // task_cycles is service-role only; the read is scoped to the workspace
  // resolved and permission-checked above.
  const cycles = await loadTaskCycles(
    await createAdminClient({ noCookie: true }),
    workspace.id
  );
  if (!cycles) notFound();

  return (
    <CyclePlanningView
      wsId={workspace.id}
      currentUserId={user.id}
      cycles={cycles}
    />
  );
}
