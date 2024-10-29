import Calendar from '@/components/calendar/Calendar';
import { getPermissions, getWorkspace } from '@/lib/workspace-helper';
import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function CalendarPage({ params }: PageProps) {
  const { wsId } = await params;
  const workspace = await getWorkspace(wsId);

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('manage_calendar')) redirect(`/${wsId}`);
  if (!workspace) return null;

  return <Calendar workspace={workspace} />;
}
