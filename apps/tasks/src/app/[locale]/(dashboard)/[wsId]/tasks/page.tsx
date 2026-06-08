import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import MyTasksPage from '@tuturuuu/ui/tu-do/my-tasks/my-tasks-page';
import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  const user = await getSatelliteAppSessionUser('tasks');

  if (!user?.id) redirect('/login');

  return <MyTasksPage params={params} user={user} />;
}
