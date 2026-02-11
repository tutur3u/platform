import HabitsClientPage from '@tuturuuu/ui/tu-do/habits/client';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function HabitsPage({ params }: Props) {
  const { wsId: id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const workspace = await getWorkspace(id);
  if (!workspace) redirect('/');

  return <HabitsClientPage wsId={workspace.id} />;
}
