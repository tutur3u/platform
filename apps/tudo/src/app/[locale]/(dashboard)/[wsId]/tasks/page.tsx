import { MyTasksDataLoader } from '@tuturuuu/ui/tu-do/my-tasks/my-tasks-data-loader';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function MyTasksPage({ params }: Props) {
  const { wsId: id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const workspace = await getWorkspace(id);
  if (!workspace) redirect('/');

  return (
    <Suspense>
      <MyTasksDataLoader
        wsId={workspace.id}
        userId={user.id}
        isPersonal={workspace.personal}
      />
    </Suspense>
  );
}
