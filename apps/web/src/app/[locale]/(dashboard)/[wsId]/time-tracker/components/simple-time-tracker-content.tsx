'use client';

import { useQuery } from '@tanstack/react-query';
import { Clock, Timer, TrendingUp } from '@tuturuuu/icons';
import type { User } from '@tuturuuu/types/primitives/User';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import type { SessionWithRelations, TimeTrackerData } from '../types';
import { SimpleTimerControls } from './simple-timer-controls';
import type {Workspace} from '@tuturuuu/types';

dayjs.extend(utc);
dayjs.extend(timezone);

interface SimpleTimeTrackerContentProps {
  wsId: string;
  initialData: TimeTrackerData;
  currentUser: User | null;
  isUserLoading: boolean;
  workspace: Workspace;
}

export default function SimpleTimeTrackerContent({
  wsId,
  initialData,
  currentUser,
  isUserLoading,
}: SimpleTimeTrackerContentProps) {
  const t = useTranslations('time-tracker');
  // Use React Query for running session to sync with command palette
  const { data: runningSessionFromQuery } = useQuery({
    queryKey: ['running-time-session', wsId, currentUser?.id],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=running`
      );
      if (!response.ok) throw new Error('Failed to fetch running session');
      const data = await response.json();
      return data.session;
    },
    refetchInterval: 30000, // 30 seconds
    initialData: initialData.runningSession,
    enabled: !!currentUser,
  });

  // Use React Query for stats to enable real-time updates
  const { data: statsFromQuery } = useQuery({
    queryKey: ['time-tracker-stats', wsId, currentUser?.id],
    queryFn: async () => {
      if (!currentUser)
        return { todayTime: 0, weekTime: 0, monthTime: 0, streak: 0 };
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=stats&userId=${currentUser.id}`
      );
      if (!response.ok) throw new Error('Failed to fetch time tracking stats');
      const data = await response.json();
      return (
        data.stats || { todayTime: 0, weekTime: 0, monthTime: 0, streak: 0 }
      );
    },
    refetchInterval: 60000, // 1 minute (less frequent than running session)
    initialData: initialData.stats || {
      todayTime: 0,
      weekTime: 0,
      monthTime: 0,
      streak: 0,
    },
    enabled: !!currentUser,
    staleTime: 30000, // 30 seconds
  });

  const [currentSession, setCurrentSession] =
    useState<SessionWithRelations | null>(initialData.runningSession);
  const [categories] = useState(initialData.categories || []);

  // Timer state
  const [elapsedTime, setElapsedTime] = useState(() => {
    if (!initialData.runningSession) return 0;
    const elapsed = Math.floor(
      (Date.now() - new Date(initialData.runningSession.start_time).getTime()) /
        1000
    );
    return Math.max(0, elapsed);
  });
  const [isRunning, setIsRunning] = useState(!!initialData.runningSession);

  // Sync React Query data with local state
  useEffect(() => {
    if (currentUser && runningSessionFromQuery !== undefined) {
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
  }, [runningSessionFromQuery, currentUser]);

  // API call helper
  const apiCall = useCallback(
    async (url: string, options: RequestInit = {}) => {
      try {
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
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Network error';
        console.error('API call failed:', message);
        throw new Error(message);
      }
    },
    []
  );

  const formatDuration = useCallback((seconds: number): string => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }, []);

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

  // Calculate stats - use dynamic data from query for real-time updates
  const todayStats = statsFromQuery || {
    todayTime: 0,
    weekTime: 0,
    monthTime: 0,
    streak: 0,
  };

  if (isUserLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
          <p className="animate-pulse text-muted-foreground text-sm">
            {t('loading')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Timer Controls */}
      <SimpleTimerControls
        wsId={wsId}
        currentSession={currentSession}
        elapsedTime={elapsedTime}
        isRunning={isRunning}
        categories={categories}
        apiCall={apiCall}
        workspace={workspace}
        currentUserId={currentUser?.id || undefined}
      />

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              {t('stats.today.title')}
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="font-bold text-2xl">
              {formatDuration(todayStats.todayTime)}
            </div>
            <p className="text-muted-foreground text-xs">
              {todayStats.todayTime > 0
                ? t('stats.today.messageActive')
                : t('stats.today.messageEmpty')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              {t('stats.week.title')}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="font-bold text-2xl">
              {formatDuration(todayStats.weekTime)}
            </div>
            <p className="text-muted-foreground text-xs">
              {todayStats.weekTime > 14400
                ? t('stats.week.messageActive')
                : t('stats.week.messageEmpty')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              {t('stats.streak.title')}
            </CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="font-bold text-2xl">
              {t('stats.streak.count', { count: todayStats.streak })}
            </div>
            <p className="text-muted-foreground text-xs">
              {todayStats.streak > 0
                ? t('stats.streak.messageActive')
                : t('stats.streak.messageEmpty')}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
