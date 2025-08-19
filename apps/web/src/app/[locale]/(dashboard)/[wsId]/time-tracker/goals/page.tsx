import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { getTimeTrackingData } from '@/lib/time-tracking-helper';
import { GoalManager } from '../components/goal-manager';
import type { TimeTrackerData } from '../types';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function TimeTrackerGoalsPage({ params }: Props) {
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

    return (
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="font-bold text-3xl">Time Tracking Goals</h1>
          <p className="text-muted-foreground">
            Set and manage your time tracking goals
          </p>
        </div>
        <GoalManager
          wsId={wsId}
          goals={initialData.goals || []}
          categories={initialData.categories || []}
          timerStats={{
            todayTime: 0,
            weekTime: 0,
            monthTime: 0,
            streak: 0,
            categoryBreakdown: {
              today: {},
              week: {},
              month: {},
            },
            dailyActivity: [],
          }}
          onGoalsUpdate={() => {
            // Refresh data when goals are updated
            window.location.reload();
          }}
          formatDuration={(seconds: number) => {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${hours}h ${minutes}m`;
          }}
          apiCall={async (url: string, options?: RequestInit) => {
            const response = await fetch(url, options);
            if (!response.ok) {
              throw new Error('Failed to update goals');
            }
            return response.json();
          }}
        />
      </div>
    );
  } catch (error) {
    console.error('Error loading time tracker goals:', error);
    notFound();
  }
}
