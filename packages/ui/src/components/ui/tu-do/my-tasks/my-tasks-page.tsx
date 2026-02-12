import { MyTasksDataLoader } from '@tuturuuu/ui/tu-do/my-tasks/my-tasks-data-loader';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

/**
 * Shared My Tasks Page component.
 * Handles workspace resolution and user authentication.
 * Used by both apps/web and apps/tasks.
 */
export default async function MyTasksPage({ params }: Props) {
  const { wsId: id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const workspace = await getWorkspace(id);
  if (!workspace) redirect('/');

  return (
    <MyTasksDataLoader
      wsId={workspace.id}
      userId={user.id}
      isPersonal={workspace.personal}
    />
  );
}
