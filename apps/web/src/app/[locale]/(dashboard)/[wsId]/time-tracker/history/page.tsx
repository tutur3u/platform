'use client';

import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getTimeTrackingData } from '@/lib/time-tracking-helper';
import { SessionHistory } from '../components/session-history';
import type { TimeTrackerData } from '../types';

interface Props {
  params: {
    locale: string;
    wsId: string;
  };
}

export default function TimeTrackerHistoryPage({ params }: Props) {
  const router = useRouter();
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
        console.error('Error loading time tracker history:', error);
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
        <h1 className="font-bold text-3xl">Session History</h1>
        <p className="text-muted-foreground">
          View and analyze your time tracking sessions
        </p>
      </div>
      <SessionHistory
        wsId={wsId}
        sessions={initialData.recentSessions || []}
        tasks={initialData.tasks || []}
        categories={initialData.categories || []}
      />
    </div>
  );
}
