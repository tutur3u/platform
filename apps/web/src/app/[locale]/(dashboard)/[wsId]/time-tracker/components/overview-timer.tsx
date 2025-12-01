'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Settings } from '@tuturuuu/icons';
import type { TimeTrackingCategory } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import type { ExtendedWorkspaceTask, SessionWithRelations } from '../types';
import { SimpleTimerControls } from './simple-timer-controls';

interface OverviewTimerProps {
  wsId: string;
  categories: TimeTrackingCategory[];
  tasks: ExtendedWorkspaceTask[];
  initialRunningSession: SessionWithRelations | null;
}

export default function OverviewTimer({
  wsId,
  categories,
  tasks,
  initialRunningSession,
}: OverviewTimerProps) {
  const tModes = useTranslations('time-tracker.modes');

  // Use React Query for running session to sync with other components
  const { data: runningSessionFromQuery } = useQuery({
    queryKey: ['running-time-session', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=running`
      );
      if (!response.ok) throw new Error('Failed to fetch running session');
      const data = await response.json();
      return data.session;
    },
    refetchInterval: 30000,
    initialData: initialRunningSession,
  });

  const [currentSession, setCurrentSession] =
    useState<SessionWithRelations | null>(initialRunningSession);

  // Timer state
  const [elapsedTime, setElapsedTime] = useState(() => {
    if (!initialRunningSession) return 0;
    const elapsed = Math.floor(
      (Date.now() - new Date(initialRunningSession.start_time).getTime()) / 1000
    );
    return Math.max(0, elapsed);
  });
  const [isRunning, setIsRunning] = useState(!!initialRunningSession);

  // Sync React Query data with local state
  useEffect(() => {
    if (runningSessionFromQuery !== undefined) {
      setCurrentSession(runningSessionFromQuery);
      setIsRunning(!!runningSessionFromQuery);
      if (runningSessionFromQuery) {
        const elapsed = Math.max(
          0,
          Math.floor(
            (Date.now() -
              new Date(runningSessionFromQuery.start_time).getTime()) /
              1000
          )
        );
        setElapsedTime(elapsed);
      } else {
        setElapsedTime(0);
      }
    }
  }, [runningSessionFromQuery]);

  // Timer effect
  useEffect(() => {
    if (isRunning && currentSession) {
      const interval = setInterval(() => {
        const elapsed = Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(currentSession.start_time).getTime()) / 1000
          )
        );
        setElapsedTime(elapsed);
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [isRunning, currentSession]);

  // API call helper
  const apiCall = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return response.json();
    },
    []
  );

  // Fetch session data
  const fetchData = useCallback(async () => {
    try {
      const response = await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=running`
      );

      if (response.session) {
        setCurrentSession(response.session);
        setIsRunning(true);
        const elapsed = Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(response.session.start_time).getTime()) /
              1000
          )
        );
        setElapsedTime(elapsed);
      } else {
        setCurrentSession(null);
        setIsRunning(false);
        setElapsedTime(0);
      }
    } catch (error) {
      console.error('Error fetching session data:', error);
    }
  }, [wsId, apiCall]);

  // Format time helpers
  const formatTime = useCallback((seconds: number): string => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const secs = safeSeconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const formatDuration = useCallback((seconds: number): string => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }, []);

  return (
    <SimpleTimerControls
      wsId={wsId}
      currentSession={currentSession}
      setCurrentSession={setCurrentSession}
      elapsedTime={elapsedTime}
      setElapsedTime={setElapsedTime}
      isRunning={isRunning}
      setIsRunning={setIsRunning}
      categories={categories}
      tasks={tasks}
      onSessionUpdate={fetchData}
      formatTime={formatTime}
      formatDuration={formatDuration}
      apiCall={apiCall}
      headerAction={
        <Link href={`/${wsId}/time-tracker/timer?mode=advanced`}>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
            <Settings className="h-3.5 w-3.5" />
            {tModes('switchToAdvanced')}
            <ExternalLink className="h-3 w-3" />
          </Button>
        </Link>
      }
    />
  );
}
