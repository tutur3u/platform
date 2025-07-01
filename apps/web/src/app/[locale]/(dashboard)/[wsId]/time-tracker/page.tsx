import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { getTimeTrackingData } from '@/lib/time-tracking-helper';
import TimeTrackerContent from './time-tracker-content';
import type { TimeTrackerData } from './types';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function TimeTrackerPage({ params }: Props) {
  const { wsId } = await params;

  try {
    const workspace = await getWorkspace(wsId);
    const user = await getCurrentUser();

    if (!workspace || !user) notFound();

    const rawData = await getTimeTrackingData(wsId, user.id);

    // Transform data to match expected types
    const initialData: TimeTrackerData = { ...rawData };

    return <TimeTrackerContent wsId={wsId} initialData={initialData} />;
  } catch (error) {
    console.error('Error loading time tracker:', error);
    notFound();
  }
}
