import { getAppSessionUserFromRequest } from '@tuturuuu/auth/app-session';
import MyTasksPage from '@tuturuuu/ui/tu-do/my-tasks/my-tasks-page';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  const user = getAppSessionUserFromRequest(
    { headers: await headers() },
    { targetApp: 'tasks' }
  );

  if (!user?.id) redirect('/login');

  return <MyTasksPage params={params} user={user} />;
}
