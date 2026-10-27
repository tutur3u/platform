import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import TaskInitiativesPage from '@tuturuuu/tasks-ui/tu-do/initiatives/task-initiatives-page';
import { connection } from 'next/server';

type Props = { params: Promise<{ wsId: string }> };

// Compatibility entry point for bookmarks and legacy Web redirects. Keep hidden
// from navigation while existing initiatives and their project links are retained.
export default async function Page({ params }: Props) {
  await connection();
  const sessionUser = await getSatelliteAppSessionUser('tasks');
  return <TaskInitiativesPage params={params} sessionUser={sessionUser} />;
}
