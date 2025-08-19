'use client';

import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getTimeTrackingData } from '@/lib/time-tracking-helper';
import { GoalManager } from '../components/goal-manager';
import type { TimeTrackerData } from '../types';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default function TimeTrackerGoalsPage({ params }: Props) {
  const router = useRouter();
  const [initialData, setInitialData] = useState<TimeTrackerData | null>(null);
  const [wsId, setWsId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const { wsId: id } = await params;
        const workspace = await getWorkspace(id);
        const currentWsId = workspace?.id;

        if (!currentWsId) {
          notFound();
          return;
        }

        const user = await getCurrentUser();
        if (!user) {
          notFound();
          return;
        }

        const rawData = await getTimeTrackingData(currentWsId, user.id);
        setInitialData({ ...rawData });
        setWsId(currentWsId);
      } catch (error) {
        console.error('Error loading time tracker goals:', error);
        notFound();
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [params]);

  if (loading || !initialData || !wsId) {
    return <div>Loading...</div>;
  }

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
          router.refresh();
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
}
