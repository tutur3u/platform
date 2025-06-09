import TimeTrackerContent, { TimeTrackerData } from './time-tracker-content';
import { getTimeTrackingData } from '@/lib/time-tracking-helper';
import { getWorkspace, verifySecret } from '@/lib/workspace-helper';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { notFound } from 'next/navigation';

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

    // Check if time tracking is enabled
    const timeTrackingEnabled = await verifySecret({
      forceAdmin: true,
      wsId,
      name: 'ENABLE_TASKS',
      value: 'true',
    });

    if (!timeTrackingEnabled) notFound();

    const rawData = await getTimeTrackingData(wsId, user.id);

    // Transform data to match expected types
    const initialData: TimeTrackerData = {
      categories: rawData.categories,
      runningSession: rawData.runningSession,
      recentSessions: rawData.recentSessions,
      goals: rawData.goals,
      tasks: rawData.tasks,
      stats: rawData.stats,
    };

    return <TimeTrackerContent wsId={wsId} initialData={initialData} />;
  } catch (error) {
    console.error('Error loading time tracker:', error);
    notFound();
  }
}
