import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import TimeTrackerContent from './time-tracker-content';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function TimeTrackerPage({ params }: Props) {
  const { wsId: id } = await params;

  try {
    const workspace = await getWorkspace(id);
    const user = await getCurrentUser();

    if (!workspace || !user) notFound();

    return <TimeTrackerContent />;
  } catch (error) {
    console.error('Error loading time tracker:', error);
    notFound();
  }
}
