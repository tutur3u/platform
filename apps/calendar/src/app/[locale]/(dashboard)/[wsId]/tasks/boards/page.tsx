import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import WorkspaceProjectsPage from '@tuturuuu/tasks-ui/tu-do/boards/workspace-projects-page';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';

export default async function BoardsPage(props: {
  params: Promise<{ wsId: string }>;
  searchParams: Promise<{ q?: string; page?: string; pageSize?: string }>;
}) {
  await connection();
  const user = await getSatelliteAppSessionUser('calendar');
  if (!user) redirect('/login');
  return <WorkspaceProjectsPage {...props} sessionUser={user} />;
}
