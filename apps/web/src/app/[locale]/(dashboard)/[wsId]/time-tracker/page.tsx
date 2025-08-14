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
  const workspace = await getWorkspace(id);
  const wsId = workspace?.id;

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
