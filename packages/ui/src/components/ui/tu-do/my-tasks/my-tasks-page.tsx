import { MyTasksDataLoader } from '@tuturuuu/ui/tu-do/my-tasks/my-tasks-data-loader';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  user?: {
    email?: string | null;
    id: string;
  } | null;
}

/**
 * Shared My Tasks Page component.
 * Handles workspace resolution and user authentication.
 * Used by both apps/web and apps/tasks.
 */
export default async function MyTasksPage({ params, user }: Props) {
  const { wsId: id } = await params;

  const currentUser = user ?? (await getCurrentUser());
  if (!currentUser) redirect('/login');

  const workspace = await getWorkspace(
    id,
    user ? { useAdmin: true, user: currentUser } : {}
  );
  if (!workspace) notFound();

  return (
    <MyTasksDataLoader
      wsId={workspace.id}
      userId={currentUser.id}
      isPersonal={workspace.personal}
    />
  );
}
