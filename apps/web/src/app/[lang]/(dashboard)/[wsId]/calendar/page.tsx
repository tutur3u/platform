import Calendar from '@/components/calendar/Calendar';
import { getWorkspace } from '@/lib/workspace-helper';

interface PageProps {
  params: {
    wsId: string;
  };
}

export default async function CalendarPage({ params: { wsId } }: PageProps) {
  const workspace = await getWorkspace(wsId);
  if (!workspace) return null;

  return <Calendar workspace={workspace} />;
}
