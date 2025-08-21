import TimeTrackerContent from './time-tracker-content';
import type { TimeTrackerData } from './types';
import { getTimeTrackingData } from '@/lib/time-tracking-helper';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';

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

    const rawData = await getTimeTrackingData(workspace.id, user.id);

    // Transform data to match expected types
    const initialData: TimeTrackerData = { ...rawData };

    return <TimeTrackerContent wsId={workspace.id} initialData={initialData} />;
  } catch (error) {
    console.error('Error loading time tracker:', error);
    notFound();
  }
}
