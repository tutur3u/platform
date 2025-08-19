'use client';

import { GoalManager } from '../components/goal-manager';
import type { TimeTrackerData } from '../types';
import { getTimeTrackingData } from '@/lib/time-tracking-helper';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { useTranslations } from 'next-intl';
import { notFound } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Props {
  params: {
    locale: string;
    wsId: string;
  };
}

export default function TimeTrackerGoalsPage({ params }: Props) {
  const t = useTranslations();
  const [initialData, setInitialData] = useState<TimeTrackerData | null>(null);
  const [wsId, setWsId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const { wsId: id } = params;
        const workspace = await getWorkspace(id);

        if (!workspace) {
          notFound();
          return;
        }

        const user = await getCurrentUser();
        if (!user) {
          notFound();
          return;
        }

        const rawData = await getTimeTrackingData(workspace.id, user.id);
        setInitialData(rawData);
        setWsId(workspace.id);
      } catch (error) {
        console.error('Error loading time tracker goals:', error);
        // Only use notFound for genuine 404s, let other errors bubble up
        if (error instanceof Error && error.message.includes('not found')) {
          notFound();
        }
        throw error; // Let error boundary handle this
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
        <h1 className="text-3xl font-bold">
          {t('time_tracker_pages.goals.title')}
        </h1>
        <p className="text-muted-foreground">
          {t('time_tracker_pages.goals.description')}
        </p>
      </div>
      <GoalManager
        wsId={wsId}
        goals={initialData.goals || []}
        categories={initialData.categories || []}
        timerStats={initialData.stats}
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
}
